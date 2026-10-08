"use client";

import { useState, type FormEvent } from "react";
import { actions, LIMITS, validateGame, type GameAction } from "@/lib/game/rules";
import type { GamePatch, GameRow, TeamSide } from "@/lib/game/types";
import { LogoField } from "./LogoField";
import { useDraft } from "./useDraft";

type Dispatch = (action: GameAction) => void;
type Warn = (text: string) => void;

const CONFLICT = "Otro controlador cambió estos datos mientras editabas. Se cargaron los valores actuales; revisa y vuelve a guardar.";

/** Guarda el borrador si es válido; avisa si hubo conflicto. */
function useSave<K extends keyof GameRow>(
  game: GameRow,
  draftState: ReturnType<typeof useDraft<K>>,
  dispatch: Dispatch,
  warn: Warn,
  label: string,
) {
  const errors = validateGame({ ...game, ...draftState.draft });
  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (errors.length > 0) return;
    const changes = draftState.takeChanges();
    if (changes === "conflict") return warn(CONFLICT);
    if (changes) dispatch(actions.updateConfig(changes as GamePatch, label));
  };
  return { errors, onSubmit };
}

function Errors({ errors, show }: { errors: string[]; show: boolean }) {
  if (!show || errors.length === 0) return null;
  return (
    <ul className="error-text" role="alert" style={{ paddingLeft: 18, margin: 0 }}>
      {errors.map((e) => (
        <li key={e}>{e}</li>
      ))}
    </ul>
  );
}

const TEAM_KEYS = {
  home: ["home_name", "home_abbr", "home_color"],
  away: ["away_name", "away_abbr", "away_color"],
} as const;

/** Nombre, abreviatura, color y logo de un equipo. */
export function TeamForm({ side, game, dispatch, warn }: { side: TeamSide; game: GameRow; dispatch: Dispatch; warn: Warn }) {
  const [nameKey, abbrKey, colorKey] = TEAM_KEYS[side];
  const draft = useDraft(game, TEAM_KEYS[side]);
  const { errors, onSubmit } = useSave(game, draft, dispatch, warn, "Equipo");
  const logoKey = side === "home" ? "home_logo_url" : "away_logo_url";
  const title = side === "home" ? "Equipo local" : "Equipo visitante";

  return (
    <form className="stack" onSubmit={onSubmit} data-testid={`team-form-${side}`}>
      <h3 className="form-title">{title}</h3>
      <div className="field">
        <label htmlFor={`${side}-name`}>Nombre</label>
        <input
          id={`${side}-name`}
          type="text"
          maxLength={LIMITS.teamNameLength}
          value={draft.draft[nameKey]}
          onChange={(e) => draft.set(nameKey, e.target.value)}
        />
      </div>
      <div className="form-grid">
        <div className="field">
          <label htmlFor={`${side}-abbr`}>Abreviatura (máx. 4)</label>
          <input
            id={`${side}-abbr`}
            type="text"
            maxLength={LIMITS.abbrLength}
            autoCapitalize="characters"
            value={draft.draft[abbrKey]}
            onChange={(e) => draft.set(abbrKey, e.target.value.toUpperCase())}
          />
        </div>
        <div className="field">
          <label htmlFor={`${side}-color`}>Color principal</label>
          <input
            id={`${side}-color`}
            type="color"
            value={draft.draft[colorKey]}
            onChange={(e) => draft.set(colorKey, e.target.value.toUpperCase())}
          />
        </div>
      </div>
      <Errors errors={errors} show={draft.dirty} />
      {draft.dirty && (
        <div className="row">
          <button className="btn btn-primary" style={{ flex: 1 }} disabled={errors.length > 0}>
            Guardar {side === "home" ? "local" : "visitante"}
          </button>
          <button type="button" className="btn btn-ghost" onClick={draft.reset}>
            Descartar
          </button>
        </div>
      )}
      <LogoField
        label="Logo"
        kind={side}
        url={game[logoKey]}
        ownerId={game.owner_id}
        gameId={game.id}
        onChange={(url) => dispatch(actions.updateConfig({ [logoKey]: url }, "Logo"))}
      />
    </form>
  );
}

const BRAND_KEYS = ["title", "brand_name", "brand_subtitle", "venue", "accent_color", "panel_color"] as const;

