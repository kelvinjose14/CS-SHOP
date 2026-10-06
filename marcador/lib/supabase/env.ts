/**
 * Configuración pública de Supabase.
 *
 * Solo se usan la URL del proyecto y la clave PÚBLICA (publishable o anon).
 * La clave service_role / secret jamás debe estar aquí: si alguien la pega por
 * error en una variable NEXT_PUBLIC_*, la aplicación se niega a arrancar.
 */

export function supabaseUrl(): string {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) throw new Error("Falta NEXT_PUBLIC_SUPABASE_URL (ver README, paso 2).");
  return url;
}

export function supabasePublicKey(): string {
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!key) throw new Error("Falta NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (ver README, paso 2).");
  assertPublicKey(key);
  return key;
}

/** Rechaza claves secretas: sb_secret_… o un JWT con rol service_role. */
export function assertPublicKey(key: string): void {
  if (key.startsWith("sb_secret_")) {
    throw new Error("Se configuró una clave SECRETA de Supabase como pública. Usa la clave publishable (sb_publishable_…).");
  }
  const parts = key.split(".");
  if (parts.length === 3) {
    try {
      const payload = JSON.parse(base64UrlDecode(parts[1])) as { role?: string };
      if (payload.role && payload.role !== "anon") {
        throw new Error(`La clave configurada tiene rol "${payload.role}". En el navegador solo se permite la clave anon/publishable.`);
      }
    } catch (error) {
      if (error instanceof Error && error.message.includes("rol")) throw error;
    }
  }
}

function base64UrlDecode(value: string): string {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  if (typeof atob === "function") return atob(padded);
  return Buffer.from(padded, "base64").toString("utf8");
}
