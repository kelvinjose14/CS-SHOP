import type { Session, User } from "@supabase/supabase-js";

export type SignUpOutcome = "sesion" | "confirmar" | "existe";

/**
 * Qué pasó al crear la cuenta.
 *
 * Con la confirmación de correo activada, Supabase no revela si el correo ya
 * está registrado (para no exponer quién tiene cuenta): responde como si todo
 * saliera bien, pero el usuario viene sin identidades y no envía ningún correo.
 */
export function signUpOutcome(data: { user: User | null; session: Session | null }): SignUpOutcome {
  if (data.session) return "sesion";
  if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) return "existe";
  return "confirmar";
}
