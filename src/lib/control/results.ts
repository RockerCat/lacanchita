// Estado de un resultado (Fase 3.2 — comportamiento original de La Penúltima):
//   en vivo   = matches.status 'live': el marcador se guarda directo en matches y es público al instante
//   oficial   = result_confirmed_at NOT NULL: partido finalizado (cierre); el motor de la Fase 3.1 puntuó
//   importado = partido histórico de La Penúltima: finalizado con marcador y sin cierre explícito registrado
//   pendiente = marcador del flujo anterior (private.match_result_drafts), conservado para revisión explícita
//   sin resultado = ninguno de los anteriores
export type MatchResultFields = {
  status: string;
  home_score: number | null;
  away_score: number | null;
  result_confirmed_at: string | null;
};

// Marcador pendiente heredado (fila de control_pending_results).
export type PendingDraft = {
  match_id: string;
  home_score: number;
  away_score: number;
  winner_side: string | null;
  revision: number;
};

export type ResultState = "none" | "live" | "official" | "imported" | "pending";

export function resultState(m: MatchResultFields, draft?: PendingDraft | null): ResultState {
  if (m.result_confirmed_at) return "official";
  if (m.status === "live") return "live";
  if (draft) return "pending";
  if (m.status === "finished" && m.home_score !== null && m.away_score !== null) return "imported";
  return "none";
}

export const RESULT_STATE_LABELS: Record<ResultState, string> = {
  none: "Sin resultado",
  live: "En vivo",
  official: "Finalizado",
  imported: "Importado (histórico)",
  pending: "Marcador pendiente (flujo anterior)",
};

export const MATCH_STATUS_LABELS: Record<string, string> = {
  scheduled: "Programado",
  live: "En vivo",
  finished: "Finalizado",
  postponed: "Aplazado",
  cancelled: "Cancelado",
};

export const EVENT_STATUS_LABELS_CONTROL: Record<string, string> = {
  draft: "Borrador",
  scheduled: "Publicado",
  in_progress: "En curso",
  finished: "Finalizado",
  closed: "Cerrado",
  cancelled: "Cancelado",
};

export type ResultSummary = { total: number; none: number; live: number; official: number; imported: number; pending: number };

export function summarizeResults(matches: (MatchResultFields & { id: string })[], drafts: PendingDraft[] = []): ResultSummary {
  const byMatch = new Map(drafts.map((d) => [d.match_id, d]));
  const s: ResultSummary = { total: matches.length, none: 0, live: 0, official: 0, imported: 0, pending: 0 };
  for (const m of matches) s[resultState(m, byMatch.get(m.id))] += 1;
  return s;
}
