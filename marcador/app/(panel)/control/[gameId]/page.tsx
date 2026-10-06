import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import type { GameRow } from "@/lib/game/types";
import { getServerClient } from "@/lib/supabase/server";
import { ControlPanel } from "./ControlPanel";

export const metadata: Metadata = { title: "Panel de control" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function ControlPage({ params }: { params: Promise<{ gameId: string }> }) {
  const { gameId } = await params;
  if (!UUID.test(gameId)) notFound();

  const supabase = await getServerClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) redirect(`/login?next=/control/${gameId}`);

  // RLS: solo devuelve el partido si pertenece al usuario de la sesión.
  const { data: game } = await supabase.from("marcador_games").select("*").eq("id", gameId).maybeSingle<GameRow>();
  if (!game) notFound();

  return <ControlPanel initial={game} />;
}
