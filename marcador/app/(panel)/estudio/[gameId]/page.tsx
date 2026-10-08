import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import type { GameRow } from "@/lib/game/types";
import { getServerClient } from "@/lib/supabase/server";
import { StudioLoader } from "./StudioLoader";

export const metadata: Metadata = { title: "Estudio en vivo" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Estudio: transmite a YouTube desde el celular con el marcador dentro del video. Solo el dueño. */
export default async function StudioPage({ params }: { params: Promise<{ gameId: string }> }) {
  const { gameId } = await params;
  if (!UUID.test(gameId)) notFound();

  const supabase = await getServerClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) redirect(`/login?next=/estudio/${gameId}`);

  // RLS: solo devuelve el partido si pertenece al usuario de la sesión.
  const { data: game } = await supabase.from("marcador_games").select("*").eq("id", gameId).maybeSingle<GameRow>();
  if (!game) notFound();

  return <StudioLoader initial={game} />;
}
