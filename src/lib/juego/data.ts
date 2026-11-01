import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../supabase/database.types";
import { predictionErrorMessage } from "./errors";
import type { LeaderboardEntry, StagePoints } from "./scoring";

// Contratos de datos del jugador para conectar la UI original (Fase 3.2 en adelante). Todo usa la sesión del
// usuario: la base valida membresía, inscripción, visibilidad y exclusiones; aquí no hay service_role.
// Identidad de un pronóstico: (parcheEventId, matchId, userId). Nunca se usa «el primer parche».
type Client = SupabaseClient<Database>;
export type Prediction = Database["public"]["Tables"]["predictions"]["Row"];

export type SavePredictionResult = { ok: true; prediction: Prediction } | { ok: false; error: string; code: string };

/** Guarda (crea o actualiza) el pronóstico propio. Equivale a save_prediction_for_user del original. */
export async function savePrediction(supabase: Client, args: { parcheEventId: string; matchId: string; home: number; away: number }): Promise<SavePredictionResult> {
  const { data, error } = await supabase.rpc("save_prediction", {
    p_parche_event_id: args.parcheEventId,
    p_match_id: args.matchId,
    p_home: args.home,
    p_away: args.away,
  });
  if (error || !data) return { ok: false, error: predictionErrorMessage(error), code: error?.message?.trim() ?? "unknown" };
  return { ok: true, prediction: data as Prediction };
}

/** Pronósticos PROPIOS del usuario en una inscripción (RLS: solo los suyos y los ajenos ya visibles). */
export async function getMyPredictions(supabase: Client, parcheEventId: string, userId: string): Promise<Prediction[]> {
  const { data, error } = await supabase.from("predictions").select("*").eq("parche_event_id", parcheEventId).eq("user_id", userId);
  if (error) throw new Error(`No se pudieron cargar tus pronósticos: ${error.message}`);
  return data ?? [];
}

/** Clasificación del parche en el torneo (puntos → exactos → resultados; empates comparten posición). */
export async function getLeaderboard(supabase: Client, parcheEventId: string): Promise<LeaderboardEntry[]> {
  const { data, error } = await supabase.rpc("get_parche_event_leaderboard", { p_parche_event_id: parcheEventId });
  if (error) throw new Error(`No se pudo cargar la clasificación: ${error.message}`);
  return (data ?? []).map((r) => ({ user_id: r.user_id, display_name: r.display_name, rank: Number(r.rank), total_points: Number(r.total_points) }));
}

export type LeaderboardRow = Database["public"]["Functions"]["get_parche_event_leaderboard"]["Returns"][number];

/** Fila completa de clasificación con exactos, resultados y pronósticos (la tabla del jugador). */
export async function getLeaderboardRows(supabase: Client, parcheEventId: string): Promise<LeaderboardRow[]> {
  const { data, error } = await supabase.rpc("get_parche_event_leaderboard", { p_parche_event_id: parcheEventId });
  if (error) throw new Error(`No se pudo cargar la clasificación: ${error.message}`);
  return data ?? [];
}

export type MatchPredictionRow = Database["public"]["Functions"]["get_match_predictions"]["Returns"][number];

/** Pronósticos de todos en un partido. La base solo los entrega cuando corresponde (`predictions_hidden` si no). */
export async function getMatchPredictions(supabase: Client, parcheEventId: string, matchId: string): Promise<MatchPredictionRow[]> {
  const { data, error } = await supabase.rpc("get_match_predictions", { p_parche_event_id: parcheEventId, p_match_id: matchId });
  if (error) throw new Error(predictionErrorMessage(error));
  return data ?? [];
}

/** Miembros activos del parche sin pronóstico para el partido. */
export async function getMissingPredictions(supabase: Client, parcheEventId: string, matchId: string) {
  const { data, error } = await supabase.rpc("get_match_missing_predictions", { p_parche_event_id: parcheEventId, p_match_id: matchId });
  if (error) throw new Error(predictionErrorMessage(error));
  return data ?? [];
}

/** Puntos por fase del torneo (event_stages): fuente de verdad para simulatePoints y la tabla de reglas. */
export async function getStagePoints(supabase: Client, eventId: string): Promise<Map<string, StagePoints & { name: string; isKnockout: boolean }>> {
  const { data, error } = await supabase.from("event_stages").select("id, name, is_knockout, exact_points, result_points").eq("event_id", eventId);
  if (error) throw new Error(`No se pudieron cargar las fases: ${error.message}`);
  return new Map((data ?? []).map((s) => [s.id, { name: s.name, isKnockout: s.is_knockout, exact: s.exact_points, result: s.result_points }]));
}

/**
 * Sincronización perezosa de partidos (mark_due_matches_live del original): pasa a En vivo los programados cuya
 * hora ya llegó. Llamarla al inicio de cada página que muestre partidos (Control ya lo hace; las pantallas del jugador
 * de la Fase 3.3 deben hacerlo igual). Idempotente; un fallo no es fatal (se registra y la página sigue).
 */
export async function syncDueMatches(supabase: Client): Promise<number> {
  const { data, error } = await supabase.rpc("sync_due_matches");
  if (error) {
    console.warn("[sync] sync_due_matches:", error.message);
    return 0;
  }
  return data ?? 0;
}
