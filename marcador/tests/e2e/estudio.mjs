/**
 * Prueba de punta a punta del Estudio en vivo, con la app y el intermediario reales:
 *
 *   Chromium (cámara y micrófono simulados) → Estudio → intermediario → ffmpeg
 *   → receptor RTMP local (hace de YouTube) → archivo que se analiza con ffprobe.
 *
 * Comprueba: video 1280 × 720 a 30 fps con H.264, audio AAC con sonido, el marcador
 * dentro del video, que los cambios hechos desde OTRO dispositivo aparecen en la
 * señal, la reconexión tras un corte de la salida, y el fin con confirmación.
 *
 * Requisitos: la app corriendo (npm start), Supabase local y ffmpeg instalado.
 *   (cd relay && npm ci --ignore-scripts)   # dependencias del intermediario
 *   BASE_URL=http://localhost:3000 npm run test:estudio
 * Variables opcionales: MIME=mp4 fuerza el formato que usa Safari.
 */
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright-core";
import { readConfig } from "../../relay/src/config.mjs";
import { createUserVerifier } from "../../relay/src/auth.mjs";
import { createRelayServer } from "../../relay/src/server.mjs";

const envFile = join(import.meta.dirname, "..", "..", ".env.local");
if (existsSync(envFile)) process.loadEnvFile(envFile);

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321";
const SUPABASE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const FORCE_MP4 = process.env.MIME === "mp4";
const OUT = join(import.meta.dirname, "salida", FORCE_MP4 ? "estudio-mp4" : "estudio");
mkdirSync(OUT, { recursive: true });
const RTMP_PORT = 19350;
const RELAY_PORT = 8799;
const INGEST = `rtmp://127.0.0.1:${RTMP_PORT}/live2/clave-de-prueba`;

