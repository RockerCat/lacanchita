import { cn } from "@/lib/juego/utils";
import type { LeaderboardEntry } from "@/lib/juego/groups";

interface LeaderboardProps {
  entries: LeaderboardEntry[];
  currentUserId: string;
}

const TOP_ACCENT = {
  1: { bg: "bg-[#f59e0b]/[0.04]", border: "border-[#f59e0b]/20", text: "text-[#f59e0b]" },
  2: { bg: "bg-[#94a3b8]/[0.03]", border: "border-[#94a3b8]/15", text: "text-[#94a3b8]" },
  3: { bg: "bg-[#cd7c3a]/[0.04]", border: "border-[#cd7c3a]/20", text: "text-[#cd7c3a]" },
} as const;

export default function Leaderboard({ entries, currentUserId }: LeaderboardProps) {
  if (entries.length === 0) {
    return (
      <div className="bg-[#18182a] border border-dashed border-[#2a2a45] rounded-2xl p-5 text-center">
        <p className="text-xs text-[#64748b]">
          No se pudieron cargar los participantes.
        </p>
      </div>
    );
  }

  const allZero = entries.every((e) => e.total_points === 0);

  return (
    <div className="flex flex-col gap-2">
      {entries.map((entry) => (
        <LeaderboardRow
          key={entry.user_id}
          entry={entry}
          isCurrentUser={entry.user_id === currentUserId}
        />
      ))}
      {allZero && (
        <p className="text-[11px] text-[#64748b] text-center pt-2 font-mono">
          Los puntos aparecerán cuando se confirmen resultados de partidos.
        </p>
      )}
    </div>
  );
}

function LeaderboardRow({
  entry,
  isCurrentUser,
}: {
  entry: LeaderboardEntry;
  isCurrentUser: boolean;
}) {
  const topAccent = entry.rank in TOP_ACCENT
    ? TOP_ACCENT[entry.rank as keyof typeof TOP_ACCENT]
    : null;

  // Current user overrides top-3 styling
  const rowBg = isCurrentUser
    ? "bg-[#00c85a]/[0.05]"
    : topAccent?.bg ?? "bg-[#18182a]";
  const rowBorder = isCurrentUser
    ? "border-[#00c85a]/25"
    : topAccent?.border ?? "border-[#2a2a45]";
  const rankColor = isCurrentUser
    ? "text-[#00c85a]"
    : topAccent?.text ?? "text-[#64748b]";

  const pointsColor =
    entry.total_points === 0
      ? "text-[#2a2a45]"
      : isCurrentUser
      ? "text-[#00c85a]"
      : entry.rank === 1
      ? "text-[#f59e0b]"
      : "text-[#f1f5f9]";

  const avatarLetter = entry.display_name.charAt(0).toUpperCase();

  return (
    <div
      data-testid="standing-row"
      className={cn(
        "flex items-center gap-3 px-4 py-3 rounded-2xl border transition-colors",
        rowBg,
        rowBorder
      )}
    >
      {/* Rank */}
      <div className="w-7 shrink-0 text-center">
        <span className={cn("text-sm font-bold tabular-nums", rankColor)}>
          {entry.rank}
        </span>
      </div>

      {/* Avatar */}
      <div
        className={cn(
          "w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-xs font-bold",
          isCurrentUser
            ? "bg-[#00c85a]/20 text-[#00c85a]"
            : "bg-[#1e1e35] text-[#94a3b8]"
        )}
      >
        {avatarLetter}
      </div>

      {/* Name + breakdown */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 mb-0.5">
          <p
            className={cn(
              "text-sm font-bold truncate",
              isCurrentUser ? "text-[#00c85a]" : "text-[#f1f5f9]"
            )}
          >
            {entry.display_name}
          </p>
          {isCurrentUser && (
            <span className="text-[10px] text-[#00c85a]/60 font-mono shrink-0">tú</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {entry.exact_count > 0 && (
            <span className="text-[10px] text-[#f59e0b] font-mono">
              ⚡{entry.exact_count}
            </span>
          )}
          {entry.result_count > 0 && (
            <span className="text-[10px] text-[#00c85a] font-mono">
              ✓{entry.result_count}
            </span>
          )}
          {entry.pred_count > 0 && (
            <span className="text-[10px] text-[#64748b] font-mono">
              {entry.pred_count} preds
            </span>
          )}
          {entry.pred_count === 0 && (
            <span className="text-[10px] text-[#2a2a45] font-mono">
              Sin predicciones
            </span>
          )}
        </div>
      </div>

      {/* Points */}
      <div className="shrink-0 text-right">
        <p className={cn("text-2xl font-black tabular-nums leading-none", pointsColor)}>
          {entry.total_points}
        </p>
        <p className="text-[10px] text-[#64748b] font-mono">pts</p>
      </div>
    </div>
  );
}
