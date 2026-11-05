import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./supabase/database.types";
import type { Membership, MembershipRole, MembershipStatus } from "./parches";
import type { SnapshotRow } from "./historial";

// Todas las lecturas usan la sesión del usuario: RLS decide qué parches, membresías
// e historiales son visibles. Aquí no se usa service_role. Las columnas monetarias heredadas
// no se leen (y authenticated ya no tiene privilegio sobre ellas).
export type Client = SupabaseClient<Database>;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (value: string) => UUID_RE.test(value);

export async function getMemberships(supabase: Client, userId: string): Promise<Membership[]> {
  const { data, error } = await supabase
    .from("parche_members")
    .select("role, status, parches!inner(id, name)")
    .eq("user_id", userId);
  if (error) throw new Error(`No se pudieron cargar tus parches: ${error.message}`);
  return (data ?? []).map((m) => ({
    parcheId: m.parches.id,
    parcheName: m.parches.name,
    role: m.role as MembershipRole,
    status: m.status as MembershipStatus,
  }));
}

export async function getMembership(supabase: Client, userId: string, parcheId: string): Promise<Membership | null> {
  if (!isUuid(parcheId)) return null;
  const { data, error } = await supabase
    .from("parche_members")
    .select("role, status, parches!inner(id, name)")
    .eq("user_id", userId)
    .eq("parche_id", parcheId)
    .maybeSingle();
  if (error) throw new Error(`No se pudo cargar el parche: ${error.message}`);
  if (!data) return null;
  return {
    parcheId: data.parches.id,
    parcheName: data.parches.name,
    role: data.role as MembershipRole,
    status: data.status as MembershipStatus,
  };
}

export type ParcheEventSummary = {
  id: string;
  status: string;
  eventName: string;
  eventStatus: string;
  snapshot: { kind: string; version: number } | null;
};

export async function getParcheEvents(supabase: Client, parcheId: string): Promise<ParcheEventSummary[]> {
  const { data, error } = await supabase
    .from("parche_events")
    .select("id, status, created_at, events!inner(name, status), standing_snapshots(kind, version, sealed_at)")
    .eq("parche_id", parcheId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`No se pudieron cargar los torneos: ${error.message}`);
  return (data ?? []).map((pe) => ({
    id: pe.id,
    status: pe.status,
    eventName: pe.events.name,
    eventStatus: pe.events.status,
    snapshot: pickSnapshot(pe.standing_snapshots ?? []),
  }));
}

// Prefiere la clasificación final oficial; si no existe, el corte histórico más reciente.
export function pickSnapshot<T extends { kind: string; version: number; sealed_at: string | null }>(snapshots: T[]): T | null {
  const sealed = snapshots.filter((s) => s.sealed_at);
  return (
    sealed.find((s) => s.kind === "final_close") ??
    [...sealed].sort((a, b) => b.version - a.version)[0] ??
    null
  );
}

export type EventResult = { key: string; teamName: string; flag: string | null; derived: boolean };

export type History = {
  eventName: string;
  eventStatus: string;
  snapshot: {
    kind: string;
    source: string;
    version: number;
    memberCount: number;
    rankedCount: number;
    dataCutoffAt: string | null;
    rankingOrder: unknown;
  };
  rows: SnapshotRow[];
  results: EventResult[];
};

