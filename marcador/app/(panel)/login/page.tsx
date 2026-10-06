import type { Metadata } from "next";
import { safeNext } from "@/lib/safe-next";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = { title: "Iniciar sesión" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  return (
    <main className="page" style={{ maxWidth: 440, paddingTop: 48 }}>
      <div className="brand-lockup">
        <span className="brand-mark" aria-hidden />
        <div>
          <h1>Marcador en vivo</h1>
          <p className="muted">Panel de control para transmisiones de softball y béisbol</p>
        </div>
      </div>
      <LoginForm next={safeNext(query.next)} authError={query.error === "auth"} />
    </main>
  );
}
