#!/usr/bin/env node
/**
 * Arranca el intermediario en esta computadora:
 *   1. lee la configuración privada (.env),
 *   2. abre el servidor en el puerto 8787,
 *   3. crea un túnel HTTPS gratuito de Cloudflare (sin cuenta) para que el celular llegue aquí,
 *   4. muestra un código QR con el enlace del Estudio.
 */
import { existsSync } from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import QRCode from "qrcode";
import { readConfig, missingSettings } from "./src/config.mjs";
import { createUserVerifier } from "./src/auth.mjs";
import { createRelayServer } from "./src/server.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const envFile = join(here, ".env");
if (existsSync(envFile)) process.loadEnvFile(envFile);
const config = readConfig();

// En el paquete para Windows se ejecuta con CONFIGURAR.bat; desde el código, con npm.
const configureHint = process.env.MARCADOR_PORTABLE ? "CONFIGURAR.bat" : "npm run configurar";
const restartHint = process.env.MARCADOR_PORTABLE ? "INICIAR.bat" : "npm start";

const ffmpegPath = await findFfmpeg();
if (!ffmpegPath) {
  console.error("No encontré ffmpeg. Ejecuta `npm install` en esta carpeta o instala ffmpeg.");
  process.exit(1);
}

// --comprobar: verifica que el paquete trae ffmpeg (con RTMPS) y cloudflared, y termina.
if (process.argv.includes("--comprobar")) {
  const { bin } = await import("cloudflared");
  const tunnelOk = existsSync(bin);
  console.log(`ffmpeg con RTMPS: ${ffmpegPath}`);
  console.log(`cloudflared: ${tunnelOk ? bin : "NO ENCONTRADO"}`);
  process.exit(tunnelOk ? 0 : 1);
}

const missing = missingSettings(config);
if (missing.length) {
  console.warn(`\n⚠  Falta configuración (ejecuta ${configureHint}):`);
  for (const item of missing) console.warn(`   - ${item}`);
  console.warn("   El servidor arranca igual, pero no transmitirá hasta completarla.\n");
}

const relay = createRelayServer({ config, ffmpegPath, verifyUser: createUserVerifier(config) });
const port = await relay.listen();
console.log(`Intermediario escuchando en http://localhost:${port}`);

if (config.tunnel === "quick") {
  await openQuickTunnel(port);
} else {
  console.log("Túnel desactivado (TUNNEL=off). Publica este puerto por HTTPS por tu cuenta.");
}

const shutdown = async () => {
  console.log("\nCerrando el intermediario…");
  await relay.close();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

async function findFfmpeg() {
  const candidates = [config.ffmpegPath];
  try {
    candidates.push((await import("ffmpeg-static")).default);
  } catch {
    // ffmpeg-static no instalado: se prueba el ffmpeg del sistema
  }
  candidates.push("ffmpeg");
  for (const candidate of candidates.filter(Boolean)) {
    const probe = spawnSync(candidate, ["-hide_banner", "-protocols"], { encoding: "utf8" });
    if (probe.status === 0 && /\brtmps\b/.test(probe.stdout)) return candidate;
  }
  return null;
}

async function openQuickTunnel(localPort) {
  const { Tunnel, bin, install } = await import("cloudflared");
  if (!existsSync(bin)) {
    console.log("Descargando cloudflared (solo la primera vez)…");
    await install(bin);
  }
  const tunnel = Tunnel.quick(`http://127.0.0.1:${localPort}`);
  tunnel.once("url", async (httpsUrl) => {
    const relayUrl = httpsUrl.replace(/^https:/, "wss:");
    const link = `${config.studioUrl}/estudio?relay=${encodeURIComponent(relayUrl)}`;
    console.log("\nTúnel listo. En el celular, escanea este código o abre el enlace:\n");
    console.log(await QRCode.toString(link, { type: "terminal", small: true }));
    console.log(`  ${link}\n`);
    console.log("Deja esta ventana abierta mientras transmites. Para cerrar: Ctrl+C o cierra la ventana.\n");
    // En Windows la consola puede dibujar mal el QR: también se abre como imagen.
    if (process.platform === "win32") {
      const png = join(here, "codigo-qr.png");
      await QRCode.toFile(png, link, { width: 480, margin: 2 });
      spawn("cmd", ["/c", "start", "", png], { detached: true, stdio: "ignore" }).unref();
    }
  });
  let lastLine = "";
  tunnel.on("stderr", (text) => {
    const line = text.trim().split("\n").pop();
    if (line) lastLine = line;
  });
  tunnel.on("error", (error) => console.error(`Túnel: ${error.message}`));
  tunnel.on("exit", (code) => {
    console.error(`\nEl túnel se cerró (código ${code}). Último mensaje de cloudflared:\n  ${lastLine}`);
    console.error(`Revisa tu conexión a internet y vuelve a ejecutar ${restartHint}.`);
  });
  process.on("exit", () => tunnel.stop());
}
