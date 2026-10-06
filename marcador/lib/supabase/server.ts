import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { supabasePublicKey, supabaseUrl } from "./env";

/** Cliente para Server Components y Route Handlers, con la sesión del usuario (cookies). */
export async function getServerClient() {
  const cookieStore = await cookies();
  return createServerClient(supabaseUrl(), supabasePublicKey(), {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) cookieStore.set(name, value, options);
        } catch {
          // En un Server Component no se pueden escribir cookies; proxy.ts ya renueva la sesión.
        }
      },
    },
  });
}

/** Cliente sin sesión (rol anon), para leer el overlay público. */
export function getAnonServerClient() {
  return createClient(supabaseUrl(), supabasePublicKey(), {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
