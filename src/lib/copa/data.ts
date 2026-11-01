import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { buildCopaModel, type CopaMatch, type CopaModel, type CopaStage } from "./format";

type Client = SupabaseClient<Database>;

// Carga la Copa de un torneo desde `matches` (única fuente de resultados). Funciona con la sesión del usuario (RLS)
// y con la del superadministrador (Control). No escribe nada.
export async function loadCopaModel(supabase: Client, eventId: string): Promise<CopaModel> {
  const [stages, matches, links] = await Promise.all([
    supabase.from("event_stages").select("id, code, name, sort_order, is_knockout").eq("event_id", eventId),
    supabase.from("matches").select("id, stage_id, match_number, starts_at, venue, status, home_score, away_score, winner_side, group_code, home_placeholder, away_placeholder, home_team_id, away_team_id, result_confirmed_at").eq("event_id", eventId).order("starts_at").order("match_number"),
    supabase.from("event_teams").select("team_id").eq("event_id", eventId),
  ]);
  if (stages.error || matches.error) throw new Error("No se pudo cargar el cuadro del torneo");
  const ids = (links.data ?? []).map((l) => l.team_id);
  const rows = ids.length ? (await supabase.from("teams").select("id, name, code, flag_emoji").in("id", ids)).data ?? [] : [];
  const teams = new Map(rows.map((t) => [t.id, { id: t.id, name: t.name, code: t.code ?? t.name.slice(0, 3).toUpperCase(), flag_emoji: t.flag_emoji }]));
  const copaMatches: CopaMatch[] = (matches.data ?? []).map((m) => ({
    id: m.id, stage_id: m.stage_id, match_number: m.match_number, starts_at: m.starts_at, venue: m.venue, status: m.status,
    home_score: m.home_score, away_score: m.away_score, winner_side: (m.winner_side as "home" | "away" | null) ?? null, group_code: m.group_code,
    home_placeholder: m.home_placeholder, away_placeholder: m.away_placeholder,
    home_team: m.home_team_id ? (teams.get(m.home_team_id) ?? null) : null, away_team: m.away_team_id ? (teams.get(m.away_team_id) ?? null) : null,
    official: m.result_confirmed_at !== null,
  }));
  return buildCopaModel((stages.data ?? []) as CopaStage[], copaMatches);
}
