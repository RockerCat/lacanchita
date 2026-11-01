// Lógica pura del juego recuperada de La Penúltima (el-var/src/lib/matches.ts: simulatePoints, matchClosedReason,
// isMatchOpen y la proyección en vivo de matches/[matchId]/page.tsx), adaptada a La Canchita:
//   * los puntos NO están fijos en el código: salen de event_stages (exact_points / result_points) de cada torneo;
//   * el motivo usa los valores de la base ('exact' | 'result' | 'miss') con las etiquetas originales en español.
// Espejo de private.score_match (SQL): exacto y resultado son excluyentes, los penales no puntúan.
export type StagePoints = { exact: number; result: number };
export type PointsReason = "exact" | "result" | "miss";
export type ScoringResult = { points: number; reason: PointsReason };

export const REASON_LABELS: Record<PointsReason, string> = {
  exact: "Marcador exacto",
  result: "Resultado acertado",
  miss: "Sin puntos",
};

/** Puntos que ganaría un pronóstico contra un marcador conocido (final o «si terminara ahora»). */
export function simulatePoints(predHome: number, predAway: number, actualHome: number, actualAway: number, points: StagePoints): ScoringResult {
  if (predHome === actualHome && predAway === actualAway) return { points: points.exact, reason: "exact" };
  if (Math.sign(predHome - predAway) === Math.sign(actualHome - actualAway)) return { points: points.result, reason: "result" };
  return { points: 0, reason: "miss" };
}

export type MatchClosedReason = "match_not_open" | "match_started";
type MatchTiming = { status: string; starts_at: string };

/**
 * Motivo por el que los pronósticos están cerrados, o null si están abiertos. Refleja la regla de la base
 * (save_prediction / can_write_prediction): estado programado o aplazado Y antes de la hora de inicio.
 * Un finalizado reabierto (En vivo) sigue cerrado; un aplazado conserva sus pronósticos y se edita hasta su nueva hora.
 */
export function matchClosedReason(match: MatchTiming, now: number = Date.now()): MatchClosedReason | null {
  if (match.status !== "scheduled" && match.status !== "postponed") return "match_not_open";
  if (now >= new Date(match.starts_at).getTime()) return "match_started";
  return null;
}

export const isPredictionOpen = (match: MatchTiming, now?: number) => matchClosedReason(match, now) === null;

export type LeaderboardEntry = { user_id: string; display_name: string; rank: number; total_points: number };
export type PredictionLike = { user_id: string; pred_home: number; pred_away: number };
export type ProjectedEntry = {
  user_id: string;
  display_name: string;
  current_rank: number;
  current_points: number;
  sim_points: number;
  projected_total: number;
  projected_rank: number;
  pred_home: number | null;
  pred_away: number | null;
  sim_reason: PointsReason | null;
};

/**
 * Tabla proyectada de un partido EN VIVO: suma a cada jugador lo que ganaría si terminara con el marcador actual.
 * Misma lógica del original: orden por total proyectado desc y nombre; posición = 1 + jugadores con MÁS puntos
 * (no aplica desempates, solo aproxima la tabla). Un jugador sin pronóstico suma 0.
 */
export function projectLeaderboard(
  board: LeaderboardEntry[],
  predictions: PredictionLike[],
  actual: { home: number; away: number },
  points: StagePoints
): ProjectedEntry[] {
  const byUser = new Map(predictions.map((p) => [p.user_id, p]));
  const rows = board.map((e) => {
    const pred = byUser.get(e.user_id);
    const sim = pred ? simulatePoints(pred.pred_home, pred.pred_away, actual.home, actual.away, points) : null;
    return {
      user_id: e.user_id,
      display_name: e.display_name,
      current_rank: e.rank,
      current_points: e.total_points,
      sim_points: sim?.points ?? 0,
      projected_total: e.total_points + (sim?.points ?? 0),
      projected_rank: 0,
      pred_home: pred?.pred_home ?? null,
      pred_away: pred?.pred_away ?? null,
      sim_reason: sim?.reason ?? null,
    };
  });
  rows.sort((a, b) => b.projected_total - a.projected_total || a.display_name.localeCompare(b.display_name));
  return rows.map((r) => ({ ...r, projected_rank: rows.filter((o) => o.projected_total > r.projected_total).length + 1 }));
}
