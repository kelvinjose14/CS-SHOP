/**
 * Reglas del marcador como funciones puras.
 *
 * Cada acción del panel es una función (estado actual) -> cambios, o null si no
 * hay nada que cambiar. La cola de acciones la aplica sobre el último estado
 * confirmado por el servidor, así nunca se calcula sobre datos viejos.
 *
 * Los mismos límites están en la base de datos (CHECK constraints): si alguien
 * se salta la interfaz, la escritura se rechaza igual.
 *
 * Automatismos (cada uno con su interruptor en el panel):
 *   - Conteo (activado por defecto): 4.ª bola = base por bolas (el bateador va a
 *     primera, avanzan solo los corredores forzados y con bases llenas entra una
 *     carrera); 3.er strike = out (si es el tercero, cambia la mitad del inning).
 *   - 3.er out → cambiar mitad de inning (desactivado por defecto).
 * Fuera de eso no se deducen avances de corredores ni carreras.
 */
import type { Base, CountField, GamePatch, GameRow, GameStatus, Half, TeamSide } from "./types";

export const LIMITS = {
  runs: { min: 0, max: 999 },
  inning: { min: 1, max: 99 },
  balls: { min: 0, max: 3 },
  strikes: { min: 0, max: 2 },
  outs: { min: 0, max: 2 },
  scheduledInnings: { min: 1, max: 20 },
  titleLength: 80,
  teamNameLength: 40,
  abbrLength: 4,
  brandNameLength: 30,
  brandSubtitleLength: 40,
  venueLength: 60,
  urlLength: 1000,
} as const;

export const COUNT_LIMITS: Record<CountField, { min: number; max: number }> = {
  balls: LIMITS.balls,
  strikes: LIMITS.strikes,
  outs: LIMITS.outs,
};

export type PatchAction = {
  kind: "patch";
  label: string;
  compute: (game: GameRow) => GamePatch | null;
};
export type UndoAction = { kind: "undo"; label: string };
export type GameAction = PatchAction | UndoAction;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const runsKey = (side: TeamSide): "home_runs" | "away_runs" => (side === "home" ? "home_runs" : "away_runs");

/** Cambios que limpian el turno al bate. */
const NEW_BATTER: GamePatch = { balls: 0, strikes: 0 };

/**
 * Base por bolas: el bateador va a primera y solo avanzan los corredores forzados.
 * Con las bases llenas, el de tercera anota una carrera para el equipo al bate.
 */
export function walkPatch(game: GameRow): GamePatch {
  const changes: GamePatch = { ...NEW_BATTER, on_first: true };
  if (game.on_first) {
    changes.on_second = true;
    if (game.on_second) {
      changes.on_third = true;
      if (game.on_third) {
        const key = runsKey(battingSide(game.half));
        changes[key] = clamp(game[key] + 1, LIMITS.runs.min, LIMITS.runs.max);
      }
    }
  }
  return changes;
}

/** Ponche: un out más y nuevo bateador; si es el tercer out, cambia la mitad del inning. */
export function strikeoutPatch(game: GameRow): GamePatch | null {
  if (game.outs >= LIMITS.outs.max) return halfChangePatch(game);
  return { ...NEW_BATTER, outs: game.outs + 1 };
}

/** Alta -> baja del mismo inning; baja -> alta del siguiente. Limpia conteo, outs y bases. */
export function halfChangePatch(game: Pick<GameRow, "half" | "inning">): GamePatch | null {
  const cleared: GamePatch = {
    balls: 0,
    strikes: 0,
    outs: 0,
    on_first: false,
    on_second: false,
    on_third: false,
  };
  if (game.half === "alta") return { ...cleared, half: "baja" };
  if (game.inning >= LIMITS.inning.max) return null;
  return { ...cleared, half: "alta", inning: game.inning + 1 };
}

const patch = (label: string, compute: PatchAction["compute"]): PatchAction => ({
  kind: "patch",
  label,
  compute,
});

