import type { Metadata } from "next";
import EventHeader from "@/components/control/EventHeader";
import Card from "@/components/ui/Card";
import { getAudit } from "@/lib/control/data";
import { formatInZone } from "@/lib/control/time";
import { loadEvent } from "../event";

export const metadata: Metadata = { title: "Actividad · Control" };

const ACTION_LABELS: Record<string, string> = {
  event_created: "Torneo creado",
  event_updated: "Datos del torneo editados",
  event_published: "Torneo publicado",
  event_status_changed: "Estado del torneo cambiado",
  stage_created: "Fase creada",
  stage_updated: "Fase editada",
  team_created: "Equipo creado",
  team_updated: "Equipo editado",
  event_team_added: "Equipo asociado al torneo",
  event_team_updated: "Grupo de equipo cambiado",
  event_team_removed: "Equipo quitado del torneo",
  match_created: "Partido creado",
  match_updated: "Partido editado",
  result_recorded: "Marcador registrado (pendiente)",
  result_pending_edited: "Marcador pendiente editado",
  result_confirmed: "Resultado confirmado (oficial)",
  result_corrected: "Resultado oficial corregido",
  result_discarded: "Marcador pendiente descartado",
};

const brief = (v: unknown) => (v === null || v === undefined ? "—" : JSON.stringify(v));

export default async function ActivityPage({ params }: { params: Promise<{ eventSlug: string }> }) {
  const { eventSlug } = await params;
  const { supabase, user, event } = await loadEvent(eventSlug, "/actividad");
  const rows = await getAudit(supabase, event.id);

  return (
    <div className="flex flex-col gap-5 animate-fade-in-up">
      <EventHeader event={event} active="actividad" />
      <p className="text-sm text-fg-2">Registro inmutable de las operaciones de Control sobre este torneo (últimas {rows.length}). Los equipos del catálogo global no pertenecen a un torneo y no aparecen aquí.</p>
      {rows.length === 0 ? (
        <Card variant="dashed" className="p-6 text-center text-sm text-fg-3">Todavía no hay actividad.</Card>
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((r) => (
            <li key={r.id}>
              <Card className="p-3 sm:p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-bold text-fg">{ACTION_LABELS[r.action] ?? r.action}</p>
                  <p className="text-xs text-fg-3">
                    {formatInZone(r.created_at, event.timezone)} · {r.actor_id === user.id ? "tú" : r.actor_id ? `usuario ${r.actor_id.slice(0, 8)}` : "sistema"}
                  </p>
                </div>
                {r.reason && <p className="mt-1 text-sm text-fg-2">Motivo: {r.reason}</p>}
                {(r.old_values || r.new_values) && (
                  <details className="mt-2">
                    <summary className="cursor-pointer text-xs font-semibold text-fg-3 hover:text-fg-2">Antes y después</summary>
                    <div className="mt-2 grid gap-2 text-xs text-fg-2 sm:grid-cols-2">
                      <pre className="overflow-x-auto whitespace-pre-wrap break-words rounded-lg bg-surface-deep p-2 font-mono">Antes: {brief(r.old_values)}</pre>
                      <pre className="overflow-x-auto whitespace-pre-wrap break-words rounded-lg bg-surface-deep p-2 font-mono">Después: {brief(r.new_values)}</pre>
                    </div>
                  </details>
                )}
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
