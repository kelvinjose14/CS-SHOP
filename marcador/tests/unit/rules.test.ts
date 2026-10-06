import { describe, expect, it } from "vitest";
import {
  actions,
  applyPending,
  computeChanges,
  halfChangePatch,
  INITIAL_STATE,
  SAMPLE_GAME,
  validateGame,
  type PatchAction,
} from "@/lib/game/rules";
import type { GameRow } from "@/lib/game/types";

const base: GameRow = {
  id: "00000000-0000-4000-8000-000000000000",
  slug: "slug-de-prueba-123456",
  owner_id: "00000000-0000-4000-8000-000000000001",
  title: "Prueba",
  sport: "softball",
  scheduled_innings: 6,
  auto_new_batter: false,
  auto_change_half: false,
  home_name: "El Parque",
  home_abbr: "PAR",
  home_color: "#14B8C4",
  home_logo_url: null,
  away_name: "Simón Bolívar",
  away_abbr: "SBO",
  away_color: "#1E3A8A",
  away_logo_url: null,
  brand_name: "MARCADOR",
  brand_subtitle: "",
  brand_logo_url: null,
  venue: "Ciudad Deportiva",
  accent_color: "#FACC15",
  panel_color: "#0B0D12",
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
  overlay_visible: true,
  undo_count: 0,
  version: 1,
  created_at: "2026-10-06T00:00:00Z",
  updated_at: "2026-10-06T00:00:00Z",
};

const game = (overrides: Partial<GameRow> = {}): GameRow => ({ ...base, ...overrides });
const run = (g: GameRow, action: PatchAction) => ({ ...g, ...(computeChanges(g, action) ?? {}) });

describe("carreras", () => {
  it("suma y resta sin bajar de 0 ni pasar de 999", () => {
    expect(run(game(), actions.addRuns("home", 1)).home_runs).toBe(1);
    expect(computeChanges(game(), actions.addRuns("home", -1))).toBeNull();
    expect(computeChanges(game({ away_runs: 999 }), actions.addRuns("away", 1))).toBeNull();
  });

  it("la edición manual solo acepta enteros entre 0 y 999", () => {
    expect(computeChanges(game(), actions.setRuns("home", 12))).toEqual({ home_runs: 12 });
    expect(computeChanges(game(), actions.setRuns("home", -3))).toBeNull();
    expect(computeChanges(game(), actions.setRuns("home", 1.5))).toBeNull();
    expect(computeChanges(game(), actions.setRuns("home", 1000))).toBeNull();
  });
});

describe("conteo y outs", () => {
  it("bolas 0–3, strikes 0–2, outs 0–2 sin automatismos", () => {
    expect(computeChanges(game({ balls: 3 }), actions.changeCount("balls", 1))).toBeNull();
    expect(computeChanges(game({ strikes: 2 }), actions.changeCount("strikes", 1))).toBeNull();
    expect(computeChanges(game({ outs: 2 }), actions.changeCount("outs", 1))).toBeNull();
    expect(computeChanges(game(), actions.changeCount("balls", -1))).toBeNull();
    expect(run(game({ balls: 2 }), actions.changeCount("balls", 1)).balls).toBe(3);
  });

  it("reinicio individual", () => {
    expect(computeChanges(game({ balls: 2, strikes: 1 }), actions.resetCount("balls"))).toEqual({ balls: 0 });
  });

  it("4.ª bola o 3.er strike → nuevo bateador solo si el automatismo está activo", () => {
    const g = game({ balls: 3, strikes: 2, auto_new_batter: true, on_first: true, outs: 1 });
    expect(computeChanges(g, actions.changeCount("balls", 1))).toEqual({ balls: 0, strikes: 0 });
    expect(computeChanges(g, actions.changeCount("strikes", 1))).toEqual({ balls: 0, strikes: 0 });
    // No se deducen corredores, carreras ni outs.
    const after = run(g, actions.changeCount("balls", 1));
    expect(after.on_first).toBe(true);
    expect(after.outs).toBe(1);
    expect(after.home_runs).toBe(0);
  });

  it("3.er out → cambiar mitad solo si el automatismo está activo", () => {
    const g = game({ outs: 2, auto_change_half: true, on_second: true, balls: 1 });
    expect(computeChanges(g, actions.changeCount("outs", 1))).toEqual({
      outs: 0,
      on_second: false,
      balls: 0,
      half: "baja",
    });
  });

  it("nuevo bateador limpia bolas y strikes, nada más", () => {
    const g = game({ balls: 2, strikes: 2, outs: 1, on_third: true });
    expect(computeChanges(g, actions.newBatter())).toEqual({ balls: 0, strikes: 0 });
  });
});

