-- La Canchita — Fase 3.1: motor de pronósticos, puntuación y clasificaciones por parche y torneo.
--
-- Recupera la lógica probada de La Penúltima (el-var) y la adapta al modelo multitorneo/multiparche:
--   save_prediction_for_user        → public.save_prediction (por parche_event_id)
--   calculate_match_points          → private.score_match (todos los parche_events del partido, puntos de event_stages)
--   get_group_leaderboard           → public.get_parche_event_leaderboard
--   get_match_detail_predictions    → public.get_match_predictions (ahora valida la regla de visibilidad en la base)
--   get_match_missing_predictions   → public.get_match_missing_predictions
-- Reglas que se conservan: marcador 0–30; cierre en starts_at con partido programado; exacto y resultado
-- excluyentes; los penales no puntúan; RANK() por puntos, exactos y resultados; sin pronóstico = 0.
-- Diferencias intencionales: los puntos salen de event_stages (no del código), el recálculo no oculta errores
-- (el original hacía EXCEPTION WHEN OTHERS THEN NULL), reabrir retira los puntos (el original no los reiniciaba),
-- el superadministrador no juega y los jugadores deshabilitados no puntúan en la tabla.
--
-- Invariantes garantizados por TRIGGER (valen para cualquier vía de escritura, incluida la futura Fase 3.2):
--   * predictions.points solo puede existir mientras el partido está `finished`;
--   * al pasar a `finished` (o cambiar su marcador/fase) se recalculan los puntos de TODOS los parches (se
--     sobrescriben, nunca se acumulan); al salir de `finished` o cancelarse se retiran;
--   * `cancelled` es definitivo; un partido finalizado solo puede volver a `live` (reapertura);
--   * el torneo con historial sellado (Mundial 2026) nunca se puntúa ni se recalcula.
-- Aditiva: no borra ni modifica filas existentes.

-- ─── 1. Pronósticos: marca de tiempo, superadministrador ────────────────────

-- predictions.updated_at es la hora del pronóstico (predicted_at del original): solo cambia si cambia el marcador,
-- no cuando el motor escribe los puntos.
create or replace function private.predictions_touch()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.home_score is not distinct from old.home_score and new.away_score is not distinct from old.away_score then
    new.updated_at := old.updated_at;
  else
    new.updated_at := now();
  end if;
  return new;
end;
$$;
drop trigger predictions_updated_at on public.predictions;
create trigger predictions_touch before update on public.predictions
  for each row execute function private.predictions_touch();

-- El superadministrador global no pronostica: restricción en la base (además de la RPC y de la política RLS).
create or replace function private.predictions_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from private.platform_admins pa where pa.user_id = new.user_id) then
    raise exception 'superadmin_cannot_predict' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger predictions_guard before insert or update of user_id, home_score, away_score on public.predictions
  for each row execute function private.predictions_guard();

-- ─── 2. Reglas de acceso (RLS): escritura y visibilidad ─────────────────────

-- Escritura: miembro ACTIVO del parche (no superadministrador), inscripción activa, torneo abierto, partido
-- programado o aplazado y antes de su hora de inicio. Un partido aplazado conserva sus pronósticos y se pueden
-- editar hasta su (nueva) hora de inicio; reabrir un finalizado (live) NO reabre pronósticos.
create or replace function private.can_write_prediction(p_parche_event_id uuid, p_match_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.parche_events pe
    join public.parche_members pm on pm.parche_id = pe.parche_id
    join public.matches m on m.id = p_match_id and m.event_id = pe.event_id
    join public.events e on e.id = pe.event_id
    where pe.id = p_parche_event_id
      and pe.status = 'active'
      and e.status in ('scheduled', 'in_progress')
      and pm.user_id = (select auth.uid())
      and pm.status = 'active'
      and m.status in ('scheduled', 'postponed')
      and now() < m.starts_at
      and not exists (select 1 from private.platform_admins pa where pa.user_id = (select auth.uid()))
  );
$$;

-- Visibilidad de pronósticos ajenos (miembros del parche): tras el inicio (partido en juego/finalizado o ya
-- pasada su hora) o, según el parche, al terminar. Un partido aplazado los mantiene ocultos (aún se pueden
-- editar); uno cancelado los muestra como historial.
create or replace function private.can_view_others_predictions(p_parche_event_id uuid, p_match_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.parche_events pe
    join public.parche_members pm on pm.parche_id = pe.parche_id
    join public.matches m on m.id = p_match_id and m.event_id = pe.event_id
    where pe.id = p_parche_event_id
      and pm.user_id = (select auth.uid())
      and case pe.predictions_visibility
            when 'after_kickoff' then m.status in ('live', 'finished', 'cancelled') or (m.status = 'scheduled' and now() >= m.starts_at)
            when 'after_finish'  then m.status in ('finished', 'cancelled')
            else false
          end
  );
