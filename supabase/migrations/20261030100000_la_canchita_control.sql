-- La Canchita Control — superadministración global, administración de torneos,
-- resultados con confirmación manual, auditoría global e inscripción de torneos en parches.
--
-- Diseño (resumen):
--   * Superadministradores: tabla PRIVADA private.platform_admins. Ningún rol de la API tiene
--     privilegios sobre ella: solo la leen funciones SECURITY DEFINER. No hay ninguna función que dé
--     de alta o baja administradores (el alta inicial es el script scripts/control/alta_superadmin.sql,
--     ejecutado con el rol dueño). Independiente de parche_members y de cualquier metadata de Auth.
--   * Toda escritura deportiva global pasa por funciones control_* (SECURITY DEFINER, search_path
--     vacío, solo EXECUTE para authenticated) que empiezan con private.require_platform_admin().
--     Las tablas deportivas siguen sin privilegios de escritura para clientes.
--   * Auditoría: public.control_audit_log, inmutable, escrita por private.audit() dentro de la misma
--     transacción de cada operación; actor = auth.uid() (el cliente no lo puede fijar).
--   * Resultado oficial = matches.result_confirmed_at IS NOT NULL. Un marcador registrado sin
--     confirmar (status 'finished' + marcador + result_confirmed_at NULL) es PENDIENTE y no es oficial.
--     matches.result_revision aumenta con cada cambio del resultado: sirve de control de concurrencia
--     y para que el futuro motor de puntuación consuma resultados oficiales de forma idempotente
--     (puntuar la revisión N de un partido confirmado una sola vez).
--   * Borradores: events.status = 'draft' solo lo ve un superadministrador (RLS en events y en
--     todas las tablas hijas, incluidos los equipos que solo pertenecen a torneos borrador).
--   * Torneos con historial sellado (Mundial 2026) o cerrados quedan bloqueados para control_*.
--   * Esta migración es aditiva: no borra ni modifica filas existentes.

-- ─── 1. Superadministradores ────────────────────────────────────────────────

create table private.platform_admins (
  user_id     uuid primary key references auth.users (id) on delete cascade,
  granted_at  timestamptz not null default now(),
  granted_by  uuid references auth.users (id) on delete set null,
  note        text
);
comment on table private.platform_admins is
  'Superadministradores globales. Sin acceso desde la API; alta solo con el rol dueño (scripts/control/alta_superadmin.sql).';
alter table private.platform_admins enable row level security;
revoke all on private.platform_admins from public, anon, authenticated, service_role;

create or replace function private.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from private.platform_admins pa where pa.user_id = (select auth.uid()));
$$;

-- Para la interfaz: solo informa si QUIEN LLAMA es superadministrador.
create or replace function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_platform_admin();
$$;

create or replace function private.require_platform_admin()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if not exists (select 1 from private.platform_admins pa where pa.user_id = uid) then
    raise exception 'not_platform_admin' using errcode = '42501';
  end if;
  return uid;
end;
$$;

-- ─── 2. Auditoría global ────────────────────────────────────────────────────

create table public.control_audit_log (
  id           bigint generated always as identity primary key,
  created_at   timestamptz not null default now(),
  actor_id     uuid,
  action       text not null,
  entity_type  text not null,
  entity_id    uuid,
  event_id     uuid,
  old_values   jsonb,
  new_values   jsonb,
  reason       text
);
comment on table public.control_audit_log is
  'Auditoría inmutable de La Canchita Control. actor_id sin FK: el registro sobrevive a la cuenta.';
create index control_audit_log_event_idx on public.control_audit_log (event_id, created_at desc);
create index control_audit_log_entity_idx on public.control_audit_log (entity_type, entity_id);

create or replace function private.control_audit_log_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'audit_log_immutable';
end;
$$;
create trigger control_audit_log_no_change before update or delete on public.control_audit_log
  for each row execute function private.control_audit_log_immutable();
create trigger control_audit_log_no_truncate before truncate on public.control_audit_log
  for each statement execute function private.control_audit_log_immutable();

alter table public.control_audit_log enable row level security;
revoke all on public.control_audit_log from public, anon, authenticated, service_role;
grant select on public.control_audit_log to authenticated;
create policy control_audit_log_admin_read on public.control_audit_log
  for select to authenticated using ((select private.is_platform_admin()));

