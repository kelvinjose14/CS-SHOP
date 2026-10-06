import { parsePlacement } from "@/components/scoreboard/placement";
import type { OverlayGame } from "@/lib/game/types";
import { getAnonServerClient } from "@/lib/supabase/server";
import { OverlayClient } from "./OverlayClient";

/**
 * Overlay público, solo lectura: /overlay/<slug>?scale=0.8&pos=bottom-center&margin=40
 * Lee con la clave pública a través de la RPC marcador_get_overlay (solo ese slug).
 */
export default async function OverlayPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  const placement = parsePlacement(await searchParams);

  let initial: OverlayGame | null = null;
  let reachable = true;
  try {
    const { data, error } = await getAnonServerClient().rpc("marcador_get_overlay", { p_slug: slug });
    if (error) reachable = false;
    else initial = (data as OverlayGame | null) ?? null;
  } catch {
    reachable = false;
  }

  return <OverlayClient slug={slug} initial={initial} initiallyMissing={reachable && !initial} placement={placement} />;
}
