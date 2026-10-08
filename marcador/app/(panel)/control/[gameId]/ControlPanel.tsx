"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Automations, BroadcastForm, GameSettings, TeamForm } from "@/components/control/ConfigForms";
import { ConfirmDialog } from "@/components/control/ConfirmDialog";
import { ConnectionBadge } from "@/components/control/ConnectionBadge";
import { LivePreview, OverlayLink } from "@/components/control/LivePreview";
import { ScoreControls } from "@/components/control/ScoreControls";
import { actions } from "@/lib/game/rules";
import type { GameRow } from "@/lib/game/types";
import { useGameController } from "@/lib/game/useGameController";

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

  const canUndo = confirmed.undo_count > 0 || pendingCount > 0;

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

          <ScoreControls game={game} dispatch={dispatch} />
        </div>

        <div className="control-config">
          <section className="card" aria-labelledby="h-overlay">
            <h2 id="h-overlay">URL del overlay</h2>
            <OverlayLink slug={game.slug} />
          </section>

          <section className="card" aria-labelledby="h-studio">
            <h2 id="h-studio">Transmitir desde el celular</h2>
            <p className="hint" style={{ marginTop: 0 }}>
              Estudio en vivo: cámara del celular con el marcador dentro del video, directo a YouTube.
            </p>
            <Link className="btn btn-primary btn-block" href={`/estudio/${game.id}`} data-testid="open-studio">
              Abrir Estudio en vivo
            </Link>
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
