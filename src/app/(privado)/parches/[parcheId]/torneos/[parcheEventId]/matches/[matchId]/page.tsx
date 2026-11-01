import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getMissingPredictions } from "@/lib/juego/data";
import { requireGame, getMatchesWithPredictions, getParcheLeaderboard } from "@/lib/juego/queries";
import { getBase, getTz } from "@/lib/juego/request-base";
import type { LeaderboardEntry } from "@/lib/juego/groups";
import { reasonLabel, formatKickoff, formatPredictionTimestamp, matchTeamName, matchTeamFlag, simulatePoints, type Match, type ScoringResult, type Team } from "@/lib/juego/matches";
import { cn } from "@/lib/juego/utils";
import MatchDetailPoller from "@/components/juego/MatchDetailPoller";
import MatchDetailHeaderWrapper from "@/components/juego/dashboard/MatchDetailHeaderWrapper";
import MyPredictionCard from "@/components/juego/dashboard/MyPredictionCard";
import { PredictionEditingProvider } from "@/components/juego/PredictionEditingContext";

export type MatchPredictionEntry = {
  user_id: string;
  display_name: string;
  pred_home: number;
  pred_away: number;
  points: number;
  points_reason: string | null;
  predicted_at: string;
};
export type MissingPredictionEntry = { user_id: string; display_name: string };

