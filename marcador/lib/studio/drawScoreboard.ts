/**
 * Dibuja el marcador en un <canvas> con el mismo diseño y medidas que
 * components/scoreboard (lienzo de 1600 × 220). Hace falta dibujarlo a mano
 * porque el video que recibe YouTube sale de un canvas: el HTML del overlay no
 * se puede "pegar" dentro de un video, y convertir HTML a imagen falla en
 * Safari (contamina el canvas y la transmisión se corta).
 *
 * Si cambias el diseño en scoreboard.module.css, refleja el cambio aquí.
 */
import { BOARD_HEIGHT, BOARD_WIDTH } from "@/components/scoreboard/Scoreboard";
import { DARK_TEXT, LIGHT_TEXT, readableTextOn } from "@/lib/game/colors";
import { battingSide } from "@/lib/game/rules";
import type { OverlayGame, TeamSide } from "@/lib/game/types";

/** Margen transparente alrededor del marcador para que quepa la sombra. */
export const BOARD_PAD = 24;
export const PADDED_WIDTH = BOARD_WIDTH + BOARD_PAD * 2;
export const PADDED_HEIGHT = BOARD_HEIGHT + BOARD_PAD * 2;

const FONT = '"Barlow Condensed", "Arial Narrow", "Roboto Condensed", Arial, sans-serif';
export const SCORE_FONTS = ['600 20px "Barlow Condensed"', '700 20px "Barlow Condensed"', '800 20px "Barlow Condensed"'];

/** Los logos se cargan con CORS; si el servidor no lo permite, se usa la abreviatura (nunca se contamina el canvas). */
export type LogoLookup = (url: string | null) => HTMLImageElement | null;

interface Palette {
  panel: string;
  text: string;
  muted: string;
  line: string;
  strip: string;
  sheen: string;
  emptyBase: string;
  accent: string;
}

function palette(game: OverlayGame): Palette {
  const dark = readableTextOn(game.panel_color) === LIGHT_TEXT;
  return {
    panel: game.panel_color,
    text: dark ? LIGHT_TEXT : DARK_TEXT,
    muted: dark ? "rgba(255,255,255,0.74)" : "rgba(11,13,18,0.72)",
    line: dark ? "rgba(255,255,255,0.13)" : "rgba(11,13,18,0.16)",
    strip: dark ? "rgba(0,0,0,0.32)" : "rgba(11,13,18,0.07)",
    sheen: dark ? "rgba(255,255,255,0.07)" : "rgba(255,255,255,0.35)",
    emptyBase: dark ? "rgba(255,255,255,0.9)" : "rgba(11,13,18,0.85)",
    accent: game.accent_color,
  };
}

// Columnas de la cuadrícula (igual que .main en el CSS): 236 · 774 · 140 · 240 · 206.
const COL = { brand: 236, teams: 774, inning: 140, count: 240, bases: 206 };
const MAIN_HEIGHT = 166;
const BORDER = 2;

type Ctx = CanvasRenderingContext2D;

const supportsLetterSpacing = (ctx: Ctx) => "letterSpacing" in ctx;

function font(ctx: Ctx, weight: number, size: number) {
  ctx.font = `${weight} ${size}px ${FONT}`;
}

/** Ancho del texto con espaciado entre letras (también en navegadores sin ctx.letterSpacing). */
function measure(ctx: Ctx, text: string, spacing = 0) {
  return ctx.measureText(text).width + spacing * text.length;
}

/** Texto con espaciado entre letras, alineado a la izquierda, centro o derecha de x. */
function spacedText(ctx: Ctx, text: string, x: number, y: number, spacing = 0, align: CanvasTextAlign = "left") {
  const width = measure(ctx, text, spacing);
  const start = align === "center" ? x - width / 2 : align === "right" ? x - width : x;
  ctx.textAlign = "left";
  if (spacing === 0) {
    ctx.fillText(text, start, y);
    return;
  }
  if (supportsLetterSpacing(ctx)) {
    const previous = ctx.letterSpacing;
    ctx.letterSpacing = `${spacing}px`;
    ctx.fillText(text, start, y);
    ctx.letterSpacing = previous;
    return;
  }
  let cursor = start;
  for (const char of text) {
    ctx.fillText(char, cursor, y);
    cursor += ctx.measureText(char).width + spacing;
  }
}

