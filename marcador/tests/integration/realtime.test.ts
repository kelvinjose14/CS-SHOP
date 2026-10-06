/**
 * Tiempo real: el overlay (sin sesión) recibe los cambios en menos de 1 s por un
 * canal privado; nadie más puede leer el canal del panel ni inyectar mensajes.
 */
import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { GameRow, OverlayGame } from "@/lib/game/types";
import { anonClient, configured, createGame, newUser, sleep, write } from "./helpers";

type Status = "SUBSCRIBED" | "CHANNEL_ERROR" | "TIMED_OUT" | "CLOSED";

function listen<T>(client: SupabaseClient, topic: string) {
  const messages: { at: number; payload: T }[] = [];
  const channel = client.channel(topic, { config: { private: true } });
  channel.on("broadcast", { event: "estado" }, (m) => messages.push({ at: Date.now(), payload: m.payload as T }));
  const status = new Promise<Status>((resolve) => {
    channel.subscribe((s) => {
      if (s !== "CLOSED") resolve(s as Status);
    });
    setTimeout(() => resolve("TIMED_OUT"), 8000);
  });
  return { channel, messages, status };
}

async function waitFor<T>(list: T[], count: number, ms = 3000) {
  const end = Date.now() + ms;
  while (list.length < count && Date.now() < end) await sleep(20);
}

describe.skipIf(!configured)("tiempo real", () => {
  let owner: SupabaseClient;
  let ownerId: string;
  let game: GameRow;
  const clients: SupabaseClient[] = [];
  const channels: [SupabaseClient, RealtimeChannel][] = [];

  beforeAll(async () => {
    const user = await newUser("realtime");
    owner = user.client;
    ownerId = user.id;
    game = await createGame(owner);
  });

  afterAll(async () => {
    for (const [client, channel] of channels) await client.removeChannel(channel);
    for (const client of clients) client.realtime.disconnect();
    owner.realtime.disconnect();
  });

  const track = (client: SupabaseClient, channel: RealtimeChannel) => {
    clients.push(client);
    channels.push([client, channel]);
  };

  it("el overlay sin sesión recibe cada cambio en menos de 1 segundo, solo con datos públicos", async () => {
    const anon = anonClient();
    const overlay = listen<OverlayGame>(anon, `marcador-overlay:${game.slug}`);
    track(anon, overlay.channel);
    expect(await overlay.status).toBe("SUBSCRIBED");

    // Calentamiento: con Realtime recién iniciado (como en CI), la difusión desde la
    // base tarda unos cientos de ms en activarse y un cambio hecho en ese instante no
    // llega por el canal. La app lo cubre releyendo el estado al suscribirse y a los
    // 2,5 s (useLiveTopic). Aquí se exige que el canal quede activo en pocos segundos.
    let warm = 0;
    while (overlay.messages.length === 0 && warm < 40) {
      warm += 1;
      game = (await write(owner, game, { away_runs: warm })).data!;
      await waitFor(overlay.messages, 1, 250);
    }
    expect(overlay.messages.length, "el canal del overlay nunca empezó a recibir").toBeGreaterThan(0);
    await sleep(300);
    const offset = overlay.messages.length;

    const latencies: number[] = [];
    for (let i = 1; i <= 5; i += 1) {
      const start = Date.now();
      game = (await write(owner, game, { home_runs: i })).data!;
      await waitFor(overlay.messages, offset + i);
      const message = overlay.messages[offset + i - 1];
      expect(message?.payload.home_runs).toBe(i);
      latencies.push(message.at - start);
    }
    console.log(`latencia overlay (ms): ${latencies.join(", ")}`);
    expect(Math.max(...latencies)).toBeLessThan(1000);
    expect(overlay.messages[0].payload).not.toHaveProperty("owner_id");
    expect(overlay.messages[0].payload).not.toHaveProperty("auto_new_batter");
  });

  it("el dueño recibe la fila completa en el canal del panel", async () => {
    const panel = listen<GameRow>(owner, `marcador-game:${game.id}`);
    channels.push([owner, panel.channel]);
    expect(await panel.status).toBe("SUBSCRIBED");
    game = (await write(owner, game, { balls: 1 })).data!;
    await waitFor(panel.messages, 1);
    expect(panel.messages[0]?.payload).toMatchObject({ id: game.id, owner_id: ownerId, balls: 1, version: game.version });
  });

  it("sin sesión u otro usuario: no pueden escuchar el canal del panel", async () => {
    const anon = anonClient();
    const spy = listen<GameRow>(anon, `marcador-game:${game.id}`);
    track(anon, spy.channel);
    const stranger = (await newUser("espia")).client;
    const spy2 = listen<GameRow>(stranger, `marcador-game:${game.id}`);
    track(stranger, spy2.channel);

    const [s1, s2] = await Promise.all([spy.status, spy2.status]);
    expect(s1).not.toBe("SUBSCRIBED");
    expect(s2).not.toBe("SUBSCRIBED");

    game = (await write(owner, game, { strikes: 1 })).data!;
    await sleep(800);
    expect(spy.messages).toHaveLength(0);
    expect(spy2.messages).toHaveLength(0);
  });

  it("nadie puede inyectar un marcador falso en el canal del overlay", async () => {
    const viewer = anonClient();
    const overlay = listen<OverlayGame>(viewer, `marcador-overlay:${game.slug}`);
    track(viewer, overlay.channel);
    expect(await overlay.status).toBe("SUBSCRIBED");

    const attacker = anonClient();
    const evil = attacker.channel(`marcador-overlay:${game.slug}`, { config: { private: true } });
    track(attacker, evil);
    await new Promise<void>((resolve) => {
      evil.subscribe(() => resolve());
      setTimeout(resolve, 3000);
    });
    await evil.send({ type: "broadcast", event: "estado", payload: { ...game, home_runs: 99, version: 99999 } });
    await sleep(1000);
    expect(overlay.messages.some((m) => m.payload.home_runs === 99)).toBe(false);
  });
});
