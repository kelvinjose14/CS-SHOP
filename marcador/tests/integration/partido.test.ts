/**
 * Concurrencia por versión (nadie sobrescribe en silencio), deshacer persistente
 * (criterio 4) y recuperación del estado exacto (criterio 5) a nivel de API.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it } from "vitest";
import type { GameRow } from "@/lib/game/types";
import { anonClient, configured, createGame, newUser, write } from "./helpers";

describe.skipIf(!configured)("partido: versión, historial y deshacer", () => {
  let owner: SupabaseClient;
  let email: string;

  beforeAll(async () => {
    const user = await newUser("partido");
    owner = user.client;
    email = user.email;
  });

  it("dos controladores escriben a la vez: el segundo se rechaza, no pisa al primero", async () => {
    const game = await createGame(owner);
    // Segundo controlador: otra sesión del mismo usuario (otro celular).
    const second = anonClient();
    await second.auth.signInWithPassword({ email, password: "clave-de-prueba-123" });

    const [a, b] = await Promise.all([write(owner, game, { home_runs: 1 }), write(second, game, { away_runs: 1 })]);
    const ok = [a, b].filter((r) => r.data);
    const rejected = [a, b].filter((r) => !r.data);
    expect(ok).toHaveLength(1);
    expect(rejected).toHaveLength(1);

    const { data: final } = await owner.from("marcador_games").select("*").eq("id", game.id).single<GameRow>();
    expect(final!.version).toBe(2);
    // Quedó exactamente uno de los dos cambios, no una mezcla ni una sobrescritura.
    expect(final!.home_runs + final!.away_runs).toBe(1);
  });

  it("una escritura sin version = actual + 1 se rechaza aunque no filtre por versión", async () => {
    const game = await createGame(owner);
    const sinVersion = await owner.from("marcador_games").update({ home_runs: 3 }).eq("id", game.id).select().maybeSingle();
    expect(sinVersion.error?.code).toBe("40001");
    const vieja = await owner.from("marcador_games").update({ home_runs: 3, version: 1 }).eq("id", game.id).select().maybeSingle();
    expect(vieja.error?.code).toBe("40001");
    const salto = await owner.from("marcador_games").update({ home_runs: 3, version: 9 }).eq("id", game.id).select().maybeSingle();
    expect(salto.error?.code).toBe("40001");
  });

  it("criterio 4: deshacer varias veces seguidas, también desde otra sesión (recarga)", async () => {
    let game = await createGame(owner);
    const steps: Partial<GameRow>[] = [{ home_runs: 1 }, { balls: 2 }, { on_first: true }, { half: "baja" }];
    for (const step of steps) game = (await write(owner, game, step)).data!;
    expect(game.undo_count).toBe(4);

    // Ocultar el marcador no es una jugada: no entra al historial.
    game = (await write(owner, game, { overlay_visible: false })).data!;
    expect(game.undo_count).toBe(4);

    // "Recargar": un cliente nuevo, sin nada en memoria.
    const reloaded = anonClient();
    await reloaded.auth.signInWithPassword({ email, password: "clave-de-prueba-123" });

    const undo = async (client: SupabaseClient, g: GameRow) => {
      const { data, error } = await client
        .rpc("marcador_undo_last", { p_game_id: g.id, p_expected_version: g.version })
        .maybeSingle<GameRow>();
      if (error) throw error;
      return data!;
    };

    game = await undo(reloaded, game);
    expect(game).toMatchObject({ half: "alta", on_first: true, undo_count: 3, overlay_visible: false });
    game = await undo(owner, game);
    expect(game).toMatchObject({ on_first: false, balls: 2, undo_count: 2 });
    game = await undo(reloaded, game);
    expect(game).toMatchObject({ balls: 0, home_runs: 1, undo_count: 1 });
    game = await undo(owner, game);
    expect(game).toMatchObject({ home_runs: 0, undo_count: 0 });

    const empty = await owner.rpc("marcador_undo_last", { p_game_id: game.id, p_expected_version: game.version });
    expect(empty.error?.message).toMatch(/nada_que_deshacer/);
  });

  it("deshacer con una versión vieja se rechaza (no pisa a otro controlador)", async () => {
    let game = await createGame(owner);
    game = (await write(owner, game, { home_runs: 1 })).data!;
    const stale = game.version - 1;
    const { error } = await owner.rpc("marcador_undo_last", { p_game_id: game.id, p_expected_version: stale });
    expect(error?.code).toBe("40001");
  });

  it("criterio 5: recargar devuelve el estado exacto", async () => {
    let game = await createGame(owner);
    game = (await write(owner, game, { home_runs: 7, away_runs: 4, inning: 5, half: "baja", balls: 3, strikes: 2, outs: 2, on_second: true, status: "en_juego" })).data!;
    const fresh = anonClient();
    await fresh.auth.signInWithPassword({ email, password: "clave-de-prueba-123" });
    const { data: reloaded } = await fresh.from("marcador_games").select("*").eq("id", game.id).single<GameRow>();
    expect(reloaded).toEqual(game);
    const { data: overlay } = await anonClient().rpc("marcador_get_overlay", { p_slug: game.slug });
    expect(overlay).toMatchObject({ home_runs: 7, away_runs: 4, inning: 5, half: "baja", balls: 3, strikes: 2, outs: 2, on_second: true, status: "en_juego", version: game.version });
  });
});