const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok: !!ok });
  console.log(`${ok ? "✔" : "✘"} ${name}${detail ? ` — ${detail}` : ""}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Receptor RTMP: ffmpeg escuchando y guardando lo que llega, como haría YouTube. */
function startReceiver(file) {
  const proc = spawn("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-listen", "1", "-i", INGEST, "-c", "copy", "-f", "mpegts", file]);
  proc.stderr.on("data", () => {});
  return proc;
}

const email = `estudio-${Date.now()}@marcador.test`;
const password = "clave-estudio-123";

// ---------- Intermediario ----------
const relayLogs = [];
const config = readConfig({
  OUTPUT_URL: INGEST,
  YOUTUBE_STREAM_KEY: "clave-de-prueba",
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY: SUPABASE_KEY,
  ALLOWED_EMAILS: email,
  ALLOWED_ORIGINS: new URL(BASE).origin,
});
const relay = createRelayServer({
  config,
  ffmpegPath: process.env.FFMPEG_PATH ?? "ffmpeg",
  verifyUser: createUserVerifier(config),
  log: (line) => {
    relayLogs.push(line);
    console.log(`   intermediario: ${line}`);
  },
});
await relay.listen(RELAY_PORT);

let receiver = startReceiver(join(OUT, "recibido-1.mpegts"));

// ---------- Navegador: cámara y micrófono simulados ----------
const browser = await chromium.launch({
  args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", "--autoplay-policy=no-user-gesture-required"],
});
const errors = [];
const watch = (page, label) => {
  page.on("pageerror", (e) => errors.push(`${label}: ${e.message}`));
};

// Cuenta nueva y partido de ejemplo (dueño).
const phoneCtx = await browser.newContext({
  viewport: { width: 844, height: 390 },
  isMobile: true,
  hasTouch: true,
  permissions: ["camera", "microphone"],
});
if (FORCE_MP4) {
  await phoneCtx.addInitScript(() => {
    const original = MediaRecorder.isTypeSupported.bind(MediaRecorder);
    MediaRecorder.isTypeSupported = (type) => type.startsWith("video/mp4") && original(type);
  });
}
const phone = await phoneCtx.newPage();
watch(phone, "estudio");
await phone.goto(`${BASE}/login?next=/control`);
await phone.click("button:has-text('Crear cuenta')");
await phone.fill("#email", email);
await phone.fill("#password", password);
await phone.click("form button.btn-primary");
await phone.waitForURL(/\/control$/);
await phone.click("button:has-text('Crear partido de ejemplo')");
await phone.waitForURL(/\/control\/[0-9a-f-]{36}$/);
const gameId = phone.url().split("/control/")[1];
check("el panel enlaza al Estudio", await phone.isVisible('[data-testid="open-studio"]'));

// El código QR del intermediario abre /estudio?relay=…: guarda la dirección.
await phone.goto(`${BASE}/estudio?relay=${encodeURIComponent(`http://localhost:${RELAY_PORT}`)}`);
check("el enlace del QR guarda el intermediario", (await phone.textContent('[data-testid="relay-saved"]')).includes(`ws://localhost:${RELAY_PORT}`));
await phone.click('[data-testid="studio-game"]');
await phone.waitForURL(new RegExp(`/estudio/${gameId}$`));
await phone.waitForSelector('[data-testid="open-media"]');
await phone.click('[data-testid="open-media"]');
await phone.waitForSelector('[data-testid="open-media"]', { state: "detached", timeout: 15000 });
await phone.waitForFunction(() => document.querySelector('[data-testid="status-relay"]')?.textContent === "Listo", null, { timeout: 15000 });
check("intermediario comprobado: Listo", true);
const mime = await phone.evaluate(() =>
  ["video/webm;codecs=h264,opus", "video/webm;codecs=vp8,opus", "video/mp4;codecs=avc1.42E01F,mp4a.40.2", "video/mp4;codecs=avc1,mp4a", "video/mp4", "video/webm"].find((t) =>
    MediaRecorder.isTypeSupported(t),
  ),
);
console.log(`   formato de grabación del navegador: ${mime}`);
check("el navegador tiene un formato de grabación compatible", !!mime, mime);

// Ajustes del marcador en el video: abajo a la izquierda, 70 %.
await phone.selectOption('[data-testid="studio-pos"]', "bottom-left");
await phone.fill('[data-testid="studio-scale"]', "0.7");

// ---------- Iniciar ----------
await phone.click('[data-testid="start-broadcast"]');
await phone.waitForFunction(() => /Recibiendo/.test(document.querySelector('[data-testid="status-youtube"]')?.textContent ?? ""), null, {
  timeout: 30000,
});
check("estado real: YouTube (receptor) recibiendo fotogramas", true, await phone.textContent('[data-testid="status-youtube"]'));
check("se muestra EN VIVO con duración", /EN VIVO · 00:0\d/.test(await phone.textContent('[data-testid="duration"]')));
await phone.screenshot({ path: join(OUT, "estudio-en-vivo.png") });
await sleep(6000);

// ---------- Otra persona cambia el marcador desde otro dispositivo ----------
const otherCtx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const other = await otherCtx.newPage();
watch(other, "otro celular");
await other.goto(`${BASE}/login?next=/control/${gameId}`);
await other.fill("#email", email);
await other.fill("#password", password);
await other.click("form button.btn-primary");
await other.waitForURL(new RegExp(`/control/${gameId}$`));
await other.waitForSelector('[data-testid="connection"][data-status="conectado"]', { timeout: 20000 });
await other.click('[data-testid="runs-plus-home"]');
await other.click('[data-testid="runs-plus-home"]');
await other.click('[data-testid="runs-plus-home"]');
await other.click('[data-testid="status-en_juego"]');
await other.click('[data-testid="base-on_second"]');
const shownInStudio = await phone
  .waitForFunction(() => document.querySelector('[data-testid="status-score"]')?.textContent?.startsWith("Conectado"), null, { timeout: 5000 })
  .then(() => true)
  .catch(() => false);
check("el Estudio sigue sincronizado con el marcador", shownInStudio);
await sleep(8000);

// ---------- Corte de la salida (como si YouTube cerrara la conexión) ----------
receiver.kill("SIGKILL");
await phone.waitForFunction(() => /Reconectando/.test(document.querySelector('[data-testid="status-broadcast"]')?.textContent ?? ""), null, {
  timeout: 15000,
});
check("tras un corte de la salida, el Estudio muestra Reconectando", true, await phone.textContent('[data-testid="broadcast-message"]'));
receiver = startReceiver(join(OUT, "recibido-2.mpegts"));
await phone.waitForFunction(() => /Recibiendo/.test(document.querySelector('[data-testid="status-youtube"]')?.textContent ?? ""), null, {
  timeout: 30000,
});
check("se reconecta solo y vuelve a enviar", true);
const durationText = await phone.textContent('[data-testid="duration"]');
check("la duración no se reinicia al reconectar", !/00:0[0-9]$/.test(durationText.trim()), durationText);

// Silenciar el micrófono.
await phone.click('[data-testid="toggle-mute"]');
check("silenciar micrófono", (await phone.getAttribute('[data-testid="toggle-mute"]', "aria-pressed")) === "true");
await sleep(5000);
await phone.click('[data-testid="toggle-mute"]');
await sleep(3000);

// ---------- Finalizar con confirmación ----------
await phone.click('[data-testid="stop-broadcast"]');
check("finalizar pide confirmación", await phone.isVisible("dialog.confirm[open]"));
await phone.click('[data-testid="confirm-yes"]');
await phone.waitForFunction(() => document.querySelector('[data-testid="broadcast-phase"]')?.textContent === "Sin transmitir", null, {
  timeout: 15000,
});
check("tras confirmar, la transmisión termina", true);
await sleep(1500);
check("el intermediario quedó libre", !relay.active);
check("la clave nunca aparece en los registros del intermediario", relayLogs.every((l) => !l.includes("clave-de-prueba")));

await browser.close();
await relay.close();
await sleep(500);
receiver.kill("SIGINT");
await sleep(1000);

// ---------- Análisis de la señal recibida ----------
function probe(path) {
  return JSON.parse(execFileSync("ffprobe", ["-v", "error", "-show_streams", "-show_format", "-of", "json", path], { encoding: "utf8" }));
}

/** Volumen máximo (dB) del audio entre dos segundos; ffmpeg lo informa en stderr. */
function maxVolume(path, from, to) {
  const run = spawnSync("ffmpeg", ["-hide_banner", "-ss", String(from), "-to", String(to), "-i", path, "-map", "0:a", "-af", "volumedetect", "-f", "null", "-"], {
    encoding: "utf8",
  });
  const match = /max_volume: (-?[\d.]+|-inf) dB/.exec(run.stderr);
  return match ? (match[1] === "-inf" ? -Infinity : Number(match[1])) : null;
}

/** Recorte del cuadro en el segundo `at` como píxeles RGB (y una imagen PNG para revisar a ojo). */
function frameCrop(path, at, crop, png) {
  execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-ss", String(at), "-i", path, "-frames:v", "1", png]);
  return execFileSync("ffmpeg", [
    "-hide_banner", "-loglevel", "error", "-ss", String(at), "-i", path, "-frames:v", "1",
    "-vf", `crop=${crop.w}:${crop.h}:${crop.x}:${crop.y}`, "-f", "rawvideo", "-pix_fmt", "rgb24", "-",
  ]);
}

const meanAbsDiff = (a, b) => {
  if (!a.length || a.length !== b.length) return 0;
  let sum = 0;
  for (let i = 0; i < a.length; i += 1) sum += Math.abs(a[i] - b[i]);
  return sum / a.length;
};
/** Fracción de píxeles que cambian de forma visible (dígitos, bases, etiqueta de estado). */
const changedFraction = (a, b) => {
  if (!a.length || a.length !== b.length) return 0;
  let changed = 0;
  for (let i = 0; i < a.length; i += 3) {
    if (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]) > 120) changed += 1;
  }
  return changed / (a.length / 3);
};
const meanLevel = (a) => (a.length ? a.reduce((sum, v) => sum + v, 0) / a.length : 0);