export default async function MatchDetailPage({ params }: { params: Promise<{ parcheId: string; parcheEventId: string; matchId: string }> }) {
  const { matchId } = await params;
  const ctx = await requireGame(params);
  if (ctx.historical) redirect(`${ctx.base}/historial`);
  const user = ctx.user;

  // La sincronización perezosa (scheduled → live) corre dentro de getMatchesWithPredictions.
  const allMatches = await getMatchesWithPredictions(ctx);
  const match = allMatches.find((m) => m.id === matchId);
  if (!match) redirect(ctx.base);
  const myPrediction = match.prediction;

  const isLive = match.status === "live";
  const isFinished = match.status === "finished";
  const hasScore = match.home_score !== null && match.away_score !== null;

  // Los pronósticos ajenos solo los entrega la base cuando la regla de visibilidad del parche lo permite
  // (`predictions_hidden` antes del inicio, durante un aplazamiento, etc.): nunca se filtran en la interfaz.
  const { supabase } = await getCurrentUser();
  const predsRes = await supabase.rpc("get_match_predictions", { p_parche_event_id: ctx.parcheEventId, p_match_id: matchId });
  const revealed = !predsRes.error;
  const allPreds: MatchPredictionEntry[] = (predsRes.data ?? []).map((r) => ({
    user_id: r.user_id, display_name: r.display_name, pred_home: r.pred_home, pred_away: r.pred_away,
    points: r.points, points_reason: reasonLabel(r.points_reason), predicted_at: r.predicted_at,
  }));
  const [missingRaw, rawLeaderboard] = await Promise.all([
    getMissingPredictions(supabase, ctx.parcheEventId, matchId),
    isLive && hasScore ? getParcheLeaderboard(ctx) : Promise.resolve([] as LeaderboardEntry[]),
  ]);
  const missingPreds: MissingPredictionEntry[] = missingRaw.map((r) => ({ user_id: r.user_id, display_name: r.display_name }));

  // ── Derived data ──────────────────────────────────────────────────

  // For knockout draws: which team advanced via penalties (for display only — not scoring).
  const advancingTeam: Team | null =
    match.is_knockout && match.advancing_team_id
      ? match.advancing_team_id === match.home_team_id
        ? match.home_team
        : match.advancing_team_id === match.away_team_id
          ? match.away_team
          : null
      : null;

  // Simulated/actual points per prediction
  type RichPred = MatchPredictionEntry & { sim: ScoringResult };
  const richPreds: RichPred[] = revealed && hasScore
    ? allPreds.map((p) => ({
        ...p,
        sim: isFinished && p.points_reason
          ? {
              points: p.points,
              reason: p.points_reason as ScoringResult["reason"],
            }
          : simulatePoints(
              p.pred_home, p.pred_away,
              match.home_score!, match.away_score!,
              match.stage_points
            ),
      }))
    : allPreds.map((p) => ({ ...p, sim: { points: 0, reason: "Sin puntos" as const } }));

  // Distribution
  const dist   = { home: 0, draw: 0, away: 0 };
  for (const p of allPreds) {
    if      (p.pred_home > p.pred_away) dist.home++;
    else if (p.pred_home < p.pred_away) dist.away++;
    else                                dist.draw++;
  }
  const distTotal = allPreds.length;
  const pct = (n: number) => distTotal > 0 ? Math.round((n / distTotal) * 100) : 0;

  // Top scores
  const scoreMap = new Map<string, number>();
  for (const p of allPreds) {
    const k = `${p.pred_home}-${p.pred_away}`;
    scoreMap.set(k, (scoreMap.get(k) ?? 0) + 1);
  }
  const topScores = [...scoreMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  // Projected full leaderboard for live matches
  const projectedLeaderboard: ProjectedEntry[] = (() => {
    if (!isLive || !hasScore || rawLeaderboard.length === 0) return [];

    const predByUserId = new Map(richPreds.map((p) => [p.user_id, p]));

    const withProjected = rawLeaderboard.map((entry) => {
      const pred   = predByUserId.get(entry.user_id);
      const simPts = pred?.sim.points ?? 0;
      return {
        user_id:         entry.user_id,
        display_name:    entry.display_name,
        current_rank:    entry.rank,
        current_points:  entry.total_points,
        sim_points:      simPts,
        projected_total: entry.total_points + simPts,
        projected_rank:  0,
        pred_home:       pred?.pred_home  ?? null,
        pred_away:       pred?.pred_away  ?? null,
        sim_reason:      (pred?.sim.reason ?? null) as ScoringResult["reason"] | null,
      };
    });

    // Sort by projected total desc, name asc for stability
    withProjected.sort((a, b) =>
      b.projected_total - a.projected_total ||
      a.display_name.localeCompare(b.display_name)
    );

    // Assign ranks: same logic as the real leaderboard (count users with MORE points)
    return withProjected.map((e) => ({
      ...e,
      projected_rank: withProjected.filter((o) => o.projected_total > e.projected_total).length + 1,
    }));
  })();

  // My situation
  const mySim = myPrediction && hasScore
    ? simulatePoints(
        myPrediction.home_score, myPrediction.away_score,
        match.home_score!, match.away_score!,
        match.stage_points
      )
    : null;

  // Community insights
  const insights = buildInsights(allPreds, richPreds, match, isFinished);

  // ── Render ────────────────────────────────────────────────────────
  return (
    <PredictionEditingProvider>
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
      <MatchDetailPoller startsAt={match.starts_at} status={match.status} />

      {/* Back */}
      <a
        href={getBase()}
        className="text-xs text-[#64748b] hover:text-[#94a3b8] transition-colors inline-flex items-center gap-1"
      >
        ← Inicio
      </a>

      {/* ── Match header ──────────────────────────────────────────── */}
      <MatchDetailHeaderWrapper
        homeScore={match.home_score}
        awayScore={match.away_score}
        isLive={isLive}
      >
        <MatchHeader match={match} advancingTeam={advancingTeam} />
      </MatchDetailHeaderWrapper>

      {/* ── Mi Pronóstico ─────────────────────────────────────────── */}
      <MyPredictionCard
        matchId={match.id}
        myPrediction={myPrediction}
        mySim={mySim}
        isScheduled={match.status === "scheduled"}
        isLive={isLive}
        isFinished={isFinished}
        hasScore={hasScore}
        homeScore={match.home_score}
        awayScore={match.away_score}
      />

      {/* ── Pre-kickoff message ────────────────────────────────────── */}
      {!revealed && (
        <div className="bg-[#11111c] border border-[#1e1e35] rounded-2xl p-5 text-center">
          <p className="text-sm text-[#64748b]">
            Los pronósticos de los demás se mostrarán cuando comience el partido.
          </p>
        </div>
      )}

      {revealed && (
        <>
          {/* ── Tabla proyectada (live only) ──────────────────────── */}
          {isLive && hasScore && projectedLeaderboard.length > 0 && (
            <section>
              <SectionHeader title="Así quedaría la tabla con este resultado... (por ahora)" />
              <ProjectedLeaderboardCard entries={projectedLeaderboard} currentUserId={user.id} />
            </section>
          )}

          {/* ── Distribución de pronósticos ───────────────────────── */}
          {distTotal > 0 && (
            <section>
              <SectionHeader title="Distribución de pronósticos" />
              <DistributionCard
                dist={dist}
                total={distTotal}
                pct={pct}
                homeName={match.home_team?.name ?? match.home_placeholder ?? "Local"}
                awayName={match.away_team?.name ?? match.away_placeholder ?? "Visitante"}
              />
            </section>
          )}

          {/* ── Marcadores más repetidos ──────────────────────────── */}
          {topScores.length > 0 && (
            <section>
              <SectionHeader title="Marcadores más populares" />
              <TopScoresCard topScores={topScores} total={distTotal} />
            </section>
          )}

          {/* ── Tabla de pronósticos ──────────────────────────────── */}
          {richPreds.length > 0 && (
            <section>
              <SectionHeader
                title={isLive ? "Pronósticos (simulado)" : "Tabla de pronósticos"}
              />
              <PredictionsTable
                preds={richPreds}
                currentUserId={user.id}
                isLive={isLive}
                isFinished={isFinished}
                hasScore={hasScore}
              />
            </section>
          )}

        </>
      )}

      {/* ── Sin pronóstico ───────────────────────────────────────────
          Shown regardless of match status (scheduled / live / finished) —
          participation transparency, not prediction content. */}
      {missingPreds.length > 0 && (
        <section>
          <SectionHeader title={`Sin pronóstico (${missingPreds.length})`} />
          <MissingPredictionsCard entries={missingPreds} />
        </section>
      )}

      {/* ── Comunidad ─────────────────────────────────────────────── */}
      {revealed && insights.length > 0 && (
        <section>
          <SectionHeader title="Comunidad" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {insights.map((ins, i) => (
              <InsightCard key={i} insight={ins} />
            ))}
          </div>
        </section>
      )}

    </div>
    </PredictionEditingProvider>
  );
}

// ── Insight computation ───────────────────────────────────────────────

type Insight =
  | { type: "popular";       score: string; count: number }
  | { type: "unanimous";     winner: string }
  | { type: "lone_believer"; name: string; team: string }
  | { type: "nobody_exact" }
  | { type: "nobody_right" };

function buildInsights(
  preds: MatchPredictionEntry[],
  rich:  (MatchPredictionEntry & { sim: ScoringResult })[],
  match: Match,
  isFinished: boolean
): Insight[] {
  if (preds.length < 2) return [];
  const insights: Insight[] = [];

  // Most popular score (≥ 2 people)
  const scoreMap = new Map<string, number>();
  for (const p of preds) {
    const k = `${p.pred_home}-${p.pred_away}`;
    scoreMap.set(k, (scoreMap.get(k) ?? 0) + 1);
  }
  const [[topScore, topCount]] = [...scoreMap.entries()].sort((a, b) => b[1] - a[1]);
  if (topCount >= 2) {
    insights.push({ type: "popular", score: topScore, count: topCount });
  }

  // All predictions for same winner/result
  const results = preds.map(p => Math.sign(p.pred_home - p.pred_away));
  const allSame  = results.every(r => r === results[0]);
  if (allSame) {
    const r0 = results[0];
    const winner =
      r0 >  0 ? (match.home_team?.name ?? match.home_placeholder ?? "Local") :
      r0 <  0 ? (match.away_team?.name ?? match.away_placeholder ?? "Visitante") :
      "el empate";
    insights.push({ type: "unanimous", winner });
  }

  // One lone believer (only when ≥ 3 predictions)
  if (!allSame && preds.length >= 3) {
    for (const r of [-1, 0, 1] as const) {
      const believers = preds.filter(p => Math.sign(p.pred_home - p.pred_away) === r);
      if (believers.length === 1) {
        const team =
          r > 0  ? (match.home_team?.name ?? match.home_placeholder ?? "Local") :
          r < 0  ? (match.away_team?.name ?? match.away_placeholder ?? "Visitante") :
          "el empate";
        insights.push({ type: "lone_believer", name: believers[0].display_name, team });
      }
    }
  }

  // Nobody predicted the exact score (finished)
  if (isFinished && match.home_score !== null) {
    const exactHits = rich.filter(p => p.sim.reason === "Marcador exacto");
    if (exactHits.length === 0) {
      insights.push({ type: "nobody_exact" });
    }
    const rightHits = rich.filter(p => p.sim.points > 0);
    if (rightHits.length === 0) {
      insights.push({ type: "nobody_right" });
    }
  }

  return insights;
}

// ── Section components ────────────────────────────────────────────────

function SectionHeader({ title }: { title: string }) {
  return (
    <h2 className="text-sm font-bold text-[#94a3b8] uppercase tracking-wide mb-3">
      {title}
    </h2>
  );
}

// ── Match header ──────────────────────────────────────────────────────

function MatchHeader({
  match,
  advancingTeam,
}: {
  match: Match;
  advancingTeam: Team | null;
}) {
  const { home_team, away_team, home_placeholder, away_placeholder, status, group_code } = match;
  const hasScore = match.home_score !== null && match.away_score !== null;
  const phaseLabel = match.stage_name;
  // Show penalty note when: knockout + draw + advancing team known
  const isDraw = hasScore && match.home_score === match.away_score;
  const showPenaltyNote = isDraw && advancingTeam !== null;

  return (
    <div className="bg-[#11111c] border border-[#1e1e35] rounded-2xl p-5">

      {/* Status + meta */}
      <div className="flex items-center justify-between mb-4">
        <StatusBadge status={status} />
        <div className="text-right">
          <p className="text-[10px] text-[#64748b]">{phaseLabel}</p>
          {group_code && (
            <p className="text-[10px] text-[#64748b]">Grupo {group_code}</p>
          )}
        </div>
      </div>

      {/* Teams + score */}
      <div className="flex items-center gap-4">
        <TeamDisplay team={home_team} placeholder={home_placeholder} side="home" />

        <div className="shrink-0 text-center min-w-[80px]">
          {status === "scheduled" ? (
            <p className="text-xs text-[#64748b] font-mono">
              {formatKickoff(match.starts_at, match.tz)}
            </p>
          ) : hasScore ? (
            <p className={cn(
              "text-3xl font-black tabular-nums",
              status === "live" ? "text-[#ef4444] animate-live-pulse" : "text-[#f1f5f9]"
            )}>
              {match.home_score}
              <span className={cn(
                "mx-2 font-light",
                status === "live" ? "text-[#ef4444]/40" : "text-[#2a2a45]"
              )}>–</span>
              {match.away_score}
            </p>
          ) : (
            <p className="text-xl font-black text-[#2a2a45]">–</p>
          )}
        </div>

        <TeamDisplay team={away_team} placeholder={away_placeholder} side="away" />
      </div>

      {/* Penalty shootout note — shown only for knockout draws with a known advancing team */}
      {showPenaltyNote && (
        <div className="mt-3 flex items-center justify-center gap-1.5">
          <span className="text-xs">🏆</span>
          <p className="text-xs text-[#94a3b8]">
            Clasificó{" "}
            <span className="font-bold text-[#f1f5f9]">
              {advancingTeam!.flag_emoji ?? ""} {advancingTeam!.name}
            </span>{" "}
            por penales
          </p>
        </div>
      )}

      {/* Kickoff for non-scheduled */}
      {status !== "scheduled" && (
        <p className="text-[10px] text-[#64748b] text-center mt-3">
          {formatKickoff(match.starts_at, match.tz)}
        </p>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === "live") {
    return (
      <div className="flex items-center gap-2 px-2.5 py-1 rounded-lg bg-[#ef4444]/15 border border-[#ef4444]/25">
        <span className="relative flex h-2 w-2 shrink-0">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#ef4444] opacity-60" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-[#ef4444]" />
        </span>
        <span className="text-xs font-black text-[#ef4444] uppercase tracking-wide">EN VIVO</span>
      </div>
    );
  }
  if (status === "finished") {
    return (
      <span className="text-[10px] font-semibold text-[#94a3b8] uppercase tracking-widest">
        FINALIZADO
      </span>
    );
  }
  return (
    <div className="flex items-center gap-1.5">
      <span className="w-1.5 h-1.5 rounded-full bg-[#00c85a]" />
      <span className="text-[10px] font-bold text-[#00c85a] uppercase tracking-widest">PROGRAMADO</span>
    </div>
  );
}

function TeamDisplay({
  team,
  placeholder,
  side,
}: {
  team: Team | null;
  placeholder: string | null;
  side: "home" | "away";
}) {
  return (
    <div className={cn(
      "flex-1 flex flex-col items-center gap-1.5 min-w-0",
      side === "away" && "items-center"
    )}>
      <span className="text-4xl leading-none">{matchTeamFlag(team)}</span>
      <span className="text-xs font-bold text-[#f1f5f9] text-center truncate w-full">
        {matchTeamName(team, placeholder)}
      </span>
    </div>
  );
}

// ── Projected leaderboard (live matches) ─────────────────────────────

const RANK_MEDALS: Record<number, string> = { 1: "🥇", 2: "🥈", 3: "🥉" };

type ProjectedEntry = {
  user_id:         string;
  display_name:    string;
  current_rank:    number;
  current_points:  number;
  sim_points:      number;
  projected_total: number;
  projected_rank:  number;
  pred_home:       number | null;
  pred_away:       number | null;
  sim_reason:      ScoringResult["reason"] | null;
};

function ProjectedLeaderboardCard({
  entries,
  currentUserId,
}: {
  entries:       ProjectedEntry[];
  currentUserId: string;
}) {
  return (
    <div className="bg-[#11111c] border border-[#1e1e35] rounded-2xl overflow-hidden">
      {entries.map((entry) => {
        const isMe   = entry.user_id === currentUserId;
        const medal  = RANK_MEDALS[entry.projected_rank];
        const simPts = entry.sim_points;

        const simColor =
          simPts === 0                                         ? "text-[#475569]" :
          entry.sim_reason === "Marcador exacto"               ? "text-[#f59e0b]" :
          "text-[#00c85a]";

        const rankDelta = entry.current_rank - entry.projected_rank; // positive = moved up

        return (
          <div
            key={entry.user_id}
            className={cn(
              "flex items-center gap-3 px-4 py-3 border-b border-[#1e1e35] last:border-b-0",
              isMe && "bg-[#00c85a]/[0.05]"
            )}
          >
            {/* Rank */}
            <div className="w-7 shrink-0 text-center">
              {medal ? (
                <span className="text-base leading-none">{medal}</span>
              ) : (
                <span className="text-xs font-mono text-[#64748b]">{entry.projected_rank}</span>
              )}
            </div>

            {/* Name + prediction */}
            <div className="flex-1 min-w-0">
              <p className={cn(
                "text-sm font-bold truncate",
                isMe ? "text-[#00c85a]" : "text-[#f1f5f9]"
              )}>
                {entry.display_name}
                {isMe && <span className="text-[10px] text-[#00c85a]/60 font-mono ml-1.5">tú</span>}
              </p>
              {entry.pred_home !== null ? (
                <p className="text-[10px] font-mono text-[#64748b]">
                  {entry.pred_home}–{entry.pred_away}
                </p>
              ) : (
                <p className="text-[10px] text-[#475569]">Sin pronóstico</p>
              )}
            </div>

            {/* Position change arrow */}
            <div className="shrink-0 w-4 text-center">
              {rankDelta > 0 && <span className="text-xs text-[#00c85a]">↑</span>}
              {rankDelta < 0 && <span className="text-xs text-[#ef4444]">↓</span>}
            </div>

            {/* Points: current +sim = total */}
            <div className="text-right shrink-0 tabular-nums text-sm">
              <span className="text-[#64748b]">{entry.current_points}</span>
              <span className={cn("mx-0.5", simColor)}>
                {" "}{simPts > 0 ? `+${simPts}` : "+0"}
              </span>
              <span className="text-[#64748b]">{" "}=</span>
              <span className={cn(
                "font-black ml-0.5",
                isMe ? "text-[#00c85a]" : "text-[#f1f5f9]"
              )}>
                {" "}{entry.projected_total}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Distribution ──────────────────────────────────────────────────────

function DistributionCard({
  dist, total, pct, homeName, awayName,
}: {
  dist: { home: number; draw: number; away: number };
  total: number;
  pct: (n: number) => number;
  homeName: string;
  awayName: string;
}) {
  const bars = [
    { label: `🏠 ${homeName}`, count: dist.home, p: pct(dist.home), color: "bg-[#3b82f6]" },
    { label: "🤝 Empate",      count: dist.draw, p: pct(dist.draw), color: "bg-[#64748b]" },
    { label: `✈️ ${awayName}`, count: dist.away, p: pct(dist.away), color: "bg-[#8b5cf6]" },
  ];

  return (
    <div className="bg-[#11111c] border border-[#1e1e35] rounded-2xl p-5 space-y-3">
      {bars.map(({ label, count, p, color }) => (
        <div key={label}>
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-[#94a3b8]">{label}</span>
            <span className="text-xs font-bold text-[#f1f5f9] tabular-nums">
              {p}%
              <span className="text-[#64748b] font-normal ml-1">({count})</span>
            </span>
          </div>
          <div className="h-1.5 rounded-full bg-[#1e1e35] overflow-hidden">
            <div
              className={cn("h-full rounded-full", color)}
              style={{ width: `${p}%` }}
            />
          </div>
        </div>
      ))}
      <p className="text-[10px] text-[#64748b] text-right">{total} pronóstico{total !== 1 ? "s" : ""}</p>
    </div>
  );
}

// ── Top scores ────────────────────────────────────────────────────────

function TopScoresCard({ topScores, total }: { topScores: [string, number][]; total: number }) {
  return (
    <div className="bg-[#11111c] border border-[#1e1e35] rounded-2xl overflow-hidden">
      {topScores.map(([score, count], i) => (
        <div
          key={score}
          className="flex items-center gap-3 px-4 py-3 border-b border-[#1e1e35] last:border-b-0"
        >
          <span className="text-xs font-mono text-[#64748b] w-5 shrink-0">{i + 1}.</span>
          <span className="text-sm font-black font-mono text-[#f1f5f9] flex-1">{score}</span>
          <div className="flex items-center gap-2 shrink-0">
            <div className="h-1.5 w-16 rounded-full bg-[#1e1e35] overflow-hidden">
              <div
                className="h-full rounded-full bg-[#00c85a]/60"
                style={{ width: total > 0 ? `${Math.round((count / total) * 100)}%` : "0%" }}
              />
            </div>
            <span className="text-xs text-[#94a3b8] tabular-nums w-16 text-right">
              {count} persona{count !== 1 ? "s" : ""}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Predictions table ─────────────────────────────────────────────────

function PredictionsTable({
  preds,
  currentUserId,
  isFinished,
  hasScore,
}: {
  preds: (MatchPredictionEntry & { sim: ScoringResult })[];
  currentUserId: string;
  isLive: boolean;
  isFinished: boolean;
  hasScore: boolean;
}) {
  const sorted = [...preds].sort((a, b) => b.sim.points - a.sim.points || a.display_name.localeCompare(b.display_name));

  return (
    <div className="bg-[#11111c] border border-[#1e1e35] rounded-2xl overflow-hidden">
      {/* Header */}
      <div className="grid grid-cols-[1fr_auto_auto_auto] gap-2 px-4 py-2.5 border-b border-[#1e1e35]">
        <span className="text-[10px] text-[#64748b] uppercase tracking-widest">Jugador</span>
        <span className="text-[10px] text-[#64748b] uppercase tracking-widest text-center w-14">Pred</span>
        <span className="text-[10px] text-[#64748b] uppercase tracking-widest text-right w-14">Pts</span>
        <span className="text-[10px] text-[#64748b] uppercase tracking-widest text-right w-20">Resultado</span>
      </div>

      {sorted.map((entry) => {
        const isMe  = entry.user_id === currentUserId;
        const pts   = hasScore ? entry.sim.points : null;
        const rsn   = hasScore ? entry.sim.reason : null;

        const ptsColor =
          pts === null    ? "text-[#64748b]" :
          pts === 0       ? "text-[#ef4444]/70" :
          rsn === "Marcador exacto" ? "text-[#f59e0b]" :
          "text-[#00c85a]";

        const rsnLabel =
          rsn === "Marcador exacto"   ? "Exacto"  :
          rsn === "Resultado acertado"? "Ganador" :
          rsn === "Sin puntos"        ? (isFinished ? "—" : "×") :
          "—";

        return (
          <div
            key={entry.user_id}
            className={cn(
              "grid grid-cols-[1fr_auto_auto_auto] gap-2 items-center px-4 py-3 border-b border-[#1e1e35] last:border-b-0",
              isMe && "bg-[#00c85a]/[0.04]"
            )}
          >
            <div className="min-w-0">
              <p className={cn(
                "text-sm font-semibold truncate",
                isMe ? "text-[#00c85a]" : "text-[#f1f5f9]"
              )}>
                {entry.display_name}
                {isMe && <span className="text-[10px] text-[#00c85a]/60 font-mono ml-1">tú</span>}
              </p>
              <p className="text-[11px] text-[#64748b] truncate">
                {formatPredictionTimestamp(entry.predicted_at, getTz())}
              </p>
            </div>

            <span className="text-sm font-mono font-bold text-[#94a3b8] text-center w-14 tabular-nums">
              {entry.pred_home}–{entry.pred_away}
            </span>

            <span className={cn("text-sm font-black tabular-nums text-right w-14", ptsColor)}>
              {pts !== null ? (pts > 0 ? `+${pts}` : "0") : "—"}
            </span>

            <span className={cn(
              "text-[11px] font-mono text-right w-20 shrink-0",
              rsn === "Marcador exacto"    ? "text-[#f59e0b]" :
              rsn === "Resultado acertado" ? "text-[#00c85a]/80" :
              "text-[#64748b]"
            )}>
              {rsnLabel}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ── Missing predictions ───────────────────────────────────────────────

function MissingPredictionsCard({ entries }: { entries: MissingPredictionEntry[] }) {
  const sorted = [...entries].sort((a, b) => a.display_name.localeCompare(b.display_name));

  return (
    <div className="bg-[#11111c] border border-[#1e1e35] rounded-2xl overflow-hidden">
      {sorted.map((entry) => (
        <div
          key={entry.user_id}
          className="px-4 py-3 border-b border-[#1e1e35] last:border-b-0"
        >
          <p className="text-sm font-semibold text-[#94a3b8] truncate">{entry.display_name}</p>
        </div>
      ))}
    </div>
  );
}

// ── Community insights ────────────────────────────────────────────────

function InsightCard({ insight }: { insight: Insight }) {
  let emoji = "💡";
  let title = "";
  let body  = "";

  switch (insight.type) {
    case "popular":
      emoji = "🏆";
      title = "Marcador favorito";
      body  = `${insight.score} (${insight.count} personas)`;
      break;
    case "unanimous":
      emoji = "🔥";
      title = "Todos de acuerdo";
      body  = `Todo el grupo apostó por ${insight.winner}`;
      break;
    case "lone_believer":
      emoji = "😱";
      title = "El único que creyó";
      body  = `${insight.name} fue el único que apostó por ${insight.team}`;
      break;
    case "nobody_exact":
      emoji = "⚡";
      title = "Nadie predijo el marcador exacto";
      body  = "Este resultado sorprendió a todos";
      break;
    case "nobody_right":
      emoji = "😬";
      title = "Nadie acertó";
      body  = "El grupo entero se fue a cero en este partido";
      break;
  }

  return (
    <div className="bg-[#11111c] border border-[#1e1e35] rounded-2xl p-4">
      <div className="flex items-start gap-3">
        <span className="text-xl shrink-0 leading-none mt-0.5">{emoji}</span>
        <div className="min-w-0">
          <p className="text-xs font-bold text-[#94a3b8] mb-0.5">{title}</p>
          <p className="text-sm text-[#f1f5f9] leading-snug">{body}</p>
        </div>
      </div>
    </div>
  );
}
