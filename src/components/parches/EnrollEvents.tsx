"use client";

import { useState } from "react";
import ActionForm from "@/components/ActionForm";
import Card from "@/components/ui/Card";
import { enrollEventAction } from "@/app/(privado)/parches/actions";
import type { AvailableEvent } from "@/lib/data";
import { illustrationUrl } from "@/lib/illustration";
import { eventStatusLabel } from "@/lib/parches";
import SoloInviteDialog from "./SoloInviteDialog";

// Sección para owner/admin activos: incorporar torneos publicados. La base vuelve a validar el permiso.
// `solo`: el parche tiene menos de 2 integrantes activos → no puede inscribirse (la base lo exige): se muestra el aviso
// con el enlace de invitación y no se abre la confirmación.
export default function EnrollEvents({
  parcheId,
  events,
  solo = false,
  embedded = false,
  heading = "Incorporar un torneo",
}: {
  parcheId: string;
  events: AvailableEvent[];
  solo?: boolean;
  // Dentro del bloque principal del resumen: sin encabezado propio (lo aporta el bloque) y con estado vacío sin CTA.
  embedded?: boolean;
  heading?: string;
}) {
  const [dialogFor, setDialogFor] = useState<string | null>(null);

  return (
    <section aria-labelledby={embedded ? undefined : "incorporar"}>
      {embedded ? (
        <p className="mb-3 text-xs text-fg-3">Los pronósticos no son retroactivos: solo se podrá pronosticar lo que aún no haya empezado.</p>
      ) : (
        <>
          <h2 id="incorporar" className="mb-1 text-lg font-bold text-fg">
            {heading}
          </h2>
          <p className="mb-3 text-sm text-fg-2">
            Elige un torneo publicado para que tu parche participe. Cada parche lleva sus propios pronósticos y su clasificación. Los pronósticos
            no son retroactivos: solo se podrá pronosticar lo que aún no haya empezado.
          </p>
        </>
      )}
      {events.length === 0 ? (
        <Card variant="dashed" className="p-5 text-center">
          <p className="text-sm text-fg-3">{embedded ? "Todavía no hay torneos disponibles. Cuando se publique uno, aparecerá aquí." : "No hay torneos nuevos disponibles ahora mismo."}</p>
        </Card>
      ) : (
        <ul className="flex flex-col gap-3">
          {events.map((e) => {
            const art = illustrationUrl(e.illustration_path);
            return (
              <li key={e.id}>
                <Card className="flex items-start gap-3 p-3 sm:items-center sm:gap-4 sm:p-4">
                  <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-line bg-surface-deep sm:h-24 sm:w-24">
                    {art ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={art} alt={`Ilustración de ${e.name}`} width={96} height={96} loading="lazy" decoding="async" className="h-full w-full object-cover" />
                    ) : (
                      <span aria-hidden="true" className="text-3xl">⚽</span>
                    )}
                  </div>
                  <ActionForm
                    action={enrollEventAction}
                    submitLabel="Jugar con mi parche"
                    pendingLabel="Incorporando…"
                    size="sm"
                    confirm={`¿Incorporar «${e.name}» a este parche? No se puede deshacer desde la aplicación.`}
                    confirmLabel="Sí, incorporar"
                    beforeArm={solo ? () => { setDialogFor(e.id); return false; } : undefined}
                                    className="flex min-w-0 flex-1 flex-col gap-2 [&>button]:self-start"
                  >
                    <input type="hidden" name="parche_id" value={parcheId} />
                    <input type="hidden" name="event_id" value={e.id} />
                    <div className="min-w-0">
                      <p className="break-words text-base font-bold leading-snug text-fg">{e.name}</p>
                      <p className="mt-0.5 text-sm text-fg-2">{eventStatusLabel(e.status)}</p>
                    </div>
                  </ActionForm>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
      {solo && (
        <SoloInviteDialog open={dialogFor !== null} onClose={() => setDialogFor(null)} />
      )}
    </section>
  );
}
