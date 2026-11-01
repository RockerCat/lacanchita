import { unrankedReasonLabel, type SnapshotRow } from "@/lib/historial";

export default function UnrankedList({ rows, currentUserId }: { rows: SnapshotRow[]; currentUserId: string }) {
  return (
    <ul className="divide-y divide-line-subtle overflow-hidden rounded-2xl border border-line bg-surface">
      {rows.map((r) => (
        <li key={r.row_number} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-4 py-3" data-testid="unranked-row">
          <span className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className="flex h-7 w-7 items-center justify-center rounded-full bg-surface-raised text-[11px] font-bold text-fg-3"
            >
              {r.display_name.trim().charAt(0).toUpperCase() || "?"}
            </span>
            <span className="text-sm font-semibold text-fg">{r.display_name}</span>
            {r.user_id === currentUserId && <span className="font-mono text-[11px] text-cancha-text">tú</span>}
          </span>
          <span className="text-xs text-fg-2">
            Sin posición · {unrankedReasonLabel(r.unranked_reason)}
            {r.stats_status === "verified" && r.predictions_count === 0 && " · sin pronósticos"}
          </span>
        </li>
      ))}
    </ul>
  );
}
