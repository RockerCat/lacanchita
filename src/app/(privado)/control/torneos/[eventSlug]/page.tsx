import type { Metadata } from "next";
import ActionForm from "@/components/ActionForm";
import IllustrationPanel from "@/components/control/IllustrationPanel";
import { TextAreaField, TextField } from "@/components/control/inputs";
import EventHeader from "@/components/control/EventHeader";
import Card from "@/components/ui/Card";
import { getEventTeams, getMatches, getPendingResults, getPublishIssues, getStages } from "@/lib/control/data";
import { PUBLISH_ISSUE_LABELS } from "@/lib/control/errors";
import { summarizeResults } from "@/lib/control/results";
import { commonTimeZones, utcToLocalInput } from "@/lib/control/time";
import { publishEventAction, setEventStatusAction, updateEventAction, updateEventPromoAction } from "../../actions";
import { loadEvent } from "./event";

export const metadata: Metadata = { title: "Torneo · Control" };

function StatusForm({ eventId, status, label, confirm, variant = "secondary" }: {
  eventId: string; status: string; label: string; confirm?: string; variant?: "primary" | "secondary" | "ghost";
}) {
  return (
    <ActionForm action={setEventStatusAction} submitLabel={label} variant={variant} size="sm" confirm={confirm} confirmLabel={`Sí, ${label.toLowerCase()}`}>
      <input type="hidden" name="event_id" value={eventId} />
      <input type="hidden" name="status" value={status} />
    </ActionForm>
  );
}

