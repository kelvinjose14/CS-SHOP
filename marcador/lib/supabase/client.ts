"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabasePublicKey, supabaseUrl } from "./env";

let browserClient: SupabaseClient | undefined;

/** Cliente del navegador (una sola instancia). Guarda la sesión en cookies. */
export function getBrowserClient(): SupabaseClient {
  browserClient ??= createBrowserClient(supabaseUrl(), supabasePublicKey(), {
    realtime: {
      // Reintentos de la conexión de tiempo real: 1 s, 2 s, 4 s… hasta 10 s.
      reconnectAfterMs: (tries: number) => Math.min(10_000, 1_000 * 2 ** Math.max(0, tries - 1)),
      heartbeatIntervalMs: 15_000,
    },
  });
  return browserClient;
}
