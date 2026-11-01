import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import EventHeader from "@/components/control/EventHeader";
import MatchForm from "@/components/control/MatchForm";
import Card from "@/components/ui/Card";
import { getEventTeams, getMatch, getPendingResults, getStages } from "@/lib/control/data";
import { loadEvent } from "../../event";

export const metadata: Metadata = { title: "Editar partido · Control" };

export default async function EditMatchPage({ params }: { params: Promise<{ eventSlug: string; matchId: string }> }) {
  const { eventSlug, matchId } = await params;
  const { supabase, event } = await loadEvent(eventSlug, `/partidos/${matchId}`);
  const match = await getMatch(supabase, event.id, matchId);
  if (!match) notFound();
  const [stages, teams, drafts] = await Promise.all([getStages(supabase, event.id), getEventTeams(supabase, event.id), getPendingResults(supabase, event.id)]);
  const hasPending = drafts.some((d) => d.match_id === match.id);

  return (
    <div className="flex flex-col gap-5 animate-fade-in-up">
      <EventHeader event={event} active="partidos" />
      <Link href={`/control/torneos/${event.slug}/partidos`} className="text-sm font-semibold text-fg-2 hover:text-cancha-text">← Partidos</Link>
      {event.locked ? (
        <Card className="p-5 text-sm text-fg-2">Este torneo es de solo lectura.</Card>
      ) : match.result_confirmed_at ? (
        <Card className="p-5 text-sm text-fg-2">
          Este partido ya está finalizado y su programación no se edita desde aquí. Para cambiar el marcador, usa{" "}
          <Link href={`/control/torneos/${event.slug}/resultados`} className="font-semibold text-cancha-text hover:underline">Resultados → Corregir resultado</Link>{" "}
          (requiere un motivo y recalcula los puntos).
        </Card>
      ) : (
        <Card className="p-5">
          <h2 className="mb-4 text-lg font-bold text-fg">Editar partido {match.match_number ? `#${match.match_number}` : ""}</h2>
          <MatchForm event={event} stages={stages} teams={teams} match={match} hasPending={hasPending} />
        </Card>
      )}
    </div>
  );
}
