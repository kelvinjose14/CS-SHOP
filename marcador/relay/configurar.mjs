#!/usr/bin/env node
/**
 * Asistente de configuración privada. Escribe el archivo .env de esta carpeta
 * (solo legible por tu usuario). La clave de YouTube queda en esta computadora.
 */
import { existsSync, readFileSync, writeFileSync, chmodSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { parseEnv } from "node:util";

const here = dirname(fileURLToPath(import.meta.url));
const envFile = join(here, ".env");
const example = parseEnv(readFileSync(join(here, ".env.example"), "utf8"));
const current = existsSync(envFile) ? parseEnv(readFileSync(envFile, "utf8")) : {};
const values = { ...example, ...current };

const rl = createInterface({ input: stdin, output: stdout });
const ask = async (question, key, { secret = false } = {}) => {
  const shown = values[key] ? (secret ? " [ya guardada; Enter para conservarla]" : ` [${values[key]}]`) : "";
  const answer = (await rl.question(`${question}${shown}: `)).trim();
  if (answer) values[key] = answer;
};

console.log("\nConfiguración del intermediario (Enter conserva el valor entre corchetes)\n");
await ask("Clave de transmisión de YouTube (YouTube Studio → Emitir en vivo → Clave de transmisión)", "YOUTUBE_STREAM_KEY", { secret: true });
await ask("Correo con el que inicias sesión en el marcador", "ALLOWED_EMAILS");
await ask("Dirección del marcador", "STUDIO_URL");
await ask("URL del proyecto de Supabase", "SUPABASE_URL");
await ask("Clave pública de Supabase (sb_publishable_…)", "SUPABASE_PUBLISHABLE_KEY");
rl.close();

if (values.SUPABASE_PUBLISHABLE_KEY?.startsWith("sb_secret_")) {
  console.error("\nEsa es una clave SECRETA de Supabase. Aquí solo hace falta la publishable (sb_publishable_…).");
  process.exit(1);
}

const lines = Object.entries(values).map(([key, value]) => `${key}=${value ?? ""}`);
writeFileSync(envFile, `${lines.join("\n")}\n`, { mode: 0o600 });
try {
  chmodSync(envFile, 0o600);
} catch {
  // Windows: los permisos los gestiona la carpeta de tu usuario
}
console.log(`\nGuardado en ${envFile}. Ahora ejecuta: npm start\n`);
