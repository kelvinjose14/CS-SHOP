"use client";

import type { CSSProperties } from "react";
import { DARK_TEXT, LIGHT_TEXT, readableTextOn } from "@/lib/game/colors";
import { battingSide } from "@/lib/game/rules";
import type { OverlayGame, TeamSide } from "@/lib/game/types";
import type { ConnectionStatus } from "@/lib/realtime/useLiveTopic";
import { AnimatedNumber } from "./AnimatedNumber";
import { FitText } from "./FitText";
import styles from "./scoreboard.module.css";

/** Lienzo base del marcador. Todo se dibuja a este tamaño y luego se escala. */
export const BOARD_WIDTH = 1600;
export const BOARD_HEIGHT = 220;

const STATUS_TAG: Record<OverlayGame["status"], { text: string; tone: string }> = {
  previo: { text: "PREVIO", tone: styles.toneIdle },
  en_juego: { text: "EN VIVO", tone: styles.toneLive },
  suspendido: { text: "SUSPENDIDO", tone: styles.toneWarn },
  finalizado: { text: "FINAL", tone: styles.toneFinal },
};

interface Props {
  game: OverlayGame;
  /** Estado de la conexión del overlay; se muestra discretamente si no está conectado. */
  connection?: ConnectionStatus;
}

export function Scoreboard({ game, connection }: Props) {
  // Colores derivados sin color-mix(): el navegador de OBS puede ser un Chromium antiguo.
  const darkPanel = readableTextOn(game.panel_color) === LIGHT_TEXT;
  const vars = {
    "--panel": game.panel_color,
    "--text": darkPanel ? LIGHT_TEXT : DARK_TEXT,
    "--muted": darkPanel ? "rgba(255,255,255,0.74)" : "rgba(11,13,18,0.72)",
    "--line": darkPanel ? "rgba(255,255,255,0.13)" : "rgba(11,13,18,0.16)",
    "--strip": darkPanel ? "rgba(0,0,0,0.32)" : "rgba(11,13,18,0.07)",
    "--sheen": darkPanel ? "rgba(255,255,255,0.07)" : "rgba(255,255,255,0.35)",
    "--empty-base": darkPanel ? "rgba(255,255,255,0.9)" : "rgba(11,13,18,0.85)",
    "--accent": game.accent_color,
  } as CSSProperties;

  const batting = game.status === "en_juego" ? battingSide(game.half) : null;
  const extra = game.inning > game.scheduled_innings;
  const outsLabel = `${game.outs} OUT${game.outs === 1 ? "" : "S"}`;
  const tag = STATUS_TAG[game.status];
  const reconnecting = connection === "reconectando" || connection === "sin_conexion";
  const strip = [game.sport === "beisbol" ? "BÉISBOL" : "SOFTBALL", game.venue.trim().toUpperCase()]
    .filter(Boolean)
    .join("  •  ");

  return (
    <div className={styles.board} style={vars} data-testid="scoreboard">
      <div className={styles.main}>
        <section className={styles.brand} aria-label="Transmisión">
          {game.brand_logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element -- logos subidos por el usuario, cualquier origen
            <img className={styles.brandLogo} src={game.brand_logo_url} alt={game.brand_name} />
          ) : (
            <FitText className={styles.brandName} text={game.brand_name} max={64} min={30} />
          )}
          {game.brand_subtitle && (
            <>
              <span className={styles.brandRule} />
              <FitText className={styles.brandSubtitle} text={game.brand_subtitle} max={19} min={12} />
            </>
          )}
        </section>

        <section className={styles.teams} aria-label="Equipos y carreras">
          <TeamRow game={game} side="away" batting={batting === "away"} />
          <TeamRow game={game} side="home" batting={batting === "home"} />
        </section>

        <section className={styles.inning} aria-label="Inning">
          {game.status === "finalizado" ? (
            <>
              <span className={styles.finalTag}>FINAL</span>
              <span className={styles.inningNumberSmall}>{game.inning}</span>
            </>
          ) : (
            <>
              <span className={`${styles.arrow} ${game.half === "alta" ? styles.arrowOn : ""}`} aria-hidden>
                ▲
              </span>
              <span className={styles.inningNumber} data-testid="inning">
                {game.inning}
              </span>
              <span className={`${styles.arrow} ${game.half === "baja" ? styles.arrowOn : ""}`} aria-hidden>
                ▼
              </span>
              <span className="sr-only">{game.half === "alta" ? "Alta" : "Baja"}</span>
            </>
          )}
          {extra && game.status !== "finalizado" && <span className={styles.extraTag}>EXTRA</span>}
        </section>

        <section className={styles.count} aria-label="Conteo y outs">
          <div className={styles.countTop}>
            <span className={styles.countNumbers} data-testid="count">
              {game.balls} - {game.strikes}
            </span>
            <span className={styles.countLabel}>BOLAS · STRIKES</span>
          </div>
          <div className={styles.countBottom}>
            <span className={styles.outDots} aria-hidden>
              <span className={`${styles.outDot} ${game.outs >= 1 ? styles.outDotOn : ""}`} />
              <span className={`${styles.outDot} ${game.outs >= 2 ? styles.outDotOn : ""}`} />
            </span>
            <span className={styles.outsLabel} data-testid="outs">
              {outsLabel}
            </span>
          </div>
        </section>

        <section className={styles.bases} aria-label="Bases">
          <div className={styles.diamond}>
            <span className={`${styles.base} ${styles.second} ${game.on_second ? styles.baseOn : ""}`} data-on={game.on_second} data-testid="overlay-base-2" />
            <span className={`${styles.base} ${styles.third} ${game.on_third ? styles.baseOn : ""}`} data-on={game.on_third} data-testid="overlay-base-3" />
            <span className={`${styles.base} ${styles.first} ${game.on_first ? styles.baseOn : ""}`} data-on={game.on_first} data-testid="overlay-base-1" />
          </div>
        </section>
      </div>

      <footer className={styles.strip}>
        <span className={styles.stripLeft}>
          {reconnecting && (
            <span className={styles.reconnecting} data-testid="overlay-reconnecting">
              <span className={styles.reconnectingDot} />
              RECONECTANDO
            </span>
          )}
        </span>
        <span className={styles.stripCenter}>{strip}</span>
        <span className={`${styles.stripRight} ${tag.tone}`} data-testid="status-tag">
          <span className={styles.statusDot} />
          {tag.text}
        </span>
      </footer>
    </div>
  );
}