/** Como FitText: reduce la fuente hasta caber y, si aun así no cabe, corta con "…". */
function fitText(ctx: Ctx, text: string, maxWidth: number, max: number, min: number, weight: number, spacing = 0) {
  let size = max;
  font(ctx, weight, size);
  while (measure(ctx, text, spacing) > maxWidth && size > min) {
    size = Math.max(min, size - 2);
    font(ctx, weight, size);
  }
  if (measure(ctx, text, spacing) <= maxWidth) return { text, size };
  let cut = text;
  while (cut.length > 1 && measure(ctx, `${cut}…`, spacing) > maxWidth) cut = cut.slice(0, -1);
  return { text: `${cut.trimEnd()}…`, size };
}

function roundRect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Dibuja la imagen "contenida" (object-fit: contain) y centrada en el recuadro. */
function drawContain(ctx: Ctx, img: HTMLImageElement, x: number, y: number, w: number, h: number) {
  const iw = img.naturalWidth || w;
  const ih = img.naturalHeight || h;
  const factor = Math.min(w / iw, h / ih);
  const dw = iw * factor;
  const dh = ih * factor;
  ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
}

const STATUS_TAG: Record<OverlayGame["status"], string> = {
  previo: "PREVIO",
  en_juego: "EN VIVO",
  suspendido: "SUSPENDIDO",
  finalizado: "FINAL",
};

/**
 * Dibuja el marcador completo en `ctx`, en un lienzo de PADDED_WIDTH × PADDED_HEIGHT
 * (el marcador queda en BOARD_PAD, BOARD_PAD con su sombra alrededor).
 */
export function drawScoreboard(ctx: Ctx, game: OverlayGame, logo: LogoLookup) {
  const p = palette(game);
  ctx.save();
  ctx.clearRect(0, 0, PADDED_WIDTH, PADDED_HEIGHT);
  ctx.translate(BOARD_PAD, BOARD_PAD);
  ctx.textBaseline = "middle";

  // Fondo con sombra, brillo superior y borde.
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.45)";
  ctx.shadowBlur = 22;
  ctx.shadowOffsetY = 8;
  roundRect(ctx, 0, 0, BOARD_WIDTH, BOARD_HEIGHT, 16);
  ctx.fillStyle = p.panel;
  ctx.fill();
  ctx.restore();

  ctx.save();
  roundRect(ctx, 0, 0, BOARD_WIDTH, BOARD_HEIGHT, 16);
  ctx.clip();
  const sheen = ctx.createLinearGradient(0, 0, 0, BOARD_HEIGHT * 0.55);
  sheen.addColorStop(0, p.sheen);
  sheen.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = sheen;
  ctx.fillRect(0, 0, BOARD_WIDTH, BOARD_HEIGHT);

  const top = BORDER;
  let x = BORDER;
  const columns = {
    brand: { x, w: COL.brand },
    teams: { x: (x += COL.brand), w: COL.teams },
    inning: { x: (x += COL.teams), w: COL.inning },
    count: { x: (x += COL.inning), w: COL.count },
    bases: { x: (x += COL.count), w: COL.bases },
  };

  // Separadores verticales entre secciones.
  ctx.fillStyle = p.line;
  for (const column of [columns.teams, columns.inning, columns.count, columns.bases]) {
    ctx.fillRect(column.x, top, BORDER, MAIN_HEIGHT);
  }

  drawBrand(ctx, game, p, columns.brand.x, top, columns.brand.w, logo);
  drawTeams(ctx, game, p, columns.teams.x + BORDER, top, columns.teams.w - BORDER, logo);
  drawInning(ctx, game, p, columns.inning.x + BORDER, top, columns.inning.w - BORDER);
  drawCount(ctx, game, p, columns.count.x + BORDER, top, columns.count.w - BORDER);
  drawBases(ctx, game, p, columns.bases.x + BORDER, top, columns.bases.w - BORDER);
  drawStrip(ctx, game, p, top + MAIN_HEIGHT);
  ctx.restore();

  ctx.strokeStyle = p.line;
  ctx.lineWidth = BORDER;
  roundRect(ctx, BORDER / 2, BORDER / 2, BOARD_WIDTH - BORDER, BOARD_HEIGHT - BORDER, 15);
  ctx.stroke();
  ctx.restore();
}