export default async function EventSummaryPage({ params }: { params: Promise<{ eventSlug: string }> }) {
  const { eventSlug } = await params;
  const { supabase, event } = await loadEvent(eventSlug, "");
  const [stages, teams, matches, drafts, issues] = await Promise.all([
    getStages(supabase, event.id),
    getEventTeams(supabase, event.id),
    getMatches(supabase, event.id),
    getPendingResults(supabase, event.id),
    event.status === "draft" ? getPublishIssues(supabase, event.id) : Promise.resolve([] as string[]),
  ]);
  const summary = summarizeResults(matches, drafts);
  const editable = !event.locked;

  return (
    <div className="flex flex-col gap-6 animate-fade-in-up">
      <EventHeader event={event} active="resumen" />

      <section aria-labelledby="estado" className="grid gap-4 md:grid-cols-2">
        <Card className="p-5">
          <h2 id="estado" className="text-base font-bold text-fg">Contenido</h2>
          <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
            <div><dt className="text-fg-3">Fases</dt><dd className="font-bold text-fg">{stages.length}</dd></div>
            <div><dt className="text-fg-3">Equipos</dt><dd className="font-bold text-fg">{teams.length}</dd></div>
            <div><dt className="text-fg-3">Partidos</dt><dd className="font-bold text-fg">{summary.total}</dd></div>
            <div><dt className="text-fg-3">En vivo</dt><dd className="font-bold text-fg">{summary.live}</dd></div>
            <div><dt className="text-fg-3">Finalizados</dt><dd className="font-bold text-fg">{summary.official}</dd></div>
            <div><dt className="text-fg-3">Sin jugar / otros</dt><dd className="font-bold text-fg">{summary.none}</dd></div>
            {summary.pending > 0 && <div><dt className="text-fg-3">Pendientes (flujo anterior)</dt><dd className="font-bold text-fg">{summary.pending}</dd></div>}
            {summary.imported > 0 && <div><dt className="text-fg-3">Importados (históricos)</dt><dd className="font-bold text-fg">{summary.imported}</dd></div>}
          </dl>
          <p className="mt-4 text-xs text-fg-3">
            Finalizar un partido calcula los puntos de todos los parches inscritos (motor de la Fase 3.1); mientras está En vivo no se puntúa.
          </p>
        </Card>

        <Card className="p-5">
          <h2 className="text-base font-bold text-fg">Publicación y estado</h2>
          {event.status === "draft" && (
            <div className="mt-3 flex flex-col gap-3">
              <p className="text-sm text-fg-2">Borrador: solo tú lo ves. Para publicarlo debe estar completo.</p>
              {issues.length === 0 ? (
                <p className="rounded-xl border border-cancha/25 bg-cancha/[0.08] px-3 py-2 text-sm text-cancha-text">✓ Cumple los requisitos mínimos para publicarse.</p>
              ) : (
                <ul className="flex flex-col gap-1.5 rounded-xl border border-gold/25 bg-gold/[0.08] px-3 py-2.5 text-sm text-fg-2">
                  {issues.map((i) => (
                    <li key={i}>• {PUBLISH_ISSUE_LABELS[i] ?? i}</li>
                  ))}
                </ul>
              )}
              {editable && issues.length === 0 && (
                <ActionForm
                  action={publishEventAction}
                  submitLabel="Publicar torneo"
                  pendingLabel="Publicando…"
                  confirm="Al publicar, los dueños y administradores de cualquier parche podrán incorporar este torneo. ¿Publicar ahora?"
                  confirmLabel="Sí, publicar"
                >
                  <input type="hidden" name="event_id" value={event.id} />
                </ActionForm>
              )}
            </div>
          )}
          {editable && event.status === "scheduled" && (
            <div className="mt-3 flex flex-col gap-3">
              <p className="text-sm text-fg-2">Publicado: los parches pueden incorporarlo.</p>
              <StatusForm eventId={event.id} status="in_progress" label="Marcar en curso" />
              <StatusForm eventId={event.id} status="draft" label="Volver a borrador" confirm="Solo es posible si ningún parche lo ha incorporado. ¿Volver a borrador?" />
              <StatusForm eventId={event.id} status="cancelled" label="Cancelar torneo" confirm="Un torneo cancelado ya no se puede modificar ni incorporar. ¿Cancelarlo?" />
            </div>
          )}
          {editable && event.status === "in_progress" && (
            <div className="mt-3 flex flex-col gap-3">
              <p className="text-sm text-fg-2">En curso. Para finalizarlo, todos los partidos (salvo los cancelados) deben estar finalizados.</p>
              <StatusForm eventId={event.id} status="finished" label="Finalizar torneo" confirm="¿Marcar el torneo como finalizado?" />
              <StatusForm eventId={event.id} status="cancelled" label="Cancelar torneo" confirm="Un torneo cancelado ya no se puede modificar ni incorporar. ¿Cancelarlo?" />
            </div>
          )}
          {editable && ["finished", "cancelled"].includes(event.status) && (
            <p className="mt-3 text-sm text-fg-2">
              {event.status === "finished" ? "Torneo finalizado. El cierre definitivo todavía no está disponible en Control." : "Torneo cancelado."}
            </p>
          )}
        </Card>
      </section>

      <Card className="p-5">
        <h2 className="text-base font-bold text-fg">Datos del torneo</h2>
        {editable ? (
          <div className="mt-4 max-w-lg">
            <ActionForm action={updateEventAction} submitLabel="Guardar datos">
              <input type="hidden" name="event_id" value={event.id} />
              <TextField name="name" label="Nombre" required minLength={2} maxLength={120} defaultValue={event.name} />
              <TextField
                name="slug"
                label="Identificador (dirección web)"
                required
                maxLength={60}
                pattern="[a-z0-9]+(-[a-z0-9]+)*"
                data-pattern-message="Usa solo minúsculas, números y guiones (por ejemplo copa-2027)."
                defaultValue={event.slug}
                readOnly
                hint="Define la dirección web del torneo y no se cambia desde la consola, para no romper enlaces. Los enlaces antiguos con UUID siguen funcionando."
                className="[&_input]:font-mono"
              />
              <TextField name="timezone" label="Zona horaria" required list="zones" defaultValue={event.timezone} hint="Cambiarla no mueve los partidos (se guardan en UTC); cambia cómo se capturan y se muestran.">
                <datalist id="zones">
                  {commonTimeZones().map((z) => (
                    <option key={z} value={z} />
                  ))}
                </datalist>
              </TextField>
              <TextField name="official_end_at" type="datetime-local" label={`Fin oficial (hora de ${event.timezone})`} hint="Opcional. Solo si hay una fuente oficial de la fecha de finalización." defaultValue={utcToLocalInput(event.official_end_at, event.timezone)} />
            </ActionForm>
          </div>
        ) : (
          <p className="mt-2 text-sm text-fg-2">Este torneo es de solo lectura.</p>
        )}
      </Card>

      <IllustrationPanel eventId={event.id} eventName={event.name} path={event.illustration_path} editable={editable} />

      {editable && (
        <Card className="p-5">
          <h2 className="text-base font-bold text-fg">Promoción en portada</h2>
          <p className="mt-1 max-w-lg text-sm text-fg-2">Para anunciar el torneo antes de tener calendario. La fecha es solo un anuncio tentativo: no es la de ningún partido y se ignora cuando se cargan los partidos oficiales.</p>
          <div className="mt-4 max-w-lg">
            <ActionForm action={updateEventPromoAction} submitLabel="Guardar promoción">
              <input type="hidden" name="event_id" value={event.id} />
              <TextField name="announced_start_date" type="date" label="Inicio previsto (fecha, sin hora)" hint="Opcional. Se muestra como «Inicio previsto» con el aviso «Sujeto a programación oficial»." defaultValue={event.announced_start_date ?? ""} />
              <TextAreaField name="landing_blurb" label="Texto breve de portada" maxLength={280} defaultValue={event.landing_blurb ?? ""} hint="Opcional, hasta 280 caracteres. Sin marcas de terceros." />
            </ActionForm>
          </div>
        </Card>
      )}
    </div>
  );
}
