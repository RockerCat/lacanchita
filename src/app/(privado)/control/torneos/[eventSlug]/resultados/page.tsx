import type { Metadata } from "next";
import Link from "next/link";
import EventHeader from "@/components/control/EventHeader";
import ResultCard from "@/components/control/ResultCard";
import { sideOf } from "@/components/control/MatchCard";
import Card from "@/components/ui/Card";
import { getEventTeams, getMatches, getPendingResults, getStages, type Match } from "@/lib/control/data";
import { resultState, summarizeResults, type PendingDraft, type ResultState } from "@/lib/control/results";
import { reconcileEventNews } from "@/lib/news/data";
import { loadEvent } from "../event";

export const metadata: Metadata = { title: "Resultados · Control" };

type View = { key: string; label: string; test: (state: ResultState, m: Match) => boolean; countKey: (s: ReturnType<typeof summarizeResults>, others: number) => number };
const VIEWS: View[] = [
  { key: "en-vivo", label: "En vivo", test: (st) => st === "live", countKey: (s) => s.live },
  { key: "por-jugar", label: "Por jugar", test: (st, m) => st === "none" && m.status === "scheduled", countKey: (s, o) => s.none - o },
  { key: "finalizados", label: "Finalizados", test: (st) => st === "official", countKey: (s) => s.official },
  { key: "otros", label: "Aplazados y cancelados", test: (st, m) => st === "none" && (m.status === "postponed" || m.status === "cancelled"), countKey: (_s, o) => o },
  { key: "pendientes", label: "Pendientes (flujo anterior)", test: (st) => st === "pending", countKey: (s) => s.pending },
  { key: "importados", label: "Importados (históricos)", test: (st) => st === "imported", countKey: (s) => s.imported },
];

export default async function ResultsPage({ params, searchParams }: { params: Promise<{ eventSlug: string }>; searchParams: Promise<{ ver?: string }> }) {
  const { eventSlug } = await params;
  const { ver } = await searchParams;
  const { supabase, event } = await loadEvent(eventSlug, "/resultados");
  // Reintento idempotente de noticias de partidos finalizados cuya publicación falló antes (solo superadministrador).
  await reconcileEventNews(supabase, event.id);
  const [stages, teams, matches, drafts] = await Promise.all([getStages(supabase, event.id), getEventTeams(supabase, event.id), getMatches(supabase, event.id), getPendingResults(supabase, event.id)]);
  const teamMap = new Map(teams.map((t) => [t.team.id, t.team]));
  const stageMap = new Map(stages.map((s) => [s.id, s]));
  const draftMap = new Map<string, PendingDraft>(drafts.map((d) => [d.match_id, d]));
  const summary = summarizeResults(matches, drafts);
  const others = matches.filter((m) => resultState(m, draftMap.get(m.id)) === "none" && (m.status === "postponed" || m.status === "cancelled")).length;
  // Solo se muestran las pestañas con partidos (salvo las dos principales).
  const visible = VIEWS.filter((v) => ["en-vivo", "por-jugar", "finalizados"].includes(v.key) || v.countKey(summary, others) > 0);
  const defaultView = summary.live > 0 ? "en-vivo" : summary.pending > 0 ? "pendientes" : summary.none - others > 0 ? "por-jugar" : summary.official > 0 ? "finalizados" : visible[0].key;
  const view = visible.find((v) => v.key === ver) ?? visible.find((v) => v.key === defaultView) ?? visible[0];
  const shown = matches.filter((m) => view.test(resultState(m, draftMap.get(m.id)), m));

  return (
    <div className="flex flex-col gap-5 animate-fade-in-up">
      <EventHeader event={event} active="resultados" />

      <p className="rounded-xl border border-line bg-surface px-4 py-3 text-sm text-fg-2">
        <strong className="text-fg">Cada guardado se ve al instante.</strong> Un partido programado pasa solo a «En vivo» al llegar su hora (al abrir esta
        consola o una pantalla de partidos). Guarda el marcador las veces que haga falta; <em>Finalizado</em> cierra el partido y calcula los puntos de todos los parches.
        Para aplazar, reprogramar o cancelar usa <Link href={`/control/torneos/${event.slug}/partidos`} className="font-semibold text-cancha-text hover:underline">Partidos</Link>.
      </p>

      <nav aria-label="Estado del partido" className="flex flex-wrap gap-1 rounded-xl border border-line bg-surface p-1">
        {visible.map((v) => (
          <Link key={v.key} href={`/control/torneos/${event.slug}/resultados?ver=${v.key}`} aria-current={v.key === view.key ? "page" : undefined}
            className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${v.key === view.key ? "bg-cancha/15 text-cancha-text" : "text-fg-2 hover:bg-surface-raised hover:text-fg"}`}>
            {v.label} ({v.countKey(summary, others)})
          </Link>
        ))}
      </nav>

      {shown.length === 0 ? (
        <Card variant="dashed" className="p-6 text-center text-sm text-fg-3">No hay partidos en esta lista.</Card>
      ) : (
        <ul className="flex flex-col gap-3">
          {shown.map((m) => (
            <li key={m.id}>
              <ResultCard
                match={m}
                stage={stageMap.get(m.stage_id)}
                draft={draftMap.get(m.id)}
                home={sideOf(m.home_team_id, m.home_placeholder, teamMap)}
                away={sideOf(m.away_team_id, m.away_placeholder, teamMap)}
                eventName={event.name}
                eventSlug={event.slug}
                timezone={event.timezone}
                editable={!event.locked}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
