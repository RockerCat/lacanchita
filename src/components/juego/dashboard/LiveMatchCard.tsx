"use client";

import Link from "next/link";
import { cn } from "@/lib/juego/utils";
import { matchTeamName, matchTeamFlag, type MatchWithPrediction } from "@/lib/juego/matches";
import { useGoalCelebration } from "@/components/juego/useGoalCelebration";
import GoalCelebrationOverlay from "./GoalCelebrationOverlay";
import { useJuego } from "@/lib/juego/context";

export default function LiveMatchCard({ match }: { match: MatchWithPrediction }) {
  const { base } = useJuego();
  const hasPrediction = !!match.prediction;
  const hasScore = match.home_score !== null && match.away_score !== null;

  const goalAnim = useGoalCelebration(
    { home: match.home_score, away: match.away_score },
    true // this component is only ever rendered for live matches
  );

  return (
    <Link
      href={`${base}/matches/${match.id}`}
      className={cn(
        "relative block rounded-2xl border border-[#ef4444]/30 bg-gradient-to-br from-[#ef4444]/[0.08] to-[#11111c] p-4 cursor-pointer transition-all hover:border-[#ef4444]/50 overflow-hidden",
        goalAnim ? "animate-goal-card" : "animate-live-glow"
      )}
    >
      <GoalCelebrationOverlay active={goalAnim} />

      {/* Status badge */}
      <div className="flex items-center gap-2 mb-3">
        <span className="relative flex h-2 w-2 shrink-0">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#ef4444] opacity-60" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-[#ef4444]" />
        </span>
        <span className="text-[10px] font-black text-[#ef4444] uppercase tracking-widest">
          EN VIVO
        </span>
      </div>

      {/* Teams + score */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5 flex-1 min-w-0">
          <span className="text-xl leading-none shrink-0">{matchTeamFlag(match.home_team)}</span>
          <span className="text-sm font-bold text-[#f1f5f9] truncate">{matchTeamName(match.home_team, match.home_placeholder)}</span>
        </div>
        <div className="shrink-0 text-center px-1">
          {hasScore ? (
            <span className="text-2xl font-black text-[#ef4444] tabular-nums animate-live-pulse">
              {match.home_score}
              <span className="text-[#ef4444]/40 mx-1 font-light">–</span>
              {match.away_score}
            </span>
          ) : (
            <span className="text-lg font-black text-[#ef4444]/50">–</span>
          )}
        </div>
        <div className="flex items-center gap-1.5 flex-1 flex-row-reverse min-w-0">
          <span className="text-xl leading-none shrink-0">{matchTeamFlag(match.away_team)}</span>
          <span className="text-sm font-bold text-[#f1f5f9] truncate text-right">{matchTeamName(match.away_team, match.away_placeholder)}</span>
        </div>
      </div>

      {/* Own prediction */}
      <div className="mt-3 pt-2.5 border-t border-[#ef4444]/10 flex items-center justify-between">
        {hasPrediction ? (
          <span className="text-xs text-[#94a3b8]">
            Mi pronóstico:{" "}
            <span className="font-mono font-bold text-[#94a3b8]">
              {match.prediction!.home_score}–{match.prediction!.away_score}
            </span>
          </span>
        ) : (
          <span className="text-xs text-[#64748b]">Sin predicción</span>
        )}
        <span className="text-[10px] text-[#ef4444]/40">Ver detalles →</span>
      </div>
    </Link>
  );
}
