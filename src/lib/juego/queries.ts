import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser, isPlatformAdmin } from "@/lib/auth";
import { getMembership, isUuid } from "@/lib/data";
import { LOGIN_PATH } from "@/lib/navigation";
import type { Membership } from "@/lib/parches";
import { displayNameOf } from "@/lib/users";
import { getLeaderboardRows, getMyPredictions, syncDueMatches } from "./data";
import type { LeaderboardEntry } from "./groups";
import { reasonLabel, type Match, type MatchWithPrediction, type Prediction, type Team } from "./matches";
import { setRequest } from "./request-base";
import type { StagePoints } from "./scoring";

// Consultas del jugador, acotadas SIEMPRE por: usuario autenticado, parche al que pertenece, inscripción válida y
// torneo correcto. Reemplazan a lib/db/* de La Penúltima (que asumían un único grupo global, groups[0]).
// Todo usa la sesión del usuario (RLS); no hay service_role.
export type GameContext = {
  user: { id: string; email?: string | null; user_metadata?: Record<string, unknown> | null };
  displayName: string;
  membership: Membership;
  parcheId: string;
  parcheEventId: string;
  eventId: string;
  eventName: string;
  eventIllustrationPath: string | null;
  eventStatus: string;
  tz: string;
  base: string;
  isSuperadmin: boolean;
  historical: boolean; // torneo con historial sellado: solo lectura, sin juego
  canPlay: boolean;
  // Compatibilidad con las páginas recuperadas, donde el «grupo» era groups[0]: aquí es la inscripción del parche.
  community: { id: string; name: string };
};

export const getGameContext = cache(async (parcheId: string, parcheEventId: string): Promise<GameContext | null> => {
  if (!isUuid(parcheId) || !isUuid(parcheEventId)) return null;
  const { supabase, user } = await getCurrentUser();
  if (!user) redirect(LOGIN_PATH);
  const membership = await getMembership(supabase, user.id, parcheId);
  if (!membership) return null; // un parche ajeno no se revela
  const { data: pe } = await supabase
    .from("parche_events")
    .select("id, status, event_id, events!inner(id, name, status, timezone, illustration_path)")
    .eq("id", parcheEventId)
    .eq("parche_id", parcheId)
    .maybeSingle();
  if (!pe) return null;
  const [superadmin, snap] = await Promise.all([
    isPlatformAdmin(),
    supabase.from("standing_snapshots").select("id").eq("parche_event_id", parcheEventId).not("sealed_at", "is", null).limit(1),
  ]);
  const historical = (snap.data?.length ?? 0) > 0;
  const base = `/parches/${parcheId}/torneos/${parcheEventId}`;
  const ev = pe.events;
  const canPlay = membership.status === "active" && !superadmin && pe.status === "active" && ["scheduled", "in_progress"].includes(ev.status) && !historical;
  setRequest(base, ev.timezone);
  return {
    user, displayName: displayNameOf(user), membership, parcheId, parcheEventId, eventId: pe.event_id, eventName: ev.name, eventIllustrationPath: ev.illustration_path, eventStatus: ev.status,
    tz: ev.timezone, base, isSuperadmin: superadmin, historical, canPlay, community: { id: parcheEventId, name: membership.parcheName },
  };
});

/** Contexto o 404 (acceso denegado sin revelar si el parche o la inscripción existen). */
export async function requireGame(params: Promise<{ parcheId: string; parcheEventId: string }>): Promise<GameContext> {
  const { parcheId, parcheEventId } = await params;
  const ctx = await getGameContext(parcheId, parcheEventId);
  if (!ctx) notFound();
  return ctx;
}

const toPrediction = (p: { id: string; match_id: string; user_id: string; home_score: number; away_score: number; points: number | null; points_reason: string | null; scored_at: string | null; created_at: string; updated_at: string }): Prediction => ({
  id: p.id, match_id: p.match_id, user_id: p.user_id, home_score: p.home_score, away_score: p.away_score, points: p.points ?? 0,
  points_reason: reasonLabel(p.points_reason), scored_at: p.scored_at, created_at: p.created_at, updated_at: p.updated_at,
});
export { toPrediction };

