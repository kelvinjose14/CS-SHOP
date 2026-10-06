"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { SAMPLE_GAME } from "@/lib/game/rules";
import { getBrowserClient } from "@/lib/supabase/client";

export function GamesActions({ hasGames }: { hasGames: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function create(sample: boolean) {
    setBusy(true);
    setError("");
    const values = sample
      ? SAMPLE_GAME
      : { title: "Nuevo partido", home_name: "Local", home_abbr: "LOC", away_name: "Visitante", away_abbr: "VIS" };
    const { data, error } = await getBrowserClient().from("marcador_games").insert(values).select("id").single();
    setBusy(false);
    if (error || !data) return setError(`No se pudo crear el partido: ${error?.message ?? "sin respuesta"}`);
    router.push(`/control/${data.id}`);
  }

  return (
    <section className="card stack">
      {!hasGames && (
        <p style={{ margin: 0 }}>
          Todavía no tienes partidos. Crea el de ejemplo (El Parque contra Simón Bolívar, softball a 6 innings) y
          cámbialo a tu gusto desde el panel.
        </p>
      )}
      <div className="row" style={{ flexWrap: "wrap" }}>
        <button className="btn btn-primary btn-big" style={{ flex: "1 1 220px" }} disabled={busy} onClick={() => create(true)}>
          Crear partido de ejemplo
        </button>
        <button className="btn btn-big" style={{ flex: "1 1 160px" }} disabled={busy} onClick={() => create(false)}>
          Partido en blanco
        </button>
      </div>
      {error && (
        <p className="error-text" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}

export function SignOutButton() {
  const router = useRouter();
  return (
    <button
      className="btn btn-ghost btn-small"
      onClick={async () => {
        await getBrowserClient().auth.signOut();
        router.replace("/login");
        router.refresh();
      }}
    >
      Salir
    </button>
  );
}