$$;

-- ─── 3. Motor de puntuación (privado) ───────────────────────────────────────

-- Recalcula los puntos de TODOS los pronósticos del partido (todos los parches inscritos). Determinista e
-- idempotente: sobrescribe, no acumula. Falla de forma visible (sin EXCEPTION WHEN OTHERS) y es atómica.
create or replace function private.score_match(p_match_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  m public.matches;
  st public.event_stages;
  v_n integer;
begin
  select * into m from public.matches where id = p_match_id for update;
  if not found then
    raise exception 'match_not_found' using errcode = 'P0002';
  end if;
  if private.event_has_sealed_history(m.event_id) then
    raise exception 'event_locked_history';
  end if;
  if m.status <> 'finished' or m.home_score is null or m.away_score is null then
    raise exception 'match_not_scorable';
  end if;
  select * into st from public.event_stages where id = m.stage_id;

  update public.predictions p
  set points = case
        when p.home_score = m.home_score and p.away_score = m.away_score then st.exact_points
        when sign(p.home_score - p.away_score) = sign(m.home_score - m.away_score) then st.result_points
        else 0
      end,
      points_reason = case
        when p.home_score = m.home_score and p.away_score = m.away_score then 'exact'
        when sign(p.home_score - p.away_score) = sign(m.home_score - m.away_score) then 'result'
        else 'miss'
      end,
      scored_at = now()
  where p.match_id = m.id;
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

-- Retira los puntos vigentes de un partido (reapertura, aplazamiento o cancelación).
create or replace function private.clear_match_points(p_match_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_n integer;
begin
  update public.predictions
  set points = null, points_reason = null, scored_at = null
  where match_id = p_match_id and (points is not null or points_reason is not null or scored_at is not null);
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

-- Sincroniza los puntos con el estado del partido, sea cual sea el flujo que lo modifique.
create or replace function private.matches_score_sync()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Nunca se puntúa ni se recalcula un torneo con historial sellado.
  if private.event_has_sealed_history(new.event_id) then
    return null;
  end if;
  if new.status = 'finished' and new.home_score is not null and new.away_score is not null then
    if old.status is distinct from new.status or old.home_score is distinct from new.home_score
       or old.away_score is distinct from new.away_score or old.stage_id is distinct from new.stage_id then
      perform private.score_match(new.id);
    end if;
  elsif old.status = 'finished' or new.status = 'cancelled' then
    perform private.clear_match_points(new.id);
  end if;
  return null;
end;
$$;
create trigger matches_score_sync after update of status, home_score, away_score, stage_id on public.matches
  for each row execute function private.matches_score_sync();

-- Transiciones de estado: `cancelled` es definitivo; un finalizado solo puede reabrirse (live).
create or replace function private.matches_status_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status = 'cancelled' and new.status <> 'cancelled' then
    raise exception 'match_cancelled';
  end if;
  if old.status = 'finished' and new.status not in ('finished', 'live') then
    raise exception 'invalid_transition';
  end if;
  return new;
end;
$$;
create trigger matches_status_guard before update of status on public.matches
  for each row when (old.status is distinct from new.status) execute function private.matches_status_guard();

-- ─── 4. Pronósticos: RPC del jugador ────────────────────────────────────────

-- Crea o actualiza (sin duplicados) el pronóstico del usuario autenticado para un partido dentro de una
-- inscripción de su parche. Equivale a save_prediction_for_user del original.
create or replace function public.save_prediction(p_parche_event_id uuid, p_match_id uuid, p_home integer, p_away integer)
returns public.predictions
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := private.require_uid();
  v_pe public.parche_events;
  v_member public.parche_members;
  v_e public.events;
  v_m public.matches;
  v_pred public.predictions;
begin
  if exists (select 1 from private.platform_admins pa where pa.user_id = uid) then
    raise exception 'superadmin_cannot_predict' using errcode = '42501';
  end if;
  if p_home is null or p_away is null or p_home not between 0 and 30 or p_away not between 0 and 30 then
    raise exception 'invalid_scores' using errcode = '22023';
  end if;
  -- Una inscripción ajena o inexistente no se distingue (no se revela).
  select * into v_pe from public.parche_events where id = p_parche_event_id;
  if not found then
    raise exception 'not_enrolled' using errcode = '42501';
  end if;
  select * into v_member from public.parche_members where parche_id = v_pe.parche_id and user_id = uid;
  if not found then
    raise exception 'not_enrolled' using errcode = '42501';
  end if;
  if v_member.status <> 'active' then
    raise exception 'member_disabled' using errcode = '42501';
  end if;
  if v_pe.status <> 'active' then
    raise exception 'enrollment_inactive';
  end if;
  select * into v_e from public.events where id = v_pe.event_id;
  if v_e.status not in ('scheduled', 'in_progress') then
    raise exception 'event_not_open';
  end if;
  -- FOR SHARE: el partido no cambia de estado/hora mientras se valida y se guarda.
  select * into v_m from public.matches where id = p_match_id for share;
  if not found then
    raise exception 'match_not_found' using errcode = 'P0002';
  end if;
  if v_m.event_id <> v_pe.event_id then
    raise exception 'match_not_in_event' using errcode = '22023';
  end if;
  if v_m.status not in ('scheduled', 'postponed') then
    raise exception 'match_not_open';
  end if;
  if now() >= v_m.starts_at then
    raise exception 'match_started';
  end if;

  insert into public.predictions (parche_event_id, event_id, match_id, user_id, home_score, away_score)
  values (p_parche_event_id, v_pe.event_id, p_match_id, uid, p_home, p_away)
  on conflict (parche_event_id, match_id, user_id)
  do update set home_score = excluded.home_score, away_score = excluded.away_score
  returning * into v_pred;
  return v_pred;
end;
$$;

-- ─── 5. Consultas de la experiencia del jugador ─────────────────────────────

-- Clasificación de un parche en un torneo. Reglas del original: puntos, exactos y resultados acertados;
-- los empates reales comparten posición (RANK). Participan los miembros activos que no son superadministradores;
-- los pronósticos de partidos cancelados no cuentan. Se calcula al consultar (no se guarda).
create or replace function public.get_parche_event_leaderboard(p_parche_event_id uuid)
returns table (
  user_id uuid, display_name text, total_points bigint, exact_count bigint, result_count bigint, pred_count bigint, rank bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  uid uuid := private.require_uid();
  v_parche uuid;
begin
  select pe.parche_id into v_parche from public.parche_events pe where pe.id = p_parche_event_id;
  if v_parche is null or not private.is_parche_member(v_parche) then
    raise exception 'not_member' using errcode = '42501';
  end if;
  return query
  with participants as (
    select pm.user_id as uid,
           coalesce(nullif(btrim(u.raw_user_meta_data ->> 'username'), ''), nullif(split_part(u.email, '@', 1), ''), 'Participante')::text as name
    from public.parche_members pm
    join auth.users u on u.id = pm.user_id
    where pm.parche_id = v_parche and pm.status = 'active'
      and not exists (select 1 from private.platform_admins pa where pa.user_id = pm.user_id)
  ), scores as (
    select pt.uid, pt.name,
           coalesce(sum(p.points), 0)::bigint as total_points,
           count(*) filter (where p.points_reason = 'exact')::bigint as exact_count,
           count(*) filter (where p.points_reason = 'result')::bigint as result_count,
           count(p.id) filter (where m.status is distinct from 'cancelled')::bigint as pred_count
    from participants pt
    left join public.predictions p on p.user_id = pt.uid and p.parche_event_id = p_parche_event_id
    left join public.matches m on m.id = p.match_id
    group by pt.uid, pt.name
  ), ranked as (
    select s.*, rank() over (order by s.total_points desc, s.exact_count desc, s.result_count desc)::bigint as rnk
    from scores s
  )
  select r.uid, r.name, r.total_points, r.exact_count, r.result_count, r.pred_count, r.rnk
  from ranked r
  order by r.rnk, r.total_points desc, r.name;
end;
$$;

-- Pronósticos de un partido dentro del parche. A diferencia del original, la base valida la regla de
-- visibilidad (antes del inicio solo se ve el propio). Excluye superadministradores y jugadores deshabilitados.
create or replace function public.get_match_predictions(p_parche_event_id uuid, p_match_id uuid)
returns table (
  user_id uuid, display_name text, pred_home integer, pred_away integer, points integer, points_reason text, predicted_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  uid uuid := private.require_uid();
  v_pe public.parche_events;
begin
  select * into v_pe from public.parche_events where id = p_parche_event_id;
  if not found or not private.is_parche_member(v_pe.parche_id) then
    raise exception 'not_member' using errcode = '42501';
  end if;
  if not exists (select 1 from public.matches m where m.id = p_match_id and m.event_id = v_pe.event_id) then
    raise exception 'match_not_in_event' using errcode = '22023';
  end if;
  if not private.can_view_others_predictions(p_parche_event_id, p_match_id) then
    raise exception 'predictions_hidden' using errcode = '42501';
  end if;
  return query
  select p.user_id,
         coalesce(nullif(btrim(u.raw_user_meta_data ->> 'username'), ''), nullif(split_part(u.email, '@', 1), ''), 'Participante')::text,
         p.home_score::integer, p.away_score::integer, coalesce(p.points, 0)::integer, p.points_reason, p.updated_at
  from public.predictions p
  join public.parche_members pm on pm.parche_id = v_pe.parche_id and pm.user_id = p.user_id and pm.status = 'active'
  join auth.users u on u.id = p.user_id
  where p.match_id = p_match_id and p.parche_event_id = p_parche_event_id
    and not exists (select 1 from private.platform_admins pa where pa.user_id = p.user_id)
  order by p.created_at;
end;
$$;

-- Miembros activos del parche que aún no pronostican el partido (el original lo muestra siempre a los miembros).
create or replace function public.get_match_missing_predictions(p_parche_event_id uuid, p_match_id uuid)
returns table (user_id uuid, display_name text)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  uid uuid := private.require_uid();
  v_pe public.parche_events;
begin
  select * into v_pe from public.parche_events where id = p_parche_event_id;
  if not found or not private.is_parche_member(v_pe.parche_id) then
    raise exception 'not_member' using errcode = '42501';
  end if;
  if not exists (select 1 from public.matches m where m.id = p_match_id and m.event_id = v_pe.event_id) then
    raise exception 'match_not_in_event' using errcode = '22023';
  end if;
  return query
  select pm.user_id,
         coalesce(nullif(btrim(u.raw_user_meta_data ->> 'username'), ''), nullif(split_part(u.email, '@', 1), ''), 'Participante')::text as name
  from public.parche_members pm
  join auth.users u on u.id = pm.user_id
  where pm.parche_id = v_pe.parche_id and pm.status = 'active'
    and not exists (select 1 from private.platform_admins pa where pa.user_id = pm.user_id)
    and not exists (select 1 from public.predictions p where p.parche_event_id = p_parche_event_id and p.match_id = p_match_id and p.user_id = pm.user_id)
  order by name;
end;
$$;

-- ─── 6. Ciclo de vida: operaciones privilegiadas (superadministrador) ───────

-- Reapertura excepcional de un partido finalizado → En vivo. Retira los puntos vigentes (trigger), conserva los
-- pronósticos (siguen bloqueados) y exige motivo y la revisión vista. Al volver a finalizar se recalcula.
create or replace function public.control_reopen_match(p_match_id uuid, p_reason text, p_expected_revision integer)
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
  v_reason text := btrim(coalesce(p_reason, ''));
  v_cleared integer;
begin
  select m.event_id into v_event_id from public.matches m where m.id = p_match_id;
  if not found then
    raise exception 'match_not_found' using errcode = 'P0002';
  end if;
  v_ev := private.lock_event(v_event_id, false);
  select * into v_m from public.matches where id = p_match_id for update;
  if v_m.status <> 'finished' then
    raise exception 'not_finished';
  end if;
  if char_length(v_reason) not between 5 and 500 then
    raise exception 'reason_required' using errcode = '22023';
  end if;
  if p_expected_revision is distinct from v_m.result_revision then
    raise exception 'stale_revision';
  end if;
  v_old := private.match_result_json(v_m);
  update public.matches
  set status = 'live', result_confirmed_at = null, result_confirmed_by = null, result_revision = result_revision + 1
  where id = p_match_id
  returning * into v_m;
  select count(*) into v_cleared from public.predictions where match_id = p_match_id and points is not null;
  if v_cleared > 0 then
    raise exception 'orphan_points';
  end if;
  perform private.audit('match_reopened', 'match', p_match_id, v_event_id, v_old, private.match_result_json(v_m), v_reason);
  return v_m.result_revision;
end;
$$;

-- Recalcula explícitamente los puntos de un partido finalizado (idempotente). Devuelve cuántos pronósticos tocó.
create or replace function public.control_rescore_match(p_match_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := private.require_platform_admin();
  v_ev public.events;
  v_event_id uuid;
  v_n integer;
begin
  select m.event_id into v_event_id from public.matches m where m.id = p_match_id;
  if not found then
    raise exception 'match_not_found' using errcode = 'P0002';
  end if;
  v_ev := private.lock_event(v_event_id, false);
  v_n := private.score_match(p_match_id);
  perform private.audit('match_rescored', 'match', p_match_id, v_event_id, null, jsonb_build_object('predictions', v_n), null);
  return v_n;
end;
$$;

-- ─── 7. Privilegios ─────────────────────────────────────────────────────────

do $$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('save_prediction', 'get_parche_event_leaderboard', 'get_match_predictions',
                        'get_match_missing_predictions', 'control_reopen_match', 'control_rescore_match')
  loop
    execute format('revoke all on function %s from public, anon, service_role', r.sig);
    execute format('grant execute on function %s to authenticated', r.sig);
  end loop;

  for r in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'private'
      and p.proname in ('score_match', 'clear_match_points', 'matches_score_sync', 'matches_status_guard',
                        'predictions_touch', 'predictions_guard')
  loop
    execute format('revoke all on function %s from public, anon, authenticated, service_role', r.sig);
  end loop;
end $$;
