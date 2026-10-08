import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { WebSocketServer } from "ws";
import { missingSettings } from "./config.mjs";
import { buildFfmpegArgs, createProgressParser, redact } from "./ffmpeg.mjs";

/**
 * Servidor intermediario.
 *
 *   GET /estado   → { listo, faltan[], transmitiendo }  (nunca devuelve la clave)
 *   WS  /ingest   → 1) el Estudio envía {type:"hello", token, mimeType, hasAudio}
 *                   2) responde {type:"ready"} y arranca ffmpeg
 *                   3) el Estudio envía trozos binarios del video
 *                   4) se le informan {type:"stats"}, {type:"live"} y errores
 *                   5) {type:"stop"} termina limpio
 *
 * Códigos de cierre: 1000 fin normal · 4001 error de salida (reintentar) ·
 * 4003 sin permiso · 4009 otra transmisión tomó el control · 4500 falta configuración.
 */
export const CLOSE = { normal: 1000, outputError: 4001, forbidden: 4003, replaced: 4009, config: 4500 };

const HELLO_TIMEOUT_MS = 10_000;
const HEARTBEAT_MS = 10_000;
const STOP_GRACE_MS = 5_000;

const defaultSpawn = (path, args) => spawn(path, args, { stdio: ["pipe", "pipe", "pipe"] });

