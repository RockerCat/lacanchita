import Badge from "@/components/ui/Badge";
import { cn } from "@/lib/juego/utils";

interface MatchCardProps {
  homeTeam: { name: string; flag: string; code: string };
  awayTeam: { name: string; flag: string; code: string };
  kickoff: string;
  status: "upcoming" | "live" | "finished";
  homeScore?: number;
  awayScore?: number;
  prediction?: { home: number; away: number; result?: "exact" | "correct_winner" | "wrong" | "pending" };
}

export default function MatchCard({
  homeTeam,
  awayTeam,
  kickoff,
  status,
  homeScore,
  awayScore,
  prediction,
}: MatchCardProps) {
  const hasResult = status === "finished" && homeScore !== undefined && awayScore !== undefined;

  return (
    <div
      className={cn(
        "bg-[#18182a] border rounded-2xl p-4 transition-all duration-200",
        "hover:border-[#2a2a45] active:scale-[0.99]",
        status === "live"
          ? "border-[#ef4444]/30 shadow-[0_0_20px_rgba(239,68,68,0.06)]"
          : "border-[#2a2a45]"
      )}
    >
      {/* Status + time row */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          {status === "live" && <Badge variant="live">EN VIVO</Badge>}
          {status === "upcoming" && (
            <span className="text-xs text-[#94a3b8]">{kickoff}</span>
          )}
          {status === "finished" && (
            <span className="text-xs text-[#64748b] uppercase tracking-wide font-mono">
              FT
            </span>
          )}
        </div>
        {prediction && (
          <PredictionBadge result={prediction.result ?? "pending"} />
        )}
      </div>

      {/* Teams + score */}
      <div className="flex items-center gap-3">
        {/* Home team */}
        <div className="flex-1 flex items-center gap-2.5">
          <span className="text-2xl leading-none">{homeTeam.flag}</span>
          <div className="min-w-0">
            <p className="text-sm font-bold text-[#f1f5f9] truncate">
              {homeTeam.name}
            </p>
            <p className="text-xs text-[#64748b] font-mono">{homeTeam.code}</p>
          </div>
        </div>

        {/* Score */}
        <div className="text-center shrink-0 w-16">
          {hasResult ? (
            <p className="text-2xl font-black text-[#f1f5f9] tabular-nums leading-none">
              {homeScore}
              <span className="text-[#64748b] font-light mx-0.5">–</span>
              {awayScore}
            </p>
          ) : status === "live" && homeScore !== undefined ? (
            <p className="text-2xl font-black text-[#ef4444] tabular-nums leading-none animate-live-pulse">
              {homeScore}
              <span className="text-[#64748b] font-light mx-0.5">–</span>
              {awayScore}
            </p>
          ) : (
            <p className="text-lg font-bold text-[#2a2a45]">vs</p>
          )}
        </div>

        {/* Away team */}
        <div className="flex-1 flex items-center gap-2.5 flex-row-reverse">
          <span className="text-2xl leading-none">{awayTeam.flag}</span>
          <div className="min-w-0 text-right">
            <p className="text-sm font-bold text-[#f1f5f9] truncate">
              {awayTeam.name}
            </p>
            <p className="text-xs text-[#64748b] font-mono">{awayTeam.code}</p>
          </div>
        </div>
      </div>

      {/* Your prediction */}
      {prediction && (
        <div className="mt-3 pt-3 border-t border-[#1e1e35] flex items-center justify-between">
          <span className="text-xs text-[#64748b]">Tu predicción</span>
          <span className="text-xs font-mono font-semibold text-[#94a3b8]">
            {prediction.home} – {prediction.away}
          </span>
        </div>
      )}
    </div>
  );
}

function PredictionBadge({ result }: { result: string }) {
  if (result === "exact")
    return (
      <Badge variant="gold">
        ⚡ Exacto
      </Badge>
    );
  if (result === "correct_winner")
    return <Badge variant="green">✓ Correcto</Badge>;
  if (result === "wrong")
    return <Badge variant="gray">✗ Incorrecto</Badge>;
  return <Badge variant="blue">· Pendiente</Badge>;
}
