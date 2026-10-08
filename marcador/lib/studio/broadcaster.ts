/**
 * Envío del video al intermediario:
 *   MediaRecorder (trozos de 1 s) → WebSocket → intermediario → ffmpeg → YouTube (RTMPS).
 *
 * - Reconexión automática con espera creciente si se corta la red o la salida a YouTube.
 * - Cada reconexión empieza una grabación nueva (el intermediario abre otra salida).
 * - Si la red no da abasto (se acumula video sin enviar), baja la calidad un escalón.
 * - El estado que se muestra es el real: "en vivo" solo cuando el intermediario confirma
 *   que ffmpeg está entregando fotogramas a YouTube.
 */
import { AUDIO_BITRATE, BITRATE_STEPS, backlogSeconds, ingestUrl, reconnectDelay } from "./media";

export type BroadcastPhase = "detenida" | "conectando" | "en_vivo" | "reconectando" | "finalizando" | "error";

export interface OutputStats {
  fps: number;
  kbps: number;
  speed: number;
}

export interface BroadcastState {
  phase: BroadcastPhase;
  /** Inicio de la transmisión (ms), para la duración. Se mantiene durante las reconexiones. */
  startedAt: number | null;
  attempt: number;
  /** El intermediario confirmó que YouTube está recibiendo fotogramas. */
  youtube: boolean;
  stats: OutputStats | null;
  /** Segundos de video grabados que aún no salieron del celular. */
  backlog: number;
  bitrate: number;
  mimeType: string;
  message: string;
}

export const IDLE_STATE: BroadcastState = {
  phase: "detenida",
  startedAt: null,
  attempt: 0,
  youtube: false,
  stats: null,
  backlog: 0,
  bitrate: BITRATE_STEPS[0],
  mimeType: "",
  message: "",
};

interface Options {
  relayUrl: string;
  mimeType: string;
  getToken: () => Promise<string | null>;
  /** Video del lienzo (con el marcador) + micrófono. */
  stream: MediaStream;
  onState: (state: BroadcastState) => void;
}

const BACKLOG_STEP_DOWN_S = 8;
const STOP_TIMEOUT_MS = 6_000;
const TIMESLICE_MS = 1_000;

export class Broadcaster {
  private state: BroadcastState = { ...IDLE_STATE };
  private ws: WebSocket | null = null;
  private recorder: MediaRecorder | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  private monitor: ReturnType<typeof setInterval> | undefined;
  private step = 0;
  private slowChecks = 0;
  private stopping = false;
  private fatal = false;
  private stopResolve: (() => void) | null = null;

  constructor(private options: Options) {}

  private set(patch: Partial<BroadcastState>) {
    this.state = { ...this.state, ...patch };
    this.options.onState(this.state);
  }

  start() {
    this.stopping = false;
    this.fatal = false;
    this.step = 0;
    this.set({ ...IDLE_STATE, phase: "conectando", startedAt: Date.now(), mimeType: this.options.mimeType });
    window.addEventListener("online", this.handleOnline);
    this.connect();
  }