export function createRelayServer({ config, verifyUser, ffmpegPath, spawnProcess = defaultSpawn, log = console.log }) {
  const say = (message) => log(`[${new Date().toLocaleTimeString()}] ${redact(message, config.streamKey)}`);
  let active = null;

  const corsHeaders = (origin) =>
    origin && config.allowedOrigins.includes(origin)
      ? { "Access-Control-Allow-Origin": origin, Vary: "Origin" }
      : {};

  const http = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://relay");
    if (req.method === "GET" && url.pathname === "/estado") {
      const faltan = missingSettings(config);
      res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store", ...corsHeaders(req.headers.origin) });
      res.end(JSON.stringify({ listo: faltan.length === 0, faltan, transmitiendo: !!active }));
      return;
    }
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Intermediario del marcador. Abre el Estudio desde el panel.");
  });

  const wss = new WebSocketServer({ noServer: true, maxPayload: 8 * 1024 * 1024 });

  http.on("upgrade", (req, socket, head) => {
    const url = new URL(req.url ?? "/", "http://relay");
    const origin = req.headers.origin;
    if (url.pathname !== "/ingest" || !origin || !config.allowedOrigins.includes(origin)) {
      say(`Conexión rechazada (origen ${origin ?? "desconocido"}).`);
      socket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws));
  });

  wss.on("connection", (ws) => {
    const send = (message) => ws.readyState === ws.OPEN && ws.send(JSON.stringify(message));
    const close = (code, reason) => ws.readyState <= ws.OPEN && ws.close(code, reason);
    let session = null;
    let alive = true;

    const helloTimer = setTimeout(() => !session && close(CLOSE.forbidden, "sin saludo"), HELLO_TIMEOUT_MS);
    const heartbeat = setInterval(() => {
      if (!alive) return ws.terminate();
      alive = false;
      ws.ping();
    }, HEARTBEAT_MS);
    ws.on("pong", () => (alive = true));

    ws.on("message", async (data, isBinary) => {
      alive = true;
      if (isBinary) {
        session?.write(data);
        return;
      }
      let message;
      try {
        message = JSON.parse(String(data));
      } catch {
        return;
      }
      if (message.type === "hello" && !session) {
        clearTimeout(helloTimer);
        const faltan = missingSettings(config);
        if (faltan.length) {
          send({ type: "fatal", code: "config", message: `Falta configurar en el intermediario: ${faltan.join(", ")}.` });
          return close(CLOSE.config, "falta configuracion");
        }
        const user = await verifyUser(message.token);
        if (!user.ok) {
          send({ type: "fatal", code: user.reason, message: authMessage(user.reason) });
          return close(CLOSE.forbidden, user.reason);
        }
        if (ws.readyState !== ws.OPEN) return;
        if (active) active.replace();
        session = startSession({ hasAudio: message.hasAudio !== false, mimeType: String(message.mimeType ?? "") });
        active = session;
        say(`Transmisión iniciada por ${user.email} (${session.mimeType || "formato automático"}).`);
        send({ type: "ready" });
      } else if (message.type === "stop" && session) {
        session.stop();
      }
    });

    ws.on("close", () => {
      clearTimeout(helloTimer);
      clearInterval(heartbeat);
      session?.disconnect();
    });

    function startSession({ hasAudio, mimeType }) {
      const args = buildFfmpegArgs({ outputUrl: config.outputUrl, hasAudio });
      const child = spawnProcess(ffmpegPath, args);
      let stopping = false;
      let replaced = false;
      let live = false;
      let errors = "";
      let killTimer;

      const parse = createProgressParser((stats) => {
        if (!live && stats.frames > 0) {
          live = true;
          say("Enviando video a YouTube.");
          send({ type: "live" });
        }
        send({ type: "stats", ...stats });
      });
      child.stdout.setEncoding("utf8");
      child.stdout.on("data", parse);
      child.stderr.setEncoding("utf8");
      child.stderr.on("data", (text) => {
        errors = (errors + text).slice(-2000);
      });
      child.stdin.on("error", () => {}); // EPIPE si ffmpeg ya terminó
      child.stdin.on("drain", () => ws.resume());

      const finish = () => {
        clearTimeout(killTimer);
        if (active === current) active = null;
      };
      child.on("error", (error) => {
        finish();
        say(`No se pudo iniciar ffmpeg: ${error.message}`);
        send({ type: "fatal", code: "ffmpeg", message: "No se pudo iniciar ffmpeg en el intermediario." });
        close(CLOSE.config, "ffmpeg");
      });
      child.on("exit", (code) => {
        finish();
        if (replaced) return;
        if (stopping) {
          say("Transmisión finalizada.");
          send({ type: "ended" });
          return close(CLOSE.normal, "fin");
        }
        const detail = redact(errors.trim().split("\n").slice(-3).join(" "), config.streamKey);
        say(`ffmpeg se detuvo (código ${code}). ${detail}`);
        send({ type: "output_error", message: describeOutputError(detail, live) });
        close(CLOSE.outputError, "salida interrumpida");
      });

      const endInput = (graceMs) => {
        if (!child.stdin.destroyed) child.stdin.end();
        clearTimeout(killTimer);
        killTimer = setTimeout(() => child.kill("SIGKILL"), graceMs);
      };

      const current = {
        mimeType,
        write(chunk) {
          if (stopping || child.stdin.destroyed) return;
          if (!child.stdin.write(chunk)) ws.pause(); // ffmpeg va atrasado: se frena la entrada
        },
        stop() {
          if (stopping) return;
          stopping = true;
          endInput(STOP_GRACE_MS);
        },
        disconnect() {
          if (stopping || replaced) return;
          stopping = true; // el celular se desconectó: se cierra la salida; al volver, abre otra
          say("El Estudio se desconectó; se cierra la salida hasta que vuelva.");
          endInput(STOP_GRACE_MS);
        },
        replace() {
          replaced = true;
          stopping = true;
          send({ type: "fatal", code: "replaced", message: "Otra pantalla del Estudio tomó el control de la transmisión." });
          close(CLOSE.replaced, "reemplazada");
          endInput(1_000);
        },
      };
      return current;
    }
  });

  return {
    http,
    // Solo en esta computadora: el túnel llega por 127.0.0.1 (y Windows no pide abrir el cortafuegos).
    listen: (port = config.port, host = "127.0.0.1") =>
      new Promise((resolve) => http.listen(port, host, () => resolve(http.address().port))),
    close: () =>
      new Promise((resolve) => {
        for (const client of wss.clients) client.terminate();
        http.close(() => resolve());
      }),
    get active() {
      return !!active;
    },
  };
}

function authMessage(reason) {
  switch (reason) {
    case "correo_no_permitido":
      return "Tu cuenta no está autorizada en este intermediario (revisa ALLOWED_EMAILS).";
    case "supabase_inalcanzable":
      return "El intermediario no pudo comprobar tu sesión (sin acceso a Supabase).";
    default:
      return "Tu sesión no es válida. Vuelve a iniciar sesión en el marcador.";
  }
}

function describeOutputError(detail, wasLive) {
  if (wasLive) return "Se cortó la conexión con YouTube. Reintentando…";
  if (/I\/O error|Input\/output error|Connection refused|End of file|Broken pipe|Connection reset/i.test(detail)) {
    return "YouTube cerró o rechazó la conexión. Revisa la clave de transmisión y que el directo exista.";
  }
  if (/Invalid data found|could not find codec|Error opening input/i.test(detail)) {
    return "El intermediario no pudo leer el video del celular.";
  }
  return "La salida hacia YouTube se interrumpió.";
}
