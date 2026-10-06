"use client";

import type { SupabaseClient } from "@supabase/supabase-js";

export const LOGO_BUCKET = "marcador-logos";
export const LOGO_MAX_BYTES = 2 * 1024 * 1024;
export const LOGO_TYPES: Record<string, string> = {
  "image/png": "png",
  "image/svg+xml": "svg",
  "image/webp": "webp",
};
export const LOGO_ACCEPT = Object.keys(LOGO_TYPES).join(",");

export type LogoKind = "home" | "away" | "brand";

/** Revisa formato y tamaño antes de subir (Storage vuelve a comprobarlo en el servidor). */
export function validateLogoFile(file: File): string | null {
  if (!LOGO_TYPES[file.type]) return "Formato no permitido. Usa PNG, SVG o WebP.";
  if (file.size > LOGO_MAX_BYTES) return `El archivo pesa ${(file.size / 1024 / 1024).toFixed(1)} MB; el máximo es 2 MB.`;
  if (file.size === 0) return "El archivo está vacío.";
  return null;
}

/** Quita scripts, eventos y referencias externas de un SVG antes de subirlo. */
async function sanitizeSvg(file: File): Promise<Blob> {
  const { default: DOMPurify } = await import("dompurify");
  const clean = DOMPurify.sanitize(await file.text(), {
    USE_PROFILES: { svg: true, svgFilters: true },
    FORBID_TAGS: ["foreignObject", "script", "style"],
  });
  let svg = clean.trim();
  if (!svg.startsWith("<svg")) throw new Error("El SVG no es válido.");
  // Dentro de <img>, un SVG sin xmlns no se dibuja.
  if (!/^<svg[^>]*\sxmlns=/.test(svg)) svg = svg.replace(/^<svg/, '<svg xmlns="http://www.w3.org/2000/svg"');
  return new Blob([svg], { type: "image/svg+xml" });
}

/** Sube el logo a <usuario>/<partido>/<tipo>-<fecha>.<ext> y devuelve su URL pública. */
export async function uploadLogo(
  supabase: SupabaseClient,
  ownerId: string,
  gameId: string,
  kind: LogoKind,
  file: File,
): Promise<string> {
  const problem = validateLogoFile(file);
  if (problem) throw new Error(problem);
  const ext = LOGO_TYPES[file.type];
  const body = file.type === "image/svg+xml" ? await sanitizeSvg(file) : file;
  const path = `${ownerId}/${gameId}/${kind}-${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from(LOGO_BUCKET).upload(path, body, {
    contentType: file.type,
    cacheControl: "31536000",
    upsert: false,
  });
  if (error) throw new Error(translateStorageError(error.message));
  return supabase.storage.from(LOGO_BUCKET).getPublicUrl(path).data.publicUrl;
}

function translateStorageError(message: string): string {
  if (/size|too large|exceeded/i.test(message)) return "El archivo supera los 2 MB.";
  if (/mime|type/i.test(message)) return "Formato no permitido. Usa PNG, SVG o WebP.";
  if (/row-level|policy|unauthorized|403/i.test(message)) return "No tienes permiso para subir aquí. Vuelve a iniciar sesión.";
  return `No se pudo subir el logo: ${message}`;
}