/**
 * Partidos del torneo con el pronóstico PROPIO (de esta inscripción). Antes de leer ejecuta la sincronización perezosa
 * (mark_due_matches_live del original): los programados cuya hora llegó pasan a En vivo.
 */
export const getMatchesWithPredictions = cache(async (ctx: GameContext): Promise<MatchWithPrediction[]> => {
  const { supabase } = await getCurrentUser();
  await syncDueMatches(supabase);
  const [matches, links, stages, preds] = await Promise.all([
    supabase.from("matches").select("*").eq("event_id", ctx.eventId).order("starts_at").order("match_number"),
    supabase.from("event_teams").select("team_id").eq("event_id", ctx.eventId),
    supabase.from("event_stages").select("id, code, name, is_knockout, exact_points, result_points").eq("event_id", ctx.eventId),
    getMyPredictions(supabase, ctx.parcheEventId, ctx.user.id),
  ]);
  if (matches.error) throw new Error(`No se pudieron cargar los partidos: ${matches.error.message}`);
  const ids = (links.data ?? []).map((l) => l.team_id);
  const teamRows = ids.length ? (await supabase.from("teams").select("id, name, code, flag_emoji, kind, crest_path").in("id", ids)).data ?? [] : [];
  const teams = new Map<string, Team>(teamRows.map((t) => [t.id, { id: t.id, name: t.name, code: t.code ?? t.name.slice(0, 3).toUpperCase(), flag_emoji: t.flag_emoji, kind: t.kind, crest_path: t.crest_path }]));
  const stageMap = new Map((stages.data ?? []).map((s) => [s.id, s]));
  const predByMatch = new Map(preds.map((p) => [p.match_id, toPrediction(p)]));
  return (matches.data ?? []).map((m): MatchWithPrediction => {
    const st = stageMap.get(m.stage_id);
    const home = m.home_team_id ? (teams.get(m.home_team_id) ?? null) : null;
    const away = m.away_team_id ? (teams.get(m.away_team_id) ?? null) : null;
    const points: StagePoints = { exact: st?.exact_points ?? 0, result: st?.result_points ?? 0 };
    return {
      id: m.id, home_team_id: m.home_team_id, away_team_id: m.away_team_id, match_number: m.match_number, starts_at: m.starts_at,
      stage: st?.code ?? "", stage_name: st?.name ?? "Fase", stage_points: points, is_knockout: st?.is_knockout ?? false, tz: ctx.tz,
      group_code: m.group_code, round_label: m.round_label, status: m.status as Match["status"], home_score: m.home_score, away_score: m.away_score,
      home_placeholder: m.home_placeholder, away_placeholder: m.away_placeholder, venue: m.venue, created_at: m.created_at,
      home_team: home, away_team: away,
      advancing_team_id: m.winner_side === "home" ? m.home_team_id : m.winner_side === "away" ? m.away_team_id : null,
      winner_side: m.winner_side as Match["winner_side"], player_can_play: ctx.canPlay, prediction: predByMatch.get(m.id) ?? null,
    };
  });
});

/** Clasificación OFICIAL de la inscripción (get_parche_event_leaderboard). */
export const getParcheLeaderboard = cache(async (ctx: GameContext): Promise<LeaderboardEntry[]> => {
  const { supabase } = await getCurrentUser();
  const rows = await getLeaderboardRows(supabase, ctx.parcheEventId);
  return rows.map((r) => ({
    user_id: r.user_id, display_name: r.display_name, total_points: Number(r.total_points), exact_count: Number(r.exact_count),
    result_count: Number(r.result_count), pred_count: Number(r.pred_count), rank: Number(r.rank),
  }));
});
