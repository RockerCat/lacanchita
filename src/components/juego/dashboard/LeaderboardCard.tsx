import Card from "@/components/ui/Card";

interface LeaderboardEntry {
  rank: number;
  username: string;
  points: number;
  exactScores: number;
  isCurrentUser?: boolean;
}

interface LeaderboardCardProps {
  groupName: string;
  entries: LeaderboardEntry[];
}

export default function LeaderboardCard({
  groupName,
  entries,
}: LeaderboardCardProps) {
  return (
    <Card className="overflow-hidden">
      <div className="px-4 py-3 border-b border-[#1e1e35] flex items-center justify-between">
        <div>
          <p className="text-xs text-[#64748b] uppercase tracking-wide font-mono mb-0.5">
            Tabla de posiciones
          </p>
          <p className="text-sm font-bold text-[#f1f5f9]">{groupName}</p>
        </div>
        <button className="text-xs text-[#00c85a] font-semibold hover:text-[#00e87a]">
          Ver todos
        </button>
      </div>

      <div className="divide-y divide-[#1e1e35]">
        {entries.map((entry) => (
          <LeaderboardRow key={entry.rank} {...entry} />
        ))}
      </div>
    </Card>
  );
}

function LeaderboardRow({
  rank,
  username,
  points,
  exactScores,
  isCurrentUser,
}: LeaderboardEntry) {
  const isTop3 = rank <= 3;
  const medals = ["🥇", "🥈", "🥉"];

  return (
    <div
      className={`flex items-center gap-3 px-4 py-3 ${
        isCurrentUser ? "bg-[#00c85a]/5" : ""
      }`}
    >
      <div className="w-6 text-center shrink-0">
        {isTop3 ? (
          <span className="text-base leading-none">{medals[rank - 1]}</span>
        ) : (
          <span className="text-xs font-mono text-[#64748b]">{rank}</span>
        )}
      </div>

      <div className="flex-1 min-w-0">
        <p
          className={`text-sm font-semibold truncate ${
            isCurrentUser ? "text-[#00c85a]" : "text-[#f1f5f9]"
          }`}
        >
          {username}
          {isCurrentUser && (
            <span className="text-xs text-[#64748b] ml-1 font-normal">
              (tú)
            </span>
          )}
        </p>
        <p className="text-xs text-[#64748b]">{exactScores} exactos</p>
      </div>

      <div className="text-right shrink-0">
        <p className="text-sm font-black tabular-nums text-[#f1f5f9]">
          {points}
          <span className="text-xs font-normal text-[#64748b] ml-0.5">pts</span>
        </p>
      </div>
    </div>
  );
}
