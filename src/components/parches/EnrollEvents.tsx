import ActionForm from "@/components/ActionForm";
import Card from "@/components/ui/Card";
import { enrollEventAction } from "@/app/(privado)/parches/actions";
import type { AvailableEvent } from "@/lib/data";
import { eventStatusLabel } from "@/lib/parches";

// Sección para owner/admin activos: incorporar torneos publicados. La base vuelve a validar el permiso.
export default function EnrollEvents({ parcheId, events }: { parcheId: string; events: AvailableEvent[] }) {
  return (
    <section aria-labelledby="incorporar">
      <h2 id="incorporar" className="mb-1 text-lg font-bold text-fg">
        Incorporar un torneo
      </h2>
      <p className="mb-3 text-sm text-fg-2">
        Elige un torneo publicado para que tu parche participe. Cada parche lleva sus propios pronósticos y su clasificación. Los pronósticos
        no son retroactivos: solo se podrá pronosticar lo que aún no haya empezado.
      </p>
      {events.length === 0 ? (
        <Card variant="dashed" className="p-5 text-center">
          <p className="text-sm text-fg-3">No hay torneos nuevos disponibles ahora mismo.</p>
        </Card>
      ) : (
        <ul className="flex flex-col gap-3">
          {events.map((e) => (
            <li key={e.id}>
              <Card className="p-4">
                <ActionForm
                  action={enrollEventAction}
                  submitLabel="Incorporar al parche"
                  pendingLabel="Incorporando…"
                  size="sm"
                  confirm={`¿Incorporar «${e.name}» a este parche? No se puede deshacer desde la aplicación.`}
                  confirmLabel="Sí, incorporar"
                  className="flex flex-wrap items-center justify-between gap-3"
                >
                  <input type="hidden" name="parche_id" value={parcheId} />
                  <input type="hidden" name="event_id" value={e.id} />
                  <p className="min-w-0 text-base font-bold text-fg">
                    {e.name} <span className="ml-1 text-sm font-normal text-fg-2">· {eventStatusLabel(e.status)}</span>
                  </p>
                </ActionForm>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