export const actions = {
  addRuns: (side: TeamSide, delta: number) =>
    patch(delta > 0 ? "Carrera" : "Quitar carrera", (g) => {
      const key = runsKey(side);
      return { [key]: clamp(g[key] + delta, LIMITS.runs.min, LIMITS.runs.max) };
    }),

  setRuns: (side: TeamSide, value: number) =>
    patch("Editar carreras", () => {
      if (!isIntInRange(value, LIMITS.runs.min, LIMITS.runs.max)) return null;
      return { [runsKey(side)]: value };
    }),

  changeInning: (delta: number) =>
    patch("Inning", (g) => ({
      inning: clamp(g.inning + delta, LIMITS.inning.min, LIMITS.inning.max),
    })),

  setHalf: (half: Half) => patch("Mitad del inning", () => ({ half })),

  /** +1 / −1 bola, strike u out, con los automatismos. */
  changeCount: (field: CountField, delta: number) =>
    patch(COUNT_ACTION_LABEL[field], (g) => {
      const { min, max } = COUNT_LIMITS[field];
      if (delta > 0 && g[field] >= max) {
        // Se llegó al tope: 4.ª bola (base por bolas), 3.er strike (ponche) o 3.er out.
        if (field === "balls" && g.auto_new_batter) return walkPatch(g);
        if (field === "strikes" && g.auto_new_batter) return strikeoutPatch(g);
        if (field === "outs" && g.auto_change_half) return halfChangePatch(g);
        return null;
      }
      return { [field]: clamp(g[field] + delta, min, max) };
    }),

  resetCount: (field: CountField) => patch(`Reiniciar ${COUNT_NAMES[field]}`, () => ({ [field]: 0 })),

  /** Se guarda el valor deseado (no "alternar") para que dos toques no se anulen. */
  setBase: (base: Base, occupied: boolean) =>
    patch(occupied ? "Corredor en base" : "Base libre", () => ({ [base]: occupied })),

  clearBases: () => patch("Limpiar bases", () => ({ on_first: false, on_second: false, on_third: false })),

  newBatter: () => patch("Nuevo bateador", () => NEW_BATTER),

  changeHalf: () => patch("Cambiar mitad de inning", (g) => halfChangePatch(g)),

  setStatus: (status: GameStatus) => patch("Estado del partido", () => ({ status })),

  setOverlayVisible: (visible: boolean) =>
    patch(visible ? "Mostrar marcador" : "Ocultar marcador", () => ({ overlay_visible: visible })),

  resetGame: () => patch("Reiniciar partido", () => INITIAL_STATE),

  /** Configuración (equipos, apariencia, automatismos). Solo envía lo válido. */
  updateConfig: (changes: GamePatch, label = "Configuración") =>
    patch(label, (g) => {
      const next = { ...g, ...changes };
      return validateGame(next).length === 0 ? changes : null;
    }),

  undo: (): UndoAction => ({ kind: "undo", label: "Deshacer" }),
};

const COUNT_NAMES: Record<CountField, string> = { balls: "bolas", strikes: "strikes", outs: "outs" };
const COUNT_ACTION_LABEL: Record<CountField, string> = { balls: "Bola", strikes: "Strike", outs: "Out" };

/** Estado de un partido recién reiniciado (no toca equipos ni apariencia). */
export const INITIAL_STATE: GamePatch = {
  home_runs: 0,
  away_runs: 0,
  inning: 1,
  half: "alta",
  balls: 0,
  strikes: 0,
  outs: 0,
  on_first: false,
  on_second: false,
  on_third: false,
  status: "previo",
};

/** Aplica una acción y devuelve solo los campos que realmente cambian (o null). */
export function computeChanges(game: GameRow, action: PatchAction): GamePatch | null {
  const proposed = action.compute(game);
  if (!proposed) return null;
  const changes: GamePatch = {};
  let any = false;
  for (const [key, value] of Object.entries(proposed) as [keyof GamePatch, unknown][]) {
    if (game[key] !== value) {
      (changes as Record<string, unknown>)[key] = value;
      any = true;
    }
  }
  if (!any) return null;
  return validateGame({ ...game, ...changes }).length === 0 ? changes : null;
}

/** Vista optimista: el estado confirmado más las acciones pendientes. */
export function applyPending(game: GameRow, pending: readonly GameAction[]): GameRow {
  let current = game;
  for (const action of pending) {
    if (action.kind !== "patch") continue;
    const changes = computeChanges(current, action);
    if (changes) current = { ...current, ...changes };
  }
  return current;
}

