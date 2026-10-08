import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { test } from "node:test";
import WebSocket from "ws";
import { readConfig, missingSettings } from "../src/config.mjs";
import { createUserVerifier } from "../src/auth.mjs";
import { buildFfmpegArgs, createProgressParser, redact } from "../src/ffmpeg.mjs";
import { createRelayServer, CLOSE } from "../src/server.mjs";

const KEY = "abcd-efgh-ijkl-mnop-qrst";
const ORIGIN = "https://marcador-one.vercel.app";

test("la URL de salida usa RTMPS de YouTube y la clave solo vive en el servidor", () => {
  const config = readConfig({ YOUTUBE_STREAM_KEY: KEY });
  assert.equal(config.outputUrl, `rtmps://a.rtmps.youtube.com/live2/${KEY}`);
  assert.deepEqual(config.allowedOrigins, [ORIGIN, "http://localhost:3000"]);
});

test("informa qué falta configurar", () => {
  assert.equal(missingSettings(readConfig({})).length, 4);
  const ok = readConfig({ YOUTUBE_STREAM_KEY: KEY, SUPABASE_URL: "https://x.supabase.co", SUPABASE_PUBLISHABLE_KEY: "sb_publishable_x", ALLOWED_EMAILS: "a@b.c" });
  assert.deepEqual(missingSettings(ok), []);
});

test("ffmpeg: 720p, 30 fps, fotograma clave cada 2 s, H.264 + AAC en FLV", () => {
  const args = buildFfmpegArgs({ outputUrl: "rtmps://x/live2/k", hasAudio: true }).join(" ");
  assert.match(args, /scale=1280:720/);
  assert.match(args, /fps=30/);
  assert.match(args, /-g 60 -keyint_min 60/);
  assert.match(args, /-c:v libx264/);
  assert.match(args, /-c:a aac/);
  assert.match(args, /-f flv .*rtmps:\/\/x\/live2\/k$/);
  assert.doesNotMatch(args, /anullsrc/);
});

test("ffmpeg: sin micrófono agrega silencio", () => {
  const args = buildFfmpegArgs({ outputUrl: "rtmp://x", hasAudio: false }).join(" ");
  assert.match(args, /anullsrc/);
  assert.match(args, /-map 1:a:0/);
});

test("lee el progreso de ffmpeg", () => {
  const seen = [];
  const parse = createProgressParser((stats) => seen.push(stats));
  parse("frame=90\nfps=30.0\nbitrate=2510.4kbits/s\nout_time_us=3000000\nspe");
  parse("ed=1.01x\nprogress=continue\n");
  assert.deepEqual(seen, [{ frames: 90, fps: 30, kbps: 2510.4, speed: 1.01, seconds: 3, ended: false }]);
});

test("la clave nunca aparece en mensajes", () => {
  assert.equal(redact(`rtmps://a.rtmps.youtube.com/live2/${KEY}: Input/output error`, KEY), "rtmps://a.rtmps.youtube.com/live2/••••: Input/output error");
});

test("verificación de sesión con Supabase", async () => {
  const reply = (status, body) => async () => new Response(JSON.stringify(body), { status });
  const config = { supabaseUrl: "https://x", supabaseKey: "pk", allowedEmails: ["yo@correo.com"] };
  const token = "t".repeat(40);
  assert.deepEqual(await createUserVerifier(config, reply(200, { email: "Yo@Correo.com" }))(token), { ok: true, email: "yo@correo.com" });
  assert.equal((await createUserVerifier(config, reply(200, { email: "otro@correo.com" }))(token)).reason, "correo_no_permitido");
  assert.equal((await createUserVerifier(config, reply(200, { email: "yo@correo.com", is_anonymous: true }))(token)).reason, "sesion_invalida");
  assert.equal((await createUserVerifier(config, reply(401, {}))(token)).reason, "sesion_invalida");
  assert.equal((await createUserVerifier(config, async () => { throw new Error("red"); })(token)).reason, "supabase_inalcanzable");
  assert.equal((await createUserVerifier(config, reply(200, {}))("corto")).reason, "sin_sesion");
});

/** Proceso de ffmpeg simulado: guarda lo que recibe y emite progreso. */
function fakeFfmpeg() {
  const spawned = [];
  const spawnProcess = (_path, args) => {
    const child = new EventEmitter();
    child.stdin = new PassThrough();
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    child.received = [];
    child.args = args;
    child.stdin.on("data", (chunk) => {
      child.received.push(chunk);
      child.stdout.write("frame=30\nfps=30\nbitrate=2500kbits/s\nout_time_us=1000000\nspeed=1x\nprogress=continue\n");
    });
    child.stdin.on("finish", () => setImmediate(() => child.emit("exit", 0)));
    child.kill = () => child.emit("exit", null);
    child.fail = (text) => {
      child.stderr.write(text);
      setTimeout(() => child.emit("exit", 1), 10);
    };
    spawned.push(child);
    return child;
  };
  return { spawned, spawnProcess };
}

