-- La Canchita Control — los marcadores pendientes dejan de vivir en `matches`.
--
-- Problema: RLS en PostgreSQL es por fila, no por columna. Un marcador pendiente guardado en
-- matches.home_score/away_score (con status 'finished' y result_confirmed_at NULL) era legible por la
-- API para cualquier usuario autenticado en torneos publicados.
--
-- Solución: el marcador pendiente es información administrativa y se guarda en una tabla PRIVADA
-- (private.match_result_drafts: fuera del esquema expuesto, sin privilegios para ningún rol de la API).
-- Solo funciones control_* (SECURITY DEFINER, solo superadministradores) la leen y escriben.
-- `matches` contiene únicamente información pública u oficial:
--   * registrar/editar/descartar un marcador pendiente NO modifica `matches` (ni status, ni marcador,
--     ni updated_at, ni result_revision): no hay columna ni estado derivado que delate el valor
--     provisional ni su existencia;
--   * confirmar mueve el marcador a `matches` (status 'finished', marcador, result_confirmed_at/by,
--     result_revision + 1) y borra el borrador, todo en una transacción;
--   * corregir sigue operando sobre `matches` (el resultado ya es oficial y público).
-- La revisión de control de concurrencia de un marcador pendiente vive en el borrador
-- (match_result_drafts.revision, 0 = no hay borrador); matches.result_revision solo cambia con
-- cambios oficiales (contrato con el futuro motor de puntuación, sin cambios).
--
-- Datos: los 104 partidos del Mundial 2026 (finished, sin confirmación, revisión 0, torneo sellado)
-- NO se tocan: son resultados históricos importados, ya públicos. Solo se mueven al borrador las filas
-- creadas por el flujo de Control (revisión > 0) en torneos sin historial sellado; en producción no hay
-- ninguna, pero la migración es reproducible si las hubiera.

-- Guarda: los resultados del torneo histórico (event_results) deben seguir apuntando a partidos
-- finalizados con marcador; nada de esto se transforma.
do $$
begin
  if exists (
    select 1 from public.event_results r join public.matches m on m.id = r.source_match_id
    where m.status <> 'finished' or m.home_score is null
  ) then
    raise exception 'event_results apunta a partidos sin marcador final: revisar antes de migrar';
  end if;
  if exists (
    select 1 from public.event_results r join public.matches m on m.id = r.source_match_id
    where m.result_revision > 0 and m.result_confirmed_at is null
  ) then
    raise exception 'un resultado histórico aparece como pendiente de Control: revisar antes de migrar';
  end if;
end $$;

create table private.match_result_drafts (
  match_id     uuid primary key references public.matches (id),
  home_score   smallint not null check (home_score between 0 and 30),
  away_score   smallint not null check (away_score between 0 and 30),
  winner_side  text check (winner_side in ('home', 'away')),
  revision     integer not null default 1 check (revision >= 1),
  recorded_by  uuid,
  recorded_at  timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint match_result_drafts_winner_only_on_tie check (winner_side is null or home_score = away_score)
);
comment on table private.match_result_drafts is
  'Marcadores PENDIENTES de confirmación (información administrativa). Sin acceso desde la API; solo funciones control_* de superadministradores.';
alter table private.match_result_drafts enable row level security;
revoke all on private.match_result_drafts from public, anon, authenticated, service_role;

-- Mueve los pendientes existentes (creados por Control) desde matches al borrador privado.
with moved as (
  select m.id, m.home_score, m.away_score, m.winner_side, greatest(m.result_revision, 1) as revision, m.updated_at,
         (select a.actor_id from public.control_audit_log a
           where a.entity_id = m.id and a.action in ('result_recorded', 'result_pending_edited')
           order by a.id desc limit 1) as actor,
         (select a.old_values ->> 'status' from public.control_audit_log a
           where a.entity_id = m.id and a.action = 'result_recorded'
           order by a.id desc limit 1) as prev_status
  from public.matches m
  where m.status = 'finished' and m.result_confirmed_at is null and m.home_score is not null
    and m.result_revision > 0 and not private.event_has_sealed_history(m.event_id)
), ins as (
  insert into private.match_result_drafts (match_id, home_score, away_score, winner_side, revision, recorded_by, recorded_at)
  select id, home_score, away_score, winner_side, revision, actor, updated_at from moved
  returning match_id
)
update public.matches m
set status = case when mv.prev_status in ('scheduled', 'live') then mv.prev_status else 'scheduled' end,
    home_score = null, away_score = null, winner_side = null
from moved mv
where m.id = mv.id and m.id in (select match_id from ins);

create or replace function private.draft_json(d private.match_result_drafts)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object('pending', true, 'home_score', d.home_score, 'away_score', d.away_score,
                            'winner_side', d.winner_side, 'confirmed', false, 'revision', d.revision);
$$;
revoke all on function private.draft_json(private.match_result_drafts) from public, anon, authenticated, service_role;

