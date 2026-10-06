"use client";

import { useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { BOARD_HEIGHT, BOARD_WIDTH, Scoreboard } from "@/components/scoreboard/Scoreboard";
import type { OverlayGame } from "@/lib/game/types";

/** Vista previa del overlay dentro del panel, escalada al ancho disponible. */
export function LivePreview({ game }: { game: OverlayGame }) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setWidth(el.clientWidth);
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const factor = width / BOARD_WIDTH;
  return (
    <div
      ref={ref}
      className="preview"
      style={{ height: BOARD_HEIGHT * factor || 56 }}
      data-testid="preview"
      aria-label="Vista previa del overlay"
    >
      {width > 0 && (
        <div className={`preview-canvas ${game.overlay_visible ? "" : "is-off"}`} style={{ transform: `scale(${factor})` }}>
          <Scoreboard game={game} />
        </div>
      )}
      {!game.overlay_visible && <span className="preview-off">Oculto en el overlay</span>}
    </div>
  );
}

const noSubscribe = () => () => {};

/** URL del overlay con botones para copiar y abrir. */
export function OverlayLink({ slug }: { slug: string }) {
  const origin = useSyncExternalStore(noSubscribe, () => window.location.origin, () => "");
  const [copied, setCopied] = useState<"" | "ok" | "error">("");
  const url = `${origin}/overlay/${slug}`;

  async function copy() {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(url);
      } else {
        // Respaldo para http:// en la red local, donde el portapapeles moderno no está disponible.
        const area = document.createElement("textarea");
        area.value = url;
        area.setAttribute("readonly", "");
        area.style.position = "fixed";
        area.style.opacity = "0";
        document.body.appendChild(area);
        area.select();
        const ok = document.execCommand("copy");
        area.remove();
        if (!ok) throw new Error("copy");
      }
      setCopied("ok");
    } catch {
      setCopied("error");
    }
    setTimeout(() => setCopied(""), 2500);
  }

  return (
    <div className="stack" style={{ gap: 8 }}>
      <code className="overlay-url" data-testid="overlay-url">
        {url}
      </code>
      <div className="row">
        <button className="btn btn-primary" style={{ flex: 1 }} onClick={copy} data-testid="copy-overlay-url">
          {copied === "ok" ? "¡URL copiada!" : copied === "error" ? "Cópiala a mano" : "Copiar URL del overlay"}
        </button>
        <a className="btn" href={url} target="_blank" rel="noreferrer">
          Abrir ↗
        </a>
      </div>
      <p className="hint">
        En OBS: Fuente → Navegador, 1920 × 1080. Opcional: <code>?scale=0.8</code> y{" "}
        <code>?pos=top-left</code> o <code>?pos=bottom-center</code>.
      </p>
    </div>
  );
}
