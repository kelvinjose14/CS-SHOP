"use client";

import { useLayoutEffect, useRef, useState } from "react";

interface Props {
  text: string;
  /** Tamaño ideal en px (lienzo base, antes de escalar). */
  max: number;
  /** Tamaño mínimo; si aun así no cabe, se corta con puntos suspensivos. */
  min: number;
  className?: string;
}

/** Texto de una línea que reduce su fuente hasta caber y, al final, usa "…". */
export function FitText({ text, max, min, className }: Props) {
  const ref = useRef<HTMLSpanElement>(null);
  const [fontsReady, setFontsReady] = useState(0);

  useLayoutEffect(() => {
    let cancelled = false;
    document.fonts?.ready.then(() => !cancelled && setFontsReady((n) => n + 1));
    return () => {
      cancelled = true;
    };
  }, []);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    let size = max;
    el.style.fontSize = `${size}px`;
    // scrollWidth y clientWidth no dependen del transform: scale del lienzo.
    while (el.scrollWidth > el.clientWidth + 0.5 && size > min) {
      size = Math.max(min, size - 2);
      el.style.fontSize = `${size}px`;
    }
  }, [text, max, min, fontsReady]);

  return (
    <span
      ref={ref}
      className={className}
      title={text}
      style={{ display: "block", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", fontSize: max }}
    >
      {text}
    </span>
  );
}
