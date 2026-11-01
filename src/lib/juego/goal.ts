// Detección de goles de La Penúltima (useGoalCelebration): solo celebra cuando el partido está en vivo, ambos
// marcadores previos y actuales son números (descarta null→0 al iniciar) y al menos uno SUBE (descarta correcciones).
export type Score = { home: number | null; away: number | null };

export function isGoal(prev: Score | null, next: Score, isLive: boolean): boolean {
  if (!isLive || prev === null) return false;
  if (prev.home === null || prev.away === null || next.home === null || next.away === null) return false;
  return next.home > prev.home || next.away > prev.away;
}
