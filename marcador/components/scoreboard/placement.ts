/**
 * Colocación del marcador dentro del lienzo de la fuente de OBS.
 *
 * El marcador mide 1600 × 220 px. Se escala de forma proporcional (un solo
 * factor para ancho y alto) tomando como referencia un cuadro de 1920 × 1080:
 * en una fuente de 1280 × 720 ocupa la misma proporción del video.
 * Nunca se sale del cuadro ni se deforma.
 */

export const REFERENCE_WIDTH = 1920;
export const REFERENCE_HEIGHT = 1080;

export const POSITIONS = [
  "top-left",
  "top-center",
  "top-right",
  "center",
  "bottom-left",
  "bottom-center",
  "bottom-right",
] as const;
export type Position = (typeof POSITIONS)[number];

export interface PlacementOptions {
  scale: number;
  pos: Position;
  /** Margen al borde, en px de un cuadro de 1920 × 1080. */
  margin: number;
}

export const DEFAULT_PLACEMENT: PlacementOptions = { scale: 1, pos: "bottom-center", margin: 40 };

type Query = Record<string, string | string[] | undefined>;

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

/** Lee ?scale=0.8&pos=top-left&margin=24 con valores seguros por defecto. */
export function parsePlacement(query: Query): PlacementOptions {
  const scaleRaw = Number(first(query.scale));
  const marginRaw = Number(first(query.margin));
  const posRaw = first(query.pos);
  return {
    scale: Number.isFinite(scaleRaw) && scaleRaw > 0 ? Math.min(3, Math.max(0.1, scaleRaw)) : DEFAULT_PLACEMENT.scale,
    pos: POSITIONS.includes(posRaw as Position) ? (posRaw as Position) : DEFAULT_PLACEMENT.pos,
    margin:
      Number.isFinite(marginRaw) && marginRaw >= 0 ? Math.min(400, marginRaw) : DEFAULT_PLACEMENT.margin,
  };
}

export interface Placement {
  factor: number;
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Calcula factor de escala y posición para un viewport dado. */
export function computePlacement(
  viewportWidth: number,
  viewportHeight: number,
  boardWidth: number,
  boardHeight: number,
  { scale, pos, margin }: PlacementOptions,
): Placement {
  const frame = Math.min(viewportWidth / REFERENCE_WIDTH, viewportHeight / REFERENCE_HEIGHT);
  const m = margin * frame;
  // El mismo factor para ancho y alto, limitado para que siempre quepa con su margen.
  const fitWidth = Math.max(0, viewportWidth - 2 * m) / boardWidth;
  const fitHeight = Math.max(0, viewportHeight - 2 * m) / boardHeight;
  const factor = Math.max(0, Math.min(frame * scale, fitWidth, fitHeight));
  const width = boardWidth * factor;
  const height = boardHeight * factor;

  const [vertical, horizontal = "center"] = pos === "center" ? ["center", "center"] : pos.split("-");
  const left =
    horizontal === "left" ? m : horizontal === "right" ? viewportWidth - width - m : (viewportWidth - width) / 2;
  const top =
    vertical === "top" ? m : vertical === "bottom" ? viewportHeight - height - m : (viewportHeight - height) / 2;

  return { factor, left: Math.round(left), top: Math.round(top), width, height };
}