  /** Termina la transmisión: envía lo último grabado y pide al intermediario cerrar la salida. */
  stop(): Promise<void> {
    if (this.stopping) return Promise.resolve();
    this.stopping = true;
    clearTimeout(this.reconnectTimer);
    window.removeEventListener("online", this.handleOnline);
    const ws = this.ws;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      this.teardown();
      this.set({ phase: "detenida", startedAt: null, youtube: false, stats: null, backlog: 0, message: "" });
      return Promise.resolve();
    }
    this.set({ phase: "finalizando", message: "" });
    return new Promise<void>((resolve) => {
      const timeout = setTimeout(() => finish(), STOP_TIMEOUT_MS);
      const finish = () => {
        clearTimeout(timeout);
        this.stopResolve = null;
        this.teardown();
        this.set({ phase: "detenida", startedAt: null, youtube: false, stats: null, backlog: 0 });
        resolve();
      };
      this.stopResolve = finish;
      const recorder = this.recorder;
      const sendStop = () => ws.readyState === WebSocket.OPEN && ws.send(JSON.stringify({ type: "stop" }));
      if (recorder && recorder.state !== "inactive") {
        recorder.addEventListener("stop", () => setTimeout(sendStop, 50), { once: true });
        recorder.stop();
      } else {
        sendStop();
      }
    });
  }

  /** Reintenta ya (por ejemplo, al volver a la página o recuperar la red). */
  retryNow() {
    if (this.stopping || this.fatal || this.state.phase !== "reconectando") return;
    clearTimeout(this.reconnectTimer);
    this.connect();
  }

  /** Usa otra cámara/micrófono (por ejemplo, tras recuperarlos) y abre una sesión nueva. */
  replaceStream(stream: MediaStream, reason: string) {
    this.options.stream = stream;
    this.restartSession(reason);
  }

  /** Corta la sesión actual y abre otra (por ejemplo, tras bajar la calidad). */
  restartSession(reason: string) {
    if (this.stopping || this.fatal || this.state.phase === "detenida") return;
    this.set({ phase: "reconectando", youtube: false, message: reason });
    this.closeSession(4100, "reinicio");
    this.reconnectTimer = setTimeout(() => this.connect(), 300);
  }

  private handleOnline = () => {
    this.set({ attempt: 0 });
    this.retryNow();
  };

  private async connect() {
    if (this.stopping) return;
    this.closeSession();
    const token = await this.options.getToken().catch(() => null);
    if (this.stopping) return;
    if (!token) {
      this.failFatal("Tu sesión expiró. Vuelve a iniciar sesión en el marcador.");
      return;
    }
    let ws: WebSocket;
    try {
      ws = new WebSocket(ingestUrl(this.options.relayUrl));
    } catch {
      this.failFatal("La dirección del intermediario no es válida.");
      return;
    }
    this.ws = ws;
    ws.binaryType = "arraybuffer";

    ws.onopen = () => {
      const hasAudio = this.options.stream.getAudioTracks().length > 0;
      ws.send(JSON.stringify({ type: "hello", token, mimeType: this.options.mimeType, hasAudio }));
    };

    ws.onmessage = (event) => {
      if (typeof event.data !== "string" || ws !== this.ws) return;
      let message: { type: string; code?: string; message?: string } & Partial<OutputStats>;
      try {
        message = JSON.parse(event.data);
      } catch {
        return;
      }
      switch (message.type) {
        case "ready":
          this.startRecorder(ws);
          break;
        case "live":
          this.set({ phase: "en_vivo", youtube: true, attempt: 0, message: "" });
          break;
        case "stats":
          this.set({ stats: { fps: message.fps ?? 0, kbps: message.kbps ?? 0, speed: message.speed ?? 0 } });
          break;
        case "output_error":
          this.set({ youtube: false, message: message.message ?? "Se interrumpió la salida a YouTube." });
          break;
        case "fatal":
          this.fatal = true;
          this.set({ message: message.message ?? "El intermediario rechazó la transmisión." });
          break;
        case "ended":
          this.stopResolve?.();
          break;
      }
    };

    ws.onclose = () => {
      if (ws !== this.ws) return;
      this.stopRecorder();
      this.stopMonitor();
      this.ws = null;
      if (this.stopping) {
        this.stopResolve?.();
        return;
      }
      if (this.fatal) {
        this.failFatal(this.state.message);
        return;
      }
      this.scheduleReconnect();
    };
  }

  private startRecorder(ws: WebSocket) {
    const bitrate = BITRATE_STEPS[this.step];
    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(this.options.stream, {
        mimeType: this.options.mimeType,
        videoBitsPerSecond: bitrate,
        audioBitsPerSecond: AUDIO_BITRATE,
      });
    } catch {
      this.failFatal("Este navegador no puede grabar el video. Usa Safari (iPhone) o Chrome (Android) actualizados.");
      ws.close(1000);
      return;
    }
    this.recorder = recorder;
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0 && ws.readyState === WebSocket.OPEN) ws.send(event.data);
    };
    recorder.onerror = () => {
      if (!this.stopping) this.restartSession("La grabación se detuvo; reiniciando…");
    };
    recorder.start(TIMESLICE_MS);
    this.set({ bitrate, phase: this.state.phase === "reconectando" ? "reconectando" : "conectando" });
    this.startMonitor(ws, bitrate);
  }

  private startMonitor(ws: WebSocket, bitrate: number) {
    this.stopMonitor();
    this.slowChecks = 0;
    this.monitor = setInterval(() => {
      const backlog = backlogSeconds(ws.bufferedAmount, bitrate + AUDIO_BITRATE);
      this.set({ backlog });
      if (backlog > BACKLOG_STEP_DOWN_S && this.step < BITRATE_STEPS.length - 1) {
        this.slowChecks += 1;
        if (this.slowChecks >= 3) {
          this.step += 1;
          this.restartSession("La red va lenta: se baja la calidad para no cortarse.");
        }
      } else {
        this.slowChecks = 0;
      }
    }, 1_000);
  }

  private stopMonitor() {
    clearInterval(this.monitor);
    this.monitor = undefined;
  }

  private stopRecorder() {
    const recorder = this.recorder;
    this.recorder = null;
    if (recorder && recorder.state !== "inactive") {
      recorder.ondataavailable = null;
      try {
        recorder.stop();
      } catch {
        // ya detenido
      }
    }
  }

  private scheduleReconnect() {
    const attempt = this.state.attempt + 1;
    const offline = typeof navigator !== "undefined" && navigator.onLine === false;
    this.set({
      phase: "reconectando",
      attempt,
      youtube: false,
      stats: null,
      backlog: 0,
      message: offline ? "Sin internet en el celular. Reintentando…" : this.state.message || "Conexión perdida. Reintentando…",
    });
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => this.connect(), reconnectDelay(attempt - 1));
  }

  private closeSession(code = 1000, reason = "") {
    this.stopRecorder();
    this.stopMonitor();
    const ws = this.ws;
    this.ws = null;
    if (ws && ws.readyState <= WebSocket.OPEN) {
      try {
        ws.close(code, reason);
      } catch {
        ws.close();
      }
    }
  }

  private failFatal(message: string) {
    this.stopping = true;
    clearTimeout(this.reconnectTimer);
    window.removeEventListener("online", this.handleOnline);
    this.teardown();
    this.set({ phase: "error", youtube: false, stats: null, backlog: 0, message });
  }

  private teardown() {
    this.closeSession();
    clearTimeout(this.reconnectTimer);
    window.removeEventListener("online", this.handleOnline);
  }

  dispose() {
    this.stopping = true;
    this.teardown();
  }
}
