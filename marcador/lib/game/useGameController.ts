"use client";

import type { PostgrestError } from "@supabase/supabase-js";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getBrowserClient } from "@/lib/supabase/client";
import { useLiveTopic, type ConnectionStatus } from "@/lib/realtime/useLiveTopic";
import { applyPending, computeChanges, type GameAction } from "./rules";
import type { GameRow } from "./types";

export type Notice = { tone: "info" | "warning" | "error"; text: string; id: number };

export interface GameController {
  /** Lo que se muestra: estado confirmado + acciones pendientes (optimista). */
  game: GameRow;
  /** Último estado confirmado por el servidor. */
  confirmed: GameRow;
  dispatch: (action: GameAction) => void;
  pendingCount: number;
  connection: ConnectionStatus;
  notice: Notice | null;
  dismissNotice: () => void;
}

const isNetworkError = (error: PostgrestError | null) =>
  !!error && (!error.code || /fetch|network|timeout/i.test(error.message));

const isConflict = (error: PostgrestError | null) =>
  !!error && (error.code === "40001" || /conflicto_version/.test(error.message));

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Controlador del partido en el panel.
 *
 * Las acciones se encolan y se envían una por una. Cada una se calcula sobre el
 * último estado confirmado y se guarda con version = actual + 1 (y el filtro
 * version = actual). Si otro controlador escribió antes, el servidor rechaza la
 * escritura: se descartan las acciones pendientes, se recarga el estado real y
 * se avisa. Nadie sobrescribe a nadie en silencio.
 */
export function useGameController(initial: GameRow): GameController {
  const supabase = getBrowserClient();
  const [confirmed, setConfirmed] = useState(initial);
  const confirmedRef = useRef(initial);
  const queueRef = useRef<GameAction[]>([]);
  const [pending, setPending] = useState<GameAction[]>([]);
  const processingRef = useRef(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [writeOffline, setWriteOffline] = useState(false);

  const dismissNotice = useCallback(() => setNotice(null), []);

  const say = useCallback((tone: Notice["tone"], text: string) => {
    setNotice({ tone, text, id: Date.now() });
  }, []);

  /** Acepta una fila solo si es igual o más nueva que la que ya tenemos. */
  const accept = useCallback((row: GameRow, force = false) => {
    if (force || row.version >= confirmedRef.current.version) {
      confirmedRef.current = row;
      setConfirmed(row);
    }
  }, []);

  const syncQueue = useCallback(() => setPending([...queueRef.current]), []);

  const reload = useCallback(async () => {
    const { data, error } = await supabase
      .from("marcador_games")
      .select("*")
      .eq("id", confirmedRef.current.id)
      .maybeSingle<GameRow>();
    if (error || !data) return false;
    accept(data, true);
    return true;
  }, [supabase, accept]);

  const process = useCallback(async () => {
    if (processingRef.current) return;
    processingRef.current = true;
    let networkTries = 0;
    try {
      while (queueRef.current.length > 0) {
        const action = queueRef.current[0];
        const base = confirmedRef.current;
        let data: GameRow | null = null;
        let error: PostgrestError | null = null;

        if (action.kind === "undo") {
          const result = await supabase
            .rpc("marcador_undo_last", { p_game_id: base.id, p_expected_version: base.version })
            .maybeSingle<GameRow>();
          data = result.data;
          error = result.error;
        } else {
          const changes = computeChanges(base, action);
          if (!changes) {
            queueRef.current.shift();
            syncQueue();
            continue;
          }
          const result = await supabase
            .from("marcador_games")
            .update({ ...changes, version: base.version + 1 })
            .eq("id", base.id)
            .eq("version", base.version)
            .select("*")
            .maybeSingle<GameRow>();
          data = result.data;
          error = result.error;
        }

        if (isNetworkError(error)) {
          // Sin red: se reintenta la misma acción. El panel sigue mostrando el cambio.
          setWriteOffline(true);
          networkTries += 1;
          await sleep(Math.min(8_000, 500 * 2 ** networkTries));
          continue;
        }
        setWriteOffline(false);
        networkTries = 0;

        if (error || !data) {
          if (!error || isConflict(error)) {
            queueRef.current = [];
            syncQueue();
            await reload();
            say(
              "warning",
              "Otro controlador cambió el marcador al mismo tiempo. Se cargó el estado actual: revísalo y repite tu acción si hace falta.",
            );
          } else {
            queueRef.current.shift();
            syncQueue();
            if (/nada_que_deshacer/.test(error.message)) say("info", "No hay más acciones para deshacer.");
            else if (error.code === "23514") say("error", "Valor fuera de rango: el servidor no lo aceptó.");
            else say("error", `No se pudo guardar: ${error.message}`);
            await reload();
          }
          continue;
        }

        accept(data);
        queueRef.current.shift();
        syncQueue();
      }
    } finally {
      processingRef.current = false;
    }
  }, [supabase, accept, reload, say, syncQueue]);

  const dispatch = useCallback(
    (action: GameAction) => {
      queueRef.current.push(action);
      syncQueue();
      void process();
    },
    [process, syncQueue],
  );

  // Si vuelve la red con cambios pendientes, se reanuda la cola.
  useEffect(() => {
    const resume = () => void process();
    window.addEventListener("online", resume);
    return () => window.removeEventListener("online", resume);
  }, [process]);

  const realtime = useLiveTopic<GameRow>({
    topic: `marcador-game:${initial.id}`,
    onMessage: (row) => accept(row),
    resync: reload,
  });

  const game = useMemo(() => applyPending(confirmed, pending), [confirmed, pending]);

  // Si las escrituras no llegan, eso manda sobre el estado del canal de tiempo real.
  let connection: ConnectionStatus = realtime;
  if (writeOffline) connection = typeof navigator !== "undefined" && !navigator.onLine ? "sin_conexion" : "reconectando";

  return {
    game,
    confirmed,
    dispatch,
    pendingCount: pending.length,
    connection,
    notice,
    dismissNotice,
  };
}