function TeamRow({ game, side, batting }: { game: OverlayGame; side: TeamSide; batting: boolean }) {
  const name = side === "home" ? game.home_name : game.away_name;
  const abbr = side === "home" ? game.home_abbr : game.away_abbr;
  const color = side === "home" ? game.home_color : game.away_color;
  const logo = side === "home" ? game.home_logo_url : game.away_logo_url;
  const runs = side === "home" ? game.home_runs : game.away_runs;

  return (
    <div className={styles.team} data-testid={`team-${side}`}>
      <span className={styles.stripe} style={{ background: color }} aria-hidden />
      <span className={styles.logoBox}>
        {logo ? (
          // eslint-disable-next-line @next/next/no-img-element -- logos subidos por el usuario, cualquier origen
          <img className={styles.logo} src={logo} alt="" />
        ) : (
          <span className={styles.abbrBadge} style={{ background: color, color: readableTextOn(color) }}>
            {abbr}
          </span>
        )}
      </span>
      <span className={styles.teamName} data-testid={`team-name-${side}`}>
        <FitText text={name.toUpperCase()} max={52} min={30} />
      </span>
      <span className={`${styles.batting} ${batting ? styles.battingOn : ""}`} aria-hidden>
        ◀
      </span>
      <span className={styles.runsBox} data-testid={`overlay-runs-${side}`}>
        <AnimatedNumber className={styles.runs} value={runs} />
      </span>
    </div>
  );
}
