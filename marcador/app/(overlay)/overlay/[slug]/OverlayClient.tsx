"use client";

import { useCallback, useState, useSyncExternalStore } from "react";
import { BOARD_HEIGHT, BOARD_WIDTH, Scoreboard } from "@/components/scoreboard/Scoreboard";
import { computePlacement, type PlacementOptions } from "@/components/scoreboard/placement";
import type { OverlayGame } from "@/lib/game/types";
import { useLiveTopic } from "@/lib/realtime/useLiveTopic";
import { getBrowserClient } from "@/lib/supabase/client";

interface Props {
  slug: string;
  initial: OverlayGame | null;
  initiallyMissing: boolean;
  placement: PlacementOptions;
}

const subscribeResize = (onChange: () => void) => {
  window.addEventListener("resize", onChange);
  return () => window.removeEventListener("resize", onChange);
};
const viewportSnapshot = () => `${window.innerWidth}x${window.innerHeight}`;
const serverSnapshot = () => null;

export function OverlayClient({ slug, initial, initiallyMissing, placement }: Props) {
  const [game, setGame] = useState<OverlayGame | null>(initial);
  const [missing, setMissing] = useState(initiallyMissing);

  // Nunca se reemplaza un estado por otro más viejo (los mensajes pueden llegar desordenados).
  const accept = useCallback((next: OverlayGame) => {
    setGame((prev) => (!prev || next.version >= prev.version ? next : prev));
  }, []);

  const resync = useCallback(async () => {
    const { data, error } = await getBrowserClient().rpc("marcador_get_overlay", { p_slug: slug });
    if (error) return false; // sin red: se conserva el último marcador conocido
    if (!data) {
      setMissing(true);
      return true;
    }
    setMissing(false);
    accept(data as OverlayGame);
    return true;
  }, [slug, accept]);

  const connection = useLiveTopic<OverlayGame>({ topic: `marcador-overlay:${slug}`, onMessage: accept, resync });

  const viewport = useSyncExternalStore(subscribeResize, viewportSnapshot, serverSnapshot);

  if (!game) {
    return missing ? (
      <p className="overlay-message" data-testid="overlay-missing">
        Marcador no encontrado. Revisa la URL del overlay.
      </p>
    ) : null;
  }

  const [width, height] = viewport ? viewport.split("x").map(Number) : [0, 0];
  const place = computePlacement(width, height, BOARD_WIDTH, BOARD_HEIGHT, placement);
  const classes = ["overlay-stage", !viewport && "is-measuring", !game.overlay_visible && "is-hidden"]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="overlay-root">
      <div
        className={classes}
        style={{ left: place.left, top: place.top, width: place.width, height: place.height }}
        data-testid="overlay-stage"
        data-visible={game.overlay_visible}
        aria-hidden={!game.overlay_visible}
      >
        <div className="overlay-canvas" style={{ transform: `scale(${place.factor})` }}>
          <Scoreboard game={game} connection={connection} />
        </div>
      </div>
    </div>
  );
}
