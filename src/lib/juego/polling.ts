// Cadencias de sondeo recuperadas de La Penúltima (LiveMatchPoller / MatchDetailPoller). El código original
// documentaba 5 s para partidos en vivo pero usaba 10 s por defecto; aquí se conserva el valor real (10 s).
export const HIDDEN_INTERVAL_MS = 60_000;
export const LIVE_ACTIVE_INTERVAL_MS = 10_000;
export const LIVE_IDLE_INTERVAL_MS = 15_000;

/** Cadencia de las listas (inicio, en vivo): pestaña oculta 60 s; con partido en vivo 10 s; sin él 15 s. */
export function listInterval(hasLiveMatch: boolean, hidden: boolean, active = LIVE_ACTIVE_INTERVAL_MS, idle = LIVE_IDLE_INTERVAL_MS): number {
  if (hidden) return HIDDEN_INTERVAL_MS;
  return hasLiveMatch ? active : idle;
}

/**
 * Cadencia del detalle de un partido (se reevalúa en cada tick):
 *   finalizado/cancelado → 60 s (pasivo) · en vivo → 10 s · programado a ≤ 5 min → 10 s · a > 5 min → 30 s
 *   hora vencida aún sin sincronizar → 5 s · aplazado → 30 s · pestaña oculta → 60 s
 */
export function detailInterval(status: string, startsAt: string, hidden: boolean, now: number = Date.now()): number {
  if (hidden) return HIDDEN_INTERVAL_MS;
  if (status === "finished" || status === "cancelled") return HIDDEN_INTERVAL_MS;
  if (status === "live") return 10_000;
  if (status === "postponed") return 30_000;
  const msToKickoff = new Date(startsAt).getTime() - now;
  if (msToKickoff <= 0) return 5_000;
  if (msToKickoff <= 5 * 60_000) return 10_000;
  return 30_000;
}

/** El detalle no sondea cuando el partido ya no puede cambiar. */
export const detailIsPassive = (status: string) => status === "finished" || status === "cancelled";

/**
 * ¿Debe omitirse este tick? Nunca se dispara un refresh mientras otro está en curso; con un formulario de
 * pronóstico abierto se pausa (salvo en el detalle cuando la hora de inicio ya pasó: la sincronización debe correr).
 */
export function shouldSkipTick(opts: { refreshInFlight: boolean; isEditing: boolean; kickoffPassed?: boolean }): boolean {
  if (opts.refreshInFlight) return true;
  return opts.isEditing && !opts.kickoffPassed;
}