-- Lectura de los marcadores pendientes de un torneo (solo superadministradores).
create or replace function public.control_pending_results(p_event_id uuid)
returns table (match_id uuid, home_score integer, away_score integer, winner_side text, revision integer, recorded_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_platform_admin();
  return query
    select d.match_id, d.home_score::integer, d.away_score::integer, d.winner_side, d.revision, d.recorded_at
    from private.match_result_drafts d
    join public.matches m on m.id = d.match_id
    where m.event_id = p_event_id;
end;
$$;

-- ─── Registrar / editar un marcador pendiente ───────────────────────────────

create or replace function public.control_record_match_result(
  p_match_id uuid, p_home integer, p_away integer, p_winner_side text, p_expected_revision integer
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
  v_stage public.event_stages;
  v_d private.match_result_drafts;
  v_event_id uuid;
  v_old jsonb;
  v_rev integer;
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
  if v_m.result_confirmed_at is not null or v_m.status = 'finished' then
    raise exception 'use_correction';
  end if;
  if v_m.status in ('postponed', 'cancelled') then
    raise exception 'match_not_playable';
  end if;
  if v_m.home_team_id is null or v_m.away_team_id is null then
    raise exception 'teams_required';
  end if;
  select * into v_d from private.match_result_drafts where match_id = p_match_id for update;
  if p_expected_revision is distinct from coalesce(v_d.revision, 0) then
    raise exception 'stale_revision';
  end if;
  select * into v_stage from public.event_stages where id = v_m.stage_id;
  perform private.validate_score(p_home, p_away, p_winner_side, v_stage.is_knockout);

  if v_d.match_id is null then
    insert into private.match_result_drafts (match_id, home_score, away_score, winner_side, revision, recorded_by)
    values (p_match_id, p_home, p_away, p_winner_side, 1, uid)
    returning * into v_d;
    perform private.audit('result_recorded', 'match', p_match_id, v_event_id,
      jsonb_build_object('pending', false), private.draft_json(v_d), null);
  else
    v_old := private.draft_json(v_d);
    update private.match_result_drafts
    set home_score = p_home, away_score = p_away, winner_side = p_winner_side,
        revision = revision + 1, recorded_by = uid, updated_at = now()
    where match_id = p_match_id
    returning * into v_d;
    perform private.audit('result_pending_edited', 'match', p_match_id, v_event_id, v_old, private.draft_json(v_d), null);
  end if;
  v_rev := v_d.revision;
  return v_rev;
end;
$$;

-- ─── Confirmar: el marcador pendiente pasa a matches y se vuelve oficial ────

create or replace function public.control_confirm_match_result(p_match_id uuid, p_expected_revision integer)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := private.require_platform_admin();
  v_ev public.events;
  v_m public.matches;
  v_d private.match_result_drafts;
  v_event_id uuid;
  v_old jsonb;
begin
  select m.event_id into v_event_id from public.matches m where m.id = p_match_id;
  if not found then
    raise exception 'match_not_found' using errcode = 'P0002';
  end if;
  v_ev := private.lock_event(v_event_id, false);
  select * into v_m from public.matches where id = p_match_id for update;
  if v_m.result_confirmed_at is not null then
    raise exception 'already_confirmed';
  end if;
  select * into v_d from private.match_result_drafts where match_id = p_match_id for update;
  if v_d.match_id is null then
    raise exception 'no_pending_result';
  end if;
  if p_expected_revision is distinct from v_d.revision then
    raise exception 'stale_revision';
  end if;
  v_old := private.draft_json(v_d);
  update public.matches
  set status = 'finished', home_score = v_d.home_score, away_score = v_d.away_score, winner_side = v_d.winner_side,
      result_confirmed_at = now(), result_confirmed_by = uid, result_revision = result_revision + 1
  where id = p_match_id
  returning * into v_m;
  delete from private.match_result_drafts where match_id = p_match_id;
  perform private.audit('result_confirmed', 'match', p_match_id, v_event_id, v_old, private.match_result_json(v_m), null);
  return v_m.result_revision;
end;
$$;

-- ─── Descartar un marcador pendiente ────────────────────────────────────────

create or replace function public.control_discard_pending_result(p_match_id uuid, p_expected_revision integer)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := private.require_platform_admin();
  v_ev public.events;
  v_m public.matches;
  v_d private.match_result_drafts;
  v_event_id uuid;
begin
  select m.event_id into v_event_id from public.matches m where m.id = p_match_id;
  if not found then
    raise exception 'match_not_found' using errcode = 'P0002';
  end if;
  v_ev := private.lock_event(v_event_id, false);
  select * into v_m from public.matches where id = p_match_id for update;
  if v_m.result_confirmed_at is not null then
    raise exception 'use_correction';
  end if;
  select * into v_d from private.match_result_drafts where match_id = p_match_id for update;
  if v_d.match_id is null then
    raise exception 'no_pending_result';
  end if;
  if p_expected_revision is distinct from v_d.revision then
    raise exception 'stale_revision';
  end if;
  delete from private.match_result_drafts where match_id = p_match_id;
  perform private.audit('result_discarded', 'match', p_match_id, v_event_id, private.draft_json(v_d), jsonb_build_object('pending', false), null);
  return 0;
end;
$$;

-- ─── Partidos: un marcador pendiente bloquea equipos/fase; "finished" ya no significa pendiente ───

create or replace function public.control_save_match(
  p_match_id uuid, p_event_id uuid, p_stage_id uuid, p_match_number integer, p_group_code text,
  p_starts_at timestamptz, p_venue text, p_home_team_id uuid, p_away_team_id uuid,
  p_home_placeholder text, p_away_placeholder text, p_status text
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
  v_venue text := nullif(btrim(coalesce(p_venue, '')), '');
  v_hph text := case when p_home_team_id is null then nullif(btrim(coalesce(p_home_placeholder, '')), '') end;
  v_aph text := case when p_away_team_id is null then nullif(btrim(coalesce(p_away_placeholder, '')), '') end;
  v_status text;
  v_source text;
  v_has_draft boolean;
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
  if v_group is not null and char_length(v_group) > 20 then
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
      if v_status not in ('scheduled', 'live', 'postponed', 'cancelled') then
        raise exception 'invalid_status' using errcode = '22023';
      end if;
      insert into public.matches (event_id, stage_id, match_number, group_code, starts_at, venue, home_team_id, away_team_id,
                                  home_placeholder, away_placeholder, teams_source, status)
      values (v_event_id, p_stage_id, p_match_number, v_group, p_starts_at, v_venue, p_home_team_id, p_away_team_id,
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
    else
      v_status := coalesce(p_status, v_old.status);
      if v_status not in ('scheduled', 'live', 'postponed', 'cancelled') then
        raise exception 'invalid_status' using errcode = '22023';
      end if;
    end if;
    if (v_old.stage_id, v_old.home_team_id, v_old.away_team_id) is distinct from (p_stage_id, p_home_team_id, p_away_team_id)
       and (v_has_draft or v_old.status = 'finished') then
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
    set stage_id = p_stage_id, match_number = p_match_number, group_code = v_group, starts_at = p_starts_at,
        venue = v_venue, home_team_id = p_home_team_id, away_team_id = p_away_team_id,
        home_placeholder = v_hph, away_placeholder = v_aph, teams_source = v_source, status = v_status
    where id = p_match_id
    returning * into v_new;
    if private.match_json(v_old) is distinct from private.match_json(v_new) then
      perform private.audit('match_updated', 'match', p_match_id, v_event_id, private.match_json(v_old), private.match_json(v_new), null);
    end if;
    return p_match_id;
  exception when unique_violation then
    raise exception 'match_number_taken';
  end;
end;
$$;

-- ─── Fases: reordenar sin gestionar números ─────────────────────────────────

-- Intercambia la posición de una fase con su vecina (p_direction 'up' = antes, 'down' = después).
create or replace function public.control_move_stage(p_event_id uuid, p_stage_id uuid, p_direction text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := private.require_platform_admin();
  v_ev public.events;
  v_cur public.event_stages;
  v_nb public.event_stages;
  v_tmp integer;
begin
  v_ev := private.lock_event(p_event_id, true);
  if p_direction is null or p_direction not in ('up', 'down') then
    raise exception 'invalid_order' using errcode = '22023';
  end if;
  select * into v_cur from public.event_stages where id = p_stage_id and event_id = p_event_id for update;
  if not found then
    raise exception 'stage_not_found' using errcode = 'P0002';
  end if;
  if p_direction = 'up' then
    select * into v_nb from public.event_stages where event_id = p_event_id and sort_order < v_cur.sort_order order by sort_order desc limit 1 for update;
  else
    select * into v_nb from public.event_stages where event_id = p_event_id and sort_order > v_cur.sort_order order by sort_order asc limit 1 for update;
  end if;
  if not found then
    return;
  end if;
  select coalesce(max(sort_order), 0) + 1000 into v_tmp from public.event_stages where event_id = p_event_id;
  update public.event_stages set sort_order = v_tmp where id = v_cur.id;
  update public.event_stages set sort_order = v_cur.sort_order where id = v_nb.id;
  update public.event_stages set sort_order = v_nb.sort_order where id = v_cur.id;
  perform private.audit('stage_reordered', 'stage', p_stage_id, p_event_id,
    jsonb_build_object('sort_order', v_cur.sort_order), jsonb_build_object('sort_order', v_nb.sort_order), null);
end;
$$;

-- ─── Privilegios ────────────────────────────────────────────────────────────

do $$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in ('control_pending_results', 'control_move_stage')
  loop
    execute format('revoke all on function %s from public, anon, service_role', r.sig);
    execute format('grant execute on function %s to authenticated', r.sig);
  end loop;
end $$;

comment on column public.matches.result_revision is
  'Aumenta solo con cambios OFICIALES (confirmar o corregir). El control de concurrencia de un marcador pendiente vive en private.match_result_drafts.revision.';
comment on column public.matches.result_confirmed_at is
  'Resultado OFICIAL: NOT NULL = confirmado explícitamente. Los marcadores pendientes no están en matches (private.match_result_drafts). Los partidos importados de La Penúltima están finalizados con marcador y sin confirmación explícita (históricos).';
