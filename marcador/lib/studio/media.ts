/**
 * Utilidades puras del Estudio (sin DOM): formato de grabación, encuadre,
 * ajustes guardados, dirección del intermediario y tiempos de reconexión.
 */
import { DEFAULT_PLACEMENT, POSITIONS, type Position } from "@/components/scoreboard/placement";

/** Lo que recibe YouTube: horizontal, 1280 × 720 a 30 fps. */
export const VIDEO = { width: 1280, height: 720, fps: 30 } as const;

/** Calidades de envío del celular al intermediario; se baja una si la red no da abasto. */
export const BITRATE_STEPS = [2_500_000, 1_500_000, 900_000] as const;
export const AUDIO_BITRATE = 128_000;

/**
 * Formatos de MediaRecorder por orden de preferencia.
 * Chrome (Android): WebM con H.264 (codificador por hardware) o VP8.
 * Safari (iPhone): MP4 con H.264 + AAC (no graba WebM en versiones anteriores a la 18.4).
 */
export const MIME_CANDIDATES = [
  "video/webm;codecs=h264,opus",
  "video/webm;codecs=vp8,opus",
  "video/mp4;codecs=avc1.42E01F,mp4a.40.2",
  "video/mp4;codecs=avc1,mp4a",
  "video/mp4",
  "video/webm",
] as const;

export function pickMimeType(isTypeSupported: (type: string) => boolean): string | null {
  for (const type of MIME_CANDIDATES) {
    try {
      if (isTypeSupported(type)) return type;
    } catch {
      // algunos navegadores lanzan con códecs desconocidos
    }
  }
  return null;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Recorte "cubrir" (object-fit: cover): llena el cuadro sin deformar. */
export function coverRect(sourceWidth: number, sourceHeight: number, frameWidth: number, frameHeight: number): Rect {
  if (sourceWidth <= 0 || sourceHeight <= 0) return { x: 0, y: 0, width: frameWidth, height: frameHeight };
  const factor = Math.max(frameWidth / sourceWidth, frameHeight / sourceHeight);
  const width = sourceWidth * factor;
  const height = sourceHeight * factor;
  return { x: (frameWidth - width) / 2, y: (frameHeight - height) / 2, width, height };
}

export interface StudioSettings {
  /** Marcador visible en el video (además, el panel puede ocultarlo para todos). */
  showBoard: boolean;
  pos: Position;
  /** Tamaño relativo (1 = el mismo que el overlay de OBS por defecto). */
  scale: number;
  margin: number;
}

export const SCALE_RANGE = { min: 0.4, max: 1.2, step: 0.05 } as const;

export const DEFAULT_STUDIO_SETTINGS: StudioSettings = {
  showBoard: true,
  pos: "bottom-center",
  scale: 0.8,
  margin: DEFAULT_PLACEMENT.margin,
};

/** Lee ajustes guardados; cualquier valor raro vuelve al valor por defecto. */
export function parseStudioSettings(raw: string | null): StudioSettings {
  let data: Partial<Record<keyof StudioSettings, unknown>> = {};
  try {
    data = raw ? (JSON.parse(raw) as typeof data) : {};
  } catch {
    data = {};
  }
  const scale = Number(data.scale);
  const margin = Number(data.margin);
  return {
    showBoard: typeof data.showBoard === "boolean" ? data.showBoard : DEFAULT_STUDIO_SETTINGS.showBoard,
    pos: POSITIONS.includes(data.pos as Position) ? (data.pos as Position) : DEFAULT_STUDIO_SETTINGS.pos,
    scale:
      Number.isFinite(scale) && scale >= SCALE_RANGE.min && scale <= SCALE_RANGE.max ? scale : DEFAULT_STUDIO_SETTINGS.scale,
    margin: Number.isFinite(margin) && margin >= 0 && margin <= 200 ? margin : DEFAULT_STUDIO_SETTINGS.margin,
  };
}

/**
 * Dirección del intermediario. Se acepta https://… o wss://… (la del túnel) y,
 * para pruebas en la misma computadora, http://localhost.
 * Devuelve null si no es válida.
 */
export function normalizeRelayUrl(input: string): string | null {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return null;
  }
  const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  if (url.protocol === "https:") url.protocol = "wss:";
  else if (url.protocol === "http:" && local) url.protocol = "ws:";
  else if (!(url.protocol === "wss:" || (url.protocol === "ws:" && local))) return null;
  if (url.username || url.password) return null;
  url.pathname = url.pathname.replace(/\/(ingest|estado)?\/*$/, "") || "";
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/+$/, "");
}

export const ingestUrl = (relay: string) => `${relay}/ingest`;
export const relayStatusUrl = (relay: string) => `${relay.replace(/^ws/, "http")}/estado`;

/** Espera antes del reintento n (1 s, 2 s, 4 s… hasta 10 s). */
export function reconnectDelay(attempt: number): number {
  return Math.min(10_000, 1_000 * 2 ** Math.max(0, attempt));
}

/** Segundos de video pendientes de enviar, según lo que el navegador tiene en cola. */
export function backlogSeconds(bufferedBytes: number, bitsPerSecond: number): number {
  return bitsPerSecond > 0 ? (bufferedBytes * 8) / bitsPerSecond : 0;
}

export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(s / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  const seconds = s % 60;
  const mm = String(minutes).padStart(2, "0");
  const ss = String(seconds).padStart(2, "0");
  return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`;
}
