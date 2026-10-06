import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { SAMPLE_GAME } from "@/lib/game/rules";
import type { GameRow } from "@/lib/game/types";

/**
 * Pruebas contra un Supabase real (por defecto el local de `supabase start`).
 * Usan SOLO la clave pública: los usuarios de prueba se registran con signUp,
 * igual que lo haría cualquiera desde el navegador.
 */
export const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const publicKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
export const configured = Boolean(url && publicKey);

export function anonClient(): SupabaseClient {
  return createClient(url, publicKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

/** Crea un usuario nuevo con la API pública y devuelve un cliente con su sesión. */
export async function newUser(tag: string): Promise<{ client: SupabaseClient; id: string; email: string }> {
  const client = anonClient();
  const email = `prueba-${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@marcador.test`;
  const { data, error } = await client.auth.signUp({ email, password: "clave-de-prueba-123" });
  if (error) throw error;
  if (!data.session || !data.user) {
    throw new Error("signUp no devolvió sesión: estas pruebas requieren 'Confirm email' desactivado (Supabase local).");
  }
  return { client, id: data.user.id, email };
}

export async function createGame(client: SupabaseClient, extra: Partial<GameRow> = {}): Promise<GameRow> {
  const { data, error } = await client
    .from("marcador_games")
    .insert({ ...SAMPLE_GAME, ...extra })
    .select("*")
    .single<GameRow>();
  if (error) throw error;
  return data;
}

/** Escribe como lo hace el panel: version = actual + 1, filtrando por la versión leída. */
export async function write(client: SupabaseClient, game: Pick<GameRow, "id" | "version">, changes: Partial<GameRow>) {
  return client
    .from("marcador_games")
    .update({ ...changes, version: game.version + 1 })
    .eq("id", game.id)
    .eq("version", game.version)
    .select("*")
    .maybeSingle<GameRow>();
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
