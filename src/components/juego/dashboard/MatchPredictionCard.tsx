import { cn } from "@/lib/juego/utils";
import {
  formatKickoff,
  matchClosedReason,
  matchTeamName,
  matchTeamCode,
  matchTeamFlag,
  type MatchWithPrediction,
} from "@/lib/juego/matches";
import Badge from "@/components/ui/Badge";
import PredictionForm from "./PredictionForm";

interface MatchPredictionCardProps {
  match: MatchWithPrediction;
}

export default function MatchPredictionCard({ match }: MatchPredictionCardProps) {
  const { home_team, away_team, status } = match;
  const hasResult =
    status === "finished" &&
    match.home_score !== null &&
    match.away_score !== null;
  const closedReason = matchClosedReason(match);
  const open = closedReason === null;

  return (
    <div
      className={cn(
        "bg-[#18182a] border rounded-2xl p-3 transition-colors",
        status === "live"
          ? "border-[#ef4444]/30 shadow-[0_0_20px_rgba(239,68,68,0.06)]"
          : "border-[#2a2a45]"
      )}
    >
      {/* Status row */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          {status === "live" && <Badge variant="live">EN VIVO</Badge>}
          {status === "scheduled" && (
            <span className="text-xs text-[#94a3b8]">{formatKickoff(match.starts_at, match.tz)}</span>
          )}
          {status === "finished" && (
            <span className="text-xs text-[#64748b] uppercase tracking-wide font-mono">PT</span>
          )}
        </div>
        <span className="text-[10px] text-[#2a2a45] uppercase tracking-widest font-mono">
          {match.stage_name}
        </span>
      </div>

      {/* Teams + score */}
      <div className="flex items-center gap-2">
        {/* Home */}
        <div className="flex-1 flex items-center gap-1.5 min-w-0">
          <span className="text-xl leading-none shrink-0">
            {matchTeamFlag(home_team)}
          </span>
          <div className="min-w-0">
            <p className="text-sm font-bold text-[#f1f5f9] truncate">{matchTeamName(home_team, match.home_placeholder)}</p>
            <p className="text-[10px] text-[#64748b] font-mono">{matchTeamCode(home_team, match.home_placeholder)}</p>
          </div>
        </div>

        {/* Score center */}
        <div className="text-center shrink-0 w-12">
          {hasResult ? (
            <p className="text-xl font-black text-[#f1f5f9] tabular-nums leading-none">
              {match.home_score}
              <span className="text-[#64748b] font-light mx-0.5">–</span>
              {match.away_score}
            </p>
          ) : status === "live" && match.home_score !== null ? (
            <p className="text-xl font-black text-[#ef4444] tabular-nums leading-none animate-live-pulse">
              {match.home_score}
              <span className="text-[#64748b] font-light mx-0.5">–</span>
              {match.away_score}
            </p>
          ) : (
            <p className="text-sm font-bold text-[#2a2a45]">vs</p>
          )}
        </div>

        {/* Away */}
        <div className="flex-1 flex items-center gap-1.5 flex-row-reverse min-w-0">
          <span className="text-xl leading-none shrink-0">
            {matchTeamFlag(away_team)}
          </span>
          <div className="min-w-0 text-right">
            <p className="text-sm font-bold text-[#f1f5f9] truncate">{matchTeamName(away_team, match.away_placeholder)}</p>
            <p className="text-[10px] text-[#64748b] font-mono">{matchTeamCode(away_team, match.away_placeholder)}</p>
          </div>
        </div>
      </div>

      {/* Prediction form / display */}
      <PredictionForm
        matchId={match.id}
        isOpen={open}
        closedReason={closedReason}
        currentPrediction={match.prediction}
      />
    </div>
  );
}
