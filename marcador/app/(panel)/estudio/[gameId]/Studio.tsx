"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { ConfirmDialog } from "@/components/control/ConfirmDialog";
import { POSITIONS, type Position } from "@/components/scoreboard/placement";
import type { OverlayGame } from "@/lib/game/types";
import { CONNECTION_LABELS, useLiveTopic } from "@/lib/realtime/useLiveTopic";
import { Broadcaster, IDLE_STATE, type BroadcastState } from "@/lib/studio/broadcaster";
import { Compositor } from "@/lib/studio/compositor";
import { drawScoreboard, PADDED_HEIGHT, PADDED_WIDTH, SCORE_FONTS } from "@/lib/studio/drawScoreboard";
import {
  DEFAULT_STUDIO_SETTINGS,
  formatDuration,
  normalizeRelayUrl,
  parseStudioSettings,
  pickMimeType,
  relayStatusUrl,
  SCALE_RANGE,
  VIDEO,
  type StudioSettings,
} from "@/lib/studio/media";
import { readStoredRelay, storeRelay } from "@/lib/studio/relayStorage";
import { getBrowserClient } from "@/lib/supabase/client";

const POSITION_LABELS: Record<Position, string> = {
  "top-left": "Arriba izquierda",
  "top-center": "Arriba al centro",
  "top-right": "Arriba derecha",
  center: "Centro",
  "bottom-left": "Abajo izquierda",
  "bottom-center": "Abajo al centro",
  "bottom-right": "Abajo derecha",
};

const PHASE_LABELS: Record<BroadcastState["phase"], string> = {
  detenida: "Sin transmitir",
  conectando: "Conectando…",
  en_vivo: "EN VIVO",
  reconectando: "Reconectando…",
  finalizando: "Finalizando…",
  error: "Detenida por un error",
};

type RelayCheck =
  | { state: "sin_configurar" }
  | { state: "comprobando" }
  | { state: "listo" }
  | { state: "incompleto"; faltan: string[] }
  | { state: "inalcanzable" };

type MediaState = "apagada" | "pidiendo" | "activa" | "denegada" | "error";

interface Props {
  gameId: string;
  slug: string;
  title: string;
  initial: OverlayGame | null;
}

const settingsKey = (gameId: string) => `marcador.estudio.${gameId}`;

const noSubscribe = () => () => {};