function drawBrand(ctx: Ctx, game: OverlayGame, p: Palette, x: number, y: number, w: number, logo: LogoLookup) {
  const inner = w - 36;
  const cx = x + w / 2;
  const subtitle = game.brand_subtitle.trim();
  const image = logo(game.brand_logo_url);

  // Alturas como en el CSS: logo 96 o nombre (≈ su tamaño), regla 3, subtítulo ≈ su tamaño, separación 10.
  let headHeight = 96;
  let name: { text: string; size: number } | null = null;
  if (!image) {
    name = fitText(ctx, game.brand_name, inner, 64, 30, 800, 1);
    headHeight = name.size * 0.95;
  }
  let sub: { text: string; size: number } | null = null;
  if (subtitle) sub = fitText(ctx, subtitle, inner, 19, 12, 600, 5);
  const total = headHeight + (sub ? 10 + 3 + 10 + sub.size : 0);
  let cursor = y + (MAIN_HEIGHT - total) / 2;

  if (image) {
    drawContain(ctx, image, cx - Math.min(200, inner) / 2, cursor, Math.min(200, inner), 96);
  } else if (name) {
    font(ctx, 800, name.size);
    ctx.fillStyle = p.text;
    spacedText(ctx, name.text, cx, cursor + headHeight / 2, 1, "center");
  }
  cursor += headHeight;
  if (sub) {
    cursor += 10;
    ctx.fillStyle = p.accent;
    roundRect(ctx, cx - inner * 0.36, cursor, inner * 0.72, 3, 1.5);
    ctx.fill();
    cursor += 3 + 10;
    font(ctx, 600, sub.size);
    ctx.fillStyle = p.muted;
    spacedText(ctx, sub.text, cx, cursor + sub.size / 2, 5, "center");
  }
}

function drawTeams(ctx: Ctx, game: OverlayGame, p: Palette, x: number, y: number, w: number, logo: LogoLookup) {
  const batting = game.status === "en_juego" ? battingSide(game.half) : null;
  const rowX = x + 10;
  const rowW = w - 20;
  const rowH = 72;
  const firstY = y + (MAIN_HEIGHT - (rowH * 2 + 8)) / 2;
  (["away", "home"] as TeamSide[]).forEach((side, index) => {
    drawTeamRow(ctx, game, p, side, rowX, firstY + index * (rowH + 8), rowW, rowH, batting === side, logo);
  });
}