export function isIntInRange(value: unknown, min: number, max: number): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= min && value <= max;
}

const HEX = /^#[0-9A-Fa-f]{6}$/;
const URL_OK = /^https?:\/\/\S+$/i;

const len = (s: string) => [...s].length;

/** Espejo de los CHECK de la base. Devuelve los errores en español (vacío = válido). */
export function validateGame(g: GameRow): string[] {
  const errors: string[] = [];
  const range = (name: string, value: number, min: number, max: number) => {
    if (!isIntInRange(value, min, max)) errors.push(`${name} debe estar entre ${min} y ${max}.`);
  };
  const text = (name: string, value: string, min: number, max: number) => {
    const n = len(value.trim());
    if (n < min || len(value) > max)
      errors.push(min > 0 ? `${name}: entre ${min} y ${max} caracteres.` : `${name}: máximo ${max} caracteres.`);
  };
  const color = (name: string, value: string) => {
    if (!HEX.test(value)) errors.push(`${name}: color inválido (usa #RRGGBB).`);
  };
  const url = (name: string, value: string | null) => {
    if (value !== null && (!URL_OK.test(value) || value.length > LIMITS.urlLength))
      errors.push(`${name}: URL inválida.`);
  };

  text("Título", g.title, 1, LIMITS.titleLength);
  if (g.sport !== "softball" && g.sport !== "beisbol") errors.push("Deporte inválido.");
  range("Innings programados", g.scheduled_innings, LIMITS.scheduledInnings.min, LIMITS.scheduledInnings.max);

  text("Nombre del local", g.home_name, 1, LIMITS.teamNameLength);
  text("Nombre del visitante", g.away_name, 1, LIMITS.teamNameLength);
  text("Abreviatura del local", g.home_abbr, 1, LIMITS.abbrLength);
  text("Abreviatura del visitante", g.away_abbr, 1, LIMITS.abbrLength);
  color("Color del local", g.home_color);
  color("Color del visitante", g.away_color);
  color("Color de acento", g.accent_color);
  color("Color de fondo", g.panel_color);
  url("Logo del local", g.home_logo_url);
  url("Logo del visitante", g.away_logo_url);
  url("Logo de la transmisión", g.brand_logo_url);
  text("Nombre de la transmisión", g.brand_name, 1, LIMITS.brandNameLength);
  text("Subtítulo", g.brand_subtitle, 0, LIMITS.brandSubtitleLength);
  text("Sede", g.venue, 0, LIMITS.venueLength);

  range("Carreras del local", g.home_runs, LIMITS.runs.min, LIMITS.runs.max);
  range("Carreras del visitante", g.away_runs, LIMITS.runs.min, LIMITS.runs.max);
  range("Inning", g.inning, LIMITS.inning.min, LIMITS.inning.max);
  if (g.half !== "alta" && g.half !== "baja") errors.push("Mitad inválida.");
  range("Bolas", g.balls, LIMITS.balls.min, LIMITS.balls.max);
  range("Strikes", g.strikes, LIMITS.strikes.min, LIMITS.strikes.max);
  range("Outs", g.outs, LIMITS.outs.min, LIMITS.outs.max);
  if (!["previo", "en_juego", "suspendido", "finalizado"].includes(g.status)) errors.push("Estado inválido.");
  return errors;
}

/** Equipo que batea: en la alta batea el visitante; en la baja, el local. */
export const battingSide = (half: Half): TeamSide => (half === "alta" ? "away" : "home");

/** Datos del partido de ejemplo (todos se pueden cambiar desde el panel). */
export const SAMPLE_GAME: GamePatch & { title: string } = {
  title: "El Parque vs Simón Bolívar",
  sport: "softball",
  scheduled_innings: 6,
  home_name: "El Parque",
  home_abbr: "PAR",
  home_color: "#14B8C4",
  away_name: "Simón Bolívar",
  away_abbr: "SBO",
  away_color: "#1E3A8A",
  brand_name: "MARCADOR",
  brand_subtitle: "TRANSMISIÓN",
  venue: "Ciudad Deportiva",
  accent_color: "#FACC15",
  panel_color: "#0B0D12",
};