async function startRelay(overrides = {}) {
  const config = readConfig({
    YOUTUBE_STREAM_KEY: KEY,
    SUPABASE_URL: "https://x.supabase.co",
    SUPABASE_PUBLISHABLE_KEY: "sb_publishable_x",
    ALLOWED_EMAILS: "yo@correo.com",
    ...overrides,
  });
  const fake = fakeFfmpeg();
  const logs = [];
  const relay = createRelayServer({
    config,
    ffmpegPath: "ffmpeg",
    spawnProcess: fake.spawnProcess,
    verifyUser: async (token) => (token === "buena".repeat(8) ? { ok: true, email: "yo@correo.com" } : { ok: false, reason: "sesion_invalida" }),
    log: (line) => logs.push(line),
  });
  const port = await relay.listen(0);
  return { relay, port, logs, ...fake };
}

function connect(port, origin = ORIGIN) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ingest`, { origin });
  const messages = [];
  const waiters = [];
  ws.on("message", (data, isBinary) => {
    if (isBinary) return;
    const message = JSON.parse(String(data));
    messages.push(message);
    for (const waiter of [...waiters]) if (waiter.test(message)) {
      waiters.splice(waiters.indexOf(waiter), 1);
      waiter.resolve(message);
    }
  });
  const next = (type) =>
    new Promise((resolve) => {
      const found = messages.find((m) => m.type === type);
      if (found) return resolve(found);
      waiters.push({ test: (m) => m.type === type, resolve });
    });
  const closed = new Promise((resolve) => ws.on("close", (code) => resolve(code)));
  const opened = new Promise((resolve, reject) => {
    ws.on("open", resolve);
    ws.on("error", reject);
  });
  return { ws, messages, next, closed, opened };
}

test("rechaza conexiones desde otros sitios", async () => {
  const { relay, port } = await startRelay();
  const client = connect(port, "https://sitio-ajeno.com");
  await assert.rejects(client.opened);
  await relay.close();
});

test("sin sesión válida no arranca ffmpeg", async () => {
  const { relay, port, spawned } = await startRelay();
  const client = connect(port);
  await client.opened;
  client.ws.send(JSON.stringify({ type: "hello", token: "mala".repeat(10) }));
  assert.equal((await client.next("fatal")).code, "sesion_invalida");
  assert.equal(await client.closed, CLOSE.forbidden);
  assert.equal(spawned.length, 0);
  await relay.close();
});

test("sin clave configurada avisa y no transmite", async () => {
  const { relay, port, spawned } = await startRelay({ YOUTUBE_STREAM_KEY: "" });
  const client = connect(port);
  await client.opened;
  client.ws.send(JSON.stringify({ type: "hello", token: "buena".repeat(8) }));
  const fatal = await client.next("fatal");
  assert.equal(fatal.code, "config");
  assert.match(fatal.message, /YOUTUBE_STREAM_KEY/);
  assert.equal(spawned.length, 0);
  await relay.close();
});

test("transmisión: video a ffmpeg, estado en vivo y fin limpio", async () => {
  const { relay, port, spawned, logs } = await startRelay();
  const client = connect(port);
  await client.opened;
  client.ws.send(JSON.stringify({ type: "hello", token: "buena".repeat(8), mimeType: "video/mp4", hasAudio: true }));
  await client.next("ready");
  assert.equal(relay.active, true);
  client.ws.send(Buffer.from([1, 2, 3]));
  await client.next("live");
  const stats = await client.next("stats");
  assert.equal(stats.fps, 30);
  assert.deepEqual(Buffer.concat(spawned[0].received), Buffer.from([1, 2, 3]));
  assert.ok(spawned[0].args.at(-1).endsWith(KEY));
  client.ws.send(JSON.stringify({ type: "stop" }));
  await client.next("ended");
  assert.equal(await client.closed, CLOSE.normal);
  assert.equal(relay.active, false);
  assert.ok(logs.every((line) => !line.includes(KEY)));
  await relay.close();
});

test("si YouTube corta, avisa sin revelar la clave y cierra para reintentar", async () => {
  const { relay, port, spawned } = await startRelay();
  const client = connect(port);
  await client.opened;
  client.ws.send(JSON.stringify({ type: "hello", token: "buena".repeat(8) }));
  await client.next("ready");
  spawned[0].fail(`rtmps://a.rtmps.youtube.com/live2/${KEY}: Input/output error\n`);
  const error = await client.next("output_error");
  assert.match(error.message, /YouTube/);
  assert.ok(!JSON.stringify(client.messages).includes(KEY));
  assert.equal(await client.closed, CLOSE.outputError);
  await relay.close();
});

test("una segunda pantalla toma el control y la primera recibe aviso", async () => {
  const { relay, port, spawned } = await startRelay();
  const first = connect(port);
  await first.opened;
  first.ws.send(JSON.stringify({ type: "hello", token: "buena".repeat(8) }));
  await first.next("ready");
  const second = connect(port);
  await second.opened;
  second.ws.send(JSON.stringify({ type: "hello", token: "buena".repeat(8) }));
  await second.next("ready");
  assert.equal((await first.next("fatal")).code, "replaced");
  assert.equal(await first.closed, CLOSE.replaced);
  assert.equal(spawned.length, 2);
  assert.equal(relay.active, true);
  await relay.close();
});

test("/estado no revela la clave", async () => {
  const { relay, port } = await startRelay();
  const response = await fetch(`http://127.0.0.1:${port}/estado`, { headers: { Origin: ORIGIN } });
  const body = await response.text();
  assert.equal(response.headers.get("access-control-allow-origin"), ORIGIN);
  assert.deepEqual(JSON.parse(body), { listo: true, faltan: [], transmitiendo: false });
  assert.ok(!body.includes(KEY));
  await relay.close();
});
