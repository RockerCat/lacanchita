// Protección de las llaves: cambiar quién avanza de un partido cuyo ganador/perdedor ya definió un partido posterior
// que empezó o terminó dejaría el cuadro incoherente (y rompería puntos y pronósticos de ese partido). Se rechaza con un
// mensaje comprensible; el resto de correcciones (mismo ganador) y los cruces aún programados se permiten (en ese caso
// Control muestra el conflicto para resolverlo a mano). Nada se propaga ni se sobrescribe automáticamente.

export type Outcome = { home: number | null; away: number | null; winnerSide: string | null };
export type Dependent = { match_number: number | null; status: string };

/** Lado que avanza (ganador de la llave): marcador, o ganador oficial de la llave si hay empate. */
export function advancingSide(o: Outcome): "home" | "away" | null {
  if (o.home === null || o.away === null) return null;
  if (o.home > o.away) return "home";
  if (o.away > o.home) return "away";
  return o.winnerSide === "home" || o.winnerSide === "away" ? o.winnerSide : null;
}

export const outcomeChangesAdvance = (prev: Outcome, next: Outcome): boolean => advancingSide(prev) !== advancingSide(next);

export const startedDependents = (deps: Dependent[]): Dependent[] => deps.filter((d) => d.status === "live" || d.status === "finished");

export function downstreamMessage(matchNumber: number | null, started: Dependent[], action: "corregir" | "reabrir"): string {
  const list = started.map((d) => (d.match_number ? `M${d.match_number}` : "un partido")).join(", ");
  return `No se puede ${action} ${matchNumber ? `M${matchNumber}` : "este partido"}: su resultado ya definió a ${started.length === 1 ? "un partido posterior que" : "partidos posteriores que"} ya empezó o terminó (${list}). Resuelve primero ese partido (con motivo) para no dejar el cuadro incoherente.`;
}
