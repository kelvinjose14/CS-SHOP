"use client";

import { useState } from "react";
import type { GameRow } from "@/lib/game/types";

type Values<K extends keyof GameRow> = Pick<GameRow, K>;

const pick = <K extends keyof GameRow>(game: GameRow, keys: readonly K[]) =>
  Object.fromEntries(keys.map((k) => [k, game[k]])) as Values<K>;

const same = <K extends keyof GameRow>(a: Values<K>, b: Values<K>, keys: readonly K[]) => keys.every((k) => a[k] === b[k]);

/**
 * Borrador de un formulario de configuración.
 *
 * - Mientras no se edita, sigue los cambios que llegan del servidor.
 * - Al guardar, solo envía los campos editados.
 * - Si otro controlador cambió alguno de esos campos mientras se editaba, no se
 *   guarda nada: se cargan los valores nuevos y se avisa (nada se pisa en silencio).
 */
export function useDraft<K extends keyof GameRow>(game: GameRow, keys: readonly K[]) {
  // "game" es la vista optimista: incluye lo recién guardado, así el formulario no parpadea.
  const current = pick(game, keys);
  const [base, setBase] = useState(current);
  const [draft, setDraft] = useState(current);

  const dirty = !same(draft, base, keys);
  if (!dirty && !same(base, current, keys)) {
    setBase(current);
    setDraft(current);
  }

  const set = <F extends K>(field: F, value: GameRow[F]) => setDraft((d) => ({ ...d, [field]: value }));

  /** Devuelve los cambios a guardar, o "conflict" si alguien más tocó esos campos. */
  const takeChanges = (): Partial<Values<K>> | "conflict" | null => {
    const changed = keys.filter((k) => draft[k] !== base[k]);
    if (changed.length === 0) return null;
    if (changed.some((k) => game[k] !== base[k])) {
      setBase(current);
      setDraft(current);
      return "conflict";
    }
    setBase(draft);
    return Object.fromEntries(changed.map((k) => [k, draft[k]])) as Partial<Values<K>>;
  };

  const reset = () => setDraft(base);

  return { draft, set, dirty, takeChanges, reset };
}
