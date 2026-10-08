/**
 * ffmpeg: recibe por la entrada estándar el video que graba el celular
 * (MP4 fragmentado en Safari, WebM o MP4 en Chrome) y lo reenvía a YouTube
 * como H.264 + AAC dentro de FLV por RTMPS.
 *
 * Siempre se vuelve a codificar: así la salida es estable (720p, 30 fps
 * constantes, un fotograma clave cada 2 s, como pide YouTube) sin importar
 * qué navegador grabó.
 */

export const OUTPUT = { width: 1280, height: 720, fps: 30, videoKbps: 2500, audioKbps: 128 };

/** Argumentos de ffmpeg. `hasAudio: false` agrega silencio (YouTube exige audio). */
export function buildFfmpegArgs({ outputUrl, hasAudio }) {
  const { width, height, fps, videoKbps, audioKbps } = OUTPUT;
  const gop = fps * 2;
  const input = [
    "-hide_banner",
    "-loglevel", "error",
    "-nostats",
    "-progress", "pipe:1",
    "-stats_period", "1",
    "-thread_queue_size", "1024",
    "-fflags", "+genpts+discardcorrupt",
    "-probesize", "2M",
    "-analyzeduration", "2M",
    "-i", "pipe:0",
  ];
  const silence = hasAudio ? [] : ["-f", "lavfi", "-i", `anullsrc=channel_layout=stereo:sample_rate=44100`];
  const maps = ["-map", "0:v:0", "-map", hasAudio ? "0:a:0" : "1:a:0"];
  const video = [
    "-vf",
    `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,fps=${fps},format=yuv420p`,
    "-c:v", "libx264",
    "-preset", "veryfast",
    "-tune", "zerolatency",
    "-profile:v", "main",
    "-b:v", `${videoKbps}k`,
    "-maxrate", `${videoKbps}k`,
    "-bufsize", `${videoKbps * 2}k`,
    "-g", String(gop),
    "-keyint_min", String(gop),
    "-sc_threshold", "0",
  ];
  const audio = [
    "-af", "aresample=async=1:first_pts=0",
    "-c:a", "aac",
    "-b:a", `${audioKbps}k`,
    "-ar", "44100",
    "-ac", "2",
  ];
  const output = [...(hasAudio ? [] : ["-shortest"]), "-f", "flv", "-flvflags", "no_duration_filesize", outputUrl];
  return [...input, ...silence, ...maps, ...video, ...audio, ...output];
}

/**
 * Lee la salida de `-progress` (bloques clave=valor que terminan en progress=…)
 * y devuelve un resumen por bloque completo.
 */
export function createProgressParser(onStats) {
  let buffer = "";
  let block = {};
  return (chunk) => {
    buffer += chunk;
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const eq = line.indexOf("=");
      if (eq < 0) continue;
      const key = line.slice(0, eq).trim();
      const value = line.slice(eq + 1).trim();
      block[key] = value;
      if (key === "progress") {
        onStats(summarize(block));
        block = {};
      }
    }
  };
}

function summarize(block) {
  const number = (value) => {
    const n = Number.parseFloat(value);
    return Number.isFinite(n) ? n : 0;
  };
  const outTimeUs = number(block.out_time_us ?? block.out_time_ms);
  return {
    frames: Math.round(number(block.frame)),
    fps: number(block.fps),
    kbps: number(block.bitrate),
    speed: number(block.speed),
    seconds: Math.max(0, Math.round(outTimeUs / 1e6)),
    ended: block.progress === "end",
  };
}

/** Quita la clave de transmisión de cualquier texto (los errores de ffmpeg incluyen la URL). */
export function redact(text, secret) {
  if (!secret) return text;
  return text.split(secret).join("••••");
}
