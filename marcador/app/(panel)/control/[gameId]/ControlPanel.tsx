"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { BasesPad } from "@/components/control/BasesPad";
import { Automations, BroadcastForm, GameSettings, TeamForm } from "@/components/control/ConfigForms";
import { ConfirmDialog } from "@/components/control/ConfirmDialog";
import { ConnectionBadge } from "@/components/control/ConnectionBadge";
import { LivePreview, OverlayLink } from "@/components/control/LivePreview";
import { RunsControl } from "@/components/control/RunsControl";
import { Stepper } from "@/components/control/Stepper";
import { actions, battingSide, COUNT_LIMITS, LIMITS } from "@/lib/game/rules";
import { STATUS_LABELS, type CountField, type GameRow, type GameStatus } from "@/lib/game/types";
import { useGameController } from "@/lib/game/useGameController";

const STATUSES: GameStatus[] = ["previo", "en_juego", "suspendido", "finalizado"];
const COUNT_FIELDS: { field: CountField; label: string }[] = [
  { field: "balls", label: "Bolas" },
  { field: "strikes", label: "Strikes" },
  { field: "outs", label: "Outs" },
];

export function ControlPanel({ initial }: { initial: GameRow }) {
  const { game, confirmed, dispatch, pendingCount, connection, notice, dismissNotice } = useGameController(initial);
  const [confirmReset, setConfirmReset] = useState(false);
  const [localNotice, setLocalNotice] = useState("");

  const visibleNotice = localNotice ? { tone: "warning" as const, text: localNotice } : notice;
  const closeNotice = useCallback(() => {
    setLocalNotice("");
    dismissNotice();
  }, [dismissNotice]);

  // Los avisos se cierran solos después de unos segundos.
  const noticeKey = localNotice || notice?.id;
  useEffect(() => {
    if (!noticeKey) return;
    const timer = setTimeout(closeNotice, 7000);
    return () => clearTimeout(timer);
  }, [noticeKey, closeNotice]);

  const batting = game.status === "en_juego" ? battingSide(game.half) : null;
  const extra = game.inning > game.scheduled_innings;
  const canUndo = confirmed.undo_count > 0 || pendingCount > 0;

  const countHint = (field: CountField) => {
    const max = COUNT_LIMITS[field].max;
    if (game[field] < max) return undefined;
    if (field === "outs") return game.auto_change_half ? "+ cambia la mitad" : "Máximo 2";
    return game.auto_new_batter ? "+ nuevo bateador" : `Máximo ${max}`;
  };
  const canPlusCount = (field: CountField) =>
    game[field] < COUNT_LIMITS[field].max || (field === "outs" ? game.auto_change_half : game.auto_new_batter);

  return (
    <>
      <header className="topbar sticky">
        <Link className="btn btn-ghost btn-small" href="/control" aria-label="Volver a mis partidos">
          ←
        </Link>
        <h1 className="topbar-title">{game.title}</h1>
        <ConnectionBadge status={connection} pending={pendingCount} />
      </header>

      <main className="page control-grid">
        <div className="control-live">
          <section className="card card-tight" aria-labelledby="h-preview">
            <h2 id="h-preview">Vista previa del overlay</h2>
            <LivePreview game={game} />
          </section>

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
        </div>

        <div className="control-config">
          <section className="card" aria-labelledby="h-overlay">
            <h2 id="h-overlay">URL del overlay</h2>
            <OverlayLink slug={game.slug} />
          </section>

          <section className="card" aria-labelledby="h-auto">
            <h2 id="h-auto">Automatismos (opcionales)</h2>
            <Automations game={game} dispatch={dispatch} />
          </section>

          <details className="card" open>
            <summary>
              <h2>Equipos</h2>
            </summary>
            <div className="stack" style={{ gap: 20 }}>
              <TeamForm side="away" game={game} dispatch={dispatch} warn={setLocalNotice} />
              <TeamForm side="home" game={game} dispatch={dispatch} warn={setLocalNotice} />
            </div>
          </details>

          <details className="card">
            <summary>
              <h2>Partido y transmisión</h2>
            </summary>
            <div className="stack" style={{ gap: 20 }}>
              <GameSettings game={game} dispatch={dispatch} />
              <BroadcastForm game={game} dispatch={dispatch} warn={setLocalNotice} />
            </div>
          </details>

          <section className="card danger-zone" aria-labelledby="h-reset">
            <h2 id="h-reset">Reiniciar</h2>
            <p className="hint" style={{ marginTop: 0 }}>
              Pone carreras, inning, conteo, outs y bases en cero y el estado en Previo. Equipos y apariencia no cambian.
            </p>
            <button className="btn btn-danger btn-block" onClick={() => setConfirmReset(true)} data-testid="reset-game">
              Reiniciar partido…
            </button>
          </section>
        </div>
      </main>

      <nav className="bottombar" aria-label="Acciones rápidas">
        <button
          className="btn btn-big"
          disabled={!canUndo}
          onClick={() => dispatch(actions.undo())}
          data-testid="undo"
        >
          ↶ Deshacer{confirmed.undo_count > 0 ? ` (${confirmed.undo_count})` : ""}
        </button>
        <button
          className={`btn btn-big ${game.overlay_visible ? "" : "btn-primary"}`}
          onClick={() => dispatch(actions.setOverlayVisible(!game.overlay_visible))}
          aria-pressed={!game.overlay_visible}
          data-testid="toggle-overlay"
        >
          {game.overlay_visible ? "Ocultar marcador" : "Mostrar marcador"}
        </button>
      </nav>

      {visibleNotice && (
        <div className="toast" data-tone={visibleNotice.tone} role="alert" data-testid="notice">
          <p>{visibleNotice.text}</p>
          <button className="btn btn-small btn-ghost" onClick={closeNotice} aria-label="Cerrar aviso">
            ✕
          </button>
        </div>
      )}

      <ConfirmDialog
        open={confirmReset}
        title="¿Reiniciar el partido?"
        confirmLabel="Sí, reiniciar"
        onCancel={() => setConfirmReset(false)}
        onConfirm={() => {
          dispatch(actions.resetGame());
          setConfirmReset(false);
        }}
      >
        <p style={{ margin: 0 }}>
          Carreras {game.away_name} {game.away_runs} – {game.home_name} {game.home_runs}, inning {game.inning}, conteo, outs
          y bases volverán a cero. El estado pasa a <strong>Previo</strong>.
        </p>
        <p className="hint">Equipos, logos y apariencia se conservan. Si fue un error, puedes usar Deshacer.</p>
      </ConfirmDialog>
    </>
  );
}
