"use client";

import { useEffect, useRef } from "react";

interface Props {
  open: boolean;
  title: string;
  children: React.ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Diálogo de confirmación explícito (modal nativo, se cierra con Esc o Cancelar). */
export function ConfirmDialog({ open, title, children, confirmLabel, onConfirm, onCancel }: Props) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog ref={ref} className="confirm" onCancel={onCancel} onClose={onCancel} aria-labelledby="confirm-title">
      <h3 id="confirm-title">{title}</h3>
      <div className="stack" style={{ gap: 6 }}>
        {children}
      </div>
      <div className="row" style={{ marginTop: 18 }}>
        <button className="btn btn-big" style={{ flex: 1 }} onClick={onCancel} autoFocus>
          Cancelar
        </button>
        <button className="btn btn-big btn-danger" style={{ flex: 1 }} onClick={onConfirm} data-testid="confirm-yes">
          {confirmLabel}
        </button>
      </div>
    </dialog>
  );
}