create or replace function private.audit(
  p_action text, p_entity_type text, p_entity_id uuid, p_event_id uuid,
  p_old jsonb, p_new jsonb, p_reason text
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.control_audit_log (actor_id, action, entity_type, entity_id, event_id, old_values, new_values, reason)
  values ((select auth.uid()), p_action, p_entity_type, p_entity_id, p_event_id, p_old, p_new, p_reason);
$$;

-- ─── 3. Columnas de resultado ───────────────────────────────────────────────

alter table public.matches
  add column result_revision integer not null default 0 check (result_revision >= 0),
  add column result_confirmed_by uuid references auth.users (id) on delete set null;
comment on column public.matches.result_revision is
  'Aumenta con cada registro, edición, confirmación, corrección o descarte del resultado. Control de concurrencia y base de la puntuación idempotente.';
comment on column public.matches.result_confirmed_by is 'Superadministrador que confirmó (o corrigió) el resultado oficial.';
comment on column public.matches.result_confirmed_at is
  'Resultado OFICIAL: NOT NULL = confirmado explícitamente. Un marcador con status finished y este campo NULL es pendiente.';

-- El ganador por penales solo existe si el marcador está empatado (verificado: 0 filas lo incumplen).
alter table public.matches
  add constraint matches_winner_only_on_tie check (winner_side is null or home_score = away_score);

-- Un equipo no se duplica por nombre y tipo.
create unique index teams_name_kind_key on public.teams (lower(btrim(name)), kind);

-- ─── 4. Borradores solo para superadministradores (RLS) ─────────────────────

revoke all on function private.is_platform_admin() from public, anon;
grant execute on function private.is_platform_admin() to authenticated;

drop policy events_read on public.events;
drop policy event_stages_read on public.event_stages;
drop policy teams_read on public.teams;
drop policy event_teams_read on public.event_teams;
drop policy matches_read on public.matches;
drop policy event_results_read on public.event_results;

create policy events_read on public.events for select to authenticated
  using (status <> 'draft' or (select private.is_platform_admin()));

-- Las tablas hijas dependen del torneo publicado (subconsulta sobre events: sin recursión, porque
-- la política de events no consulta a sus hijas).
create policy event_stages_read on public.event_stages for select to authenticated
  using ((select private.is_platform_admin()) or event_id in (select e.id from public.events e where e.status <> 'draft'));
create policy event_teams_read on public.event_teams for select to authenticated
  using ((select private.is_platform_admin()) or event_id in (select e.id from public.events e where e.status <> 'draft'));
create policy matches_read on public.matches for select to authenticated
  using ((select private.is_platform_admin()) or event_id in (select e.id from public.events e where e.status <> 'draft'));
create policy event_results_read on public.event_results for select to authenticated
  using ((select private.is_platform_admin()) or event_id in (select e.id from public.events e where e.status <> 'draft'));
-- Un equipo es visible si participa en algún torneo publicado (los equipos recién creados o que solo
-- están en borradores los ve únicamente un superadministrador).
create policy teams_read on public.teams for select to authenticated
  using (
    (select private.is_platform_admin())
    or id in (
      select et.team_id from public.event_teams et
      join public.events e on e.id = et.event_id
      where e.status <> 'draft'
    )
  );

-- ─── 5. Auxiliares privados ─────────────────────────────────────────────────

create or replace function private.event_has_sealed_history(p_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.standing_snapshots s
    join public.parche_events pe on pe.id = s.parche_event_id
    where pe.event_id = p_event_id and s.sealed_at is not null
  );
$$;

-- Bloquea el torneo (exclusivo o compartido) y rechaza los que ya no se pueden administrar.
create or replace function private.lock_event(p_event_id uuid, p_exclusive boolean)
returns public.events
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.events;
begin
  if p_exclusive then
    select * into v from public.events where id = p_event_id for update;
  else
    select * into v from public.events where id = p_event_id for share;
  end if;
  if not found then
    raise exception 'event_not_found' using errcode = 'P0002';
  end if;
  if v.status = 'closed' then
    raise exception 'event_closed';
  end if;
  if v.status = 'cancelled' then
    raise exception 'event_cancelled';
  end if;
  if private.event_has_sealed_history(p_event_id) then
    raise exception 'event_locked_history';
  end if;
  return v;
end;
$$;

create or replace function private.match_result_json(m public.matches)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object(
    'status', m.status, 'home_score', m.home_score, 'away_score', m.away_score,
    'winner_side', m.winner_side, 'confirmed', m.result_confirmed_at is not null,
    'revision', m.result_revision
  );
$$;

create or replace function private.match_json(m public.matches)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select to_jsonb(m) - 'created_at' - 'updated_at';
$$;

create or replace function private.validate_score(p_home integer, p_away integer, p_winner text, p_is_knockout boolean)
returns void
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_home is null or p_away is null or p_home not between 0 and 30 or p_away not between 0 and 30 then
    raise exception 'invalid_scores' using errcode = '22023';
  end if;
  if p_winner is not null and p_winner not in ('home', 'away') then
    raise exception 'invalid_winner' using errcode = '22023';
  end if;
  if p_home = p_away then
    if p_is_knockout and p_winner is null then
      raise exception 'winner_required' using errcode = '22023';
    end if;
    if not p_is_knockout and p_winner is not null then
      raise exception 'winner_not_applicable' using errcode = '22023';
    end if;
  elsif p_winner is not null then
    raise exception 'winner_not_applicable' using errcode = '22023';
  end if;
end;
$$;

create or replace function private.event_publish_issues(p_event_id uuid)
returns text[]
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_issues text[] := '{}';
  v_tz text;
begin
  select e.timezone into v_tz from public.events e where e.id = p_event_id;
  if not exists (select 1 from pg_catalog.pg_timezone_names z where z.name = v_tz) then
    v_issues := array_append(v_issues, 'invalid_timezone'::text);
  end if;
  if not exists (select 1 from public.event_stages s where s.event_id = p_event_id) then
    v_issues := array_append(v_issues, 'no_stages'::text);
  end if;
  if (select count(*) from public.event_teams et where et.event_id = p_event_id) < 2 then
    v_issues := array_append(v_issues, 'few_teams'::text);
  end if;
  if not exists (select 1 from public.matches m where m.event_id = p_event_id) then
    v_issues := array_append(v_issues, 'no_matches'::text);
  end if;
  if exists (
    select 1 from public.matches m
    where m.event_id = p_event_id
      and ((m.home_team_id is null and nullif(btrim(m.home_placeholder), '') is null)
        or (m.away_team_id is null and nullif(btrim(m.away_placeholder), '') is null))
  ) then
    v_issues := array_append(v_issues, 'match_without_sides'::text);
  end if;
  return v_issues;
end;
$$;

-- ─── 6. Torneos ─────────────────────────────────────────────────────────────

create or replace function public.control_create_event(p_slug text, p_name text, p_timezone text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := private.require_platform_admin();
  v_slug text := lower(btrim(coalesce(p_slug, '')));
  v_name text := btrim(coalesce(p_name, ''));
  v_tz text := btrim(coalesce(p_timezone, ''));
  v_id uuid;
begin
  if v_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' or char_length(v_slug) > 60 then
    raise exception 'invalid_slug' using errcode = '22023';
  end if;
  if char_length(v_name) not between 2 and 120 then
    raise exception 'invalid_name' using errcode = '22023';
  end if;
  if not exists (select 1 from pg_catalog.pg_timezone_names z where z.name = v_tz) then
    raise exception 'invalid_timezone' using errcode = '22023';
  end if;
  begin
    insert into public.events (slug, name, timezone, status) values (v_slug, v_name, v_tz, 'draft') returning id into v_id;
  exception when unique_violation then
    raise exception 'slug_taken';
  end;
  perform private.audit('event_created', 'event', v_id, v_id, null,
    jsonb_build_object('slug', v_slug, 'name', v_name, 'timezone', v_tz, 'status', 'draft'), null);
  return v_id;
end;
$$;

create or replace function public.control_update_event(
  p_event_id uuid, p_name text, p_slug text, p_timezone text, p_official_end_at timestamptz
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := private.require_platform_admin();
  v_ev public.events;
  v_slug text := lower(btrim(coalesce(p_slug, '')));
  v_name text := btrim(coalesce(p_name, ''));
  v_tz text := btrim(coalesce(p_timezone, ''));
  v_old jsonb;
  v_new jsonb;
begin
  v_ev := private.lock_event(p_event_id, true);
  if v_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' or char_length(v_slug) > 60 then
    raise exception 'invalid_slug' using errcode = '22023';
  end if;
  if char_length(v_name) not between 2 and 120 then
    raise exception 'invalid_name' using errcode = '22023';
  end if;
  if not exists (select 1 from pg_catalog.pg_timezone_names z where z.name = v_tz) then
    raise exception 'invalid_timezone' using errcode = '22023';
  end if;
  -- El identificador de un torneo ya publicado no cambia.
  if v_slug <> v_ev.slug and v_ev.status <> 'draft' then
    raise exception 'slug_locked';
  end if;
  v_old := jsonb_build_object('slug', v_ev.slug, 'name', v_ev.name, 'timezone', v_ev.timezone, 'official_end_at', v_ev.official_end_at);
  v_new := jsonb_build_object('slug', v_slug, 'name', v_name, 'timezone', v_tz, 'official_end_at', p_official_end_at);
  if v_old = v_new then
    return;
  end if;
  begin
    update public.events set slug = v_slug, name = v_name, timezone = v_tz, official_end_at = p_official_end_at
    where id = p_event_id;
  exception when unique_violation then
    raise exception 'slug_taken';
  end;
  perform private.audit('event_updated', 'event', p_event_id, p_event_id, v_old, v_new, null);
end;
$$;

create or replace function public.control_event_publish_issues(p_event_id uuid)
returns text[]
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_platform_admin();
  return private.event_publish_issues(p_event_id);
end;
$$;

create or replace function public.control_publish_event(p_event_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := private.require_platform_admin();
  v_ev public.events;
  v_issues text[];
begin
  v_ev := private.lock_event(p_event_id, true);
  if v_ev.status <> 'draft' then
    raise exception 'invalid_transition';
  end if;
  v_issues := private.event_publish_issues(p_event_id);
  if cardinality(v_issues) > 0 then
    raise exception 'publish_blocked' using detail = array_to_string(v_issues, ',');
  end if;
  update public.events set status = 'scheduled' where id = p_event_id;
  perform private.audit('event_published', 'event', p_event_id, p_event_id,
    jsonb_build_object('status', 'draft'), jsonb_build_object('status', 'scheduled'), null);
end;
$$;

create or replace function public.control_set_event_status(p_event_id uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := private.require_platform_admin();
  v_ev public.events;
begin
  v_ev := private.lock_event(p_event_id, true);
  if p_status is null or p_status not in ('draft', 'scheduled', 'in_progress', 'finished', 'cancelled') then
    raise exception 'invalid_status' using errcode = '22023';
  end if;
  if v_ev.status = p_status then
    return;
  end if;
  if v_ev.status = 'scheduled' and p_status = 'in_progress' then
    null;
  elsif v_ev.status = 'in_progress' and p_status = 'finished' then
    if exists (
      select 1 from public.matches m
      where m.event_id = p_event_id and m.status <> 'cancelled' and m.result_confirmed_at is null
    ) then
      raise exception 'pending_results';
    end if;
  elsif v_ev.status in ('scheduled', 'in_progress') and p_status = 'cancelled' then
    null;
  elsif v_ev.status = 'scheduled' and p_status = 'draft' then
    -- Despublicar solo si ningún parche ni pronóstico depende del torneo.
    if exists (select 1 from public.parche_events pe where pe.event_id = p_event_id)
       or exists (select 1 from public.predictions p where p.event_id = p_event_id) then
      raise exception 'event_in_use';
    end if;
  else
    raise exception 'invalid_transition';
  end if;
  update public.events set status = p_status where id = p_event_id;
  perform private.audit('event_status_changed', 'event', p_event_id, p_event_id,
    jsonb_build_object('status', v_ev.status), jsonb_build_object('status', p_status), null);
end;
$$;

-- ─── 7. Fases ───────────────────────────────────────────────────────────────

create or replace function public.control_save_stage(
  p_event_id uuid, p_stage_id uuid, p_code text, p_name text, p_sort_order integer,
  p_is_knockout boolean, p_exact_points integer, p_result_points integer
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := private.require_platform_admin();
  v_ev public.events;
  v_code text := lower(btrim(coalesce(p_code, '')));
  v_name text := btrim(coalesce(p_name, ''));
  v_old public.event_stages;
  v_id uuid;
  v_c text;
begin
  v_ev := private.lock_event(p_event_id, true);
  if v_code !~ '^[a-z0-9_]+$' or char_length(v_code) > 40 then
    raise exception 'invalid_code' using errcode = '22023';
  end if;
  if char_length(v_name) not between 2 and 80 then
    raise exception 'invalid_name' using errcode = '22023';
  end if;
  if p_sort_order is null or p_sort_order < 1 or p_sort_order > 999 then
    raise exception 'invalid_order' using errcode = '22023';
  end if;
  if p_is_knockout is null or p_exact_points is null or p_result_points is null
     or p_exact_points not between 0 and 100 or p_result_points not between 0 and 100 then
    raise exception 'invalid_points' using errcode = '22023';
  end if;

  begin
    if p_stage_id is null then
      insert into public.event_stages (event_id, code, name, sort_order, is_knockout, exact_points, result_points)
      values (p_event_id, v_code, v_name, p_sort_order, p_is_knockout, p_exact_points, p_result_points)
      returning id into v_id;
      perform private.audit('stage_created', 'stage', v_id, p_event_id, null,
        jsonb_build_object('code', v_code, 'name', v_name, 'sort_order', p_sort_order, 'is_knockout', p_is_knockout,
                           'exact_points', p_exact_points, 'result_points', p_result_points), null);
      return v_id;
    end if;

    select * into v_old from public.event_stages where id = p_stage_id and event_id = p_event_id for update;
    if not found then
      raise exception 'stage_not_found' using errcode = 'P0002';
    end if;
    -- Con resultados oficiales en la fase, su puntuación y su formato ya no cambian.
    if (v_old.code, v_old.is_knockout, v_old.exact_points, v_old.result_points)
         is distinct from (v_code, p_is_knockout, p_exact_points, p_result_points)
       and exists (select 1 from public.matches m where m.stage_id = p_stage_id and m.result_confirmed_at is not null) then
      raise exception 'stage_has_confirmed_results';
    end if;
    if (v_old.code, v_old.name, v_old.sort_order, v_old.is_knockout, v_old.exact_points, v_old.result_points)
         is not distinct from (v_code, v_name, p_sort_order, p_is_knockout, p_exact_points, p_result_points) then
      return p_stage_id;
    end if;
    update public.event_stages
    set code = v_code, name = v_name, sort_order = p_sort_order, is_knockout = p_is_knockout,
        exact_points = p_exact_points, result_points = p_result_points
    where id = p_stage_id;
    perform private.audit('stage_updated', 'stage', p_stage_id, p_event_id,
      jsonb_build_object('code', v_old.code, 'name', v_old.name, 'sort_order', v_old.sort_order, 'is_knockout', v_old.is_knockout,
                         'exact_points', v_old.exact_points, 'result_points', v_old.result_points),
      jsonb_build_object('code', v_code, 'name', v_name, 'sort_order', p_sort_order, 'is_knockout', p_is_knockout,
                         'exact_points', p_exact_points, 'result_points', p_result_points), null);
    return p_stage_id;
  exception when unique_violation then
    get stacked diagnostics v_c = constraint_name;
    if v_c like '%sort_order%' then
      raise exception 'stage_order_taken';
    end if;
    raise exception 'stage_code_taken';
  end;
end;
$$;

-- ─── 8. Equipos ─────────────────────────────────────────────────────────────

create or replace function public.control_save_team(
  p_team_id uuid, p_name text, p_code text, p_kind text, p_flag_emoji text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := private.require_platform_admin();
  v_name text := btrim(coalesce(p_name, ''));
  v_code text := nullif(upper(btrim(coalesce(p_code, ''))), '');
  v_flag text := nullif(btrim(coalesce(p_flag_emoji, '')), '');
  v_old public.teams;
  v_id uuid;
begin
  if char_length(v_name) not between 2 and 80 then
    raise exception 'invalid_name' using errcode = '22023';
  end if;
  if v_code is not null and v_code !~ '^[A-Z0-9]{2,8}$' then
    raise exception 'invalid_code' using errcode = '22023';
  end if;
  if p_kind is null or p_kind not in ('national', 'club', 'other') then
    raise exception 'invalid_kind' using errcode = '22023';
  end if;
  if v_flag is not null and char_length(v_flag) > 16 then
    raise exception 'invalid_flag' using errcode = '22023';
  end if;
  begin
    if p_team_id is null then
      insert into public.teams (name, code, kind, flag_emoji) values (v_name, v_code, p_kind, v_flag) returning id into v_id;
      perform private.audit('team_created', 'team', v_id, null, null,
        jsonb_build_object('name', v_name, 'code', v_code, 'kind', p_kind, 'flag_emoji', v_flag), null);
      return v_id;
    end if;
    select * into v_old from public.teams where id = p_team_id for update;
    if not found then
      raise exception 'team_not_found' using errcode = 'P0002';
    end if;
    -- Un equipo de un torneo con historial sellado o cerrado no se renombra.
    if exists (
      select 1 from public.event_teams et join public.events e on e.id = et.event_id
      where et.team_id = p_team_id and (e.status = 'closed' or private.event_has_sealed_history(e.id))
    ) then
      raise exception 'team_in_locked_event';
    end if;
    if (v_old.name, v_old.code, v_old.kind, v_old.flag_emoji) is not distinct from (v_name, v_code, p_kind, v_flag) then
      return p_team_id;
    end if;
    update public.teams set name = v_name, code = v_code, kind = p_kind, flag_emoji = v_flag where id = p_team_id;
    perform private.audit('team_updated', 'team', p_team_id, null,
      jsonb_build_object('name', v_old.name, 'code', v_old.code, 'kind', v_old.kind, 'flag_emoji', v_old.flag_emoji),
      jsonb_build_object('name', v_name, 'code', v_code, 'kind', p_kind, 'flag_emoji', v_flag), null);
    return p_team_id;
  exception when unique_violation then
    raise exception 'team_exists';
  end;
end;
$$;

-- Asocia un equipo existente a un torneo o cambia su grupo. Devuelve 'added' o 'updated'.
create or replace function public.control_set_event_team(p_event_id uuid, p_team_id uuid, p_group_code text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := private.require_platform_admin();
  v_ev public.events;
  v_group text := nullif(upper(btrim(coalesce(p_group_code, ''))), '');
  v_old public.event_teams;
begin
  v_ev := private.lock_event(p_event_id, true);
  if v_group is not null and v_group !~ '^[A-Z0-9]{1,6}$' then
    raise exception 'invalid_group' using errcode = '22023';
  end if;
  if not exists (select 1 from public.teams t where t.id = p_team_id) then
    raise exception 'team_not_found' using errcode = 'P0002';
  end if;
  select * into v_old from public.event_teams where event_id = p_event_id and team_id = p_team_id for update;
  if not found then
    insert into public.event_teams (event_id, team_id, group_code) values (p_event_id, p_team_id, v_group);
    perform private.audit('event_team_added', 'event_team', p_team_id, p_event_id, null,
      jsonb_build_object('team_id', p_team_id, 'group_code', v_group), null);
    return 'added';
  end if;
  if v_old.group_code is not distinct from v_group then
    return 'updated';
  end if;
  update public.event_teams set group_code = v_group where event_id = p_event_id and team_id = p_team_id;
  perform private.audit('event_team_updated', 'event_team', p_team_id, p_event_id,
    jsonb_build_object('group_code', v_old.group_code), jsonb_build_object('group_code', v_group), null);
  return 'updated';
end;
$$;

create or replace function public.control_remove_event_team(p_event_id uuid, p_team_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := private.require_platform_admin();
  v_ev public.events;
  v_old public.event_teams;
begin
  v_ev := private.lock_event(p_event_id, true);
  select * into v_old from public.event_teams where event_id = p_event_id and team_id = p_team_id for update;
  if not found then
    raise exception 'team_not_in_event' using errcode = 'P0002';
  end if;
  if exists (
    select 1 from public.matches m
    where m.event_id = p_event_id and (m.home_team_id = p_team_id or m.away_team_id = p_team_id)
  ) or exists (select 1 from public.event_results r where r.event_id = p_event_id and r.team_id = p_team_id) then
    raise exception 'team_in_use';
  end if;
  delete from public.event_teams where event_id = p_event_id and team_id = p_team_id;
  perform private.audit('event_team_removed', 'event_team', p_team_id, p_event_id,
    jsonb_build_object('team_id', p_team_id, 'group_code', v_old.group_code), null, null);
end;
$$;

-- ─── 9. Partidos ────────────────────────────────────────────────────────────

-- Crea (p_match_id NULL) o edita la programación y los datos deportivos de un partido.
-- p_starts_at es un instante (la interfaz convierte desde la zona horaria del torneo).
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
  v_c text;
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
    -- Con marcador pendiente el estado no cambia aquí (se confirma o se descarta).
    if v_old.status = 'finished' then
      v_status := 'finished';
      if (v_old.stage_id, v_old.home_team_id, v_old.away_team_id) is distinct from (p_stage_id, p_home_team_id, p_away_team_id) then
        raise exception 'match_has_result';
      end if;
    else
      v_status := coalesce(p_status, v_old.status);
      if v_status not in ('scheduled', 'live', 'postponed', 'cancelled') then
        raise exception 'invalid_status' using errcode = '22023';
      end if;
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
    get stacked diagnostics v_c = constraint_name;
    raise exception 'match_number_taken';
  end;
end;
$$;

-- ─── 10. Resultados: pendiente → confirmado → corregido ─────────────────────

-- Registra (o edita, mientras siga pendiente) un marcador. NO lo hace oficial.
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
  v_event_id uuid;
  v_old jsonb;
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
  if v_m.result_confirmed_at is not null then
    raise exception 'use_correction';
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
  select * into v_stage from public.event_stages where id = v_m.stage_id;
  perform private.validate_score(p_home, p_away, p_winner_side, v_stage.is_knockout);

  v_old := private.match_result_json(v_m);
  v_action := case when v_m.status = 'finished' then 'result_pending_edited' else 'result_recorded' end;
  update public.matches
  set status = 'finished', home_score = p_home, away_score = p_away, winner_side = p_winner_side,
      result_revision = result_revision + 1
  where id = p_match_id
  returning * into v_m;
  perform private.audit(v_action, 'match', p_match_id, v_event_id, v_old, private.match_result_json(v_m), null);
  return v_m.result_revision;
end;
$$;

-- Confirmación explícita: el resultado pasa a ser oficial.
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
  if v_m.status <> 'finished' or v_m.home_score is null then
    raise exception 'no_pending_result';
  end if;
  if p_expected_revision is distinct from v_m.result_revision then
    raise exception 'stale_revision';
  end if;
  v_old := private.match_result_json(v_m);
  update public.matches
  set result_confirmed_at = now(), result_confirmed_by = uid, result_revision = result_revision + 1
  where id = p_match_id
  returning * into v_m;
  perform private.audit('result_confirmed', 'match', p_match_id, v_event_id, v_old, private.match_result_json(v_m), null);
  return v_m.result_revision;
end;
$$;

-- Corrige un resultado ya oficial. Motivo obligatorio; sigue siendo oficial (nueva revisión).
create or replace function public.control_correct_match_result(
  p_match_id uuid, p_home integer, p_away integer, p_winner_side text, p_reason text, p_expected_revision integer
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
  v_event_id uuid;
  v_old jsonb;
  v_reason text := btrim(coalesce(p_reason, ''));
begin
  select m.event_id into v_event_id from public.matches m where m.id = p_match_id;
  if not found then
    raise exception 'match_not_found' using errcode = 'P0002';
  end if;
  v_ev := private.lock_event(v_event_id, false);
  select * into v_m from public.matches where id = p_match_id for update;
  if v_m.result_confirmed_at is null then
    raise exception 'not_confirmed';
  end if;
  if char_length(v_reason) not between 5 and 500 then
    raise exception 'reason_required' using errcode = '22023';
  end if;
  if p_expected_revision is distinct from v_m.result_revision then
    raise exception 'stale_revision';
  end if;
  select * into v_stage from public.event_stages where id = v_m.stage_id;
  perform private.validate_score(p_home, p_away, p_winner_side, v_stage.is_knockout);
  if (v_m.home_score, v_m.away_score, v_m.winner_side) is not distinct from (p_home, p_away, p_winner_side) then
    raise exception 'no_changes';
  end if;
  v_old := private.match_result_json(v_m);
  update public.matches
  set home_score = p_home, away_score = p_away, winner_side = p_winner_side,
      result_confirmed_at = now(), result_confirmed_by = uid, result_revision = result_revision + 1
  where id = p_match_id
  returning * into v_m;
  perform private.audit('result_corrected', 'match', p_match_id, v_event_id, v_old, private.match_result_json(v_m), v_reason);
  return v_m.result_revision;
end;
$$;

-- Descarta un marcador pendiente (el partido vuelve a "programado"). No aplica a resultados oficiales.
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
    raise exception 'use_correction';
  end if;
  if v_m.status <> 'finished' then
    raise exception 'no_pending_result';
  end if;
  if p_expected_revision is distinct from v_m.result_revision then
    raise exception 'stale_revision';
  end if;
  v_old := private.match_result_json(v_m);
  update public.matches
  set status = 'scheduled', home_score = null, away_score = null, winner_side = null,
      result_revision = result_revision + 1
  where id = p_match_id
  returning * into v_m;
  perform private.audit('result_discarded', 'match', p_match_id, v_event_id, v_old, private.match_result_json(v_m), null);
  return v_m.result_revision;
end;
$$;

-- ─── 11. Inscripción de torneos en parches ──────────────────────────────────

alter table public.parche_member_events drop constraint parche_member_events_action_check;
alter table public.parche_member_events add constraint parche_member_events_action_check
  check (action in ('parche_created', 'joined', 'left', 'disabled', 'reactivated',
                    'role_changed', 'invitation_created', 'invitation_revoked', 'event_enrolled'));

-- Un owner/admin activo incorpora un torneo PUBLICADO y abierto. Sin pronósticos retroactivos:
-- la escritura de pronósticos ya exige partido programado y antes de su inicio (can_write_prediction).
create or replace function public.add_event_to_parche(p_parche_id uuid, p_event_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := private.require_uid();
  v_status text;
  v_id uuid;
begin
  -- Serializa las operaciones administrativas del parche.
  perform 1 from public.parches where id = p_parche_id for update;
  if not found or not private.is_parche_admin(p_parche_id) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  select e.status into v_status from public.events e where e.id = p_event_id;
  -- Un borrador no se revela como existente.
  if not found or v_status = 'draft' then
    raise exception 'event_not_found' using errcode = 'P0002';
  end if;
  if v_status not in ('scheduled', 'in_progress') then
    raise exception 'event_not_open';
  end if;
  begin
    insert into public.parche_events (parche_id, event_id) values (p_parche_id, p_event_id) returning id into v_id;
  exception when unique_violation then
    raise exception 'already_enrolled';
  end;
  perform private.log_member_event(p_parche_id, uid, uid, 'event_enrolled',
    jsonb_build_object('event_id', p_event_id, 'parche_event_id', v_id));
  return v_id;
end;
$$;

-- ─── 12. Privilegios de ejecución ───────────────────────────────────────────

do $$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and (p.proname like 'control\_%' or p.proname in ('add_event_to_parche', 'is_platform_admin'))
  loop
    execute format('revoke all on function %s from public, anon, service_role', r.sig);
    execute format('grant execute on function %s to authenticated', r.sig);
  end loop;

  for r in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'private'
      and p.proname in ('require_platform_admin', 'audit', 'control_audit_log_immutable', 'event_has_sealed_history', 'lock_event',
                        'match_result_json', 'match_json', 'validate_score', 'event_publish_issues')
  loop
    execute format('revoke all on function %s from public, anon, authenticated, service_role', r.sig);
  end loop;
end $$;