function drawTeamRow(
  ctx: Ctx,
  game: OverlayGame,
  p: Palette,
  side: TeamSide,
  x: number,
  y: number,
  w: number,
  h: number,
  batting: boolean,
  logo: LogoLookup,
) {
  const home = side === "home";
  const name = (home ? game.home_name : game.away_name).toUpperCase();
  const abbr = home ? game.home_abbr : game.away_abbr;
  const color = home ? game.home_color : game.away_color;
  const image = logo(home ? game.home_logo_url : game.away_logo_url);
  const runs = home ? game.home_runs : game.away_runs;

  ctx.save();
  roundRect(ctx, x, y, w, h, 8);
  ctx.clip();
  ctx.fillStyle = "rgba(0,0,0,0.18)";
  ctx.fillRect(x, y, w, h);

  // Franja de color en diagonal.
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + 34, y);
  ctx.lineTo(x + 34 * 0.62, y + h);
  ctx.lineTo(x, y + h);
  ctx.closePath();
  ctx.fill();

  // Logo o abreviatura (64 × 64, contenido).
  const logoX = x + 34 + 4;
  const midY = y + h / 2;
  if (image) {
    drawContain(ctx, image, logoX, midY - 32, 64, 64);
  } else {
    roundRect(ctx, logoX, midY - 25, 64, 50, 6);
    ctx.fillStyle = color;
    ctx.fill();
    font(ctx, 800, 26);
    ctx.fillStyle = readableTextOn(color);
    spacedText(ctx, abbr, logoX + 32, midY + 1, 0.5, "center");
  }

  // Carreras (recuadro claro a la derecha).
  const runsX = x + w - 112;
  ctx.fillStyle = "#f3f4f6";
  ctx.fillRect(runsX, y, 112, h);
  ctx.fillStyle = "rgba(0,0,0,0.25)";
  ctx.fillRect(runsX, y, 3, h);
  font(ctx, 800, 66);
  ctx.fillStyle = "#0b0d12";
  ctx.textAlign = "center";
  ctx.fillText(String(runs), runsX + 1.5 + 112 / 2, midY + 3);

  // Flecha de turno al bate.
  if (batting) {
    font(ctx, 700, 20);
    ctx.fillStyle = p.accent;
    ctx.textAlign = "center";
    ctx.fillText("◀", runsX - 12, midY);
  }

  // Nombre: se achica hasta caber y luego "…".
  const nameX = logoX + 64 + 14;
  const nameW = runsX - 24 - 8 - nameX;
  const fitted = fitText(ctx, name, nameW, 52, 30, 800, 0.5);
  font(ctx, 800, fitted.size);
  ctx.fillStyle = p.text;
  spacedText(ctx, fitted.text, nameX, midY + 2, 0.5);
  ctx.restore();
}

function drawInning(ctx: Ctx, game: OverlayGame, p: Palette, x: number, y: number, w: number) {
  const cx = x + w / 2;
  ctx.textAlign = "center";
  if (game.status === "finalizado") {
    const total = 40 + 2 + 46;
    let cursor = y + (MAIN_HEIGHT - total) / 2;
    font(ctx, 800, 40);
    ctx.fillStyle = p.text;
    spacedText(ctx, "FINAL", cx, cursor + 20, 2, "center");
    cursor += 42;
    font(ctx, 800, 46);
    ctx.fillStyle = p.muted;
    ctx.textAlign = "center";
    ctx.fillText(String(game.inning), cx, cursor + 23);
    return;
  }
  const total = 26 + 2 + 80 + 2 + 26;
  const start = y + (MAIN_HEIGHT - total) / 2;
  font(ctx, 700, 26);
  ctx.fillStyle = p.accent;
  if (game.half === "alta") ctx.fillText("▲", cx, start + 13);
  if (game.half === "baja") ctx.fillText("▼", cx, start + 26 + 2 + 80 + 2 + 13);
  font(ctx, 800, 80);
  ctx.fillStyle = p.text;
  ctx.fillText(String(game.inning), cx, start + 26 + 2 + 40 + 3);

  if (game.inning > game.scheduled_innings) {
    font(ctx, 700, 15);
    const label = "EXTRA";
    const tw = measure(ctx, label, 1) + 12;
    const tx = x + w - 8 - tw;
    const ty = y + MAIN_HEIGHT - 8 - 19;
    roundRect(ctx, tx, ty, tw, 19, 4);
    ctx.fillStyle = p.accent;
    ctx.fill();
    ctx.fillStyle = "#0b0d12";
    spacedText(ctx, label, tx + tw / 2, ty + 10, 1, "center");
  }
}

