import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../supabase/database.types";
import { isUuid } from "../data";
import { summarizeResults, type PendingDraft, type ResultSummary } from "./results";

// Lecturas de La Canchita Control con la sesión del superadministrador (RLS: un superadministrador
// ve también los borradores). Las escrituras solo ocurren en las acciones, vía funciones control_*.
type Client = SupabaseClient<Database>;

export type ControlEvent = {
  id: string;
  slug: string;
  name: string;
  status: string;
  timezone: string;
  official_end_at: string | null;
};
export type Stage = Database["public"]["Tables"]["event_stages"]["Row"];
export type Team = Database["public"]["Tables"]["teams"]["Row"];
export type Match = Database["public"]["Tables"]["matches"]["Row"];
export type EventTeam = { team: Team; groupCode: string | null };
export type AuditRow = Database["public"]["Tables"]["control_audit_log"]["Row"];

const EVENT_COLUMNS = "id, slug, name, status, timezone, official_end_at";

async function lockReasons(supabase: Client): Promise<Map<string, string>> {
  const { data, error } = await supabase.rpc("control_event_lock_reasons");
  if (error) throw new Error(`No se pudo comprobar el bloqueo de torneos: ${error.message}`);
  return new Map((data ?? []).map((r) => [r.event_id, r.reason]));
}

export type EventListItem = ControlEvent & { summary: ResultSummary; locked: string | null; stageCount: number; teamCount: number };

export async function listControlEvents(supabase: Client): Promise<EventListItem[]> {
  const [events, matches, stages, teams, locks] = await Promise.all([
    supabase.from("events").select(EVENT_COLUMNS).order("created_at", { ascending: false }),
    supabase.from("matches").select("id, event_id, status, home_score, away_score, result_confirmed_at"),
    supabase.from("event_stages").select("event_id"),
    supabase.from("event_teams").select("event_id"),
    lockReasons(supabase),
  ]);
  if (events.error) throw new Error(`No se pudieron cargar los torneos: ${events.error.message}`);
  if (matches.error || stages.error || teams.error) throw new Error("No se pudo cargar el resumen de torneos.");
  const byEvent = <T extends { event_id: string }>(rows: T[] | null) => {
    const m = new Map<string, T[]>();
    for (const r of rows ?? []) m.set(r.event_id, [...(m.get(r.event_id) ?? []), r]);
    return m;
  };
  const draftLists = await Promise.all((events.data ?? []).map((e) => getPendingResults(supabase, e.id)));
  const drafts = new Map((events.data ?? []).map((e, i) => [e.id, draftLists[i]]));
  const mm = byEvent(matches.data);
  const ss = byEvent(stages.data);
  const tt = byEvent(teams.data);
  return (events.data ?? []).map((e) => ({
    ...e,
    summary: summarizeResults(mm.get(e.id) ?? [], drafts.get(e.id) ?? []),
    locked: locks.get(e.id) ?? null,
    stageCount: ss.get(e.id)?.length ?? 0,
    teamCount: tt.get(e.id)?.length ?? 0,
  }));
}

// Resuelve un torneo por su slug (ruta canónica) o, por compatibilidad con enlaces antiguos, por su UUID.
export async function getControlEvent(supabase: Client, ref: string): Promise<(ControlEvent & { locked: string | null }) | null> {
  let { data, error } = await supabase.from("events").select(EVENT_COLUMNS).eq("slug", ref).maybeSingle();
  if (!data && !error && isUuid(ref)) ({ data, error } = await supabase.from("events").select(EVENT_COLUMNS).eq("id", ref).maybeSingle());
  if (error) throw new Error(`No se pudo cargar el torneo: ${error.message}`);
  if (!data) return null;
  return { ...data, locked: (await lockReasons(supabase)).get(data.id) ?? null };
}

// Marcadores PENDIENTES del torneo (solo superadministradores; viven en una tabla privada).
export async function getPendingResults(supabase: Client, eventId: string): Promise<PendingDraft[]> {
  const { data, error } = await supabase.rpc("control_pending_results", { p_event_id: eventId });
  if (error) throw new Error(`No se pudieron cargar los marcadores pendientes: ${error.message}`);
  return data ?? [];
}

