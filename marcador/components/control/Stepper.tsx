interface Props {
  id: string;
  label: string;
  value: number;
  onMinus: () => void;
  onPlus: () => void;
  canMinus: boolean;
  canPlus: boolean;
  onReset?: () => void;
  hint?: string;
}

/** Fila con − valor + (y reinicio opcional), con botones grandes para el pulgar. */
export function Stepper({ id, label, value, onMinus, onPlus, canMinus, canPlus, onReset, hint }: Props) {
  return (
    <div className="stepper" data-testid={`stepper-${id}`}>
      <div className="stepper-label">
        <span>{label}</span>
        {hint && <small className="muted">{hint}</small>}
      </div>
      <button className="btn btn-round" aria-label={`Restar ${label.toLowerCase()}`} disabled={!canMinus} onClick={onMinus}>
        −
      </button>
      <output className="stepper-value" aria-label={label} data-testid={`value-${id}`}>
        {value}
      </output>
      <button className="btn btn-round" aria-label={`Sumar ${label.toLowerCase()}`} disabled={!canPlus} onClick={onPlus}>
        +
      </button>
      {onReset && (
        <button
          className="btn btn-small btn-ghost"
          aria-label={`Reiniciar ${label.toLowerCase()}`}
          title={`Reiniciar ${label.toLowerCase()}`}
          disabled={value === 0}
          onClick={onReset}
        >
          ↺
        </button>
      )}
    </div>
  );
}
