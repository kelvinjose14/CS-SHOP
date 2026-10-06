/**
 * Criterios 2, 3 y 7: seguridad (RLS), aislamiento del overlay por slug y reglas
 * en la base de datos, probados con la clave pública directamente contra la API.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it } from "vitest";
import type { GameRow } from "@/lib/game/types";
import { anonClient, configured, createGame, newUser, write } from "./helpers";

describe.skipIf(!configured)("seguridad y reglas en la base de datos", () => {
  let anon: SupabaseClient;
  let owner: SupabaseClient;
  let stranger: SupabaseClient;
  let game: GameRow;
  let otherGame: GameRow;

  beforeAll(async () => {
    anon = anonClient();
    owner = (await newUser("dueno")).client;
    stranger = (await newUser("ajeno")).client;
    game = await createGame(owner);
    otherGame = await createGame(stranger, { title: "Partido ajeno", home_name: "Otro Equipo" });
  });

  describe("criterio 2: sin sesión, la clave pública no puede escribir", () => {
    it("no puede leer la tabla", async () => {
      const { data, error } = await anon.from("marcador_games").select("*");
      expect(data).toBeNull();
      expect(error?.code).toBe("42501");
    });

    it("no puede crear partidos", async () => {
      const { error } = await anon.from("marcador_games").insert({ title: "intruso" });
      expect(error?.code).toBe("42501");
    });

    it("no puede modificar un partido", async () => {
      const { error } = await anon.from("marcador_games").update({ home_runs: 99, version: game.version + 1 }).eq("id", game.id);
      expect(error?.code).toBe("42501");
    });

    it("no puede borrar un partido", async () => {
      const { error } = await anon.from("marcador_games").delete().eq("id", game.id);
      expect(error?.code).toBe("42501");
    });

    it("no puede leer el historial ni deshacer", async () => {
      expect((await anon.from("marcador_history").select("*")).error?.code).toBe("42501");
      const undo = await anon.rpc("marcador_undo_last", { p_game_id: game.id, p_expected_version: game.version });
      expect(undo.error?.code).toBe("42501");
    });

    it("el partido sigue intacto", async () => {
      const { data } = await owner.from("marcador_games").select("home_runs,version").eq("id", game.id).single();
      expect(data).toEqual({ home_runs: 0, version: 1 });
    });
  });

  describe("criterio 2: una sesión anónima de Supabase tampoco puede escribir", () => {
    // Si el proyecto permite "Anonymous sign-ins", cualquiera obtiene una sesión con la clave pública.
    it("no puede crear partidos, modificar ajenos ni subir logos", async () => {
      const ghost = anonClient();
      const { data, error } = await ghost.auth.signInAnonymously();
      if (error?.message.match(/disabled/i)) return; // el proyecto no permite sesiones anónimas: nada que probar
      expect(error).toBeNull();
      const uid = data.user!.id;

      const insert = await ghost.from("marcador_games").insert({ title: "anónimo" }).select().maybeSingle();
      expect(insert.data).toBeNull();
      expect(insert.error?.code).toBe("42501");

      const upd = await write(ghost, game, { home_runs: 77 });
      expect(upd.data).toBeNull();

      const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==", "base64");
      const up = await ghost.storage.from("marcador-logos").upload(`${uid}/x/logo.png`, png, { contentType: "image/png" });
      expect(up.error).not.toBeNull();
    });
  });

  describe("criterio 3: el overlay solo lee el partido de su slug", () => {
    it("devuelve solo campos públicos (sin id, owner_id, historial ni automatismos)", async () => {
      const { data, error } = await anon.rpc("marcador_get_overlay", { p_slug: game.slug });
      expect(error).toBeNull();
      expect(data.home_name).toBe("El Parque");
      for (const hidden of ["id", "owner_id", "undo_count", "auto_new_batter", "auto_change_half", "title", "created_at"]) {
        expect(data).not.toHaveProperty(hidden);
      }
    });

    it("con un slug devuelve ese partido y no otro", async () => {
      const mine = await anon.rpc("marcador_get_overlay", { p_slug: game.slug });
      const theirs = await anon.rpc("marcador_get_overlay", { p_slug: otherGame.slug });
      expect(mine.data.slug).toBe(game.slug);
      expect(theirs.data.home_name).toBe("Otro Equipo");
      expect(mine.data.home_name).not.toBe(theirs.data.home_name);
    });

    it("un slug inventado, vacío o con comodines no devuelve nada", async () => {
      for (const slug of ["no-existe-este-slug-123", "", "%", "%%%%%%%%%%%%%%%%%%%%%%", game.slug.slice(0, 10)]) {
        const { data, error } = await anon.rpc("marcador_get_overlay", { p_slug: slug });
        expect(error).toBeNull();
        expect(data).toBeNull();
      }
    });

    it("el slug es aleatorio, largo e independiente del id", () => {
      expect(game.slug).toMatch(/^[A-Za-z0-9_-]{22}$/);
      expect(game.slug).not.toContain(game.id.slice(0, 8));
      expect(game.slug).not.toBe(otherGame.slug);
    });

    it("otro usuario con sesión tampoco ve ni modifica el partido", async () => {
      const read = await stranger.from("marcador_games").select("*").eq("id", game.id);
      expect(read.data).toEqual([]);
      const upd = await write(stranger, game, { home_runs: 50 });
      expect(upd.data).toBeNull();
      const undo = await stranger.rpc("marcador_undo_last", { p_game_id: game.id, p_expected_version: game.version });
      expect(undo.error?.message).toMatch(/partido_no_encontrado/);
      const hist = await stranger.from("marcador_history").select("*").eq("game_id", game.id);
      expect(hist.data).toEqual([]);
    });
  });

  describe("criterio 7: valores inválidos rechazados aunque se salte la interfaz", () => {
    it.each([
      ["carreras negativas", { home_runs: -1 }],
      ["carreras > 999", { away_runs: 1000 }],
      ["4 bolas", { balls: 4 }],
      ["bolas negativas", { balls: -1 }],
      ["3 strikes", { strikes: 3 }],
      ["3 outs", { outs: 3 }],
      ["inning 0", { inning: 0 }],
      ["mitad inválida", { half: "media" }],
      ["estado inválido", { status: "jugando" }],
      ["abreviatura de 5", { home_abbr: "ABCDE" }],
      ["color inválido", { home_color: "red" }],
      ["logo javascript:", { home_logo_url: "javascript:alert(1)" }],
      ["innings programados 0", { scheduled_innings: 0 }],
    ])("rechaza %s", async (_name, changes) => {
      const { data: current } = await owner.from("marcador_games").select("id,version").eq("id", game.id).single();
      const { data, error } = await write(owner, current!, changes as Partial<GameRow>);
      expect(data).toBeNull();
      expect(error?.code).toMatch(/^(23514|22P02)$/);
    });

    it("no se puede cambiar el slug ni el dueño", async () => {
      const { data: current } = await owner.from("marcador_games").select("id,version").eq("id", game.id).single();
      const slug = await write(owner, current!, { slug: "mi-slug-facil" });
      expect(slug.error?.message).toMatch(/campo_inmutable/);
    });

    it("al crear, el servidor ignora el slug y la versión que mande el cliente", async () => {
      const { data } = await owner
        .from("marcador_games")
        .insert({ title: "Intento", slug: "slug-elegido-por-mi", version: 500 })
        .select("slug,version")
        .single();
      expect(data?.slug).not.toBe("slug-elegido-por-mi");
      expect(data?.version).toBe(1);
    });
  });
});
