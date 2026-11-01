import type { Metadata } from "next";
import Link from "next/link";
import { EventStatusBadge } from "@/components/control/badges";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import { requirePlatformAdmin } from "@/lib/auth";
import { listControlEvents } from "@/lib/control/data";
import { syncDueMatches } from "@/lib/juego/data";
import ActionForm from "@/components/ActionForm";
import { setFeaturedEventAction, setLandingVisibleAction } from "../actions";

export const metadata: Metadata = { title: "Torneos · Control" };

export default async function ControlEventsPage() {
  const { supabase } = await requirePlatformAdmin();
  await syncDueMatches(supabase); // inicio perezoso de partidos vencidos
  const events = await listControlEvents(supabase);
  // Portada: qué torneos están autorizados y cuál es el destacado manual (None = modo automático).
  const [{ data: vis }, { data: featuredId }] = await Promise.all([
    supabase.from("events").select("id, landing_visible"),
    supabase.rpc("control_landing_featured"),
  ]);
  const visible = new Map((vis ?? []).map((v) => [v.id, v.landing_visible]));
  const canShow = (status: string) => status === "scheduled" || status === "in_progress";

  return (
    <div className="flex flex-col gap-5 animate-fade-in-up">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-fg">Torneos</h1>
          <p className="mt-1 text-sm text-fg-2">Catálogo global. Los torneos se cargan con importaciones verificadas; aquí los administras. Los borradores solo los ves tú; los parches incorporan los publicados.</p>
        </div>
      </div>

      {events.length === 0 ? (
        <Card variant="dashed" className="p-6 text-center text-sm text-fg-3">
          Todavía no hay torneos cargados. Se preparan con una importación verificada (ver README).
        </Card>
      ) : (
        <ul className="flex flex-col gap-3">
          {events.map((e) => (
            <li key={e.id}>
              <Card className="p-4 sm:p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Link href={`/control/torneos/${e.slug}`} className="min-w-0 text-base font-bold text-fg hover:text-cancha-text">
                    {e.name}
                  </Link>
                  <div className="flex flex-wrap items-center gap-2">
                    {e.locked && <Badge variant="gray">Solo lectura</Badge>}
                    <EventStatusBadge status={e.status} />
                  </div>
                </div>
                <p className="mt-1 font-mono text-xs text-fg-3">
                  {e.slug} · {e.timezone}
                </p>
                <p className="mt-2 text-sm text-fg-2">
                  {e.stageCount} fases · {e.teamCount} equipos · {e.summary.total} partidos
                  {e.summary.live > 0 && <> · {e.summary.live} en vivo</>}
                  {e.summary.official > 0 && <> · {e.summary.official} finalizados</>}
                  {e.summary.pending > 0 && <> · {e.summary.pending} con marcador pendiente (flujo anterior)</>}
                  {e.summary.imported > 0 && <> · {e.summary.imported} con resultado importado (histórico)</>}
                </p>
                {(canShow(e.status) || visible.get(e.id)) && !e.locked && (
                  <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line-subtle pt-3">
                    <span className="text-xs font-semibold text-fg-2">Portada pública:</span>
                    <ActionForm action={setLandingVisibleAction} submitLabel={visible.get(e.id) ? "Quitar de la portada" : "Mostrar en la portada"} variant="secondary" size="sm" className="flex items-center gap-2">
                      <input type="hidden" name="event_id" value={e.id} />
                      <input type="hidden" name="visible" value={visible.get(e.id) ? "false" : "true"} />
                    </ActionForm>
                    {visible.get(e.id) && (
                      featuredId === e.id ? (
                        <ActionForm action={setFeaturedEventAction} submitLabel="Quitar destacado (modo automático)" variant="ghost" size="sm" className="flex items-center gap-2">
                          <input type="hidden" name="event_id" value="" />
                        </ActionForm>
                      ) : (
                        <ActionForm action={setFeaturedEventAction} submitLabel="Destacar en la landing" variant="secondary" size="sm" className="flex items-center gap-2">
                          <input type="hidden" name="event_id" value={e.id} />
                        </ActionForm>
                      )
                    )}
                    {visible.get(e.id) && <Badge variant="green">{featuredId === e.id ? "Destacado" : "En la portada"}</Badge>}
                  </div>
                )}
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
