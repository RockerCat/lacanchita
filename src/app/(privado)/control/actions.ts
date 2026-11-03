"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requirePlatformAdmin } from "@/lib/auth";
import { isUuid } from "@/lib/data";
import { controlErrorMessage, ERROR_FIELDS } from "@/lib/control/errors";
import { isValidTimeZone, localToUtc, TIME_ERROR_MESSAGES } from "@/lib/control/time";
import { checkCrest } from "@/lib/control/crest";
import { checkIllustration, ILLUSTRATION_BUCKET } from "@/lib/control/illustration";
import { suggestFlag } from "@/lib/control/team-visual";
import { publishMatchNewsSafely } from "@/lib/news/data";
import { loadCopaModel } from "@/lib/copa/data";
import { resolveCopa } from "@/lib/copa/format";
import { planAdvance } from "@/lib/copa/plan";
import { downstreamMessage, outcomeChangesAdvance, startedDependents } from "@/lib/copa/guard";

// Cada acción vuelve a comprobar en el servidor que quien llama es superadministrador (el 404 de la
// interfaz no basta) y usa la sesión del usuario: las funciones control_* de la base repiten la
// comprobación y escriben la auditoría en la misma transacción. Los campos del formulario solo
// identifican el objetivo; el actor y la fecha los fija la base.
//
// La creación de torneos y de fases NO tiene formulario ni acción aquí: los torneos se preparan con
// importaciones verificadas. Las funciones control_create_event / control_save_stage (alta) siguen
// existiendo en la base para esas importaciones.
export type ControlState = {
  error: string | null;
  ok?: boolean;
  message?: string;
  fieldErrors?: Record<string, string>;
  values?: Record<string, string>;
};

type Supabase = Awaited<ReturnType<typeof requirePlatformAdmin>>["supabase"];

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const optStr = (fd: FormData, k: string) => str(fd, k) || null;
// Los tipos generados marcan los argumentos como no nulos; las funciones aceptan NULL donde corresponde.
const nul = <T>(v: T | null) => v as T;

function formValues(fd: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of fd.entries()) if (typeof v === "string") out[k] = v;
  return out;
}

// Error de validación: si el código corresponde a un campo presente en el formulario se muestra junto a
// ese campo (sin aviso general duplicado); si no, como aviso general. Nunca texto técnico de la base.
function failure(fd: FormData, code: string, field?: string): ControlState {
  const message = controlErrorMessage({ message: code });
  const target = field ?? ERROR_FIELDS[code];
  if (target && fd.has(target)) return { error: null, fieldErrors: { [target]: message }, values: formValues(fd) };
  return { error: message, values: formValues(fd) };
}

function rpcFailure(fd: FormData, error: { message?: string | null } | null): ControlState {
  return failure(fd, error?.message?.trim() ?? "");
}

function intOrNull(raw: string): number | null | "invalid" {
  if (raw === "") return null;
  if (!/^-?\d+$/.test(raw)) return "invalid";
  return Number(raw);
}

function refresh() {
  revalidatePath("/control", "layout");
}

async function eventInfo(supabase: Supabase, eventId: string) {
  const { data } = await supabase.from("events").select("slug, timezone").eq("id", eventId).maybeSingle();
  return data;
}

// ── Torneos (solo edición) ───────────────────────────────────────────────────

export async function updateEventAction(_prev: ControlState, fd: FormData): Promise<ControlState> {
  const { supabase } = await requirePlatformAdmin();
  const eventId = str(fd, "event_id");
  if (!isUuid(eventId)) return failure(fd, "event_not_found");
  const timezone = str(fd, "timezone");
  if (!isValidTimeZone(timezone)) return failure(fd, "invalid_timezone");
  let endAt: string | null = null;
  const endLocal = str(fd, "official_end_at");
  if (endLocal) {
    const r = localToUtc(endLocal, timezone);
    if (!r.ok) return { error: null, fieldErrors: { official_end_at: TIME_ERROR_MESSAGES[r.reason] }, values: formValues(fd) };
    endAt = r.iso;
  }
  // El identificador (slug) define la dirección web y no se cambia desde la consola: se conserva el de la base.
  const current = await eventInfo(supabase, eventId);
  if (!current) return failure(fd, "event_not_found");
  const newSlug = current.slug;
  const { error } = await supabase.rpc("control_update_event", {
    p_event_id: eventId,
    p_name: str(fd, "name"),
    p_slug: newSlug,
    p_timezone: timezone,
    p_official_end_at: nul(endAt),
  });
  if (error) return rpcFailure(fd, error);
  refresh();
  return { error: null, ok: true, message: "Datos del torneo guardados." };
}

