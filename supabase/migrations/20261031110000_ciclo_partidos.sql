-- La Canchita — Fase 3.2: ciclo de vida de partidos y administración de marcadores como en La Penúltima.
--
-- Recupera el comportamiento original (el-var) sobre el motor de la Fase 3.1:
--   update_match_result + save_winner_side   → public.control_update_match_live (UNA operación atómica)
--   mark_due_matches_live()                  → public.sync_due_matches()
-- y retira el flujo «marcador pendiente privado → confirmación» (incompatible con el marcador en vivo).
--
-- Contrato: el superadministrador guarda el marcador DIRECTAMENTE en matches (visible al instante para los
-- jugadores); no hay aprobación por guardado. Pasar a `finished` es el cierre: fija el resultado oficial
-- (result_confirmed_at/by) y el trigger de la Fase 3.1 calcula los puntos de todos los parches. Durante `live` no
-- se puntúa. Cada guardado sube result_revision (control de concurrencia) y queda auditado en la misma transacción.
--
-- Datos: private.match_result_drafts y control_pending_results se CONSERVAN (marcadores pendientes heredados, p. ej.
-- el de Copa de prueba). Nada se publica solo: control_resolve_pending_result permite aplicarlos como marcador en
-- vivo o descartarlos de forma explícita y auditada. Se retiran las 4 funciones del flujo anterior (record, confirm,
-- discard, correct): no son datos, y dejarlas sería mantener un segundo flujo paralelo.

-- ─── 1. Auditoría de sistema (actor nulo) ───────────────────────────────────

