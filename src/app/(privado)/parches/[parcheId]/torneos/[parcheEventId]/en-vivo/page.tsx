import LiveMatchCard from "@/components/juego/dashboard/LiveMatchCard";
import LiveMatchPoller from "@/components/juego/LiveMatchPoller";
import { PredictionEditingProvider } from "@/components/juego/PredictionEditingContext";
import { formatKickoff, matchClosedReason, matchTeamFlag, matchTeamName, type MatchWithPrediction } from "@/lib/juego/matches";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireGame, getMatchesWithPredictions } from "@/lib/juego/queries";
import { getBase } from "@/lib/juego/request-base";

export default async function EnVivoPage({ params }: { params: Promise<{ parcheId: string; parcheEventId: string }> }) {
  const ctx = await requireGame(params);
  if (ctx.historical) redirect(`${ctx.base}/historial`);
  const resolvedMatches = await getMatchesWithPredictions(ctx);

  const liveMatches = resolvedMatches
    .filter((m) => m.status === "live")
    .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime());

  // Caso 1: un solo partido en vivo → ir directo al detalle
  if (liveMatches.length === 1) redirect(`${getBase()}/matches/${liveMatches[0].id}`);

  const nextMatch = resolvedMatches
    .filter((m) => m.status === "scheduled" || m.status === "postponed")
    .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime())[0] ?? null;

  return (
    <PredictionEditingProvider>
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
      <LiveMatchPoller hasLiveMatch={liveMatches.length > 0} />

      {/* Header */}
      <div className="flex items-center gap-2">
        {liveMatches.length > 0 ? (
          <>
            <span className="relative flex h-2.5 w-2.5 shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#ef4444] opacity-60" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-[#ef4444]" />
            </span>
            <h1 className="text-xl font-black text-[#f1f5f9]">En Vivo</h1>
            {liveMatches.length > 1 && (
              <span className="text-xs text-[#ef4444]/70 font-mono">
                · {liveMatches.length} partidos
              </span>
            )}
          </>
        ) : (
          <>
            <span className="inline-flex h-2.5 w-2.5 rounded-full bg-[#2a2a45] shrink-0" />
            <h1 className="text-xl font-black text-[#f1f5f9]">En Vivo</h1>
          </>
        )}
      </div>

      {/* Case A: live matches */}
      {liveMatches.length > 0 && (
        <div className="space-y-3">
          {liveMatches.map((m) => (
            <LiveMatchCard key={m.id} match={m} />
          ))}
        </div>
      )}

      {/* Case B: no live matches */}
      {liveMatches.length === 0 && (
        <div className="space-y-4">
          <div className="bg-[#11111c] border border-[#1e1e35] rounded-2xl p-5 text-center">
            <p className="text-sm text-[#64748b]">No hay partidos en vivo en este momento.</p>
          </div>

          {nextMatch ? (
            <NextMatchCard
              match={nextMatch}
              hasPrediction={!!nextMatch.prediction}
              predictionOpen={matchClosedReason(nextMatch) === null}
            />
          ) : (
            <div className="bg-[#11111c] border border-[#1e1e35] rounded-2xl p-5 text-center">
              <p className="text-xs text-[#475569]">No hay próximos partidos programados.</p>
            </div>
          )}
        </div>
      )}

    </div>
    </PredictionEditingProvider>
  );
}

// ── Next match card ───────────────────────────────────────────────────

function NextMatchCard({
  match,
  hasPrediction,
  predictionOpen,
}: {
  match: MatchWithPrediction;
  hasPrediction: boolean;
  predictionOpen: boolean;
}) {
  const homeName = matchTeamName(match.home_team, match.home_placeholder);
  const awayName = matchTeamName(match.away_team, match.away_placeholder);
  const homeFlag = matchTeamFlag(match.home_team);
  const awayFlag = matchTeamFlag(match.away_team);

  return (
    <Link
      href={`${getBase()}/matches/${match.id}`}
      className="block bg-[#11111c] border border-[#1e1e35] rounded-2xl p-4 space-y-3 hover:border-[#2a2a45] transition-colors cursor-pointer"
    >
      <p className="text-[10px] text-[#475569] font-mono uppercase tracking-widest">
        Próximo partido
      </p>

      {/* Teams */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5 flex-1 min-w-0">
          <span className="text-xl leading-none shrink-0">{homeFlag}</span>
          <span className="text-sm font-bold text-[#f1f5f9] truncate">{homeName}</span>
        </div>
        <span className="text-xs text-[#475569] font-bold shrink-0">vs</span>
        <div className="flex items-center gap-1.5 flex-1 flex-row-reverse min-w-0">
          <span className="text-xl leading-none shrink-0">{awayFlag}</span>
          <span className="text-sm font-bold text-[#f1f5f9] truncate text-right">{awayName}</span>
        </div>
      </div>

      <p className="text-xs text-[#64748b]">{formatKickoff(match.starts_at, match.tz)}</p>

      {/* Prediction status */}
      {hasPrediction ? (
        <div className="flex items-center gap-2 pt-1 border-t border-[#1e1e35]">
          <span className="text-sm">✅</span>
          <p className="text-xs text-[#64748b]">Ya tienes pronóstico registrado para este partido.</p>
        </div>
      ) : predictionOpen ? (
        <div className="flex items-center justify-between gap-3 pt-1 border-t border-[#1e1e35]">
          <div>
            <p className="text-xs font-semibold text-[#f59e0b]">⚠️ No tienes pronóstico para este partido.</p>
            <p className="text-[10px] text-[#64748b] mt-0.5">Haz tu predicción antes de que cierre.</p>
          </div>
          <span className="shrink-0 text-xs font-bold bg-[#f59e0b] text-[#0a0a12] px-3 py-1.5 rounded-lg whitespace-nowrap">
            Pronosticar ahora
          </span>
        </div>
      ) : null}
    </Link>
  );
}