// Promoción del torneo: fecha de inicio ANUNCIADA (civil, sin hora; no es la de ningún partido) y texto breve de portada.
export async function updateEventPromoAction(_prev: ControlState, fd: FormData): Promise<ControlState> {
  const { supabase } = await requirePlatformAdmin();
  const eventId = str(fd, "event_id");
  if (!isUuid(eventId)) return failure(fd, "event_not_found");
  const date = str(fd, "announced_start_date");
  if (date && (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T12:00:00Z`)))) return failure(fd, "invalid_date");
  const blurb = str(fd, "landing_blurb");
  if (blurb.length > 280) return failure(fd, "invalid_blurb");
  const { error } = await supabase.rpc("control_set_event_promo", { p_event_id: eventId, p_announced_start: nul(date), p_blurb: nul(blurb) });
  if (error) return rpcFailure(fd, error);
  refresh();
  revalidatePath("/", "layout");
  return { error: null, ok: true, message: "Promoción guardada." };
}

export async function publishEventAction(_prev: ControlState, fd: FormData): Promise<ControlState> {
  const { supabase } = await requirePlatformAdmin();
  const eventId = str(fd, "event_id");
  if (!isUuid(eventId)) return failure(fd, "event_not_found");
  const { error } = await supabase.rpc("control_publish_event", { p_event_id: eventId });
  if (error) return rpcFailure(fd, error);
  refresh();
  return { error: null, ok: true, message: "Torneo publicado: los parches ya pueden incorporarlo." };
}

export async function setEventStatusAction(_prev: ControlState, fd: FormData): Promise<ControlState> {
  const { supabase } = await requirePlatformAdmin();
  const eventId = str(fd, "event_id");
  const status = str(fd, "status");
  if (!isUuid(eventId)) return failure(fd, "event_not_found");
  const { error } = await supabase.rpc("control_set_event_status", { p_event_id: eventId, p_status: status });
  if (error) return rpcFailure(fd, error);
  refresh();
  return { error: null, ok: true, message: "Estado del torneo actualizado." };
}

// ── Fases (solo edición: el código interno y el orden los conserva la base) ──

export async function saveStageAction(_prev: ControlState, fd: FormData): Promise<ControlState> {
  const { supabase } = await requirePlatformAdmin();
  const eventId = str(fd, "event_id");
  const stageId = str(fd, "stage_id");
  if (!isUuid(eventId) || !isUuid(stageId)) return failure(fd, "stage_not_found");
  const exact = intOrNull(str(fd, "exact_points"));
  const result = intOrNull(str(fd, "result_points"));
  if (exact === "invalid" || exact === null || exact < 0 || exact > 100) return failure(fd, "invalid_points", "exact_points");
  if (result === "invalid" || result === null || result < 0 || result > 100) return failure(fd, "invalid_points", "result_points");
  // El código y el orden no se editan: se leen de la base y se reenvían tal cual.
  const { data: stage } = await supabase.from("event_stages").select("code, sort_order").eq("id", stageId).eq("event_id", eventId).maybeSingle();
  if (!stage) return failure(fd, "stage_not_found");
  const { error } = await supabase.rpc("control_save_stage", {
    p_event_id: eventId,
    p_stage_id: stageId,
    p_code: stage.code,
    p_name: str(fd, "name"),
    p_sort_order: stage.sort_order,
    p_is_knockout: str(fd, "format") === "knockout",
    p_exact_points: exact,
    p_result_points: result,
  });
  if (error) return rpcFailure(fd, error);
  refresh();
  return { error: null, ok: true, message: "Fase guardada." };
}

export async function moveStageAction(_prev: ControlState, fd: FormData): Promise<ControlState> {
  const { supabase } = await requirePlatformAdmin();
  const eventId = str(fd, "event_id");
  const stageId = str(fd, "stage_id");
  const direction = str(fd, "direction");
  if (!isUuid(eventId) || !isUuid(stageId)) return failure(fd, "stage_not_found");
  const { error } = await supabase.rpc("control_move_stage", { p_event_id: eventId, p_stage_id: stageId, p_direction: direction });
  if (error) return rpcFailure(fd, error);
  refresh();
  return { error: null, ok: true };
}

// ── Equipos ──────────────────────────────────────────────────────────────────

// Crea o edita un equipo del catálogo global. Al crear desde un torneo (event_id) lo asocia a ese
// torneo y vuelve a su sección de equipos; editar nunca cambia otras asociaciones.
export async function saveTeamAction(_prev: ControlState, fd: FormData): Promise<ControlState> {
  const { supabase } = await requirePlatformAdmin();
  const teamId = optStr(fd, "team_id");
  const eventId = optStr(fd, "event_id");
  if ((teamId && !isUuid(teamId)) || (eventId && !isUuid(eventId))) return failure(fd, "team_not_found");
  const kind = str(fd, "kind") || "national";
  // Selecciones sin bandera: se sugiere el emoji por el nombre (si hay correspondencia válida).
  const flag = optStr(fd, "flag_emoji") ?? (kind === "national" ? suggestFlag(str(fd, "name")) : null);
  const { data, error } = await supabase.rpc("control_save_team", {
    p_team_id: nul(teamId),
    p_name: str(fd, "name"),
    p_code: nul(optStr(fd, "code")),
    p_kind: kind,
    p_flag_emoji: nul(flag),
  });
  if (error || !data) return rpcFailure(fd, error);
  if (eventId && !teamId) {
    const { error: aErr } = await supabase.rpc("control_set_event_team", {
      p_event_id: eventId,
      p_team_id: data,
      p_group_code: nul(optStr(fd, "group_code")),
    });
    if (aErr) {
      refresh();
      return { error: `El equipo se creó, pero no se pudo asociar al torneo: ${controlErrorMessage(aErr)}`, values: formValues(fd) };
    }
    refresh();
    const info = await eventInfo(supabase, eventId);
    redirect(`/control/torneos/${info?.slug ?? ""}/equipos?creado=1`);
  }
  refresh();
  return { error: null, ok: true, message: teamId ? "Equipo guardado." : "Equipo creado." };
}

export async function setEventTeamAction(_prev: ControlState, fd: FormData): Promise<ControlState> {
  const { supabase } = await requirePlatformAdmin();
  const eventId = str(fd, "event_id");
  const teamId = str(fd, "team_id");
  if (!isUuid(eventId) || !isUuid(teamId)) return failure(fd, "team_not_found");
  const { data, error } = await supabase.rpc("control_set_event_team", {
    p_event_id: eventId,
    p_team_id: teamId,
    p_group_code: nul(optStr(fd, "group_code")),
  });
  if (error) return rpcFailure(fd, error);
  refresh();
  return { error: null, ok: true, message: data === "added" ? "Equipo asociado al torneo." : "Grupo actualizado." };
}

export async function removeEventTeamAction(_prev: ControlState, fd: FormData): Promise<ControlState> {
  const { supabase } = await requirePlatformAdmin();
  const eventId = str(fd, "event_id");
  const teamId = str(fd, "team_id");
  if (!isUuid(eventId) || !isUuid(teamId)) return failure(fd, "team_not_found");
  const { error } = await supabase.rpc("control_remove_event_team", { p_event_id: eventId, p_team_id: teamId });
  if (error) return rpcFailure(fd, error);
  refresh();
  return { error: null, ok: true, message: "Equipo quitado del torneo." };
}

// ── Partidos ─────────────────────────────────────────────────────────────────

export async function saveMatchAction(_prev: ControlState, fd: FormData): Promise<ControlState> {
  const { supabase } = await requirePlatformAdmin();
  const eventId = str(fd, "event_id");
  const matchId = optStr(fd, "match_id");
  const stageId = str(fd, "stage_id");
  if (!isUuid(eventId) || (matchId && !isUuid(matchId))) return failure(fd, "event_not_found");
  if (!isUuid(stageId)) return failure(fd, "stage_not_in_event", "stage_id");
  const home = optStr(fd, "home_team_id");
  const away = optStr(fd, "away_team_id");
  if ((home && !isUuid(home)) || (away && !isUuid(away))) return failure(fd, "team_not_in_event", "home_team_id");
  const number = intOrNull(str(fd, "match_number"));
  if (number === "invalid") return failure(fd, "invalid_match_number");

  // La hora se captura en la zona del torneo (leída de la base, no del formulario) y se guarda en UTC.
  const info = await eventInfo(supabase, eventId);
  if (!info) return failure(fd, "event_not_found");
  if (str(fd, "status") === "cancelled" && fd.get("confirm_cancel") !== "on") return failure(fd, "confirm_cancel_required", "confirm_cancel");
  const when = localToUtc(str(fd, "starts_at"), info.timezone);
  if (!when.ok) return { error: null, fieldErrors: { starts_at: TIME_ERROR_MESSAGES[when.reason] }, values: formValues(fd) };

  const { data, error } = await supabase.rpc("control_save_match", {
    p_match_id: nul(matchId),
    p_event_id: eventId,
    p_stage_id: stageId,
    p_match_number: nul(number),
    p_group_code: nul(optStr(fd, "group_code")),
    p_starts_at: when.iso,
    p_venue: nul(optStr(fd, "venue")),
    p_home_team_id: nul(home),
    p_away_team_id: nul(away),
    p_home_placeholder: nul(optStr(fd, "home_placeholder")),
    p_away_placeholder: nul(optStr(fd, "away_placeholder")),
    p_status: nul(optStr(fd, "status")),
    p_round_label: nul(optStr(fd, "round_label")),
  });
  if (error || !data) return rpcFailure(fd, error);
  refresh();
  if (!matchId) redirect(`/control/torneos/${info.slug}/partidos`);
  return { error: null, ok: true, message: "Partido guardado." };
}


// Protección de llaves: no se cambia quién avanza (ni se reabre) un partido cuyo resultado ya definió a un partido
// posterior en vivo o finalizado. Devuelve el mensaje de rechazo o null.
async function downstreamBlock(supabase: Supabase, matchId: string, action: "corregir" | "reabrir", next?: { home: number; away: number; winnerSide: string | null }): Promise<string | null> {
  const { data: m } = await supabase.from("matches").select("event_id, match_number, status, home_score, away_score, winner_side").eq("id", matchId).maybeSingle();
  if (!m || m.status !== "finished" || m.match_number === null) return null;
  if (next && !outcomeChangesAdvance({ home: m.home_score, away: m.away_score, winnerSide: m.winner_side }, { home: next.home, away: next.away, winnerSide: next.winnerSide })) return null;
  const refs = [`Winner M${m.match_number}`, `Loser M${m.match_number}`].map((r) => `"${r}"`).join(",");
  const { data: deps } = await supabase.from("matches").select("match_number, status").eq("event_id", m.event_id).or(`home_placeholder.in.(${refs}),away_placeholder.in.(${refs})`);
  const started = startedDependents(deps ?? []);
  return started.length > 0 ? downstreamMessage(m.match_number, started, action) : null;
}

// ── Resultados: guardado directo (comportamiento original de La Penúltima) ──

// Guarda el marcador/estado de un partido EN VIVO o lo cierra («Finalizado»); un finalizado se corrige con motivo.
// Es la única operación ordinaria de resultados: escribe directamente en matches (visible al instante para los
// jugadores), con marcador, estado, ganador por penales, revisión y auditoría en una sola transacción de la base.
export async function updateLiveResultAction(_prev: ControlState, fd: FormData): Promise<ControlState> {
  const { supabase } = await requirePlatformAdmin();
  const matchId = str(fd, "match_id");
  const status = str(fd, "status");
  if (!isUuid(matchId)) return failure(fd, "match_not_found");
  if (status !== "live" && status !== "finished") return failure(fd, "invalid_status");
  const home = intOrNull(str(fd, "home_score"));
  const away = intOrNull(str(fd, "away_score"));
  const rev = intOrNull(str(fd, "expected_revision"));
  const winner = str(fd, "winner_side");
  if (home === "invalid" || home === null || home < 0 || home > 30) return failure(fd, "invalid_scores", "home_score");
  if (away === "invalid" || away === null || away < 0 || away > 30) return failure(fd, "invalid_scores", "away_score");
  if (rev === "invalid" || rev === null) return failure(fd, "stale_revision");
  if (winner && winner !== "home" && winner !== "away") return failure(fd, "invalid_winner");
  const blocked = await downstreamBlock(supabase, matchId, "corregir", { home, away, winnerSide: status === "finished" ? winner || null : null });
  if (blocked) return { error: blocked, values: formValues(fd) };
  const { error } = await supabase.rpc("control_update_match_live", {
    p_match_id: matchId,
    p_status: status,
    p_home: home,
    p_away: away,
    p_winner_side: nul(status === "finished" ? winner || null : null),
    p_expected_revision: rev,
    p_reason: nul(optStr(fd, "reason")),
  });
  if (error) return rpcFailure(fd, error);
  // Noticias automáticas (como en La Penúltima: al cerrar el partido). Cubre también las correcciones: la base retira
  // las anteriores y aquí se publican las de la revisión vigente. Nunca bloquea ni deshace la finalización.
  const news = status === "finished" ? await publishMatchNewsSafely(supabase, matchId) : true;
  refresh();
  if (status === "finished") {
    return { error: null, ok: true, message: "Partido finalizado: los puntos ya se calcularon." + (news ? " Noticias publicadas." : " Las noticias no se pudieron publicar; se reintentará al abrir Resultados.") };
  }
  return { error: null, ok: true, message: "Marcador guardado: ya lo ven los jugadores." };
}

// Reapertura excepcional de un finalizado → En vivo (retira los puntos; los pronósticos siguen bloqueados).
export async function reopenMatchAction(_prev: ControlState, fd: FormData): Promise<ControlState> {
  const { supabase } = await requirePlatformAdmin();
  const matchId = str(fd, "match_id");
  const rev = intOrNull(str(fd, "expected_revision"));
  if (!isUuid(matchId)) return failure(fd, "match_not_found");
  if (rev === "invalid" || rev === null) return failure(fd, "stale_revision");
  const blocked = await downstreamBlock(supabase, matchId, "reabrir");
  if (blocked) return { error: blocked, values: formValues(fd) };
  const { error } = await supabase.rpc("control_reopen_match", { p_match_id: matchId, p_reason: str(fd, "reason"), p_expected_revision: rev });
  if (error) return rpcFailure(fd, error);
  refresh();
  return { error: null, ok: true, message: "Partido reabierto: está En vivo y sus puntos se retiraron hasta que lo finalices de nuevo." };
}

// Marcador pendiente del flujo anterior: aplicarlo como marcador EN VIVO o descartarlo (nunca se publica solo).
export async function resolvePendingAction(_prev: ControlState, fd: FormData): Promise<ControlState> {
  const { supabase } = await requirePlatformAdmin();
  const matchId = str(fd, "match_id");
  const rev = intOrNull(str(fd, "expected_revision"));
  const action = str(fd, "action");
  if (!isUuid(matchId)) return failure(fd, "match_not_found");
  if (rev === "invalid" || rev === null) return failure(fd, "stale_revision");
  if (action !== "apply_live" && action !== "discard") return failure(fd, "invalid_action");
  const { error } = await supabase.rpc("control_resolve_pending_result", { p_match_id: matchId, p_expected_revision: rev, p_action: action });
  if (error) return rpcFailure(fd, error);
  refresh();
  return { error: null, ok: true, message: action === "apply_live" ? "Marcador pendiente aplicado como marcador en vivo." : "Marcador pendiente descartado." };
}

// ── Ilustración del torneo (opcional) ────────────────────────────────────────
// Reemplazo seguro: validar contenido y permisos → subir objeto nuevo (nombre único) → asociar → solo entonces retirar
// el anterior. Si asociar falla, se retira el nuevo y la referencia anterior queda intacta. Doble protección: RLS de
// Storage y control_set_event_illustration (solo superadministradores).
export async function uploadIllustrationAction(_prev: ControlState, fd: FormData): Promise<ControlState> {
  const { supabase } = await requirePlatformAdmin();
  const eventId = str(fd, "event_id");
  const file = fd.get("illustration");
  if (!isUuid(eventId)) return failure(fd, "event_not_found");
  if (!(file instanceof File)) return failure(fd, "illustration_required");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const check = checkIllustration(bytes);
  if (!check.ok) return failure(fd, check.code);
  const { data: ev } = await supabase.from("events").select("illustration_path").eq("id", eventId).maybeSingle();
  if (!ev) return failure(fd, "event_not_found");
  const path = `${eventId}/${crypto.randomUUID()}.${check.type.ext}`;
  const { error: upErr } = await supabase.storage.from(ILLUSTRATION_BUCKET).upload(path, bytes, { contentType: check.type.mime, upsert: false, cacheControl: "31536000" });
  if (upErr) return failure(fd, "illustration_upload_failed");
  const { error } = await supabase.rpc("control_set_event_illustration", { p_event_id: eventId, p_path: path });
  if (error) {
    await supabase.storage.from(ILLUSTRATION_BUCKET).remove([path]);
    return rpcFailure(fd, error);
  }
  if (ev.illustration_path) await supabase.storage.from(ILLUSTRATION_BUCKET).remove([ev.illustration_path]);
  refresh();
  revalidatePath("/", "layout");
  return { error: null, ok: true, message: "Ilustración guardada." };
}

export async function removeIllustrationAction(_prev: ControlState, fd: FormData): Promise<ControlState> {
  const { supabase } = await requirePlatformAdmin();
  const eventId = str(fd, "event_id");
  if (!isUuid(eventId)) return failure(fd, "event_not_found");
  const { data: ev } = await supabase.from("events").select("illustration_path").eq("id", eventId).maybeSingle();
  if (!ev) return failure(fd, "event_not_found");
  const { error } = await supabase.rpc("control_set_event_illustration", { p_event_id: eventId, p_path: null as unknown as string });
  if (error) return rpcFailure(fd, error);
  if (ev.illustration_path) await supabase.storage.from(ILLUSTRATION_BUCKET).remove([ev.illustration_path]);
  refresh();
  revalidatePath("/", "layout");
  return { error: null, ok: true, message: "Ilustración quitada." };
}

// ── Escudos de clubes (catálogo global) ──────────────────────────────────────

const CREST_BUCKET = "team-crests";

// Sube un escudo (png/jpg/webp ≤ 512 KB, verificado por firma) y lo asocia al equipo. Escritura protegida
// por RLS de Storage y por control_set_team_crest (solo superadministradores).
export async function uploadCrestAction(_prev: ControlState, fd: FormData): Promise<ControlState> {
  const { supabase } = await requirePlatformAdmin();
  const teamId = str(fd, "team_id");
  const file = fd.get("crest");
  if (!isUuid(teamId)) return failure(fd, "team_not_found");
  if (!(file instanceof File)) return failure(fd, "crest_required");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const check = checkCrest(bytes);
  if (!check.ok) return failure(fd, check.code);

  const { data: team } = await supabase.from("teams").select("crest_path").eq("id", teamId).maybeSingle();
  if (!team) return failure(fd, "team_not_found");
  const path = `${teamId}/${crypto.randomUUID()}.${check.type.ext}`;
  const { error: upErr } = await supabase.storage.from(CREST_BUCKET).upload(path, bytes, { contentType: check.type.mime, upsert: false, cacheControl: "31536000" });
  if (upErr) return failure(fd, "crest_upload_failed");
  const { error } = await supabase.rpc("control_set_team_crest", { p_team_id: teamId, p_path: path });
  if (error) {
    await supabase.storage.from(CREST_BUCKET).remove([path]);
    return rpcFailure(fd, error);
  }
  if (team.crest_path) await supabase.storage.from(CREST_BUCKET).remove([team.crest_path]);
  refresh();
  return { error: null, ok: true, message: "Escudo guardado." };
}

export async function removeCrestAction(_prev: ControlState, fd: FormData): Promise<ControlState> {
  const { supabase } = await requirePlatformAdmin();
  const teamId = str(fd, "team_id");
  if (!isUuid(teamId)) return failure(fd, "team_not_found");
  const { data: team } = await supabase.from("teams").select("crest_path").eq("id", teamId).maybeSingle();
  const { error } = await supabase.rpc("control_set_team_crest", { p_team_id: teamId, p_path: null as unknown as string });
  if (error) return rpcFailure(fd, error);
  if (team?.crest_path) await supabase.storage.from(CREST_BUCKET).remove([team.crest_path]);
  refresh();
  return { error: null, ok: true, message: "Escudo quitado." };
}

// ── Cuadro eliminatorio: asignar clasificados determinados por resultados oficiales ─────────────────────────────
// Reutiliza control_save_match (permisos, bloqueos por pronósticos/historial y auditoría de siempre). Solo llena
// equipos AUSENTES de partidos programados cuando lo determinan resultados oficiales cerrados y sin empates sin
// criterio; nunca sobrescribe un equipo asignado ni toca partidos iniciados. Es idempotente: repetirla no cambia nada.
export async function advanceBracketAction(_prev: ControlState, fd: FormData): Promise<ControlState> {
  const { supabase } = await requirePlatformAdmin();
  const eventId = str(fd, "event_id");
  if (!isUuid(eventId)) return failure(fd, "event_not_found");
  const model = await loadCopaModel(supabase, eventId);
  const plan = planAdvance(model, resolveCopa(model));
  if (plan.assignments.length === 0) return { error: null, ok: true, message: "No hay clasificados nuevos que asignar." };
  const { data: rows, error: readError } = await supabase.from("matches").select("*").eq("event_id", eventId).in("id", [...new Set(plan.assignments.map((a) => a.matchId))]);
  if (readError) return rpcFailure(fd, readError);
  let done = 0;
  const failed: string[] = [];
  for (const m of rows ?? []) {
    const mine = plan.assignments.filter((a) => a.matchId === m.id);
    const home = mine.find((a) => a.side === "home")?.team.id ?? m.home_team_id;
    const away = mine.find((a) => a.side === "away")?.team.id ?? m.away_team_id;
    // Se reenvían tal cual los demás campos del partido: solo cambian los equipos ausentes.
    const { error } = await supabase.rpc("control_save_match", {
      p_match_id: m.id, p_event_id: eventId, p_stage_id: m.stage_id, p_match_number: nul(m.match_number), p_group_code: nul(m.group_code),
      p_starts_at: m.starts_at, p_venue: nul(m.venue), p_home_team_id: nul(home), p_away_team_id: nul(away),
      p_home_placeholder: nul(m.home_placeholder), p_away_placeholder: nul(m.away_placeholder), p_status: m.status, p_round_label: nul(m.round_label),
    });
    if (error) failed.push(`M${m.match_number ?? "?"}: ${controlErrorMessage({ message: error.message?.trim() ?? "" })}`);
    else done += mine.length;
  }
  refresh();
  if (failed.length > 0) return { error: `Se asignaron ${done} cupos. No se pudo actualizar: ${failed.join(" · ")}`, values: formValues(fd) };
  return { error: null, ok: true, message: `Se asignaron ${done} ${done === 1 ? "cupo" : "cupos"} del cuadro con resultados oficiales.` };
}

// ── Portada pública: torneos mostrados y destacado ───────────────────────────────────────────────────────────────
// Solo el superadministrador (las funciones de la base lo exigen y auditan). El destacado manual se conserva aunque el
// torneo deje de ser elegible: mientras tanto la portada aplica la selección automática.
export async function setLandingVisibleAction(_prev: ControlState, fd: FormData): Promise<ControlState> {
  const { supabase } = await requirePlatformAdmin();
  const eventId = str(fd, "event_id");
  if (!isUuid(eventId)) return failure(fd, "event_not_found");
  const visible = str(fd, "visible") === "true";
  const { error } = await supabase.rpc("control_set_landing_visible", { p_event_id: eventId, p_visible: visible });
  if (error) return rpcFailure(fd, error);
  revalidatePath("/", "layout");
  return { error: null, ok: true, message: visible ? "El torneo se mostrará en la portada." : "El torneo ya no se muestra en la portada." };
}

export async function setFeaturedEventAction(_prev: ControlState, fd: FormData): Promise<ControlState> {
  const { supabase } = await requirePlatformAdmin();
  const eventId = optStr(fd, "event_id");
  if (eventId && !isUuid(eventId)) return failure(fd, "event_not_found");
  const { error } = await supabase.rpc("control_set_featured_event", { p_event_id: nul(eventId) });
  if (error) return rpcFailure(fd, error);
  revalidatePath("/", "layout");
  return { error: null, ok: true, message: eventId ? "Torneo destacado en la portada." : "Destacado quitado: la portada elige automáticamente." };
}
