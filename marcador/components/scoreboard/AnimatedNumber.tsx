"use client";

import { useState } from "react";
import styles from "./scoreboard.module.css";

/** Número que hace una animación breve (< 400 ms) cuando cambia, no al cargar. */
export function AnimatedNumber({ value, className }: { value: number; className?: string }) {
  const [state, setState] = useState({ value, changes: 0 });
  if (state.value !== value) setState({ value, changes: state.changes + 1 });

  return (
    <span key={state.changes} className={`${className ?? ""} ${state.changes > 0 ? styles.pop : ""}`}>
      {value}
    </span>
  );
}
