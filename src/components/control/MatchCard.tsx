import TeamBadge from "./TeamBadge";
import { MATCH_STATUS_LABELS, type ResultState } from "@/lib/control/results";
import type { Match, Team } from "@/lib/control/data";
import { formatInZone } from "@/lib/control/time";
import Badge from "@/components/ui/Badge";

export type Side = { name: string; team: Team | null };

export function sideOf(teamId: string | null, placeholder: string | null, teams: Map<string, Team>): Side {
  const team = teamId ? (teams.get(teamId) ?? null) : null;
  return { name: team?.name ?? (placeholder?.trim() || "Por definir"), team };
}

// Cabecera de un partido en Control: equipos con su identidad visual, marcador destacado según el estado
// (en vivo, finalizado, importado, pendiente heredado) y fecha en la zona del torneo.
export default function MatchCard({ match, stageName, home, away, state, shown, timezone, children }: {
  match: Match;
  stageName?: string;
  home: Side;
  away: Side;
  state: ResultState;
  // Marcador a mostrar (el pendiente heredado viene del borrador privado; el resto, de matches).
  shown: { home: number | null; away: number | null };
  timezone: string;
  children?: React.ReactNode;
}) {
  const context = [match.match_number ? `#${match.match_number}` : null, stageName, match.group_code ? `Grupo ${match.group_code}` : null, match.round_label].filter(Boolean).join(" · ");
  const hasScore = state !== "none" && shown.home !== null && shown.away !== null;
  const scoreClass =
    state === "official"
      ? "text-3xl font-black text-fg"
      : state === "live"
        ? "rounded-xl border border-danger/50 bg-danger/[0.08] px-3 py-1 text-3xl font-black text-danger"
        : state === "pending"
          ? "rounded-xl border border-dashed border-gold/60 bg-gold/[0.08] px-3 py-1 text-2xl font-black text-gold"
          : "text-2xl font-bold text-fg-2";

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <p className="text-xs text-fg-3">{context}</p>
        <p className="text-xs font-medium text-fg-2">{formatInZone(match.starts_at, timezone)}</p>
      </div>

      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 sm:gap-4">
        <div className="flex min-w-0 items-center justify-end gap-2">
          <span className="min-w-0 truncate text-right text-sm font-bold text-fg sm:text-base">{home.name}</span>
          <TeamBadge team={home.team} />
        </div>
        <div className="flex min-w-[4.5rem] flex-col items-center gap-0.5 text-center">
          {hasScore ? (
            <span className={`font-mono tabular-nums ${scoreClass}`}>{shown.home} – {shown.away}</span>
          ) : (
            <span className="font-mono text-sm font-semibold uppercase tracking-widest text-fg-3">vs</span>
          )}
        </div>
        <div className="flex min-w-0 items-center gap-2">
          <TeamBadge team={away.team} />
          <span className="min-w-0 truncate text-sm font-bold text-fg sm:text-base">{away.name}</span>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {state === "live" && (
          <Badge variant="red">
            <span aria-hidden="true" className="h-1.5 w-1.5 animate-live-pulse rounded-full bg-danger" />
            En vivo
          </Badge>
        )}
        {state === "official" && <Badge variant="green">Finalizado</Badge>}
        {state === "imported" && <Badge variant="gray">Importado (histórico)</Badge>}
        {state === "pending" && <Badge variant="gold">Marcador pendiente (flujo anterior)</Badge>}
        {state === "none" && <Badge variant={match.status === "cancelled" ? "red" : "gray"}>{MATCH_STATUS_LABELS[match.status] ?? match.status}</Badge>}
        {state === "pending" && <span className="text-xs text-fg-3">Solo tú lo ves; no es público.</span>}
      </div>
      {children}
    </div>
  );
}