export function Studio({ gameId, slug, title, initial }: Props) {
  // ---------- Marcador en vivo (misma sincronización que el overlay) ----------
  const [game, setGame] = useState<OverlayGame | null>(initial);
  const accept = useCallback((next: OverlayGame) => {
    setGame((prev) => (!prev || next.version >= prev.version ? next : prev));
  }, []);
  const resync = useCallback(async () => {
    const { data, error } = await getBrowserClient().rpc("marcador_get_overlay", { p_slug: slug });
    if (error) return false;
    if (data) accept(data as OverlayGame);
    return true;
  }, [slug, accept]);
  const scoreConnection = useLiveTopic<OverlayGame>({ topic: `marcador-overlay:${slug}`, onMessage: accept, resync });

  // ---------- Ajustes guardados en este celular ----------
  // (Este componente solo se dibuja en el navegador: ver StudioLoader.)
  const [settings, setSettings] = useState<StudioSettings>(() => {
    try {
      return parseStudioSettings(localStorage.getItem(settingsKey(gameId)));
    } catch {
      return DEFAULT_STUDIO_SETTINGS;
    }
  });
  const [relayUrl, setRelayUrl] = useState(readStoredRelay);
  const [relayDraft, setRelayDraft] = useState(relayUrl);
  const [relayDraftError, setRelayDraftError] = useState("");
  const updateSettings = (patch: Partial<StudioSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      try {
        localStorage.setItem(settingsKey(gameId), JSON.stringify(next));
      } catch {
        // sin almacenamiento: el ajuste vale hasta cerrar la página
      }
      return next;
    });
  };

  // ---------- Comprobación del intermediario ----------
  const [relayResult, setRelayResult] = useState<{ key: string; check: RelayCheck } | null>(null);
  const [checkNonce, setCheckNonce] = useState(0);
  const checkKey = `${relayUrl}#${checkNonce}`;
  useEffect(() => {
    if (!relayUrl) return;
    let cancelled = false;
    void fetchRelayStatus(relayUrl).then((check) => !cancelled && setRelayResult({ key: checkKey, check }));
    return () => {
      cancelled = true;
    };
  }, [relayUrl, checkKey]);
  const relayCheck: RelayCheck = !relayUrl
    ? { state: "sin_configurar" }
    : relayResult?.key === checkKey
      ? relayResult.check
      : { state: "comprobando" };
  const recheckRelay = () => setCheckNonce((n) => n + 1);

  const saveRelay = () => {
    const normalized = normalizeRelayUrl(relayDraft);
    if (!normalized) {
      setRelayDraftError("Dirección no válida. Debe empezar por https:// (la del túnel).");
      return;
    }
    setRelayDraftError("");
    storeRelay(normalized);
    setRelayDraft(normalized);
    setRelayUrl(normalized);
    recheckRelay();
  };

  // ---------- Cámara, micrófono y composición ----------
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const compositorRef = useRef<Compositor | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const outputRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const meterRef = useRef<HTMLSpanElement>(null);
  const [media, setMedia] = useState<MediaState>("apagada");
  const [mediaError, setMediaError] = useState("");
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [mics, setMics] = useState<MediaDeviceInfo[]>([]);
  const [cameraId, setCameraId] = useState("");
  const [micId, setMicId] = useState("");
  const [muted, setMuted] = useState(false);
  const [portrait, setPortrait] = useState(false);

  const mimeType = useSyncExternalStore(
    noSubscribe,
    () => (typeof MediaRecorder === "undefined" ? "" : (pickMimeType((t) => MediaRecorder.isTypeSupported(t)) ?? "")),
    () => "",
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const compositor = new Compositor(canvas);
    compositorRef.current = compositor;
    compositor.setVideo(videoRef.current);
    compositor.start();
    return () => {
      compositor.stop();
      compositorRef.current = null;
    };
  }, []);

  const listDevices = useCallback(async () => {
    const devices = await navigator.mediaDevices.enumerateDevices();
    setCameras(devices.filter((d) => d.kind === "videoinput"));
    setMics(devices.filter((d) => d.kind === "audioinput"));
  }, []);

  const startMeter = useCallback((stream: MediaStream) => {
    const track = stream.getAudioTracks()[0];
    if (!track) return;
    try {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      audioCtxRef.current?.close().catch(() => {});
      const ctx = new Ctor();
      audioCtxRef.current = ctx;
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      ctx.createMediaStreamSource(new MediaStream([track])).connect(analyser);
      const data = new Uint8Array(analyser.fftSize);
      const loop = () => {
        if (audioCtxRef.current !== ctx) return;
        analyser.getByteTimeDomainData(data);
        let peak = 0;
        for (const value of data) peak = Math.max(peak, Math.abs(value - 128));
        if (meterRef.current) meterRef.current.style.transform = `scaleX(${track.enabled ? Math.min(1, peak / 64) : 0})`;
        requestAnimationFrame(loop);
      };
      loop();
    } catch {
      // sin medidor de audio; la transmisión no depende de él
    }
  }, []);

  const attachVideo = useCallback(async (stream: MediaStream) => {
    const video = videoRef.current;
    if (!video) return;
    video.srcObject = stream;
    video.muted = true;
    video.playsInline = true;
    await video.play().catch(() => {});
  }, []);

  /** Pide cámara (trasera por defecto) y micrófono. */
  const openMedia = useCallback(
    async (opts: { cameraId?: string; micId?: string } = {}) => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setMedia("error");
        setMediaError("Este navegador no permite usar la cámara. Abre la página en Safari (iPhone) o Chrome (Android).");
        return null;
      }
      setMedia("pidiendo");
      setMediaError("");
      const video: MediaTrackConstraints = {
        width: { ideal: VIDEO.width },
        height: { ideal: VIDEO.height },
        frameRate: { ideal: VIDEO.fps, max: VIDEO.fps },
        ...(opts.cameraId ? { deviceId: { exact: opts.cameraId } } : { facingMode: { ideal: "environment" } }),
      };
      const audio: MediaTrackConstraints = {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        ...(opts.micId ? { deviceId: { exact: opts.micId } } : {}),
      };
      for (const track of streamRef.current?.getTracks() ?? []) track.stop();
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video, audio });
        streamRef.current = stream;
        const [videoTrack] = stream.getVideoTracks();
        const [audioTrack] = stream.getAudioTracks();
        if (audioTrack) audioTrack.enabled = !muted;
        setCameraId(videoTrack?.getSettings().deviceId ?? "");
        setMicId(audioTrack?.getSettings().deviceId ?? "");
        await attachVideo(stream);
        startMeter(stream);
        await listDevices();
        setMedia("activa");
        return stream;
      } catch (error) {
        const name = error instanceof DOMException ? error.name : "";
        setMedia(name === "NotAllowedError" ? "denegada" : "error");
        setMediaError(
          name === "NotAllowedError"
            ? "Permiso denegado. Permite cámara y micrófono en los ajustes del navegador para este sitio y recarga."
            : name === "NotReadableError"
              ? "La cámara está en uso por otra app. Ciérrala y vuelve a intentar."
              : "No se pudo abrir la cámara o el micrófono.",
        );
        return null;
      }
    },
    [attachVideo, listDevices, startMeter, muted],
  );

  /** Cambia solo la cámara (se puede durante la transmisión, sin cortar). */
  const switchCamera = async (deviceId: string) => {
    const stream = streamRef.current;
    if (!stream) return;
    for (const track of stream.getVideoTracks()) {
      track.stop();
      stream.removeTrack(track);
    }
    try {
      const fresh = await navigator.mediaDevices.getUserMedia({
        video: {
          deviceId: { exact: deviceId },
          width: { ideal: VIDEO.width },
          height: { ideal: VIDEO.height },
          frameRate: { ideal: VIDEO.fps, max: VIDEO.fps },
        },
      });
      const [track] = fresh.getVideoTracks();
      stream.addTrack(track);
      setCameraId(deviceId);
      await attachVideo(new MediaStream(stream.getTracks()));
    } catch {
      setMediaError("No se pudo cambiar a esa cámara.");
    }
  };

  // Orientación: el video de YouTube es horizontal.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const check = () => setPortrait(video.videoHeight > video.videoWidth);
    video.addEventListener("resize", check);
    video.addEventListener("loadedmetadata", check);
    return () => {
      video.removeEventListener("resize", check);
      video.removeEventListener("loadedmetadata", check);
    };
  }, []);

  // ---------- Marcador dibujado en el video ----------
  const boardRef = useRef<HTMLCanvasElement | null>(null);
  const logosRef = useRef(new Map<string, HTMLImageElement | "cargando" | "error">());
  const [logoTick, setLogoTick] = useState(0);
  const [fontsTick, setFontsTick] = useState(0);
  useEffect(() => {
    let cancelled = false;
    Promise.all(SCORE_FONTS.map((f) => document.fonts?.load(f)))
      .catch(() => {})
      .then(() => !cancelled && setFontsTick((n) => n + 1));
    return () => {
      cancelled = true;
    };
  }, []);

  const logo = useCallback((url: string | null) => {
    if (!url) return null;
    const cache = logosRef.current;
    const entry = cache.get(url);
    if (entry instanceof HTMLImageElement) return entry;
    if (!entry) {
      cache.set(url, "cargando");
      const img = new Image();
      img.crossOrigin = "anonymous"; // sin CORS no carga y se usa la abreviatura: el video nunca se bloquea
      img.decoding = "async";
      img.onload = () => {
        cache.set(url, img);
        setLogoTick((n) => n + 1);
      };
      img.onerror = () => cache.set(url, "error");
      img.src = url;
    }
    return null;
  }, []);

  const boardVisible = !!game && settings.showBoard && game.overlay_visible;
  useEffect(() => {
    const compositor = compositorRef.current;
    if (!compositor) return;
    if (!game || !boardVisible) {
      compositor.setBoard(null, null);
      return;
    }
    boardRef.current ??= Object.assign(document.createElement("canvas"), { width: PADDED_WIDTH, height: PADDED_HEIGHT });
    const ctx = boardRef.current.getContext("2d");
    if (!ctx) return;
    drawScoreboard(ctx, game, logo);
    compositor.setBoard(boardRef.current, { scale: settings.scale, pos: settings.pos, margin: settings.margin });
  }, [game, boardVisible, settings, logo, logoTick, fontsTick]);

  // ---------- Transmisión ----------
  const [broadcast, setBroadcast] = useState<BroadcastState>(IDLE_STATE);
  const broadcasterRef = useRef<Broadcaster | null>(null);
  const [confirmStop, setConfirmStop] = useState(false);
  const live = !["detenida", "error"].includes(broadcast.phase);

  const getToken = useCallback(async () => {
    const { data } = await getBrowserClient().auth.getSession();
    return data.session?.access_token ?? null;
  }, []);

  /** Video del lienzo (con el marcador) + audio del micrófono: lo que se envía. */
  const outputStream = (stream: MediaStream) => {
    const compositor = compositorRef.current;
    if (!compositor) return null;
    outputRef.current ??= compositor.captureStream();
    return new MediaStream([...outputRef.current.getVideoTracks(), ...stream.getAudioTracks()]);
  };

  const startBroadcast = async () => {
    if (!relayUrl || !mimeType) return;
    let stream = streamRef.current;
    if (!stream || stream.getTracks().some((t) => t.readyState === "ended")) stream = await openMedia({ cameraId, micId });
    const output = stream && outputStream(stream);
    if (!output) return;
    broadcasterRef.current?.dispose();
    const broadcaster = new Broadcaster({ relayUrl, mimeType, getToken, stream: output, onState: setBroadcast });
    broadcasterRef.current = broadcaster;
    broadcaster.start();
  };

  /** Tras recuperar cámara y micrófono, sigue la misma transmisión (no reinicia la duración). */
  const resumeWith = (stream: MediaStream | null) => {
    const output = stream && outputStream(stream);
    if (output && broadcasterRef.current && live) broadcasterRef.current.replaceStream(output, "Cámara y micrófono recuperados; reanudando…");
  };

  const stopBroadcast = async () => {
    setConfirmStop(false);
    await broadcasterRef.current?.stop();
  };

  useEffect(() => () => broadcasterRef.current?.dispose(), []);

  // Silenciar: el audio sigue saliendo, pero en silencio (YouTube no corta).
  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    for (const track of streamRef.current?.getAudioTracks() ?? []) track.enabled = !next;
  };

  const switchMic = (deviceId: string) => void openMedia({ cameraId, micId: deviceId });

  // Pantalla siempre encendida mientras se transmite.
  const [wakeLock, setWakeLock] = useState<"no_disponible" | "activa" | "inactiva">("inactiva");
  useEffect(() => {
    if (!live) return;
    let sentinel: WakeLockSentinel | null = null;
    let cancelled = false;
    const request = async () => {
      if (!("wakeLock" in navigator)) return setWakeLock("no_disponible");
      try {
        sentinel = await navigator.wakeLock.request("screen");
        if (cancelled) return sentinel.release();
        setWakeLock("activa");
        sentinel.addEventListener("release", () => setWakeLock("inactiva"));
      } catch {
        setWakeLock("inactiva");
      }
    };
    void request();
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      void request();
      // Al volver: si el sistema apagó la cámara o el micrófono, se reabren y se reanuda.
      const stream = streamRef.current;
      const lost = !stream || stream.getTracks().some((t) => t.readyState === "ended");
      if (lost) void openMedia({ cameraId, micId }).then(resumeWith);
      else broadcasterRef.current?.retryNow();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      void sentinel?.release().catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo depende de si hay transmisión
  }, [live]);

  // Si la cámara o el micrófono se cortan (llamada entrante, otra app), se avisa y se intenta recuperar.
  useEffect(() => {
    const stream = streamRef.current;
    if (!stream || media !== "activa") return;
    const onEnded = () => {
      setMediaError("Se perdió la cámara o el micrófono. Recuperando…");
      if (document.visibilityState === "visible") {
        void openMedia({ cameraId, micId }).then(resumeWith);
      }
    };
    const tracks = stream.getTracks();
    for (const track of tracks) track.addEventListener("ended", onEnded);
    return () => {
      for (const track of tracks) track.removeEventListener("ended", onEnded);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- se vuelve a enganchar al cambiar de stream
  }, [media, cameraId, micId, live]);

  // Duración en pantalla.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!broadcast.startedAt) return;
    const timer = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(timer);
  }, [broadcast.startedAt]);
  const duration = broadcast.startedAt ? formatDuration((now - broadcast.startedAt) / 1000) : "00:00";

  const panelUrl = useSyncExternalStore(noSubscribe, () => `${window.location.origin}/control/${gameId}`, () => "");

  const canStart = media === "activa" && relayCheck.state === "listo" && !!mimeType && !live;
  const startBlocker = (() => {
    if (!mimeType) return "Este navegador no puede grabar video. Usa Safari (iPhone, iOS 14.5+) o Chrome (Android).";
    if (media !== "activa") return "Primero activa la cámara y el micrófono.";
    if (relayCheck.state === "sin_configurar") return "Falta la dirección del intermediario (abajo).";
    if (relayCheck.state === "inalcanzable") return "No se encuentra el intermediario. ¿Está encendido en tu computadora?";
    if (relayCheck.state === "incompleto") return `Al intermediario le falta: ${relayCheck.faltan.join(", ")}.`;
    if (relayCheck.state === "comprobando") return "Comprobando el intermediario…";
    return "";
  })();

  return (
    <>
      <header className="topbar sticky">
        <Link className="btn btn-ghost btn-small" href={`/control/${gameId}`} aria-label="Volver al panel">
          ←
        </Link>
        <h1 className="topbar-title">Estudio · {title}</h1>
        <span className="conn" data-status={broadcast.phase === "en_vivo" ? "conectado" : live ? "reconectando" : "sin_conexion"} data-testid="broadcast-phase">
          <span className="conn-dot" aria-hidden />
          {PHASE_LABELS[broadcast.phase]}
        </span>
      </header>

      <main className="page studio-grid">
        <div className="studio-live">
          <div className="studio-stage">
            <canvas ref={canvasRef} className="studio-canvas" data-testid="studio-canvas" aria-label="Vista previa de lo que recibe YouTube" />
            {/* El video de la cámara solo alimenta al lienzo; tiene que estar en la página para que iOS lo reproduzca. */}
            <video ref={videoRef} className="studio-source" playsInline muted autoPlay aria-hidden />
            {media !== "activa" && (
              <div className="studio-cover">
                <button className="btn btn-primary btn-big" onClick={() => openMedia()} disabled={media === "pidiendo"} data-testid="open-media">
                  {media === "pidiendo" ? "Esperando permiso…" : "Activar cámara y micrófono"}
                </button>
                {mediaError && <p className="error-text">{mediaError}</p>}
              </div>
            )}
            <div className="studio-badges">
              {live && (
                <span className={`studio-badge ${broadcast.phase === "en_vivo" ? "is-live" : ""}`} data-testid="duration">
                  ● {broadcast.phase === "en_vivo" ? "EN VIVO" : PHASE_LABELS[broadcast.phase]} · {duration}
                </span>
              )}
              {muted && <span className="studio-badge is-warn">Micrófono silenciado</span>}
              {portrait && <span className="studio-badge is-warn">Gira el celular a horizontal</span>}
            </div>
          </div>

          <div className="studio-actions">
            {!live ? (
              <button className="btn btn-primary btn-big" onClick={startBroadcast} disabled={!canStart} data-testid="start-broadcast">
                Iniciar transmisión
              </button>
            ) : (
              <button className="btn btn-danger btn-big" onClick={() => setConfirmStop(true)} disabled={broadcast.phase === "finalizando"} data-testid="stop-broadcast">
                Finalizar transmisión…
              </button>
            )}
            <button
              className={`btn btn-big ${muted ? "btn-primary" : ""}`}
              onClick={toggleMute}
              disabled={media !== "activa"}
              aria-pressed={muted}
              data-testid="toggle-mute"
            >
              {muted ? "Activar micrófono" : "Silenciar micrófono"}
            </button>
          </div>
          {!live && startBlocker && <p className="hint" data-testid="start-blocker">{startBlocker}</p>}
          {broadcast.message && (
            <p className={broadcast.phase === "error" ? "error-text" : "hint"} role="status" data-testid="broadcast-message">
              {broadcast.message}
            </p>
          )}

          <section className="card" aria-labelledby="h-status">
            <h2 id="h-status">Estado</h2>
            <dl className="studio-status">
              <dt>Transmisión</dt>
              <dd data-testid="status-broadcast">
                {PHASE_LABELS[broadcast.phase]}
                {live && ` · ${duration}`}
                {broadcast.phase === "reconectando" && broadcast.attempt > 0 && ` (intento ${broadcast.attempt})`}
              </dd>
              <dt>YouTube</dt>
              <dd data-testid="status-youtube">
                {broadcast.youtube && broadcast.stats
                  ? `Recibiendo · ${Math.round(broadcast.stats.fps)} fps · ${Math.round(broadcast.stats.kbps)} kbps`
                  : live
                    ? "Esperando señal…"
                    : "—"}
              </dd>
              <dt>Envío desde el celular</dt>
              <dd data-testid="status-upload">
                {live
                  ? broadcast.backlog > 3
                    ? `Red lenta: ${broadcast.backlog.toFixed(0)} s pendientes`
                    : `Al día · ${(broadcast.bitrate / 1_000_000).toFixed(1)} Mbps`
                  : "—"}
              </dd>
              <dt>Intermediario</dt>
              <dd data-testid="status-relay">{relayLabel(relayCheck)}</dd>
              <dt>Marcador</dt>
              <dd data-testid="status-score">
                {CONNECTION_LABELS[scoreConnection]}
                {game && !game.overlay_visible && " · oculto desde el panel"}
              </dd>
              <dt>Cámara y micrófono</dt>
              <dd>
                {media === "activa" ? "Activos" : media === "pidiendo" ? "Pidiendo permiso…" : media === "apagada" ? "Apagados" : "No disponibles"}
                {media === "activa" && (
                  <span className="studio-meter" aria-label="Nivel del micrófono">
                    <span ref={meterRef} />
                  </span>
                )}
              </dd>
              <dt>Pantalla</dt>
              <dd>{wakeLock === "activa" ? "Se mantiene encendida" : wakeLock === "no_disponible" ? "Desactiva el bloqueo automático a mano" : "—"}</dd>
            </dl>
          </section>

          <section className="card studio-warning" aria-labelledby="h-warning">
            <h2 id="h-warning">Mientras transmites</h2>
            <ul>
              <li>
                Deja el celular <strong>desbloqueado y con esta página abierta</strong>. Si lo bloqueas, contestas una llamada o
                cambias de app, el video se detiene. Al volver se reanuda solo, pero en YouTube habrá un corte.
              </li>
              <li>No se puede transmitir en segundo plano.</li>
              <li>Conecta el cargador y usa Wi-Fi o buena señal. Una hora gasta unos 1,3 GB de datos.</li>
              <li>Pon el celular en horizontal.</li>
            </ul>
          </section>
        </div>

        <div className="studio-config">
          <section className="card" aria-labelledby="h-board">
            <h2 id="h-board">Marcador en el video</h2>
            <div className="stack">
              <label className="switch">
                <input
                  type="checkbox"
                  checked={settings.showBoard}
                  onChange={(e) => updateSettings({ showBoard: e.target.checked })}
                  data-testid="studio-show-board"
                />
                <span>
                  <strong>Mostrar el marcador</strong>
                  <small>El botón «Ocultar marcador» del panel también lo quita del video.</small>
                </span>
              </label>
              <div className="field">
                <label htmlFor="studio-pos">Posición</label>
                <select id="studio-pos" value={settings.pos} onChange={(e) => updateSettings({ pos: e.target.value as Position })} data-testid="studio-pos">
                  {POSITIONS.map((pos) => (
                    <option key={pos} value={pos}>
                      {POSITION_LABELS[pos]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="studio-scale">Tamaño: {Math.round(settings.scale * 100)} %</label>
                <input
                  id="studio-scale"
                  type="range"
                  min={SCALE_RANGE.min}
                  max={SCALE_RANGE.max}
                  step={SCALE_RANGE.step}
                  value={settings.scale}
                  onChange={(e) => updateSettings({ scale: Number(e.target.value) })}
                  data-testid="studio-scale"
                />
              </div>
            </div>
          </section>

          <section className="card" aria-labelledby="h-devices">
            <h2 id="h-devices">Cámara y micrófono</h2>
            <div className="stack">
              <div className="field">
                <label htmlFor="studio-camera">Cámara</label>
                <select
                  id="studio-camera"
                  value={cameraId}
                  disabled={media !== "activa" || cameras.length < 2}
                  onChange={(e) => switchCamera(e.target.value)}
                  data-testid="studio-camera"
                >
                  {cameras.map((d, i) => (
                    <option key={d.deviceId} value={d.deviceId}>
                      {d.label || `Cámara ${i + 1}`}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="studio-mic">Micrófono</label>
                <select
                  id="studio-mic"
                  value={micId}
                  disabled={media !== "activa" || mics.length < 2 || live}
                  onChange={(e) => switchMic(e.target.value)}
                  data-testid="studio-mic"
                >
                  {mics.map((d, i) => (
                    <option key={d.deviceId} value={d.deviceId}>
                      {d.label || `Micrófono ${i + 1}`}
                    </option>
                  ))}
                </select>
              </div>
              <p className="hint">
                La cámara se puede cambiar en vivo. El micrófono, antes de iniciar la transmisión.
              </p>
            </div>
          </section>

          <section className="card" aria-labelledby="h-relay">
            <h2 id="h-relay">Intermediario</h2>
            <div className="stack">
              <div className="field">
                <label htmlFor="relay-url">Dirección (la muestra la computadora al ejecutar npm start)</label>
                <input
                  id="relay-url"
                  type="url"
                  inputMode="url"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  placeholder="https://algo.trycloudflare.com"
                  value={relayDraft}
                  disabled={live}
                  onChange={(e) => setRelayDraft(e.target.value)}
                  data-testid="relay-url"
                />
              </div>
              <div className="row">
                <button className="btn btn-primary" style={{ flex: 1 }} onClick={saveRelay} disabled={live} data-testid="save-relay">
                  Guardar y comprobar
                </button>
                <button className="btn" onClick={recheckRelay} disabled={!relayUrl}>
                  Comprobar
                </button>
              </div>
              {relayDraftError && <p className="error-text">{relayDraftError}</p>}
              <p className="hint">La clave de YouTube se guarda solo en el intermediario; nunca pasa por este celular.</p>
            </div>
          </section>

          <section className="card" aria-labelledby="h-share">
            <h2 id="h-share">Marcador desde otro celular</h2>
            <p className="hint" style={{ marginTop: 0 }}>
              Otra persona puede llevar el marcador mientras tú grabas: que abra el panel e inicie sesión con la misma cuenta.
              Los cambios aparecen en el video en menos de un segundo.
            </p>
            <code className="overlay-url">{panelUrl}</code>
          </section>
        </div>
      </main>

      <ConfirmDialog
        open={confirmStop}
        title="¿Finalizar la transmisión?"
        confirmLabel="Sí, finalizar"
        onConfirm={stopBroadcast}
        onCancel={() => setConfirmStop(false)}
      >
        <p style={{ margin: 0 }}>
          Se deja de enviar video a YouTube. Para terminar también el directo, ciérralo en YouTube Studio (o se cerrará solo
          al rato).
        </p>
      </ConfirmDialog>
    </>
  );
}

async function fetchRelayStatus(url: string): Promise<RelayCheck> {
  try {
    const response = await fetch(relayStatusUrl(url), { cache: "no-store", signal: AbortSignal.timeout(8000) });
    const body = (await response.json()) as { listo: boolean; faltan: string[] };
    return body.listo ? { state: "listo" } : { state: "incompleto", faltan: body.faltan ?? [] };
  } catch {
    return { state: "inalcanzable" };
  }
}

function relayLabel(check: RelayCheck): string {
  switch (check.state) {
    case "sin_configurar":
      return "Sin configurar";
    case "comprobando":
      return "Comprobando…";
    case "listo":
      return "Listo";
    case "incompleto":
      return `Falta configurar: ${check.faltan.join(", ")}`;
    case "inalcanzable":
      return "No responde";
  }
}
