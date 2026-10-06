"use client";

import { useState, type FormEvent } from "react";
import { readableTextOn } from "@/lib/game/colors";
import { LIMITS } from "@/lib/game/rules";

interface Props {
  side: "home" | "away";
  name: string;
  abbr: string;
  color: string;
  runs: number;
  batting: boolean;
  onAdd: (delta: number) => void;
  onSet: (value: number) => void;
}

/** Carreras de un equipo: −1, +1 y edición directa al tocar el número. */
export function RunsControl({ side, name, abbr, color, runs, batting, onAdd, onSet }: Props) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const role = side === "home" ? "Local" : "Visitante";

  function startEdit() {
    setText(String(runs));
    setError("");
    setEditing(true);
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    const value = Number(text);
    if (!/^\d+$/.test(text.trim()) || value < LIMITS.runs.min || value > LIMITS.runs.max) {
      setError(`Escribe un número entero entre ${LIMITS.runs.min} y ${LIMITS.runs.max}.`);
      return;
    }
    onSet(value);
    setEditing(false);
  }

  return (
    <div className="runs" data-testid={`runs-${side}`}>
      <div className="runs-team">
        <span className="abbr-chip" style={{ background: color, color: readableTextOn(color) }}>
          {abbr}
        </span>
        <span className="runs-name">
          <strong>{name}</strong>
          <small className="muted">
            {role}
            {batting ? " · al bate" : ""}
          </small>
        </span>
      </div>
      {editing ? (
        <form className="runs-edit" onSubmit={submit}>
          <input
            type="number"
            inputMode="numeric"
            min={LIMITS.runs.min}
            max={LIMITS.runs.max}
            step={1}
            autoFocus
            aria-label={`Carreras de ${name}`}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <button className="btn btn-primary btn-small">Guardar</button>
          <button type="button" className="btn btn-ghost btn-small" onClick={() => setEditing(false)}>
            Cancelar
          </button>
          {error && (
            <p className="error-text" role="alert" style={{ flexBasis: "100%" }}>
              {error}
            </p>
          )}
        </form>
      ) : (
        <div className="runs-controls">
          <button
            className="btn btn-round"
            aria-label={`Quitar carrera a ${name}`}
            disabled={runs <= LIMITS.runs.min}
            onClick={() => onAdd(-1)}
          >
            −
          </button>
          <button
            className="runs-value"
            onClick={startEdit}
            aria-label={`Carreras de ${name}: ${runs}. Tocar para editar`}
            data-testid={`runs-value-${side}`}
          >
            {runs}
          </button>
          <button
            className="btn btn-round btn-primary"
            aria-label={`Sumar carrera a ${name}`}
            disabled={runs >= LIMITS.runs.max}
            onClick={() => onAdd(1)}
            data-testid={`runs-plus-${side}`}
          >
            +
          </button>
        </div>
      )}
    </div>
  );
}