export async function getHistory(supabase: Client, parcheId: string, parcheEventId: string): Promise<History | null> {
  if (!isUuid(parcheEventId)) return null;
  const { data: pe, error } = await supabase
    .from("parche_events")
    .select("id, event_id, events!inner(name, status)")
    .eq("id", parcheEventId)
    .eq("parche_id", parcheId)
    .maybeSingle();
  if (error) throw new Error(`No se pudo cargar el torneo: ${error.message}`);
  if (!pe) return null;

  const { data: snapshots, error: sErr } = await supabase
    .from("standing_snapshots")
    .select("id, kind, source, version, member_count, ranked_count, data_cutoff_at, ranking_rules, sealed_at")
    .eq("parche_event_id", parcheEventId);
  if (sErr) throw new Error(`No se pudo cargar el historial: ${sErr.message}`);
  const snapshot = pickSnapshot(snapshots ?? []);
  if (!snapshot) return null;

  const [rowsRes, resultsRes] = await Promise.all([
    supabase
      .from("standing_snapshot_rows")
      .select(
        "row_number, user_id, display_name, participation, unranked_reason, position, position_shared, stats_status, points, exact_hits, result_hits, misses, predictions_count"
      )
      .eq("snapshot_id", snapshot.id)
      .order("row_number"),
    supabase.from("event_results").select("result_key, team_id, source_match_id").eq("event_id", pe.event_id),
  ]);
  if (rowsRes.error) throw new Error(`No se pudo cargar la clasificación: ${rowsRes.error.message}`);
  if (resultsRes.error) throw new Error(`No se pudieron cargar los resultados: ${resultsRes.error.message}`);

  const results = resultsRes.data ?? [];
  const teamIds = [...new Set(results.map((r) => r.team_id))];
  const matchIds = [...new Set(results.map((r) => r.source_match_id))];
  const [teamsRes, matchesRes] = await Promise.all([
    teamIds.length ? supabase.from("teams").select("id, name, flag_emoji").in("id", teamIds) : { data: [], error: null },
    matchIds.length ? supabase.from("matches").select("id, teams_source").in("id", matchIds) : { data: [], error: null },
  ]);
  if (teamsRes.error || matchesRes.error) throw new Error("No se pudieron cargar los resultados del torneo.");
  const teams = new Map((teamsRes.data ?? []).map((t) => [t.id, t]));
  const derivedMatches = new Set(
    (matchesRes.data ?? []).filter((m) => m.teams_source === "derived_legacy_logic").map((m) => m.id)
  );
  const order = ["champion", "runner_up", "third_place", "fourth_place"];

  return {
    eventName: pe.events.name,
    eventStatus: pe.events.status,
    snapshot: {
      kind: snapshot.kind,
      source: snapshot.source,
      version: snapshot.version,
      memberCount: snapshot.member_count,
      rankedCount: snapshot.ranked_count,
      dataCutoffAt: snapshot.data_cutoff_at,
      rankingOrder: (snapshot.ranking_rules as { order?: unknown } | null)?.order,
    },
    rows: (rowsRes.data ?? []) as SnapshotRow[],
    results: results
      .sort((a, b) => order.indexOf(a.result_key) - order.indexOf(b.result_key))
      .map((r) => ({
        key: r.result_key,
        teamName: teams.get(r.team_id)?.name ?? "Equipo desconocido",
        flag: teams.get(r.team_id)?.flag_emoji ?? null,
        derived: derivedMatches.has(r.source_match_id),
      })),
  };
}

export type ParcheMember = {
  userId: string;
  displayName: string;
  role: MembershipRole;
  status: MembershipStatus;
  joinedAt: string;
  isMe: boolean;
};

// Participantes con nombre visible (función get_parche_members: solo miembros del parche, sin correos).
export async function getParcheMembers(supabase: Client, parcheId: string): Promise<ParcheMember[]> {
  if (!isUuid(parcheId)) return [];
  const { data, error } = await supabase.rpc("get_parche_members", { p_parche_id: parcheId });
  if (error) throw new Error(`No se pudieron cargar los participantes: ${error.message}`);
  return (data ?? []).map((m) => ({
    userId: m.user_id,
    displayName: m.display_name,
    role: m.role as MembershipRole,
    status: m.status as MembershipStatus,
    joinedAt: m.joined_at,
    isMe: m.is_me,
  }));
}

export type OpenInvitation = { expiresAt: string; useCount: number; maxUses: number | null; expired: boolean };

// Enlace activo del parche (RLS: solo administradores activos lo ven; nunca el token ni su hash).
export async function getOpenInvitation(supabase: Client, parcheId: string): Promise<OpenInvitation | null> {
  const { data, error } = await supabase
    .from("parche_invitations")
    .select("expires_at, use_count, max_uses")
    .eq("parche_id", parcheId)
    .is("revoked_at", null)
    .maybeSingle();
  if (error) throw new Error(`No se pudo cargar la invitación: ${error.message}`);
  if (!data) return null;
  return {
    expiresAt: data.expires_at,
    useCount: data.use_count,
    maxUses: data.max_uses,
    expired: new Date(data.expires_at).getTime() <= Date.now(),
  };
}

export type AvailableEvent = { id: string; name: string; status: string; illustration_path?: string | null };

// Torneos publicados y abiertos (RLS oculta los borradores) que el parche aún no ha incorporado.
export async function getAvailableEvents(supabase: Client, parcheId: string): Promise<AvailableEvent[]> {
  const [eventsRes, enrolledRes] = await Promise.all([
    supabase.from("events").select("id, name, status, illustration_path").in("status", ["scheduled", "in_progress"]).order("name"),
    supabase.from("parche_events").select("event_id").eq("parche_id", parcheId),
  ]);
  if (eventsRes.error) throw new Error(`No se pudieron cargar los torneos disponibles: ${eventsRes.error.message}`);
  if (enrolledRes.error) throw new Error(`No se pudieron cargar los torneos del parche: ${enrolledRes.error.message}`);
  const enrolled = new Set((enrolledRes.data ?? []).map((r) => r.event_id));
  return (eventsRes.data ?? []).filter((e) => !enrolled.has(e.id));
}