/** Apariencia de la transmisión: nombre, subtítulo, sede, colores y logo. */
export function BroadcastForm({ game, dispatch, warn }: { game: GameRow; dispatch: Dispatch; warn: Warn }) {
  const draft = useDraft(game, BRAND_KEYS);
  const { errors, onSubmit } = useSave(game, draft, dispatch, warn, "Apariencia");
  const d = draft.draft;

  return (
    <form className="stack" onSubmit={onSubmit} data-testid="broadcast-form">
      <div className="field">
        <label htmlFor="title">Título del partido (solo en el panel)</label>
        <input id="title" type="text" maxLength={LIMITS.titleLength} value={d.title} onChange={(e) => draft.set("title", e.target.value)} />
      </div>
      <div className="form-grid">
        <div className="field">
          <label htmlFor="brand-name">Nombre de la transmisión</label>
          <input
            id="brand-name"
            type="text"
            maxLength={LIMITS.brandNameLength}
            value={d.brand_name}
            onChange={(e) => draft.set("brand_name", e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="brand-subtitle">Subtítulo</label>
          <input
            id="brand-subtitle"
            type="text"
            maxLength={LIMITS.brandSubtitleLength}
            value={d.brand_subtitle}
            onChange={(e) => draft.set("brand_subtitle", e.target.value)}
          />
        </div>
      </div>
      <div className="field">
        <label htmlFor="venue">Sede (franja inferior)</label>
        <input id="venue" type="text" maxLength={LIMITS.venueLength} value={d.venue} onChange={(e) => draft.set("venue", e.target.value)} />
      </div>
      <div className="form-grid">
        <div className="field">
          <label htmlFor="accent">Color de acento</label>
          <input id="accent" type="color" value={d.accent_color} onChange={(e) => draft.set("accent_color", e.target.value.toUpperCase())} />
        </div>
        <div className="field">
          <label htmlFor="panel">Fondo del marcador</label>
          <input id="panel" type="color" value={d.panel_color} onChange={(e) => draft.set("panel_color", e.target.value.toUpperCase())} />
        </div>
      </div>
      <Errors errors={errors} show={draft.dirty} />
      {draft.dirty && (
        <div className="row">
          <button className="btn btn-primary" style={{ flex: 1 }} disabled={errors.length > 0}>
            Guardar apariencia
          </button>
          <button type="button" className="btn btn-ghost" onClick={draft.reset}>
            Descartar
          </button>
        </div>
      )}
      <LogoField
        label="Logo de la transmisión (reemplaza al nombre)"
        kind="brand"
        url={game.brand_logo_url}
        ownerId={game.owner_id}
        gameId={game.id}
        onChange={(url) => dispatch(actions.updateConfig({ brand_logo_url: url }, "Logo"))}
      />
    </form>
  );
}

const INNING_PRESETS = [6, 7, 9];

/** Deporte e innings programados (se aplican al momento). */
export function GameSettings({ game, dispatch }: { game: GameRow; dispatch: Dispatch }) {
  const preset = INNING_PRESETS.includes(game.scheduled_innings) ? String(game.scheduled_innings) : "custom";
  const [custom, setCustom] = useState(preset === "custom");
  const [customText, setCustomText] = useState(String(game.scheduled_innings));
  const value = custom ? "custom" : preset;

  return (
    <div className="stack">
      <div className="form-grid">
        <div className="field">
          <label htmlFor="sport">Deporte</label>
          <select
            id="sport"
            value={game.sport}
            onChange={(e) => dispatch(actions.updateConfig({ sport: e.target.value as GameRow["sport"] }, "Deporte"))}
          >
            <option value="softball">Softball</option>
            <option value="beisbol">Béisbol</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="innings">Innings programados</label>
          <select
            id="innings"
            value={value}
            onChange={(e) => {
              if (e.target.value === "custom") {
                setCustom(true);
                setCustomText(String(game.scheduled_innings));
                return;
              }
              setCustom(false);
              dispatch(actions.updateConfig({ scheduled_innings: Number(e.target.value) }, "Innings"));
            }}
          >
            <option value="6">6 (softball)</option>
            <option value="7">7</option>
            <option value="9">9 (béisbol)</option>
            <option value="custom">Personalizado…</option>
          </select>
        </div>
      </div>
      {custom && (
        <form
          className="row"
          onSubmit={(e) => {
            e.preventDefault();
            const n = Number(customText);
            if (Number.isInteger(n) && n >= LIMITS.scheduledInnings.min && n <= LIMITS.scheduledInnings.max)
              dispatch(actions.updateConfig({ scheduled_innings: n }, "Innings"));
          }}
        >
          <div className="field" style={{ flex: 1 }}>
            <label htmlFor="innings-custom">
              Innings ({LIMITS.scheduledInnings.min}–{LIMITS.scheduledInnings.max})
            </label>
            <input
              id="innings-custom"
              type="number"
              inputMode="numeric"
              min={LIMITS.scheduledInnings.min}
              max={LIMITS.scheduledInnings.max}
              value={customText}
              onChange={(e) => setCustomText(e.target.value)}
            />
          </div>
          <button className="btn btn-primary" style={{ alignSelf: "flex-end" }}>
            Aplicar
          </button>
        </form>
      )}
      <p className="hint">Después del último inning programado se permiten entradas extras sin límite.</p>
    </div>
  );
}

/** Automatismos opcionales, desactivados por defecto. */
export function Automations({ game, dispatch }: { game: GameRow; dispatch: Dispatch }) {
  return (
    <div className="stack" style={{ gap: 4 }}>
      <label className="switch">
        <input
          type="checkbox"
          checked={game.auto_new_batter}
          onChange={(e) => dispatch(actions.updateConfig({ auto_new_batter: e.target.checked }, "Automatismo"))}
          data-testid="auto-new-batter"
        />
        <span>
          <strong>4.ª bola → base por bolas · 3.er strike → out</strong>
          <small>
            Con 4 bolas el bateador pasa a primera (avanzan los corredores forzados; con bases llenas entra la carrera).
            Con 3 strikes se anota un out (si es el tercero, cambia la mitad). El conteo vuelve a 0-0.
          </small>
        </span>
      </label>
      <label className="switch">
        <input
          type="checkbox"
          checked={game.auto_change_half}
          onChange={(e) => dispatch(actions.updateConfig({ auto_change_half: e.target.checked }, "Automatismo"))}
          data-testid="auto-change-half"
        />
        <span>
          <strong>3.er out → cambiar mitad de inning</strong>
          <small>Al sumar el 3.er out, pasa a la siguiente mitad y limpia conteo, outs y bases.</small>
        </span>
      </label>
    </div>
  );
}
