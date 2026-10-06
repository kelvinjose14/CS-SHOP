"use client";

import { useRef, useState } from "react";
import { getBrowserClient } from "@/lib/supabase/client";
import { LOGO_ACCEPT, uploadLogo, validateLogoFile, type LogoKind } from "@/lib/storage/logos";

interface Props {
  label: string;
  kind: LogoKind;
  url: string | null;
  ownerId: string;
  gameId: string;
  onChange: (url: string | null) => void;
}

/** Subir, cambiar o quitar un logo (PNG, SVG o WebP; máximo 2 MB). */
export function LogoField({ label, kind, url, ownerId, gameId, onChange }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setError("");
    const problem = validateLogoFile(file);
    if (problem) return setError(problem);
    setBusy(true);
    try {
      // El archivo anterior no se borra: si el cambio no se guardara, el marcador seguiría mostrándolo.
      onChange(await uploadLogo(getBrowserClient(), ownerId, gameId, kind, file));
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo subir el logo.");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <div className="field">
      <span className="label">{label}</span>
      <div className="logo-field">
        <span className="logo-preview">
          {url ? (
            // eslint-disable-next-line @next/next/no-img-element -- logo subido por el usuario
            <img src={url} alt={`Logo: ${label}`} />
          ) : (
            <span className="muted">Sin logo</span>
          )}
        </span>
        <div className="stack" style={{ gap: 6, flex: 1 }}>
          <button type="button" className="btn btn-small" disabled={busy} onClick={() => input.current?.click()}>
            {busy ? "Subiendo…" : url ? "Cambiar logo" : "Subir logo"}
          </button>
          {url && (
            <button
              type="button"
              className="btn btn-small btn-ghost"
              disabled={busy}
              onClick={() => onChange(null)}
            >
              Quitar
            </button>
          )}
        </div>
        <input
          ref={input}
          type="file"
          accept={LOGO_ACCEPT}
          hidden
          onChange={(e) => handleFile(e.target.files?.[0])}
          data-testid={`logo-input-${kind}`}
        />
      </div>
      <small className="muted">PNG, SVG o WebP · máximo 2 MB · se muestra sin deformar.</small>
      {error && (
        <p className="error-text" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
