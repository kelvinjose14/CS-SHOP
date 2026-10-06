/**
 * Pruebas de punta a punta de los criterios de aceptación, con la app real.
 *
 * Requisitos: la app corriendo (npm run dev o npm start) y Supabase con registro
 * abierto y sin confirmación de correo (el local de `supabase start` ya viene así).
 *
 *   BASE_URL=http://localhost:3000 npm run test:e2e
 *
 * Usa dos contextos de navegador aislados (como dos perfiles): el panel y el overlay.
 * Guarda capturas en tests/e2e/salida/.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright-core";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const OUT = join(import.meta.dirname, "salida");
mkdirSync(OUT, { recursive: true });

const results = [];
const check = (criterion, name, ok, detail = "") => {
  results.push({ criterion, name, ok: !!ok, detail });
  console.log(`${ok ? "✔" : "✘"} [${criterion}] ${name}${detail ? ` — ${detail}` : ""}`);
};

const browser = await chromium.launch();
const errors = [];
const watch = (page, label) => {
  page.on("pageerror", (e) => errors.push(`${label}: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error" && !/hydrat|WebSocket|ERR_INTERNET_DISCONNECTED|Failed to fetch|net::/i.test(m.text()))
      errors.push(`${label}: ${m.text()}`);
  });
};

// ---------- Preparación: cuenta nueva y partido de ejemplo desde la interfaz ----------
const panelCtx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const panel = await panelCtx.newPage();
watch(panel, "panel");
const email = `e2e-${Date.now()}@marcador.test`;
await panel.goto(`${BASE}/control`);
check("auth", "/control sin sesión redirige al login", panel.url().includes("/login"));
await panel.click("button:has-text('Crear cuenta')");
await panel.fill("#email", email);
await panel.fill("#password", "clave-e2e-123");
await panel.click("form button.btn-primary");
await panel.waitForURL(/\/control$/);
await panel.click("button:has-text('Crear partido de ejemplo')");
await panel.waitForURL(/\/control\/[0-9a-f-]{36}$/);
await panel.waitForSelector('[data-testid="connection"][data-status="conectado"]', { timeout: 20000 });
check("panel", "indicador de conexión visible: Conectado", true);
const overlayUrl = (await panel.textContent('[data-testid="overlay-url"]')).trim();
const slug = overlayUrl.split("/overlay/")[1];
check("panel", "URL del overlay disponible para copiar", /\/overlay\/[A-Za-z0-9_-]{22}$/.test(overlayUrl), overlayUrl);

// ---------- Overlay en otro contexto (otro "perfil"), con corte de red controlable ----------
const overlayCtx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
let networkCut = false;
const sockets = [];
await overlayCtx.routeWebSocket(/\/realtime\/v1\/websocket/, (ws) => {
  if (networkCut) return ws.close();
  const server = ws.connectToServer();
  sockets.push({ ws, server });
});
const overlay = await overlayCtx.newPage();
watch(overlay, "overlay");
await overlay.goto(overlayUrl);
await overlay.waitForSelector('[data-testid="scoreboard"]');
await overlay.evaluate(() => (window.__sinRecargar = true));

const runsOverlay = (side) => overlay.textContent(`[data-testid="overlay-runs-${side}"]`).then((t) => t?.trim());
async function timed(action, predicate, timeout = 3000) {
  const start = Date.now();
  await action();
  await overlay.waitForFunction(predicate, null, { timeout });
  return Date.now() - start;
}

// ---------- Criterio 1: cada cambio se refleja sin recargar ----------
const latencies = [];
latencies.push(
  await timed(
    () => panel.click('[data-testid="runs-plus-home"]'),
    () => document.querySelector('[data-testid="overlay-runs-home"]')?.textContent?.trim() === "1",
  ),
);
latencies.push(
  await timed(
    () => panel.click('[data-testid="stepper-balls"] button[aria-label^="Sumar"]'),
    () => document.querySelector('[data-testid="count"]')?.textContent?.trim() === "1 - 0",
  ),
);
latencies.push(
  await timed(
    () => panel.click('[data-testid="base-on_second"]'),
    () => document.querySelector('[data-testid="overlay-base-2"][data-on="true"]') !== null,
  ),
);
latencies.push(
  await timed(
    () => panel.click('[data-testid="status-en_juego"]'),
    () => document.querySelector('[data-testid="status-tag"]')?.textContent?.includes("EN VIVO"),
  ),
);
latencies.push(
  await timed(
    () => panel.click('[data-testid="toggle-overlay"]'),
    () => document.querySelector('[data-testid="overlay-stage"]')?.dataset.visible === "false",
  ),
);
latencies.push(
  await timed(
    () => panel.click('[data-testid="toggle-overlay"]'),
    () => document.querySelector('[data-testid="overlay-stage"]')?.dataset.visible === "true",
  ),
);
check("1", "carreras, conteo, bases, estado y mostrar/ocultar llegan al overlay sin recargar", await overlay.evaluate(() => window.__sinRecargar === true));
check("1", "tiempo de clic en el panel → overlay actualizado < 1 s", Math.max(...latencies) < 1000, `${latencies.join(", ")} ms`);

// Cambiar mitad: alta → baja limpia conteo y bases
await panel.click('[data-testid="change-half"]');
await overlay.waitForFunction(() => document.querySelector('[data-testid="count"]')?.textContent?.trim() === "0 - 0");
check("1", "cambiar mitad limpia conteo y bases en el overlay", (await overlay.$('[data-testid="overlay-base-2"][data-on="true"]')) === null);

// ---------- Criterio 4: deshacer varias veces, también después de recargar ----------
// Estado: 1-0 carreras, baja del 1.º. Hacemos 3 acciones y deshacemos 2, recargamos y deshacemos 1 más.
await panel.click('[data-testid="runs-plus-away"]');
await panel.click('[data-testid="runs-plus-away"]');
await panel.click('[data-testid="stepper-outs"] button[aria-label^="Sumar"]');
await overlay.waitForFunction(() => document.querySelector('[data-testid="outs"]')?.textContent?.trim() === "1 OUT");
await panel.click('[data-testid="undo"]');
await panel.click('[data-testid="undo"]');
await overlay.waitForFunction(
  () =>
    document.querySelector('[data-testid="outs"]')?.textContent?.trim() === "0 OUTS" &&
    document.querySelector('[data-testid="overlay-runs-away"]')?.textContent?.trim() === "1",
);
check("4", "deshacer dos veces seguidas", true);
await panel.reload();
await panel.waitForSelector('[data-testid="connection"][data-status="conectado"]', { timeout: 20000 });
const undoLabel = await panel.textContent('[data-testid="undo"]');
await panel.click('[data-testid="undo"]');
await overlay.waitForFunction(() => document.querySelector('[data-testid="overlay-runs-away"]')?.textContent?.trim() === "0");
check("4", "después de recargar el panel, deshacer sigue funcionando", true, `botón tras recargar: "${undoLabel.trim()}"`);

// ---------- Criterio 5: recargar recupera el estado exacto ----------
await panel.click('[data-testid="runs-plus-home"]');
await panel.click('[data-testid="stepper-strikes"] button[aria-label^="Sumar"]');
await panel.click('[data-testid="base-on_third"]');
await overlay.waitForFunction(() => document.querySelector('[data-testid="overlay-base-3"][data-on="true"]') !== null);
const snapshot = async (page) =>
  page.evaluate(() => {
    const board = document.querySelector('[data-testid="scoreboard"]');
    return board ? board.innerText.replace(/\s+/g, " ").replace("RECONECTANDO", "").trim() : null;
  });
const before = { panel: await snapshot(panel), overlay: await snapshot(overlay) };
await panel.reload();
await overlay.reload();
await overlay.waitForSelector('[data-testid="scoreboard"]');
await panel.waitForSelector('[data-testid="connection"][data-status="conectado"]', { timeout: 20000 });
await overlay.waitForTimeout(500);
const after = { panel: await snapshot(panel), overlay: await snapshot(overlay) };
check("5", "recargar el panel recupera el estado exacto", before.panel === after.panel, after.panel);
check("5", "recargar el overlay recupera el estado exacto", before.overlay === after.overlay);

// ---------- Concurrencia en la interfaz: dos paneles, ninguno pisa al otro ----------
const panelB = await panelCtx.newPage(); // misma sesión, otra pestaña (como otro celular)
watch(panelB, "panelB");
let cutB = false;
const panelBSockets = [];
await panelB.routeWebSocket(/\/realtime\/v1\/websocket/, (ws) => {
  if (cutB) return ws.close();
  const server = ws.connectToServer();
  panelBSockets.push({ ws, server });
});
await panelB.goto(panel.url());
await panelB.waitForSelector('[data-testid="connection"][data-status="conectado"]', { timeout: 20000 });
// B deja de recibir el tiempo real, así no se entera del cambio de A.
cutB = true;
for (const { ws, server } of panelBSockets) {
  await ws.close().catch(() => {});
  await server.close().catch(() => {});
}
await panelB.waitForTimeout(300);
const homeBefore = Number(await panel.textContent('[data-testid="runs-value-home"]'));
await panel.click('[data-testid="runs-plus-home"]');
await overlay.waitForFunction((n) => document.querySelector('[data-testid="overlay-runs-home"]')?.textContent?.trim() === String(n), homeBefore + 1);
await panelB.click('[data-testid="runs-plus-home"]'); // B cree que está en homeBefore
await panelB.waitForSelector('[data-testid="notice"]', { timeout: 5000 });
const notice = await panelB.textContent('[data-testid="notice"]');
await panelB.waitForFunction((n) => document.querySelector('[data-testid="runs-value-home"]')?.textContent?.trim() === String(n), homeBefore + 1);
await overlay.waitForTimeout(500);
check(
  "concurrencia",
  "el segundo controlador recibe un aviso y nadie sobrescribe en silencio",
  /Otro controlador/.test(notice) && (await runsOverlay("home")) === String(homeBefore + 1),
  notice.trim().slice(0, 70),
);
await panelB.close();

// ---------- Criterio 6: cortar la red del overlay ----------
const runsBeforeCut = await runsOverlay("away");
await overlay.evaluate(() => (window.__duranteCorte = true));
networkCut = true;
await overlayCtx.setOffline(true);
for (const { ws, server } of sockets) {
  await ws.close().catch(() => {});
  await server.close().catch(() => {});
}
await overlay.waitForSelector('[data-testid="overlay-reconnecting"]', { timeout: 20000 });
await panel.click('[data-testid="runs-plus-away"]');
await panel.click('[data-testid="runs-plus-away"]');
await panel.waitForTimeout(1500);
check("6", "sin red, el overlay conserva el último marcador", (await runsOverlay("away")) === runsBeforeCut && (await overlay.isVisible('[data-testid="scoreboard"]')));
check("6", "sin red, el overlay muestra que está reconectando", await overlay.isVisible('[data-testid="overlay-reconnecting"]'));
await overlay.screenshot({ path: join(OUT, "overlay-reconectando.png"), omitBackground: true });
networkCut = false;
await overlayCtx.setOffline(false);
const reconnectStart = Date.now();
await overlay.waitForFunction(
  (n) => document.querySelector('[data-testid="overlay-runs-away"]')?.textContent?.trim() === String(n),
  Number(runsBeforeCut) + 2,
  { timeout: 30000 },
);
await overlay.waitForSelector('[data-testid="overlay-reconnecting"]', { state: "detached", timeout: 30000 });
check("6", "al volver la red se reconecta y se pone al día", true, `${Date.now() - reconnectStart} ms`);
check("6", "el overlay no se recargó durante el corte", await overlay.evaluate(() => window.__duranteCorte === true));

// ---------- Logos: PNG no cuadrado y SVG con script ----------
const pngBuffer = await overlay.evaluate(async () => {
  const c = Object.assign(document.createElement("canvas"), { width: 300, height: 100 });
  const g = c.getContext("2d");
  g.fillStyle = "#e11d48";
  g.fillRect(0, 0, 300, 100);
  g.fillStyle = "#fff";
  g.font = "bold 60px sans-serif";
  g.fillText("LOGO", 70, 72);
  return Array.from(new Uint8Array(await (await new Promise((r) => c.toBlob(r, "image/png"))).arrayBuffer()));
});
await panel.setInputFiles('[data-testid="logo-input-home"]', { name: "logo.png", mimeType: "image/png", buffer: Buffer.from(pngBuffer) });
await overlay.waitForFunction(() => {
  const img = document.querySelector('[data-testid="team-home"] img');
  return img && img.complete && img.naturalWidth > 0;
}, null, { timeout: 10000 });
const logo = await overlay.$eval('[data-testid="team-home"] img', (img) => ({
  fit: getComputedStyle(img).objectFit,
  w: img.getBoundingClientRect().width,
  h: img.getBoundingClientRect().height,
  natural: img.naturalWidth,
}));
check("logos", "PNG subido a Storage aparece en el overlay sin deformarse (object-fit: contain)", logo.fit === "contain" && logo.natural === 300, JSON.stringify(logo));

const evilSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10" onload="alert(1)"><script>alert(2)</script><circle cx="5" cy="5" r="4" fill="#22c55e"/></svg>`;
await panel.setInputFiles('[data-testid="logo-input-away"]', { name: "logo.svg", mimeType: "image/svg+xml", buffer: Buffer.from(evilSvg) });
await overlay.waitForSelector('[data-testid="team-away"] img', { timeout: 10000 });
const svgUrl = await overlay.$eval('[data-testid="team-away"] img', (img) => img.src);
const svgText = await (await fetch(svgUrl)).text();
check("logos", "SVG subido sin scripts ni eventos", !/script|onload/i.test(svgText) && /circle/.test(svgText));
await panel.click('summary:has-text("Partido y transmisión")');
const big = Buffer.alloc(2 * 1024 * 1024 + 10, 1);
await panel.setInputFiles('[data-testid="logo-input-brand"]', { name: "grande.png", mimeType: "image/png", buffer: big }).catch(() => {});
const bigError = await panel.locator("text=el máximo es 2 MB").first().isVisible().catch(() => false);
check("logos", "archivo de más de 2 MB rechazado con mensaje claro", bigError);

// ---------- Nombres largos: se reducen o usan "…", nunca se desbordan ----------
await panel.fill("#away-name", "Club Deportivo Simón Bolívar del Ensanche");
await panel.click('[data-testid="team-form-away"] button.btn-primary');
await overlay.waitForFunction(() => document.querySelector('[data-testid="team-away"]')?.textContent?.includes("CLUB DEPORTIVO"));
await overlay.waitForTimeout(300);
const fit = await overlay.$eval('[data-testid="team-away"]', (row) => {
  const name = row.querySelector('[data-testid="team-name-away"] span');
  return {
    rowOverflow: row.scrollWidth > row.clientWidth,
    nameOverflowHandled: name.scrollWidth <= name.clientWidth + 1 || getComputedStyle(name).textOverflow === "ellipsis",
    fontSize: getComputedStyle(name).fontSize,
  };
});
check("overlay", "nombre largo ajustado sin desbordar", !fit.rowOverflow && fit.nameOverflowHandled, JSON.stringify(fit));

// ---------- Criterio 8: transparencia, sin barras, legible ----------
const page8 = overlay;
const transparency = await page8.evaluate(() => ({
  html: getComputedStyle(document.documentElement).backgroundColor,
  body: getComputedStyle(document.body).backgroundColor,
  scrollX: document.documentElement.scrollWidth > window.innerWidth,
  scrollY: document.documentElement.scrollHeight > window.innerHeight,
  buttons: document.querySelectorAll("button, a, input, select").length,
  bodyMargin: getComputedStyle(document.body).margin,
}));
check("8", "html y body transparentes", transparency.html === "rgba(0, 0, 0, 0)" && transparency.body === "rgba(0, 0, 0, 0)", `${transparency.html} / ${transparency.body}`);
check("8", "sin barras de desplazamiento, márgenes ni controles", !transparency.scrollX && !transparency.scrollY && transparency.buttons === 0 && transparency.bodyMargin === "0px");
const transparentPng = await page8.screenshot({ path: join(OUT, "overlay-transparente.png"), omitBackground: true });

const composer = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
const b64 = transparentPng.toString("base64");
const corner = await composer.evaluate(async (data) => {
  const img = new Image();
  img.src = `data:image/png;base64,${data}`;
  await img.decode();
  const c = Object.assign(document.createElement("canvas"), { width: img.width, height: img.height });
  const g = c.getContext("2d");
  g.drawImage(img, 0, 0);
  return { topLeft: g.getImageData(5, 5, 1, 1).data[3], center: g.getImageData(960, 540, 1, 1).data[3] };
}, b64);
check("8", "píxeles fuera del marcador 100 % transparentes en la captura", corner.topLeft === 0 && corner.center === 0, JSON.stringify(corner));
await composer.setContent(`<html><body style="margin:0;background-color:#fff;background-image:linear-gradient(45deg,#bbb 25%,transparent 25%),linear-gradient(-45deg,#bbb 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#bbb 75%),linear-gradient(-45deg,transparent 75%,#bbb 75%);background-size:40px 40px;background-position:0 0,0 20px,20px -20px,-20px 0"><img src="data:image/png;base64,${b64}" style="display:block"></body></html>`);
await composer.screenshot({ path: join(OUT, "overlay-sobre-cuadros.png") });
// Cuadro sintético tipo transmisión: cielo claro, gradas y césped con líneas blancas (el peor caso de contraste).
await composer.setContent(`<html><body style="margin:0"><canvas id="c" width="1920" height="1080"></canvas><img src="data:image/png;base64,${b64}" style="position:absolute;left:0;top:0"><script>
const g=document.getElementById('c').getContext('2d');
let s=g.createLinearGradient(0,0,0,420);s.addColorStop(0,'#bfe3ff');s.addColorStop(1,'#ffffff');g.fillStyle=s;g.fillRect(0,0,1920,420);
for(let i=0;i<500;i++){g.fillStyle=['#d1d5db','#f87171','#fde68a','#93c5fd','#ffffff'][i%5];g.fillRect((i*137)%1920,250+((i*53)%170),18,14);}
let f=g.createLinearGradient(0,420,0,1080);f.addColorStop(0,'#4d9e3a');f.addColorStop(1,'#2f7d24');g.fillStyle=f;g.fillRect(0,420,1920,660);
g.fillStyle='#c98b4a';g.beginPath();g.moveTo(960,520);g.lineTo(1500,1080);g.lineTo(420,1080);g.fill();
g.strokeStyle='#ffffff';g.lineWidth=10;g.beginPath();g.moveTo(960,520);g.lineTo(1800,1080);g.moveTo(960,520);g.lineTo(120,1080);g.stroke();
</script></body></html>`);
await composer.waitForTimeout(200);
await composer.screenshot({ path: join(OUT, "overlay-sobre-video.png") });
await composer.close();
check("8", "capturas sobre cuadros y sobre un cuadro de video guardadas", true, "tests/e2e/salida/");

// ---------- ?scale y ?pos: proporcional y siempre dentro de 1920 × 1080 ----------
for (const [query, vw, vh, expect] of [
  ["?scale=0.8&pos=top-left", 1920, 1080, { x: 40, y: 40, w: 1280, h: 176 }],
  ["?scale=0.5&pos=bottom-center", 1920, 1080, { x: 560, y: 930, w: 800, h: 110 }],
  ["?scale=3&pos=bottom-right", 1920, 1080, null],
  ["", 1280, 720, { w: 1066.67, h: 146.67 }],
]) {
  const p = await overlayCtx.newPage();
  await p.setViewportSize({ width: vw, height: vh });
  await p.goto(`${overlayUrl}${query}`);
  await p.waitForSelector('[data-testid="scoreboard"]');
  await p.waitForTimeout(400);
  const box = await p.$eval('[data-testid="scoreboard"]', (el) => {
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height };
  });
  const inside = box.x >= 0 && box.y >= 0 && box.x + box.w <= vw + 0.5 && box.y + box.h <= vh + 0.5;
  const ratio = Math.abs(box.w / box.h - 1600 / 220) < 0.02;
  const near = !expect || Object.entries(expect).every(([k, v]) => Math.abs(box[k] - v) < 2);
  check("overlay", `parámetros ${query || "(ninguno)"} en ${vw}×${vh}: proporción intacta y dentro del cuadro`, inside && ratio && near, JSON.stringify(box));
  if (query.includes("top-left")) await p.screenshot({ path: join(OUT, "overlay-scale-0.8-top-left.png"), omitBackground: true });
  await p.close();
}

// ---------- Animaciones breves y prefers-reduced-motion ----------
const calm = await overlayCtx.newPage();
await calm.emulateMedia({ reducedMotion: "reduce" });
await calm.goto(overlayUrl);
await calm.waitForSelector('[data-testid="scoreboard"]');
const runsNow = Number(await runsOverlay("home"));
await panel.click('[data-testid="runs-plus-home"]');
const target = String(runsNow + 1);
const anim = async (page) => {
  await page.waitForFunction((t) => document.querySelector('[data-testid="overlay-runs-home"]')?.textContent?.trim() === t, target);
  return page.$eval('[data-testid="overlay-runs-home"] span', (el) => {
    const cs = getComputedStyle(el);
    return { name: cs.animationName, ms: parseFloat(cs.animationDuration) * 1000 };
  });
};
const normalAnim = await anim(overlay);
const calmAnim = await anim(calm);
const stageCalm = await calm.$eval('[data-testid="overlay-stage"]', (el) => getComputedStyle(el).transitionDuration);
check("overlay", "al cambiar las carreras hay una animación de menos de 400 ms", normalAnim.name !== "none" && normalAnim.ms < 400, JSON.stringify(normalAnim));
check("overlay", "con prefers-reduced-motion no hay animaciones ni transiciones", calmAnim.name === "none" && /^0s(, 0s)*$/.test(stageCalm), `${calmAnim.name} / ${stageCalm}`);
await calm.close();

// ---------- Criterio 9: el panel a 375 px ----------
const narrowCtx = await browser.newContext({
  viewport: { width: 375, height: 812 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
  storageState: await panelCtx.storageState(),
});
const narrow = await narrowCtx.newPage();
watch(narrow, "panel375");
await narrow.goto(panel.url());
await narrow.waitForSelector('[data-testid="connection"][data-status="conectado"]', { timeout: 20000 });
await narrow.waitForTimeout(500);
const layout = await narrow.evaluate(() => {
  const small = [...document.querySelectorAll("button, a.btn, select, summary, label.switch, .field input:not([type=file])")]
    .filter((el) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && (r.height < 44 || r.width < 44);
    })
    .map((el) => `${el.tagName}:${(el.textContent || el.getAttribute("aria-label") || "").trim().slice(0, 20)}`);
  return { scrollWidth: document.documentElement.scrollWidth, small };
});
check("9", "sin desplazamiento horizontal a 375 px", layout.scrollWidth <= 375, `scrollWidth = ${layout.scrollWidth}`);
check("9", "todos los controles miden al menos 44 px", layout.small.length === 0, layout.small.join(", ") || "todos ≥ 44 px");
await narrow.screenshot({ path: join(OUT, "panel-375.png") });
await narrow.screenshot({ path: join(OUT, "panel-375-completo.png"), fullPage: true });

// ---------- Reiniciar con confirmación explícita ----------
await narrow.click('[data-testid="reset-game"]');
const dialogOpen = await narrow.isVisible("dialog.confirm[open]");
await narrow.screenshot({ path: join(OUT, "panel-reiniciar.png") });
await narrow.click('[data-testid="confirm-yes"]');
await overlay.waitForFunction(() => document.querySelector('[data-testid="count"]')?.textContent?.trim() === "0 - 0" && document.querySelector('[data-testid="status-tag"]')?.textContent?.includes("PREVIO"));
check("panel", "reiniciar pide confirmación y deja el partido en Previo", dialogOpen);

check("general", "sin errores de JavaScript en las páginas", errors.length === 0, errors.slice(0, 3).join(" | "));

await browser.close();
writeFileSync(join(OUT, "resultados.json"), JSON.stringify({ base: BASE, slug, results }, null, 2));
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} verificaciones correctas. Capturas en ${OUT}`);
process.exit(failed.length ? 1 : 0);
