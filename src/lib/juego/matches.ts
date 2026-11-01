import { REASON_LABELS, simulatePoints as simulate, type PointsReason, type StagePoints } from "./scoring";

// Tipos y utilidades de partidos recuperados de La Penúltima (lib/matches.ts) y adaptados a La Canchita:
//   * la fase y sus puntos salen del torneo (event_stages), no de una tabla fija del Mundial;
//   * la zona horaria es la del torneo (events.timezone), no Bogotá fija;
//   * estados adicionales `postponed` y `cancelled`;
//   * `player_can_play` = el usuario puede pronosticar en esta inscripción (miembro activo y no superadministrador).
export type Team = { id: string; name: string; code: string; flag_emoji: string | null; kind?: string; crest_path?: string | null };
export type MatchStatus = "scheduled" | "live" | "finished" | "postponed" | "cancelled";

export type Match = {
  id: string;
  home_team_id: string | null;
  away_team_id: string | null;
  match_number: number | null;
  starts_at: string;
  stage: string; // código de la fase
  stage_name: string;
  stage_points: StagePoints;
  is_knockout: boolean;
  tz: string;
  group_code: string | null;
  round_label: string | null;
  status: MatchStatus;
  home_score: number | null;
  away_score: number | null;
  home_placeholder: string | null;
  away_placeholder: string | null;
  venue: string | null;
  created_at: string;
  home_team: Team | null;
  away_team: Team | null;
  // Equipo que avanzó por penales (derivado de winner_side). NUNCA se usa para puntuar.
  advancing_team_id: string | null;
  winner_side: "home" | "away" | null;
  player_can_play: boolean;
};

export const isKnockoutStage = (m: Pick<Match, "is_knockout">): boolean => m.is_knockout;

export type Prediction = {
  id: string;
  match_id: string;
  user_id: string;
  home_score: number;
  away_score: number;
  points: number;
  points_reason: string | null;
  scored_at: string | null;
  created_at: string;
  updated_at: string;
};

export type MatchWithPrediction = Match & { prediction: Prediction | null };

export type PredictionActionResult = { error: string; devMessage?: string } | { success: true; prediction: Prediction };
export type PredictionActionState = PredictionActionResult | null;

export const reasonLabel = (reason: string | null): string | null => (reason && reason in REASON_LABELS ? REASON_LABELS[reason as PointsReason] : reason);

/** Motivo por el que los pronósticos están cerrados (mismos códigos que el original), o null si están abiertos. */
export function matchClosedReason(match: Pick<Match, "starts_at" | "status" | "player_can_play">, now: number = Date.now()): "match_not_scheduled" | "match_started" | null {
  if (!match.player_can_play) return "match_not_scheduled";
  if (match.status !== "scheduled" && match.status !== "postponed") return "match_not_scheduled";
  if (now >= new Date(match.starts_at).getTime()) return "match_started";
  return null;
}

export function isMatchOpen(match: Pick<Match, "starts_at" | "status" | "player_can_play">): boolean {
  return matchClosedReason(match) === null;
}

export function matchTeamName(team: Team | null, placeholder: string | null): string {
  return team?.name ?? placeholder ?? "Por definir";
}
export function matchTeamCode(team: Team | null, placeholder: string | null): string {
  return team?.code ?? placeholder ?? "TBD";
}
export function matchTeamFlag(team: Team | null): string {
  return team?.flag_emoji ?? "🏳️";
}

const dayKey = (iso: string, tz: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: tz });

/** Etiqueta de fecha/hora legible («Hoy · 15:00») en la zona horaria del torneo. */
export function formatKickoff(startsAt: string, tz: string = "UTC"): string {
  const [ty, tm, td] = dayKey(new Date().toISOString(), tz).split("-").map(Number);
  const [my, mm, md] = dayKey(startsAt, tz).split("-").map(Number);
  const diffDays = Math.round((new Date(my, mm - 1, md).getTime() - new Date(ty, tm - 1, td).getTime()) / 86_400_000);
  const time = new Date(startsAt).toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit", timeZone: tz });
  if (diffDays === -1) return `Ayer · ${time}`;
  if (diffDays === 0) return `Hoy · ${time}`;
  if (diffDays === 1) return `Mañana · ${time}`;
  return new Date(startsAt).toLocaleDateString("es", { weekday: "short", day: "numeric", month: "short", timeZone: tz }) + ` · ${time}`;
}

/** Marca de tiempo breve de un pronóstico, p. ej. «18 jun, 9:25 p. m.». */
export function formatPredictionTimestamp(iso: string, tz: string = "UTC"): string {
  const d = new Date(iso);
  const day = d.toLocaleDateString("es", { day: "numeric", timeZone: tz });
  const month = d.toLocaleDateString("es", { month: "short", timeZone: tz }).replace(/\.$/, "");
  const time = d.toLocaleTimeString("es", { hour: "numeric", minute: "2-digit", timeZone: tz });
  return `${day} ${month}, ${time}`;
}

export type ScoringResult = { points: number; reason: "Marcador exacto" | "Resultado acertado" | "Sin puntos" };

/** Puntos que ganaría un pronóstico contra un marcador conocido, con las etiquetas del original. */
export function simulatePoints(predHome: number, predAway: number, actualHome: number, actualAway: number, points: StagePoints): ScoringResult {
  const r = simulate(predHome, predAway, actualHome, actualAway, points);
  return { points: r.points, reason: REASON_LABELS[r.reason] as ScoringResult["reason"] };
}

/** Clave de día para agrupar partidos en el calendario. */
export function matchDayKey(startsAt: string, tz: string = "UTC"): string {
  return new Date(startsAt).toLocaleDateString("es", { weekday: "long", day: "numeric", month: "long", timeZone: tz });
}

/** El torneo terminó cuando todo partido está finalizado o cancelado (una lista vacía nunca cuenta como terminado). */
export function isTournamentFinished(matches: Pick<Match, "status">[]): boolean {
  return matches.length > 0 && matches.every((m) => m.status === "finished" || m.status === "cancelled");
}

/** Fase actual: la del partido en vivo, o la del primero programado; si no, la última. */
export function detectCurrentStage(matches: Pick<Match, "stage" | "status">[]): string | null {
  const live = matches.find((m) => m.status === "live");
  if (live) return live.stage;
  const next = matches.find((m) => m.status === "scheduled" || m.status === "postponed");
  if (next) return next.stage;
  return matches[matches.length - 1]?.stage ?? null;
}