// Marcador abajo a la izquierda al 70 %: factor 1280/1920 × 0,7; margen 40 × 1280/1920.
const factor = (1280 / 1920) * 0.7;
const margin = Math.round(40 * (1280 / 1920));
const board = { x: margin, y: Math.round(720 - 220 * factor - margin), w: Math.floor(1600 * factor), h: Math.floor(220 * factor) };
// Zona de la cámara sin marcador: el reloj de la cámara simulada de Chromium (arriba a la izquierda).
const cameraZone = { x: 80, y: 20, w: 400, h: 60 };

const first = join(OUT, "recibido-1.mpegts");
const second = join(OUT, "recibido-2.mpegts");
for (const path of [first, second]) {
  const name = path.split("/").pop();
  const size = statSync(path, { throwIfNoEntry: false })?.size ?? 0;
  check(`${name}: llegó video`, size > 100_000, `${Math.round(size / 1024)} KB`);
  if (!size) continue;
  const info = probe(path);
  const video = info.streams.find((s) => s.codec_type === "video");
  const audio = info.streams.find((s) => s.codec_type === "audio");
  check(`${name}: H.264 1280 × 720`, video?.codec_name === "h264" && video.width === 1280 && video.height === 720, `${video?.codec_name} ${video?.width}×${video?.height}`);
  check(`${name}: 30 fps`, video?.r_frame_rate === "30/1", video?.r_frame_rate);
  check(`${name}: audio AAC`, audio?.codec_name === "aac", `${audio?.codec_name} ${audio?.sample_rate} Hz`);
  console.log(`   ${name}: ${Number(info.format.duration).toFixed(1)} s`);
}

const firstDuration = Number(probe(first).format.duration);
const loud = maxVolume(first, 2, firstDuration - 1);
check("el micrófono se oye en la señal recibida", loud !== null && loud > -30, `volumen máximo ${loud} dB`);

const before = frameCrop(first, 3, board, join(OUT, "cuadro-antes.png"));
const after = frameCrop(first, firstDuration - 3, board, join(OUT, "cuadro-despues.png"));
const camBefore = frameCrop(first, 3, cameraZone, join(OUT, "cuadro-antes.png"));
const camAfter = frameCrop(first, firstDuration - 3, cameraZone, join(OUT, "cuadro-despues.png"));
check("la cámara se ve y está en movimiento", meanLevel(camBefore) > 20 && meanAbsDiff(camBefore, camAfter) > 1, `nivel ${meanLevel(camBefore).toFixed(0)}, cambio ${meanAbsDiff(camBefore, camAfter).toFixed(1)}`);
check("el marcador está dentro del video (zona oscura del panel)", meanLevel(before) < 90, `nivel medio ${meanLevel(before).toFixed(0)}`);
const boardChange = changedFraction(before, after);
check("los cambios hechos desde el otro celular aparecen en el video", boardChange > 0.003, `${(boardChange * 100).toFixed(1)} % del marcador cambió`);
frameCrop(second, 2, board, join(OUT, "cuadro-tras-reconectar.png"));

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} comprobaciones correctas · capturas en ${OUT}`);
if (errors.length) console.log(`Errores en las páginas:\n  ${errors.join("\n  ")}`);
process.exit(failed.length || errors.length ? 1 : 0);
