import { CONNECTION_LABELS, type ConnectionStatus } from "@/lib/realtime/useLiveTopic";

/** Indicador visible del estado de conexión del panel. */
export function ConnectionBadge({ status, pending }: { status: ConnectionStatus; pending: number }) {
  let detail = "";
  if (pending > 0) detail = status === "conectado" ? " · guardando…" : ` · ${pending} sin enviar`;
  return (
    <span className="conn" data-status={status} role="status" aria-live="polite" data-testid="connection">
      <span className="conn-dot" aria-hidden />
      {CONNECTION_LABELS[status]}
      {detail}
    </span>
  );
}
