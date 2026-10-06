import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { STATUS_LABELS, type GameRow } from "@/lib/game/types";
import { getServerClient } from "@/lib/supabase/server";
import { GamesActions, SignOutButton } from "./GamesActions";

export const metadata: Metadata = { title: "Mis partidos" };

type GameSummary = Pick<
  GameRow,
  "id" | "title" | "home_name" | "away_name" | "home_runs" | "away_runs" | "inning" | "half" | "status" | "updated_at"
>;

export default async function GamesPage() {
  const supabase = await getServerClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) redirect("/login?next=/control");

  const { data, error } = await supabase
    .from("marcador_games")
    .select("id,title,home_name,away_name,home_runs,away_runs,inning,half,status,updated_at")
    .order("updated_at", { ascending: false })
    .returns<GameSummary[]>();

  const games = data ?? [];

  return (
    <main className="page" style={{ maxWidth: 720 }}>
      <header className="topbar">
        <div className="brand-lockup small">
          <span className="brand-mark" aria-hidden />
          <h1>Mis partidos</h1>
        </div>
        <SignOutButton />
      </header>

      {error && (
        <p className="card error-text" role="alert">
          No se pudieron cargar los partidos: {error.message}
        </p>
      )}

      <GamesActions hasGames={games.length > 0} />

      <ul className="games-list">
        {games.map((game) => (
          <li key={game.id}>
            <Link className="game-item" href={`/control/${game.id}`}>
              <span className="game-title">{game.title}</span>
              <span className="game-score">
                {game.away_name} {game.away_runs} · {game.home_name} {game.home_runs}
              </span>
              <span className="muted">
                {STATUS_LABELS[game.status]} · {game.half === "alta" ? "▲" : "▼"} {game.inning}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
