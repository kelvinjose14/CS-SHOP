import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { GameRow } from "@/lib/game/types";
import { getServerClient } from "@/lib/supabase/server";
import { SaveRelayFromLink } from "./SaveRelayFromLink";

export const metadata: Metadata = { title: "Estudio en vivo" };

/**
 * Entrada al Estudio. El código QR del intermediario abre /estudio?relay=wss://…:
 * aquí se guarda esa dirección en el celular y se elige el partido.
 */
export default async function StudioIndex({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = await searchParams;
  const relay = typeof query.relay === "string" ? query.relay : "";

  const supabase = await getServerClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) redirect(`/login?next=${encodeURIComponent(`/estudio${relay ? `?relay=${encodeURIComponent(relay)}` : ""}`)}`);

  const { data } = await supabase
    .from("marcador_games")
    .select("id,title,home_name,away_name")
    .order("updated_at", { ascending: false })
    .returns<Pick<GameRow, "id" | "title" | "home_name" | "away_name">[]>();
  const games = data ?? [];

  return (
    <main className="page" style={{ maxWidth: 720 }}>
      <header className="topbar">
        <div className="brand-lockup small">
          <span className="brand-mark" aria-hidden />
          <h1>Estudio en vivo</h1>
        </div>
        <Link className="btn btn-ghost btn-small" href="/control">
          Mis partidos
        </Link>
      </header>
      <SaveRelayFromLink relay={relay} />
      <p className="hint">Elige el partido que vas a transmitir:</p>
      <ul className="games-list">
        {games.map((game) => (
          <li key={game.id}>
            <Link className="game-item" href={`/estudio/${game.id}`} data-testid="studio-game">
              <span className="game-title">{game.title}</span>
              <span className="game-score">
                {game.away_name} · {game.home_name}
              </span>
            </Link>
          </li>
        ))}
      </ul>
      {games.length === 0 && <p className="card">Todavía no tienes partidos. Crea uno en «Mis partidos».</p>}
    </main>
  );
}