describe("cambiar mitad de inning", () => {
  it("alta → baja del mismo inning", () => {
    expect(halfChangePatch({ half: "alta", inning: 4 })).toMatchObject({ half: "baja" });
    expect(halfChangePatch({ half: "alta", inning: 4 })).not.toHaveProperty("inning");
  });

  it("baja → alta del siguiente; limpia conteo, outs y bases; no toca carreras", () => {
    const g = game({ half: "baja", inning: 4, balls: 2, strikes: 1, outs: 2, on_first: true, on_third: true, home_runs: 5, away_runs: 3 });
    const after = run(g, actions.changeHalf());
    expect(after).toMatchObject({
      half: "alta",
      inning: 5,
      balls: 0,
      strikes: 0,
      outs: 0,
      on_first: false,
      on_second: false,
      on_third: false,
      home_runs: 5,
      away_runs: 3,
    });
  });

  it("permite entradas extras después del último inning programado", () => {
    const after = run(game({ half: "baja", inning: 6, scheduled_innings: 6 }), actions.changeHalf());
    expect(after.inning).toBe(7);
    expect(run(game({ inning: 12 }), actions.changeInning(1)).inning).toBe(13);
  });

  it("inning nunca baja de 1", () => {
    expect(computeChanges(game({ inning: 1 }), actions.changeInning(-1))).toBeNull();
  });
});

describe("bases y estado", () => {
  it("las bases guardan el valor deseado (dos toques no se anulan)", () => {
    const on = actions.setBase("on_first", true);
    expect(run(run(game(), on), on).on_first).toBe(true);
  });

  it("reiniciar partido no toca equipos ni apariencia", () => {
    const g = game({ home_runs: 7, inning: 5, balls: 2, status: "en_juego", home_name: "Otro", accent_color: "#FF0000" });
    const after = run(g, actions.resetGame());
    expect(after).toMatchObject({ ...INITIAL_STATE, home_name: "Otro", accent_color: "#FF0000" });
  });
});

describe("validación (espejo de los CHECK de la base)", () => {
  it("el partido de ejemplo es válido", () => {
    expect(validateGame(game(SAMPLE_GAME))).toEqual([]);
  });

  it.each([
    ["carreras negativas", { home_runs: -1 }],
    ["4 bolas", { balls: 4 }],
    ["3 strikes", { strikes: 3 }],
    ["3 outs", { outs: 3 }],
    ["inning 0", { inning: 0 }],
    ["abreviatura de 5", { home_abbr: "ABCDE" }],
    ["color inválido", { home_color: "rojo" }],
    ["logo no http", { home_logo_url: "javascript:alert(1)" }],
    ["nombre vacío", { away_name: "   " }],
  ] as [string, Partial<GameRow>][])("rechaza %s", (_name, overrides) => {
    expect(validateGame(game(overrides)).length).toBeGreaterThan(0);
  });

  it("la configuración inválida no se envía", () => {
    expect(computeChanges(game(), actions.updateConfig({ home_abbr: "LARGO" }))).toBeNull();
    expect(computeChanges(game(), actions.updateConfig({ home_abbr: "LAR" }))).toEqual({ home_abbr: "LAR" });
  });
});

describe("vista optimista", () => {
  it("aplica las acciones pendientes en orden sobre el estado confirmado", () => {
    const shown = applyPending(game(), [
      actions.addRuns("home", 1),
      actions.addRuns("home", 1),
      actions.undo(),
      actions.changeCount("balls", 1),
    ]);
    expect(shown.home_runs).toBe(2);
    expect(shown.balls).toBe(1);
  });
});
