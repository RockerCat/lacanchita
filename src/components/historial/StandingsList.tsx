import { podiumTone, statValue, type SnapshotRow } from "@/lib/historial";

// Filas de clasificación con el estilo del Leaderboard original (el-var/src/components/groups/Leaderboard.tsx):
// posición con acento de podio, avatar con inicial, desglose ⚡ exactos / ✓ aciertos y puntos destacados.
// En celular cada fila se apila sin perder datos (no hay columnas ocultas).
const TONES = {
  gold: { row: "bg-gold/[0.05] border-gold/25", rank: "text-gold", points: "text-gold" },
  silver: { row: "bg-silver/[0.05] border-silver/25", rank: "text-silver", points: "text-fg" },
  bronze: { row: "bg-bronze/[0.05] border-bronze/25", rank: "text-bronze", points: "text-fg" },
} as const;

export default function StandingsList({ rows, currentUserId }: { rows: SnapshotRow[]; currentUserId: string }) {
  if (rows.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-line bg-surface p-5 text-center">
        <p className="text-sm text-fg-3">Esta clasificación no tiene participantes clasificados.</p>
      </div>
    );
  }

  return (
    <ol className="flex flex-col gap-2" aria-label="Clasificación">
      {rows.map((r) => (
        <StandingRow key={r.row_number} row={r} isCurrentUser={r.user_id === currentUserId} />
      ))}
    </ol>
  );
}

function StandingRow({ row, isCurrentUser }: { row: SnapshotRow; isCurrentUser: boolean }) {
  const tone = podiumTone(row.position);
  const accent = tone ? TONES[tone] : null;
  const rowClass = isCurrentUser ? "bg-cancha/[0.07] border-cancha/30" : accent?.row ?? "bg-surface border-line";
  const rankClass = isCurrentUser ? "text-cancha-text" : accent?.rank ?? "text-fg-3";
  const pointsClass = isCurrentUser ? "text-cancha-text" : accent?.points ?? "text-fg";

  return (
    <li className={`flex items-center gap-3 rounded-2xl border px-3 py-3 sm:px-4 ${rowClass}`} data-testid="standing-row">
      <div className="w-8 shrink-0 text-center">
        <span className={`text-sm font-bold tabular-nums ${rankClass}`}>
          {row.position}
          {row.position_shared && <span title="Posición compartida">=</span>}
        </span>
        <span className="sr-only">{row.position_shared ? " (empate)" : ""}.º puesto</span>
      </div>

      <div
        aria-hidden="true"
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
          isCurrentUser ? "bg-cancha/20 text-cancha-text" : "bg-surface-raised text-fg-2"
        }`}
      >
        {row.display_name.trim().charAt(0).toUpperCase() || "?"}
      </div>

      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5">
          <span className={`truncate text-sm font-bold ${isCurrentUser ? "text-cancha-text" : "text-fg"}`}>
            {row.display_name}
          </span>
          {isCurrentUser && <span className="shrink-0 font-mono text-[11px] text-cancha-text">tú</span>}
        </p>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 font-mono text-[11px]">
          <span className="text-gold">
            <span aria-hidden="true">⚡</span>
            {statValue(row, row.exact_hits)} exactos
          </span>
          <span className="text-cancha-text">
            <span aria-hidden="true">✓</span>
            {statValue(row, row.result_hits)} aciertos
          </span>
          <span className="text-fg-3">
            <span aria-hidden="true">✗</span>
            {statValue(row, row.misses)} fallos
          </span>
          <span className="text-fg-3">{statValue(row, row.predictions_count)} pronósticos</span>
        </p>
      </div>

      <div className="shrink-0 text-right">
        <p className={`text-2xl font-black leading-none tabular-nums ${pointsClass}`}>{statValue(row, row.points)}</p>
        <p className="font-mono text-[11px] text-fg-3">pts</p>
      </div>
    </li>
  );
}
