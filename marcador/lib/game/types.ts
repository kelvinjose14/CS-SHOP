export type Sport = "softball" | "beisbol";
export type Half = "alta" | "baja";
export type GameStatus = "previo" | "en_juego" | "suspendido" | "finalizado";
export type TeamSide = "home" | "away";
export type Base = "on_first" | "on_second" | "on_third";
export type CountField = "balls" | "strikes" | "outs";

/** Una fila de public.marcador_games (lo que ve el dueño en el panel). */
export interface GameRow {
  id: string;
  slug: string;
  owner_id: string;
  title: string;

  sport: Sport;
  scheduled_innings: number;
  auto_new_batter: boolean;
  auto_change_half: boolean;

  home_name: string;
  home_abbr: string;
  home_color: string;
  home_logo_url: string | null;
  away_name: string;
  away_abbr: string;
  away_color: string;
  away_logo_url: string | null;

  brand_name: string;
  brand_subtitle: string;
  brand_logo_url: string | null;
  venue: string;
  accent_color: string;
  panel_color: string;

  home_runs: number;
  away_runs: number;
  inning: number;
  half: Half;
  balls: number;
  strikes: number;
  outs: number;
  on_first: boolean;
  on_second: boolean;
  on_third: boolean;
  status: GameStatus;
  overlay_visible: boolean;

  undo_count: number;
  version: number;
  created_at: string;
  updated_at: string;
}

/** Campos que entrega marcador_get_overlay y el canal público del overlay. */
export const OVERLAY_FIELDS = [
  "slug",
  "version",
  "updated_at",
  "sport",
  "scheduled_innings",
  "home_name",
  "home_abbr",
  "home_color",
  "home_logo_url",
  "away_name",
  "away_abbr",
  "away_color",
  "away_logo_url",
  "brand_name",
  "brand_subtitle",
  "brand_logo_url",
  "venue",
  "accent_color",
  "panel_color",
  "home_runs",
  "away_runs",
  "inning",
  "half",
  "balls",
  "strikes",
  "outs",
  "on_first",
  "on_second",
  "on_third",
  "status",
  "overlay_visible",
] as const satisfies readonly (keyof GameRow)[];

export type OverlayGame = Pick<GameRow, (typeof OVERLAY_FIELDS)[number]>;

/** Campos que el cliente puede escribir (el resto lo controla el servidor). */
export type GamePatch = Partial<
  Omit<GameRow, "id" | "slug" | "owner_id" | "created_at" | "updated_at" | "version" | "undo_count">
>;

export const STATUS_LABELS: Record<GameStatus, string> = {
  previo: "Previo",
  en_juego: "En juego",
  suspendido: "Suspendido",
  finalizado: "Finalizado",
};

export const SPORT_LABELS: Record<Sport, string> = {
  softball: "Softball",
  beisbol: "Béisbol",
};
