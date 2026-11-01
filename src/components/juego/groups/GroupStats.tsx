interface GroupStatsProps {
  memberCount: number;
  totalPredictions: number;
  scoredMatches: number;
  pendingMatches: number;
  leaderName: string | null;
}

export default function GroupStats({
  memberCount,
  totalPredictions,
  scoredMatches,
  pendingMatches,
  leaderName,
}: GroupStatsProps) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <StatCard value={memberCount} label="miembros" />
        <StatCard value={totalPredictions} label="predicciones" />
        <StatCard value={scoredMatches} label="finalizados" />
        <StatCard value={pendingMatches} label="pendientes" />
      </div>

      {leaderName && (
        <div className="flex items-center gap-2 px-4 py-2.5 bg-[#f59e0b]/[0.05] border border-[#f59e0b]/20 rounded-xl">
          <span className="text-sm">👑</span>
          <p className="text-xs text-[#94a3b8]">
            Lidera{" "}
            <span className="font-bold text-[#f59e0b]">{leaderName}</span>
          </p>
        </div>
      )}
    </div>
  );
}

function StatCard({ value, label }: { value: number; label: string }) {
  return (
    <div className="bg-[#18182a] border border-[#2a2a45] rounded-xl px-4 py-3">
      <p className="text-2xl font-black text-[#f1f5f9] tabular-nums leading-none mb-0.5">
        {value}
      </p>
      <p className="text-[11px] text-[#64748b] font-mono">{label}</p>
    </div>
  );
}
