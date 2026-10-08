"use client";

import { useEffect, useSyncExternalStore } from "react";
import { normalizeRelayUrl } from "@/lib/studio/media";
import { readStoredRelay, storeRelay } from "@/lib/studio/relayStorage";

const noSubscribe = () => () => {};

/** Guarda la dirección del intermediario que trae el enlace del código QR. */
export function SaveRelayFromLink({ relay }: { relay: string }) {
  const fromLink = relay ? normalizeRelayUrl(relay) : null;
  const stored = useSyncExternalStore(noSubscribe, readStoredRelay, () => null);
  useEffect(() => {
    if (fromLink) storeRelay(fromLink);
  }, [fromLink]);

  const saved = fromLink ?? stored;
  if (saved === null) return null;
  return (
    <p className={`card ${saved ? "" : "error-text"}`} data-testid="relay-saved">
      {saved
        ? `Intermediario: ${saved}`
        : "Aún no hay intermediario. En la computadora ejecuta npm start dentro de la carpeta relay y escanea el código QR."}
    </p>
  );
}