export async function getPublishIssues(supabase: Client, eventId: string): Promise<string[]> {
  const { data, error } = await supabase.rpc("control_event_publish_issues", { p_event_id: eventId });
  if (error) throw new Error(`No se pudieron comprobar los requisitos: ${error.message}`);
  return data ?? [];
}

export async function getStages(supabase: Client, eventId: string): Promise<Stage[]> {
  const { data, error } = await supabase.from("event_stages").select("*").eq("event_id", eventId).order("sort_order");
  if (error) throw new Error(`No se pudieron cargar las fases: ${error.message}`);
  return data ?? [];
}

export async function getEventTeams(supabase: Client, eventId: string): Promise<EventTeam[]> {
  const { data: links, error } = await supabase.from("event_teams").select("team_id, group_code").eq("event_id", eventId);
  if (error) throw new Error(`No se pudieron cargar los equipos: ${error.message}`);
  const ids = (links ?? []).map((l) => l.team_id);
  if (ids.length === 0) return [];
  const { data: teams, error: tErr } = await supabase.from("teams").select("*").in("id", ids);
  if (tErr) throw new Error(`No se pudieron cargar los equipos: ${tErr.message}`);
  const byId = new Map((teams ?? []).map((t) => [t.id, t]));
  return (links ?? [])
    .map((l) => ({ team: byId.get(l.team_id) as Team, groupCode: l.group_code }))
    .filter((x) => x.team)
    .sort((a, b) => (a.groupCode ?? "~").localeCompare(b.groupCode ?? "~") || a.team.name.localeCompare(b.team.name, "es"));
}

// Catálogo global de equipos (un superadministrador ve todos), con búsqueda por nombre o código.
export async function searchTeams(supabase: Client, q: string, limit = 50): Promise<Team[]> {
  let query = supabase.from("teams").select("*").order("name").limit(limit);
  const term = q.trim().replace(/[%,()]/g, " ").trim();
  if (term) query = query.or(`name.ilike.%${term}%,code.ilike.%${term}%`);
  const { data, error } = await query;
  if (error) throw new Error(`No se pudieron buscar equipos: ${error.message}`);
  return data ?? [];
}

export type MatchFilters = { stageId?: string; status?: string; from?: string; to?: string };

export async function getMatches(supabase: Client, eventId: string, filters: MatchFilters = {}): Promise<Match[]> {
  let q = supabase.from("matches").select("*").eq("event_id", eventId).order("starts_at").order("match_number");
  if (filters.stageId && isUuid(filters.stageId)) q = q.eq("stage_id", filters.stageId);
  if (filters.status) q = q.eq("status", filters.status);
  if (filters.from) q = q.gte("starts_at", filters.from);
  if (filters.to) q = q.lt("starts_at", filters.to);
  const { data, error } = await q;
  if (error) throw new Error(`No se pudieron cargar los partidos: ${error.message}`);
  const rows = data ?? [];
  return rows;
}

export async function getMatch(supabase: Client, eventId: string, matchId: string): Promise<Match | null> {
  if (!isUuid(matchId)) return null;
  const { data, error } = await supabase.from("matches").select("*").eq("event_id", eventId).eq("id", matchId).maybeSingle();
  if (error) throw new Error(`No se pudo cargar el partido: ${error.message}`);
  return data;
}

export async function getAudit(supabase: Client, eventId: string, limit = 100): Promise<AuditRow[]> {
  const { data, error } = await supabase
    .from("control_audit_log")
    .select("*")
    .eq("event_id", eventId)
    .order("id", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`No se pudo cargar la actividad: ${error.message}`);
  return data ?? [];
}

// Nombre legible de un lado del partido: equipo asignado o descripción.
export function sideLabel(teamId: string | null, placeholder: string | null, teams: Map<string, Team>): string {
  if (teamId) return teams.get(teamId)?.name ?? "Equipo";
  return placeholder?.trim() || "Por definir";
}