create or replace function private.audit_system(
  p_action text, p_entity_type text, p_entity_id uuid, p_event_id uuid, p_old jsonb, p_new jsonb, p_reason text
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.control_audit_log (actor_id, action, entity_type, entity_id, event_id, old_values, new_values, reason)
  values (null, p_action, p_entity_type, p_entity_id, p_event_id, p_old, p_new, p_reason);
$$;

-- ─── 2. Inicio automático (mark_due_matches_live del original) ──────────────

-- Pasa a En vivo los partidos programados cuya hora de inicio ya llegó (instante absoluto: now() de la base, no la
-- zona del navegador ni del torneo). Idempotente y segura ante concurrencia (SKIP LOCKED: cada partido lo inicia una
-- sola sesión). Solo torneos publicados/en curso, sin historial sellado, con ambos equipos asignados; no toca
-- aplazados ni cancelados; inicia en 0-0 solo si no hay marcador; no puntúa. Devuelve cuántos partidos inició.
-- Cualquier usuario autenticado puede llamarla (como el original): no recibe argumentos ni puede hacer otra cosa.
create or replace function public.sync_due_matches()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_n integer;
begin
  perform private.require_uid();
  with due as (
    select m.id, m.event_id
    from public.matches m
    join public.events e on e.id = m.event_id
    where m.status = 'scheduled' and m.starts_at <= now()
      and m.home_team_id is not null and m.away_team_id is not null
      and e.status in ('scheduled', 'in_progress')
      and not private.event_has_sealed_history(e.id)
    order by m.starts_at
    for update of m skip locked
  ), started as (
    update public.matches m
    set status = 'live', home_score = coalesce(m.home_score, 0), away_score = coalesce(m.away_score, 0)
    from due
    where m.id = due.id
    returning m.id, due.event_id
  ), logged as (
    select private.audit_system('match_auto_started', 'match', s.id, s.event_id,
                                jsonb_build_object('status', 'scheduled'),
                                jsonb_build_object('status', 'live', 'home_score', 0, 'away_score', 0), null)
    from started s
  )
  select count(*) into v_n from logged;
  return v_n;
end;
$$;

-- ─── 3. Guardar marcador / estado: la operación única (update_match_result del original) ───

-- p_status 'live' (marcador en vivo, se puede guardar tantas veces como haga falta) o 'finished' (cierre).
-- Un partido programado puede pasar a En vivo por el administrador (intervención excepcional). Un finalizado solo se
-- edita como CORRECCIÓN (motivo obligatorio, recalcula los puntos); para volver a En vivo existe control_reopen_match.
-- Marcador, estado, ganador (penales), resultado oficial, revisión y auditoría se escriben en una sola transacción.
create or replace function public.control_update_match_live(
  p_match_id uuid, p_status text, p_home integer, p_away integer, p_winner_side text, p_expected_revision integer, p_reason text
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := private.require_platform_admin();
  v_ev public.events;
  v_m public.matches;
  v_new public.matches;
  v_stage public.event_stages;
  v_event_id uuid;
  v_home integer := p_home;
  v_away integer := p_away;
  v_winner text := p_winner_side;
  v_reason text := btrim(coalesce(p_reason, ''));
  v_action text;
begin
  select m.event_id into v_event_id from public.matches m where m.id = p_match_id;
  if not found then
    raise exception 'match_not_found' using errcode = 'P0002';
  end if;
  v_ev := private.lock_event(v_event_id, false);
  select * into v_m from public.matches where id = p_match_id for update;
  if v_ev.status = 'draft' then
    raise exception 'event_not_published';
  end if;
  if p_status is null or p_status not in ('live', 'finished') then
    raise exception 'invalid_status' using errcode = '22023';
  end if;
  if v_m.status in ('postponed', 'cancelled') then
    raise exception 'match_not_playable';
  end if;
  if v_m.home_team_id is null or v_m.away_team_id is null then
    raise exception 'teams_required';
  end if;
  if p_expected_revision is distinct from v_m.result_revision then
    raise exception 'stale_revision';
  end if;
  if v_m.status = 'finished' and p_status = 'live' then
    raise exception 'use_reopen';
  end if;
  select * into v_stage from public.event_stages where id = v_m.stage_id;

  if p_status = 'live' then
    -- Como el original: un partido en vivo sin marcador empieza 0-0; el ganador por penales se define al cerrar.
    v_home := coalesce(v_home, 0);
    v_away := coalesce(v_away, 0);
    v_winner := null;
    perform private.validate_score(v_home, v_away, null, false);
    if v_m.status = 'live' and (v_m.home_score, v_m.away_score) is not distinct from (v_home, v_away) then
      return v_m.result_revision;                      -- sin cambios: no sube la revisión ni se audita
    end if;
    v_action := case when v_m.status = 'scheduled' then 'match_started' else 'score_updated' end;
    update public.matches
    set status = 'live', home_score = v_home, away_score = v_away, winner_side = null,
        result_confirmed_at = null, result_confirmed_by = null, result_revision = result_revision + 1
    where id = p_match_id
    returning * into v_new;
    perform private.audit(v_action, 'match', p_match_id, v_event_id, private.match_result_json(v_m), private.match_result_json(v_new), null);
    return v_new.result_revision;
  end if;

  -- Cierre (o corrección de un finalizado).
  perform private.validate_score(v_home, v_away, v_winner, v_stage.is_knockout);
  if v_m.status = 'finished' then
    if char_length(v_reason) not between 5 and 500 then
      raise exception 'reason_required' using errcode = '22023';
    end if;
    if (v_m.home_score, v_m.away_score, v_m.winner_side) is not distinct from (v_home, v_away, v_winner) then
      raise exception 'no_changes';
    end if;
    v_action := 'result_corrected';
  else
    v_action := 'match_finished';
    v_reason := null;
  end if;
  update public.matches
  set status = 'finished', home_score = v_home, away_score = v_away, winner_side = v_winner,
      result_confirmed_at = now(), result_confirmed_by = uid, result_revision = result_revision + 1
  where id = p_match_id
  returning * into v_new;                              -- el trigger de la Fase 3.1 recalcula los puntos (sobrescribe)
  perform private.audit(v_action, 'match', p_match_id, v_event_id, private.match_result_json(v_m), private.match_result_json(v_new), v_reason);
  return v_new.result_revision;
end;
$$;

-- ─── 4. Marcadores pendientes heredados: revisión explícita ─────────────────

-- Convierte o descarta un marcador del flujo anterior. NUNCA publica nada por sí solo: 'apply_live' lo aplica como
-- marcador EN VIVO (no finaliza: el cierre sigue siendo un paso aparte) y 'discard' lo elimina; ambos auditados.
create or replace function public.control_resolve_pending_result(p_match_id uuid, p_expected_revision integer, p_action text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := private.require_platform_admin();
  v_ev public.events;
  v_m public.matches;
  v_new public.matches;
  v_d private.match_result_drafts;
  v_event_id uuid;
begin
  select m.event_id into v_event_id from public.matches m where m.id = p_match_id;
  if not found then
    raise exception 'match_not_found' using errcode = 'P0002';
  end if;
  if p_action is null or p_action not in ('apply_live', 'discard') then
    raise exception 'invalid_action' using errcode = '22023';
  end if;
  v_ev := private.lock_event(v_event_id, false);
  select * into v_m from public.matches where id = p_match_id for update;
  select * into v_d from private.match_result_drafts where match_id = p_match_id for update;
  if v_d.match_id is null then
    raise exception 'no_pending_result';
  end if;
  if p_expected_revision is distinct from v_d.revision then
    raise exception 'stale_revision';
  end if;
  if p_action = 'discard' then
    delete from private.match_result_drafts where match_id = p_match_id;
    perform private.audit('pending_discarded', 'match', p_match_id, v_event_id, private.draft_json(v_d), jsonb_build_object('pending', false), null);
    return v_m.result_revision;
  end if;
  if v_ev.status = 'draft' then
    raise exception 'event_not_published';
  end if;
  if v_m.status not in ('scheduled', 'live') then
    raise exception 'match_not_playable';
  end if;
  update public.matches
  set status = 'live', home_score = v_d.home_score, away_score = v_d.away_score, winner_side = null,
      result_confirmed_at = null, result_confirmed_by = null, result_revision = result_revision + 1
  where id = p_match_id
  returning * into v_new;
  delete from private.match_result_drafts where match_id = p_match_id;
  perform private.audit('pending_converted', 'match', p_match_id, v_event_id, private.draft_json(v_d), private.match_result_json(v_new), null);
  return v_new.result_revision;
end;
$$;

-- ─── 5. control_save_match: programación, aplazamiento, reprogramación y cancelación ───

-- Cambios respecto a la versión anterior: el estado «En vivo» y los marcadores se manejan solo con
-- control_update_match_live; aquí solo programado / aplazado / cancelado; al sacar un partido de «En vivo» (revertir el
-- inicio, aplazarlo o cancelarlo) se limpian marcador y ganador; la auditoría distingue aplazamiento, reprogramación y
-- cancelación; las descripciones de «por definir» se siguen conservando.
drop function public.control_save_match(uuid, uuid, uuid, integer, text, timestamptz, text, uuid, uuid, text, text, text, text);

create or replace function public.control_save_match(
  p_match_id uuid, p_event_id uuid, p_stage_id uuid, p_match_number integer, p_group_code text,
  p_starts_at timestamptz, p_venue text, p_home_team_id uuid, p_away_team_id uuid,
  p_home_placeholder text, p_away_placeholder text, p_status text, p_round_label text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := private.require_platform_admin();
  v_ev public.events;
  v_old public.matches;
  v_new public.matches;
  v_event_id uuid;
  v_group text := nullif(btrim(coalesce(p_group_code, '')), '');
  v_round text := nullif(btrim(coalesce(p_round_label, '')), '');
  v_venue text := nullif(btrim(coalesce(p_venue, '')), '');
  v_hph text := nullif(btrim(coalesce(p_home_placeholder, '')), '');
  v_aph text := nullif(btrim(coalesce(p_away_placeholder, '')), '');
  v_status text;
  v_source text;
  v_has_draft boolean;
  v_action text;
begin
  if p_match_id is null then
    v_event_id := p_event_id;
  else
    select m.event_id into v_event_id from public.matches m where m.id = p_match_id;
    if not found then
      raise exception 'match_not_found' using errcode = 'P0002';
    end if;
  end if;
  v_ev := private.lock_event(v_event_id, false);

  if p_starts_at is null then
    raise exception 'invalid_start' using errcode = '22023';
  end if;
  if p_match_number is not null and p_match_number < 1 then
    raise exception 'invalid_match_number' using errcode = '22023';
  end if;
  if (v_group is not null and char_length(v_group) > 20) or (v_round is not null and char_length(v_round) > 40) then
    raise exception 'invalid_group' using errcode = '22023';
  end if;
  if (v_hph is not null and char_length(v_hph) > 60) or (v_aph is not null and char_length(v_aph) > 60)
     or (v_venue is not null and char_length(v_venue) > 120) then
    raise exception 'text_too_long' using errcode = '22023';
  end if;
  if not exists (select 1 from public.event_stages s where s.id = p_stage_id and s.event_id = v_event_id) then
    raise exception 'stage_not_in_event' using errcode = '22023';
  end if;
  if (p_home_team_id is not null and not exists (select 1 from public.event_teams et where et.event_id = v_event_id and et.team_id = p_home_team_id))
     or (p_away_team_id is not null and not exists (select 1 from public.event_teams et where et.event_id = v_event_id and et.team_id = p_away_team_id)) then
    raise exception 'team_not_in_event' using errcode = '22023';
  end if;
  if p_home_team_id is not null and p_home_team_id = p_away_team_id then
    raise exception 'same_team' using errcode = '22023';
  end if;
  if (p_home_team_id is null and v_hph is null) or (p_away_team_id is null and v_aph is null) then
    raise exception 'side_required' using errcode = '22023';
  end if;
  v_source := case when p_home_team_id is not null or p_away_team_id is not null then 'assigned' end;

  begin
    if p_match_id is null then
      v_status := coalesce(p_status, 'scheduled');
      if v_status not in ('scheduled', 'postponed', 'cancelled') then
        raise exception 'invalid_status' using errcode = '22023';
      end if;
      insert into public.matches (event_id, stage_id, match_number, group_code, round_label, starts_at, venue, home_team_id, away_team_id,
                                  home_placeholder, away_placeholder, teams_source, status)
      values (v_event_id, p_stage_id, p_match_number, v_group, v_round, p_starts_at, v_venue, p_home_team_id, p_away_team_id,
              v_hph, v_aph, v_source, v_status)
      returning * into v_new;
      perform private.audit('match_created', 'match', v_new.id, v_event_id, null, private.match_json(v_new), null);
      return v_new.id;
    end if;

    select * into v_old from public.matches where id = p_match_id for update;
    if v_old.result_confirmed_at is not null then
      raise exception 'match_confirmed';
    end if;
    v_has_draft := exists (select 1 from private.match_result_drafts d where d.match_id = p_match_id);
    if v_old.status = 'finished' then
      v_status := 'finished';
    elsif v_old.status = 'live' and (p_status is null or p_status = 'live') then
      v_status := 'live';
    else
      v_status := coalesce(p_status, v_old.status);
      if v_status not in ('scheduled', 'postponed', 'cancelled') then
        raise exception 'invalid_status' using errcode = '22023';
      end if;
    end if;
    if (v_old.stage_id, v_old.home_team_id, v_old.away_team_id) is distinct from (p_stage_id, p_home_team_id, p_away_team_id)
       and (v_has_draft or v_old.status in ('finished', 'live')) then
      raise exception 'match_has_result';
    end if;
    if v_has_draft and v_status in ('postponed', 'cancelled') then
      raise exception 'match_has_result';
    end if;
    if (v_old.stage_id, v_old.home_team_id, v_old.away_team_id) is distinct from (p_stage_id, p_home_team_id, p_away_team_id)
       and exists (select 1 from public.predictions p where p.match_id = p_match_id) then
      raise exception 'match_has_predictions';
    end if;
    update public.matches
    set stage_id = p_stage_id, match_number = p_match_number, group_code = v_group, round_label = v_round, starts_at = p_starts_at,
        venue = v_venue, home_team_id = p_home_team_id, away_team_id = p_away_team_id,
        home_placeholder = v_hph, away_placeholder = v_aph, teams_source = v_source, status = v_status,
        -- un partido que deja «En vivo» (inicio revertido, aplazado o cancelado) no conserva el marcador
        home_score = case when v_old.status = 'live' and v_status <> 'live' then null else home_score end,
        away_score = case when v_old.status = 'live' and v_status <> 'live' then null else away_score end,
        winner_side = case when v_old.status = 'live' and v_status <> 'live' then null else winner_side end
    where id = p_match_id
    returning * into v_new;
    if private.match_json(v_old) is distinct from private.match_json(v_new) then
      v_action := case
        when v_status = 'cancelled' and v_old.status <> 'cancelled' then 'match_cancelled'
        when v_status = 'postponed' and v_old.status <> 'postponed' then 'match_postponed'
        when v_old.status = 'postponed' and v_status = 'scheduled' then 'match_rescheduled'
        when v_old.status = 'postponed' and v_status = 'postponed' and v_old.starts_at <> p_starts_at then 'match_rescheduled'
        when v_old.status = 'live' and v_status = 'scheduled' then 'match_start_reverted'
        else 'match_updated' end;
      perform private.audit(v_action, 'match', p_match_id, v_event_id, private.match_json(v_old), private.match_json(v_new), null);
    end if;
    return p_match_id;
  exception when unique_violation then
    raise exception 'match_number_taken';
  end;
end;
$$;

-- ─── 6. Flujo anterior retirado ─────────────────────────────────────────────

drop function public.control_record_match_result(uuid, integer, integer, text, integer);
drop function public.control_confirm_match_result(uuid, integer, integer, integer, text);
drop function public.control_discard_pending_result(uuid, integer);
drop function public.control_correct_match_result(uuid, integer, integer, text, text, integer);

-- ─── 7. Privilegios ─────────────────────────────────────────────────────────

do $$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('sync_due_matches', 'control_update_match_live', 'control_resolve_pending_result', 'control_save_match')
  loop
    execute format('revoke all on function %s from public, anon, service_role', r.sig);
    execute format('grant execute on function %s to authenticated', r.sig);
  end loop;
  revoke all on function private.audit_system(text, text, uuid, uuid, jsonb, jsonb, text) from public, anon, authenticated, service_role;
end $$;
