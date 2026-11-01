import type { Metadata } from "next";
import Link from "next/link";
import { sideOf } from "@/components/control/MatchCard";
import MatchBoard from "@/components/control/MatchBoard";
import type { RowData } from "@/components/control/MatchRow";
import { inputClass } from "@/components/control/inputs";
import EventHeader from "@/components/control/EventHeader";
import Card from "@/components/ui/Card";
import { buttonClasses } from "@/components/ui/button";
import { getEventTeams, getMatches, getPendingResults, getStages } from "@/lib/control/data";
import { MATCH_STATUS_LABELS, resultState } from "@/lib/control/results";
import { dayKey } from "@/lib/control/board";
import { localToUtc } from "@/lib/control/time";
import BracketPanel from "@/components/control/BracketPanel";
import { loadCopaModel } from "@/lib/copa/data";
import { resolveCopa } from "@/lib/copa/format";
import { planAdvance } from "@/lib/copa/plan";
import { loadEvent } from "../event";

export const metadata: Metadata = { title: "Partidos · Control" };

type SP = { stage?: string; status?: string; result?: string; from?: string; to?: string };

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

export default async function MatchesPage({ params, searchParams }: { params: Promise<{ eventSlug: string }>; searchParams: Promise<SP> }) {
  const { eventSlug } = await params;
  const sp = await searchParams;
  const { supabase, event } = await loadEvent(eventSlug, "/partidos");

  // Los filtros de fecha son días de la zona del torneo: se convierten a instantes UTC.
  const dayStart = (d?: string) => (d && DAY_RE.test(d) ? localToUtc(`${d}T00:00`, event.timezone) : null);
  const from = dayStart(sp.from);
  const toDay = sp.to && DAY_RE.test(sp.to) ? new Date(Date.parse(`${sp.to}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10) : null;
  const to = toDay ? dayStart(toDay) : null;

  const [stages, teams, allMatches, drafts] = await Promise.all([
    getStages(supabase, event.id),
    getEventTeams(supabase, event.id),
    getMatches(supabase, event.id, {
      stageId: sp.stage,
      status: sp.status && sp.status in MATCH_STATUS_LABELS ? sp.status : undefined,
      from: from?.ok ? from.iso : undefined,
      to: to?.ok ? to.iso : undefined,
    }),
    getPendingResults(supabase, event.id),
  ]);
  // Cuadro eliminatorio (solo torneos operativos con eliminatorias): cupos que ya determinan resultados oficiales.
  const copaModel = event.locked ? null : await loadCopaModel(supabase, event.id);
  const bracketPlan = copaModel && copaModel.kind !== "none" ? planAdvance(copaModel, resolveCopa(copaModel)) : null;
  const draftMap = new Map(drafts.map((d) => [d.match_id, d]));
  // El filtro por resultado usa el borrador privado (el marcador pendiente no está en matches).
  const matches = sp.result ? allMatches.filter((m) => resultState(m, draftMap.get(m.id)) === sp.result) : allMatches;
  const teamMap = new Map(teams.map((t) => [t.team.id, t.team]));
  const stageMap = new Map(stages.map((s) => [s.id, s]));
  const editable = !event.locked;
  const rows: RowData[] = matches.map((m) => {
    const draft = draftMap.get(m.id);
    return {
      id: m.id,
      eventId: m.event_id,
      startsAt: m.starts_at,
      status: m.status,
      state: resultState(m, draft),
      homeScore: m.home_score,
      awayScore: m.away_score,
      winnerSide: m.winner_side,
      revision: m.result_revision,
      stageName: stageMap.get(m.stage_id)?.name,
      isKnockout: Boolean(stageMap.get(m.stage_id)?.is_knockout),
      matchNumber: m.match_number,
      groupCode: m.group_code,
      roundLabel: m.round_label,
      home: sideOf(m.home_team_id, m.home_placeholder, teamMap),
      away: sideOf(m.away_team_id, m.away_placeholder, teamMap),
      playable: Boolean(m.home_team_id && m.away_team_id) && !["postponed", "cancelled"].includes(m.status),
      pending: draft ? { home: draft.home_score, away: draft.away_score } : null,
    };
  });

  return (
    <div className="flex flex-col gap-5 animate-fade-in-up">
      <EventHeader event={event} active="partidos" />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-bold text-fg">Partidos ({matches.length})</h2>
        {editable && (
          <Link href={`/control/torneos/${event.slug}/partidos/nuevo`} className={buttonClasses({ size: "sm" })}>
            + Nuevo partido
          </Link>
        )}
      </div>

      <details className="rounded-xl border border-line bg-surface px-4 py-3" open={Boolean(sp.stage || sp.status || sp.result || sp.from || sp.to)}>
        <summary className="cursor-pointer text-sm font-semibold text-fg-2">Más filtros (fase, estado, fechas)</summary>
      <form method="get" className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-6">
        <select name="stage" defaultValue={sp.stage ?? ""} aria-label="Fase" className={inputClass}>
          <option value="">Todas las fases</option>
          {stages.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
        <select name="status" defaultValue={sp.status ?? ""} aria-label="Estado" className={inputClass}>
          <option value="">Todos los estados</option>
          {Object.entries(MATCH_STATUS_LABELS).map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </select>
        <select name="result" defaultValue={sp.result ?? ""} aria-label="Resultado" className={inputClass}>
          <option value="">Cualquier resultado</option>
          <option value="none">Sin resultado</option>
          <option value="live">En vivo</option>
          <option value="official">Finalizado</option>
          <option value="pending">Pendiente (flujo anterior)</option>
          <option value="imported">Importado (histórico)</option>
        </select>
        <input type="date" name="from" defaultValue={sp.from ?? ""} aria-label="Desde" className={inputClass} />
        <input type="date" name="to" defaultValue={sp.to ?? ""} aria-label="Hasta" className={inputClass} />
        <button type="submit" className={buttonClasses({ variant: "secondary", size: "md" })}>Filtrar</button>
      </form>
      </details>

      {copaModel && bracketPlan && <BracketPanel eventId={event.id} kind={copaModel.kind} plan={bracketPlan} />}

      {matches.length === 0 ? (
        <Card variant="dashed" className="p-6 text-center text-sm text-fg-3">No hay partidos con esos filtros.</Card>
      ) : (
        <MatchBoard rows={rows} timezone={event.timezone} todayKey={dayKey(new Date().toISOString(), event.timezone)} base={`/control/torneos/${event.slug}`} editable={editable} />
      )}
    </div>
  );
}
