import type { Metadata } from "next";
import Link from "next/link";
import EventHeader from "@/components/control/EventHeader";
import MatchForm from "@/components/control/MatchForm";
import Card from "@/components/ui/Card";
import { getEventTeams, getMatches, getStages } from "@/lib/control/data";
import { loadEvent } from "../../event";

export const metadata: Metadata = { title: "Nuevo partido · Control" };

export default async function NewMatchPage({ params }: { params: Promise<{ eventSlug: string }> }) {
  const { eventSlug } = await params;
  const { supabase, event } = await loadEvent(eventSlug, "/partidos/nuevo");
  const [stages, teams, matches] = await Promise.all([getStages(supabase, event.id), getEventTeams(supabase, event.id), getMatches(supabase, event.id)]);
  const next = Math.max(0, ...matches.map((m) => m.match_number ?? 0)) + 1;

  return (
    <div className="flex flex-col gap-5 animate-fade-in-up">
      <EventHeader event={event} active="partidos" />
      <Link href={`/control/torneos/${event.slug}/partidos`} className="text-sm font-semibold text-fg-2 hover:text-cancha-text">← Partidos</Link>
      {event.locked ? (
        <Card className="p-5 text-sm text-fg-2">Este torneo es de solo lectura.</Card>
      ) : stages.length === 0 ? (
        <Card variant="dashed" className="p-5 text-sm text-fg-2">Este torneo todavía no tiene fases configuradas. Su estructura debe cargarse mediante una importación administrativa.</Card>
      ) : (
        <Card className="p-5">
          <h2 className="mb-4 text-lg font-bold text-fg">Nuevo partido</h2>
          <MatchForm event={event} stages={stages} teams={teams} suggestedNumber={next} />
        </Card>
      )}
    </div>
  );
}
