"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { getBrowserClient } from "@/lib/supabase/client";

const MESSAGES: Record<string, string> = {
  "Invalid login credentials": "Correo o contraseña incorrectos.",
  "Email not confirmed": "Confirma tu correo antes de entrar (revisa tu bandeja de entrada).",
  "Signups not allowed for this instance": "El registro de cuentas nuevas está desactivado en Supabase.",
  "User already registered": "Ya existe una cuenta con ese correo. Inicia sesión.",
};

const translate = (message: string) =>
  MESSAGES[message] ?? (/password/i.test(message) ? "La contraseña debe tener al menos 6 caracteres." : message);

export function LoginForm({ next, authError }: { next: string; authError: boolean }) {
  const router = useRouter();
  const [mode, setMode] = useState<"entrar" | "crear">("entrar");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(authError ? "El enlace de confirmación no es válido o ya expiró." : "");
  const [info, setInfo] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setInfo("");
    const supabase = getBrowserClient();
    try {
      if (mode === "entrar") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) return setError(translate(error.message));
      } else {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}` },
        });
        if (error) return setError(translate(error.message));
        if (!data.session) {
          setInfo("Cuenta creada. Revisa tu correo y abre el enlace de confirmación para entrar.");
          return;
        }
      }
      router.replace(next);
      router.refresh();
    } catch {
      setError("No hay conexión con el servidor. Revisa tu internet e inténtalo de nuevo.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card stack" onSubmit={submit}>
      <div className="segmented" role="group" aria-label="Modo">
        <button type="button" aria-pressed={mode === "entrar"} onClick={() => setMode("entrar")}>
          Iniciar sesión
        </button>
        <button type="button" aria-pressed={mode === "crear"} onClick={() => setMode("crear")}>
          Crear cuenta
        </button>
      </div>
      <div className="field">
        <label htmlFor="email">Correo</label>
        <input
          id="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>
      <div className="field">
        <label htmlFor="password">Contraseña</label>
        <input
          id="password"
          type="password"
          autoComplete={mode === "entrar" ? "current-password" : "new-password"}
          minLength={6}
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>
      {error && (
        <p className="error-text" role="alert">
          {error}
        </p>
      )}
      {info && (
        <p className="hint" role="status">
          {info}
        </p>
      )}
      <button className="btn btn-primary btn-big btn-block" disabled={busy}>
        {busy ? "Un momento…" : mode === "entrar" ? "Entrar" : "Crear cuenta"}
      </button>
    </form>
  );
}
