"use client";

import type { RealtimeChannel } from "@supabase/supabase-js";
import { useEffect, useRef, useState } from "react";
import { getBrowserClient } from "@/lib/supabase/client";

export type ConnectionStatus = "conectando" | "conectado" | "reconectando" | "sin_conexion";

export const CONNECTION_LABELS: Record<ConnectionStatus, string> = {
  conectando: "Conectando…",
  conectado: "Conectado",
  reconectando: "Reconectando…",
  sin_conexion: "Sin conexión",
};

interface Options<T> {
  /** Canal privado de Realtime, por ejemplo "marcador-overlay:<slug>". */
  topic: string | null;
  /** Mensaje recibido por broadcast (evento "estado"). */
  onMessage: (payload: T) => void;
  /** Vuelve a leer el estado completo (al conectar, al reconectar y como respaldo). */
  resync: () => Promise<boolean>;
}

const MAX_BACKOFF_MS = 15_000;
const POLL_WHILE_DOWN_MS = 4_000;
const SAFETY_RESYNC_MS = 30_000;

/**
 * Suscripción en tiempo real con reconexión automática.
 *
 * - Canal privado: solo recibe lo que la base publica (nadie puede inyectar mensajes).
 * - Si el canal falla, lo vuelve a crear con espera exponencial (1 s, 2 s, 4 s… 15 s).
 * - Cada vez que queda suscrito, vuelve a leer el estado completo para no perder eventos.
 * - Mientras no hay tiempo real, consulta el estado cada 4 s; y cada 30 s aunque todo vaya bien.
 * - Nunca borra el último estado conocido: si se cae la red, el marcador se queda como estaba.
 */
export function useLiveTopic<T>({ topic, onMessage, resync }: Options<T>): ConnectionStatus {
  const [status, setStatus] = useState<ConnectionStatus>("conectando");
  const onMessageRef = useRef(onMessage);
  const resyncRef = useRef(resync);

  useEffect(() => {
    onMessageRef.current = onMessage;
    resyncRef.current = resync;
  });

  useEffect(() => {
    if (!topic) return;
    const supabase = getBrowserClient();
    let channel: RealtimeChannel | null = null;
    let attempt = 0;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
    let disposed = false;
    let subscribed = false;

    const offline = () => typeof navigator !== "undefined" && navigator.onLine === false;
    const markDown = () => {
      subscribed = false;
      setStatus(offline() ? "sin_conexion" : "reconectando");
    };

    const runResync = () => {
      resyncRef.current().catch(() => false);
    };

    const connect = () => {
      if (disposed) return;
      const current = supabase.channel(topic, { config: { private: true } });
      channel = current;
      current.on("broadcast", { event: "estado" }, (message) => {
        onMessageRef.current(message.payload as T);
      });
      current.subscribe((state) => {
        if (disposed || channel !== current) return; // eventos de un canal ya descartado
        if (state === "SUBSCRIBED") {
          attempt = 0;
          subscribed = true;
          setStatus("conectado");
          runResync();
        } else if (state === "CHANNEL_ERROR" || state === "TIMED_OUT" || state === "CLOSED") {
          markDown();
          scheduleReconnect();
        }
      });
    };

    const scheduleReconnect = (delay?: number) => {
      clearTimeout(reconnectTimer);
      const wait = delay ?? Math.min(MAX_BACKOFF_MS, 1_000 * 2 ** attempt) + Math.random() * 300;
      attempt += 1;
      reconnectTimer = setTimeout(() => {
        const old = channel;
        channel = null;
        if (old) supabase.removeChannel(old);
        connect();
      }, wait);
    };

    const handleOnline = () => {
      setStatus("reconectando");
      attempt = 0;
      runResync();
      if (!subscribed) scheduleReconnect(0);
    };
    const handleOffline = () => markDown();
    const handleVisible = () => {
      if (document.visibilityState === "visible") runResync();
    };

    // Respaldo: si el tiempo real no está, se consulta el estado por HTTP.
    const poll = setInterval(() => {
      if (!subscribed && !offline()) runResync();
    }, POLL_WHILE_DOWN_MS);
    const safety = setInterval(runResync, SAFETY_RESYNC_MS);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    document.addEventListener("visibilitychange", handleVisible);
    // Si arranca sin red, el canal falla y markDown() marca "sin conexión".
    connect();

    return () => {
      disposed = true;
      clearTimeout(reconnectTimer);
      clearInterval(poll);
      clearInterval(safety);
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      document.removeEventListener("visibilitychange", handleVisible);
      if (channel) supabase.removeChannel(channel);
    };
  }, [topic]);

  return status;
}
