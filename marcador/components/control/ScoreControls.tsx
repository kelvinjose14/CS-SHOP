"use client";

import { actions, battingSide, COUNT_LIMITS, LIMITS, type GameAction } from "@/lib/game/rules";
import { STATUS_LABELS, type CountField, type GameRow, type GameStatus } from "@/lib/game/types";
import { BasesPad } from "./BasesPad";
import { RunsControl } from "./RunsControl";
import { Stepper } from "./Stepper";

const STATUSES: GameStatus[] = ["previo", "en_juego", "suspendido", "finalizado"];
const COUNT_FIELDS: { field: CountField; label: string }[] = [
  { field: "balls", label: "Bolas" },
  { field: "strikes", label: "Strikes" },
  { field: "outs", label: "Outs" },
];

/** Botones de la pizarra: carreras, conteo, bases, inning y estado. Los usan el panel y el Estudio. */
export function ScoreControls({ game, dispatch }: { game: GameRow; dispatch: (action: GameAction) => void }) {
  const batting = game.status === "en_juego" ? battingSide(game.half) : null;
  const extra = game.inning > game.scheduled_innings;

  const countHint = (field: CountField) => {
    const max = COUNT_LIMITS[field].max;
    if (game[field] < max) return undefined;
    if (field === "outs") return game.auto_change_half ? "+ cambia la mitad" : "Máximo 2";
    if (!game.auto_new_batter) return `Máximo ${max}`;
    return field === "balls" ? "+ base por bolas" : game.outs >= 2 ? "+ ponche, 3.er out" : "+ ponche (out)";
  };
  const canPlusCount = (field: CountField) =>
    game[field] < COUNT_LIMITS[field].max || (field === "outs" ? game.auto_change_half : game.auto_new_batter);

  return (
    <>
    <section className="card" aria-labelledby="h-runs">
      <h2 id="h-runs">Carreras</h2>
      <div className="stack">
        {(["away", "home"] as const).map((side) => (
          <RunsControl
            key={side}
            side={side}
            name={side === "home" ? game.home_name : game.away_name}
            abbr={side === "home" ? game.home_abbr : game.away_abbr}
            color={side === "home" ? game.home_color : game.away_color}
            runs={side === "home" ? game.home_runs : game.away_runs}
            batting={batting === side}
            onAdd={(delta) => dispatch(actions.addRuns(side, delta))}
            onSet={(value) => dispatch(actions.setRuns(side, value))}
          />
        ))}
      </div>
    </section>

    <section className="card" aria-labelledby="h-count">
      <h2 id="h-count">Conteo y outs</h2>
      <div className="stack">
        {COUNT_FIELDS.map(({ field, label }) => (
          <Stepper
            key={field}
            id={field}
            label={label}
            value={game[field]}
            canMinus={game[field] > COUNT_LIMITS[field].min}
            canPlus={canPlusCount(field)}
            hint={countHint(field)}
            onMinus={() => dispatch(actions.changeCount(field, -1))}
            onPlus={() => dispatch(actions.changeCount(field, 1))}
            onReset={() => dispatch(actions.resetCount(field))}
          />
        ))}
        <button
          className="btn btn-big btn-block"
          onClick={() => dispatch(actions.newBatter())}
          disabled={game.balls === 0 && game.strikes === 0}
          data-testid="new-batter"
        >
          Nuevo bateador <span className="muted">(bolas y strikes a 0)</span>
        </button>
      </div>
    </section>

    <section className="card" aria-labelledby="h-bases">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h2 id="h-bases" style={{ margin: 0 }}>
          Bases
        </h2>
        <button
          className="btn btn-small btn-ghost"
          onClick={() => dispatch(actions.clearBases())}
          disabled={!game.on_first && !game.on_second && !game.on_third}
        >
          Limpiar
        </button>
      </div>
      <BasesPad
        bases={{ on_first: game.on_first, on_second: game.on_second, on_third: game.on_third }}
        onSet={(base, occupied) => dispatch(actions.setBase(base, occupied))}
      />
    </section>

    <section className="card" aria-labelledby="h-inning">
      <h2 id="h-inning">Inning</h2>
      <div className="stack">
        <div className="inning-row">
          <button
            className="btn btn-round"
            aria-label="Inning anterior"
            disabled={game.inning <= LIMITS.inning.min}
            onClick={() => dispatch(actions.changeInning(-1))}
          >
            −
          </button>
          <output className="inning-value" data-testid="value-inning">
            <span aria-hidden>{game.half === "alta" ? "▲" : "▼"}</span> {game.inning}
            {extra && <small className="extra-chip">EXTRA</small>}
          </output>
          <button
            className="btn btn-round"
            aria-label="Inning siguiente"
            disabled={game.inning >= LIMITS.inning.max}
            onClick={() => dispatch(actions.changeInning(1))}
          >
            +
          </button>
        </div>
        <div className="segmented" role="group" aria-label="Mitad del inning">
          <button aria-pressed={game.half === "alta"} onClick={() => dispatch(actions.setHalf("alta"))}>
            ▲ Alta
          </button>
          <button aria-pressed={game.half === "baja"} onClick={() => dispatch(actions.setHalf("baja"))}>
            ▼ Baja
          </button>
        </div>
        <button
          className="btn btn-big btn-block btn-primary"
          onClick={() => dispatch(actions.changeHalf())}
          data-testid="change-half"
        >
          Cambiar mitad de inning
        </button>
        <p className="hint" style={{ marginTop: 0 }}>
          Alta → baja del mismo inning; baja → alta del siguiente. Limpia conteo, outs y bases; no toca las carreras.
        </p>
      </div>
    </section>

    <section className="card" aria-labelledby="h-status">
      <h2 id="h-status">Estado del partido</h2>
      <div className="segmented status-segmented" role="group" aria-label="Estado del partido">
        {STATUSES.map((status) => (
          <button
            key={status}
            aria-pressed={game.status === status}
            onClick={() => dispatch(actions.setStatus(status))}
            data-testid={`status-${status}`}
          >
            {STATUS_LABELS[status]}
          </button>
        ))}
      </div>
    </section>
    </>
  );
}
