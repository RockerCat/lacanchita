import ActionForm from "@/components/ActionForm";
import Card from "@/components/ui/Card";
import { advanceBracketAction } from "@/app/(privado)/control/actions";
import type { AdvancePlan } from "@/lib/copa/plan";
import type { CopaKind } from "@/lib/copa/format";

const KIND: Record<CopaKind, string> = { none: "Sin eliminatorias", knockout: "Eliminatoria (sin matriz de mejores terceros)", worldcup: "Formato Mundial (con matriz de mejores terceros)" };

// Estado del cuadro eliminatorio en Control → Partidos. No es otro editor: solo informa qué cupos determinan ya los
// resultados oficiales y los asigna con la operación de partidos de siempre; los cambios de resultado que dejan un
// cruce posterior incoherente se muestran como conflictos para resolverlos a mano (nunca se sobrescriben).
export default function BracketPanel({ eventId, kind, plan }: { eventId: string; kind: CopaKind; plan: AdvancePlan }) {
  const { assignments, conflicts, blocked } = plan;
  if (assignments.length + conflicts.length + blocked.length === 0) return null;
  const label = (n: number | null) => (n ? `M${n}` : "partido");
  return (
    <Card className="flex flex-col gap-3 border-gold/30">
      <div>
        <h2 className="text-sm font-black text-fg">Cuadro eliminatorio</h2>
        <p className="text-xs text-fg-3">{KIND[kind]}. Solo cuentan resultados oficiales cerrados.</p>
      </div>
      {conflicts.length > 0 && (
        <div role="alert" className="rounded-xl border border-danger/25 bg-danger/[0.08] p-3 text-sm text-danger">
          <p className="font-semibold">Un resultado cambió y el cuadro quedó incoherente. No se modifica solo:</p>
          <ul className="mt-1 list-disc pl-5">
            {conflicts.map((c) => (
              <li key={`${c.matchId}${c.side}`}>
                {label(c.matchNumber)} ({c.stageName}, {c.side === "home" ? "local" : "visitante"}): tiene {c.assigned.name} y ahora corresponde {c.expected.name}.{" "}
                {c.locked ? "El partido ya empezó o terminó: revisa el resultado antes de corregir." : "Edítalo en «Editar partido» (si hay pronósticos, la base lo impedirá)."}
              </li>
            ))}
          </ul>
        </div>
      )}
      {blocked.length > 0 && (
        <ul className="list-disc pl-5 text-xs text-gold">
          {blocked.map((b, i) => <li key={i}>{label(b.matchNumber)} ({b.stageName}, {b.side === "home" ? "local" : "visitante"}): {b.reason}.</li>)}
        </ul>
      )}
      {assignments.length > 0 && (
        <ActionForm
          action={advanceBracketAction}
          submitLabel={`Asignar ${assignments.length} ${assignments.length === 1 ? "clasificado" : "clasificados"} al cuadro`}
          variant="secondary"
          size="sm"
          confirm={
            <ul className="list-disc pl-5">
              {assignments.map((a) => <li key={`${a.matchId}${a.side}`}>{label(a.matchNumber)} ({a.stageName}, {a.side === "home" ? "local" : "visitante"}): <strong>{a.team.name}</strong></li>)}
            </ul>
          }
          confirmLabel="Sí, asignar"
        >
          <input type="hidden" name="event_id" value={eventId} />
        </ActionForm>
      )}
    </Card>
  );
}
