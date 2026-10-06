import type { Base } from "@/lib/game/types";

const BASES: { key: Base; label: string; name: string }[] = [
  { key: "on_second", label: "2B", name: "Segunda" },
  { key: "on_third", label: "3B", name: "Tercera" },
  { key: "on_first", label: "1B", name: "Primera" },
];

/** Diamante con las tres bases: tocar una base la ocupa o la libera. */
export function BasesPad({
  bases,
  onSet,
}: {
  bases: Record<Base, boolean>;
  onSet: (base: Base, occupied: boolean) => void;
}) {
  return (
    <div className="bases-pad" role="group" aria-label="Bases">
      {BASES.map(({ key, label, name }) => (
        <button
          key={key}
          className={`base-btn base-${key}`}
          aria-pressed={bases[key]}
          aria-label={`${name} base: ${bases[key] ? "ocupada" : "libre"}`}
          onClick={() => onSet(key, !bases[key])}
          data-testid={`base-${key}`}
        >
          <span>{label}</span>
        </button>
      ))}
      <span className="home-plate" aria-hidden />
    </div>
  );
}