function drawCount(ctx: Ctx, game: OverlayGame, p: Palette, x: number, y: number, w: number) {
  const cx = x + w / 2;
  const bottomH = 62;
  const topH = MAIN_HEIGHT - bottomH - BORDER;

  // Bolas - strikes y su etiqueta.
  const total = 62 + 6 + 17;
  const start = y + (topH - total) / 2;
  font(ctx, 800, 62);
  ctx.fillStyle = p.text;
  spacedText(ctx, `${game.balls} - ${game.strikes}`, cx, start + 31 + 3, 2, "center");
  font(ctx, 600, 17);
  ctx.fillStyle = p.muted;
  spacedText(ctx, "BOLAS · STRIKES", cx, start + 62 + 6 + 9, 2, "center");

  ctx.fillStyle = p.line;
  ctx.fillRect(x, y + topH, w, BORDER);

  // Outs: dos puntos y el texto.
  const label = `${game.outs} OUT${game.outs === 1 ? "" : "S"}`;
  font(ctx, 800, 30);
  const labelW = Math.max(82, measure(ctx, label, 1));
  const groupW = 24 * 2 + 12 + 18 + labelW;
  let cursor = cx - groupW / 2;
  const midY = y + topH + BORDER + bottomH / 2;
  for (let i = 1; i <= 2; i += 1) {
    ctx.beginPath();
    ctx.arc(cursor + 12, midY, 10.5, 0, Math.PI * 2);
    if (game.outs >= i) {
      ctx.fillStyle = p.accent;
      ctx.fill();
      ctx.strokeStyle = p.accent;
    } else {
      ctx.strokeStyle = p.emptyBase;
    }
    ctx.lineWidth = 3;
    ctx.stroke();
    cursor += 24 + 12;
  }
  cursor += 18 - 12;
  ctx.fillStyle = p.text;
  spacedText(ctx, label, cursor, midY + 2, 1);
}

function drawBases(ctx: Ctx, game: OverlayGame, p: Palette, x: number, y: number, w: number) {
  const ox = x + (w - 150) / 2;
  const oy = y + (MAIN_HEIGHT - 120) / 2;
  const bases: [number, number, boolean][] = [
    [52, 6, game.on_second],
    [8, 50, game.on_third],
    [96, 50, game.on_first],
  ];
  for (const [left, topOffset, on] of bases) {
    ctx.save();
    ctx.translate(ox + left + 23, oy + topOffset + 23);
    ctx.rotate(Math.PI / 4);
    roundRect(ctx, -21, -21, 42, 42, 3);
    if (on) {
      ctx.fillStyle = p.accent;
      ctx.fill();
    }
    ctx.lineWidth = 4;
    ctx.strokeStyle = on ? p.accent : p.emptyBase;
    ctx.stroke();
    ctx.restore();
  }
}

function drawStrip(ctx: Ctx, game: OverlayGame, p: Palette, y: number) {
  ctx.fillStyle = p.line;
  ctx.fillRect(0, y, BOARD_WIDTH, BORDER);
  const stripY = y + BORDER;
  const stripH = BOARD_HEIGHT - BORDER - stripY;
  ctx.fillStyle = p.strip;
  ctx.fillRect(0, stripY, BOARD_WIDTH, stripH);
  const midY = stripY + stripH / 2 + 1;

  const center = [game.sport === "beisbol" ? "BÉISBOL" : "SOFTBALL", game.venue.trim().toUpperCase()]
    .filter(Boolean)
    .join("  •  ");
  const fitted = fitText(ctx, center, 900, 22, 22, 700, 6);
  font(ctx, 700, 22);
  ctx.fillStyle = p.muted;
  spacedText(ctx, fitted.text, BOARD_WIDTH / 2, midY, 6, "center");

  const tag = STATUS_TAG[game.status];
  font(ctx, 700, 22);
  const tagW = measure(ctx, tag, 2);
  const right = BOARD_WIDTH - 26;
  const tone =
    game.status === "en_juego" ? "#ef2b2b" : game.status === "suspendido" ? "#f59e0b" : game.status === "finalizado" ? p.text : p.muted;
  ctx.fillStyle = game.status === "previo" ? p.muted : p.text;
  spacedText(ctx, tag, right, midY, 2, "right");
  ctx.beginPath();
  ctx.arc(right - tagW - 12 - 8, midY - 1, 8, 0, Math.PI * 2);
  ctx.fillStyle = tone;
  ctx.fill();
}
