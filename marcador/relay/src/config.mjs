/**
 * Configuración privada del intermediario. Vive solo en esta computadora
 * (archivo .env, fuera de git). La clave de YouTube nunca sale de aquí:
 * no se envía al navegador ni aparece en los registros.
 */

export const DEFAULT_INGEST_URL = "rtmps://a.rtmps.youtube.com/live2";

const list = (value) =>
  (value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

export function readConfig(env = process.env) {
  const studioUrl = (env.STUDIO_URL || "https://marcador-one.vercel.app").replace(/\/+$/, "");
  const ingest = (env.YOUTUBE_INGEST_URL || DEFAULT_INGEST_URL).replace(/\/+$/, "");
  const streamKey = (env.YOUTUBE_STREAM_KEY ?? "").trim();
  return {
    port: Number(env.PORT) || 8787,
    tunnel: (env.TUNNEL || "quick").toLowerCase(),
    studioUrl,
    supabaseUrl: (env.SUPABASE_URL ?? "").replace(/\/+$/, ""),
    supabaseKey: env.SUPABASE_PUBLISHABLE_KEY ?? "",
    allowedEmails: list(env.ALLOWED_EMAILS).map((email) => email.toLowerCase()),
    allowedOrigins: list(env.ALLOWED_ORIGINS).length
      ? list(env.ALLOWED_ORIGINS)
      : [new URL(studioUrl).origin, "http://localhost:3000"],
    streamKey,
    // OUTPUT_URL solo para pruebas (por ejemplo, un receptor RTMP local).
    outputUrl: env.OUTPUT_URL || (streamKey ? `${ingest}/${streamKey}` : ""),
    ffmpegPath: env.FFMPEG_PATH || "",
  };
}

/** Lo que falta para poder transmitir, en palabras para el usuario. */
export function missingSettings(config) {
  const missing = [];
  if (!config.outputUrl) missing.push("YOUTUBE_STREAM_KEY (la clave de transmisión de YouTube Studio)");
  if (!config.supabaseUrl) missing.push("SUPABASE_URL");
  if (!config.supabaseKey) missing.push("SUPABASE_PUBLISHABLE_KEY");
  if (config.allowedEmails.length === 0) missing.push("ALLOWED_EMAILS (tu correo de inicio de sesión)");
  return missing;
}
