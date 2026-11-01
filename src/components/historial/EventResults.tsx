import { RESULT_LABELS } from "@/lib/historial";
import type { EventResult } from "@/lib/data";

const ACCENTS: Record<string, string> = {
  champion: "border-gold/30 bg-gold/[0.06]",
  runner_up: "border-silver/30 bg-silver/[0.05]",
  third_place: "border-bronze/30 bg-bronze/[0.05]",
};

export default function EventResults({ results }: { results: EventResult[] }) {
  const anyDerived = results.some((r) => r.derived);
  return (
    <div>
      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {results.map((r) => (
          <div key={r.key} className={`rounded-xl border px-3 py-2.5 ${ACCENTS[r.key] ?? "border-line bg-surface-raised"}`}>
            <dt className="font-mono text-[11px] uppercase tracking-wider text-fg-3">{RESULT_LABELS[r.key] ?? r.key}</dt>
            <dd className="mt-1 text-sm font-bold text-fg">
              {r.flag && <span aria-hidden="true">{r.flag} </span>}
              {r.teamName}
            </dd>
          </div>
        ))}
      </dl>
      {anyDerived && (
        <p className="mt-3 text-xs text-fg-3">
          Calculados a partir de los datos del sistema anterior (La Penúltima). No están verificados con una fuente
          oficial externa.
        </p>
      )}
    </div>
  );
}
