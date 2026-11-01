-- Verificación del motor contra el proyecto REAL (lacanchita), TODO en una transacción con ROLLBACK (no deja datos).
-- Identidades simuladas con claims JWT (no toca auth.*): superadmin autorizado + miembros reales de La Penúltima.
-- Crea dentro de la transacción un torneo/partidos/inscripciones ficticios; el Mundial y Copa de prueba no se tocan.
--   npx supabase db query --linked -f scripts/history-migration/tests/remote_motor_test.sql
begin;
do $$ begin
  if not exists (select 1 from public.events where slug = 'mundial-2026') then raise exception 'proyecto_inesperado'; end if;
end $$;
create temp table results (n serial, name text, ok boolean, detail text);
create temp table vars (k text primary key, v text);
grant insert, select on results to authenticated;
grant select, insert, update on vars to authenticated;
grant usage on sequence results_n_seq to authenticated;
create function pg_temp.as_user(p uuid) returns void language plpgsql as $$
begin execute 'reset role'; perform set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated')::text, true); execute 'set local role authenticated'; end $$;
create function pg_temp.as_admin() returns void language plpgsql as $$
begin execute 'reset role'; perform set_config('request.jwt.claims', '', true); end $$;
create function pg_temp.check(p_name text, p_ok boolean, p_detail text default null) returns void language sql as $$
  insert into results (name, ok, detail) values (p_name, coalesce(p_ok, false), p_detail); $$;
create function pg_temp.try(p_name text, p_sql text, p_expect_error boolean, p_error_like text default null) returns void language plpgsql as $$
begin
  begin execute p_sql; insert into results (name, ok, detail) values (p_name, not p_expect_error, 'sin error');
  exception when others then insert into results (name, ok, detail) values (p_name, p_expect_error and (p_error_like is null or sqlerrm like p_error_like), sqlerrm); end;
end $$;
create function pg_temp.v(p_k text) returns text language sql as $$ select v from vars where k = p_k $$;
grant execute on all functions in schema pg_temp to authenticated;

insert into vars select 'sa', '95d77e57-b6cb-4359-bc86-e70b3b9f44dd';
insert into vars select 'lp', '91ad5d8d-414c-4e74-bf57-2ca476652de0';
insert into vars select 'mundial', 'daaebb9b-8e92-5644-824f-bf826114446a';
insert into vars select 'a', (select user_id::text from public.parche_members where parche_id = '91ad5d8d-414c-4e74-bf57-2ca476652de0' and role = 'member' and status = 'active' order by joined_at limit 1);
insert into vars select 'b', (select user_id::text from public.parche_members where parche_id = '91ad5d8d-414c-4e74-bf57-2ca476652de0' and role = 'member' and status = 'active' order by joined_at offset 1 limit 1);
create temp table before as select
  (select md5(string_agg(m::text, '|' order by m.id)) from public.matches m where event_id = pg_temp.v('mundial')::uuid) matches,
  (select rows_checksum from public.standing_snapshots limit 1) checksum,
  (select count(*) from public.predictions) preds,
  (select md5(string_agg(m::text, '|' order by m.id)) from public.matches m where event_id = 'e67ed98a-1929-49e0-bcc8-6ff9eb74169c') copa;

-- Torneo ficticio en la transacción: 1 fase 3/1, 2 equipos del catálogo, 1 partido, La Penúltima inscrita + parche de prueba
select pg_temp.as_user(pg_temp.v('sa')::uuid);
insert into vars select 'e', public.control_create_event('motor-remoto', 'Motor remoto (se revierte)', 'America/Bogota')::text;
insert into vars select 'st', public.control_save_stage(pg_temp.v('e')::uuid, null, 'g', 'Grupos', 1, false, 3, 1)::text;
insert into vars select 'ta', public.control_save_team(null, 'Remoto Motor A', null, 'club', null)::text;
insert into vars select 'tb', public.control_save_team(null, 'Remoto Motor B', null, 'club', null)::text;
select public.control_set_event_team(pg_temp.v('e')::uuid, pg_temp.v('ta')::uuid, null);
select public.control_set_event_team(pg_temp.v('e')::uuid, pg_temp.v('tb')::uuid, null);
insert into vars select 'm', public.control_save_match(null, pg_temp.v('e')::uuid, pg_temp.v('st')::uuid, 1, null, now() + interval '1 day', null, pg_temp.v('ta')::uuid, pg_temp.v('tb')::uuid, null, null, null)::text;
select public.control_publish_event(pg_temp.v('e')::uuid);
select pg_temp.as_admin();
insert into public.parche_events (id, parche_id, event_id) values ('b1000000-0000-4000-8000-0000000000e1', pg_temp.v('lp')::uuid, pg_temp.v('e')::uuid);
insert into vars values ('pe', 'b1000000-0000-4000-8000-0000000000e1');

select pg_temp.as_user(pg_temp.v('a')::uuid);
select public.save_prediction(pg_temp.v('pe')::uuid, pg_temp.v('m')::uuid, 2, 1);
select pg_temp.check('R1 miembro real pronostica en La Penúltima', (select count(*) from public.predictions where parche_event_id = pg_temp.v('pe')::uuid and user_id = pg_temp.v('a')::uuid) = 1);
select pg_temp.as_user(pg_temp.v('sa')::uuid);
select pg_temp.try('R2 el superadministrador no pronostica', format($q$select public.save_prediction(%L, %L, 1, 0)$q$, pg_temp.v('pe'), pg_temp.v('m')), true, 'superadmin_cannot_predict');
select pg_temp.as_user(pg_temp.v('b')::uuid);
select public.save_prediction(pg_temp.v('pe')::uuid, pg_temp.v('m')::uuid, 1, 0);
select pg_temp.try('R3 pronósticos ajenos ocultos antes del inicio (RPC)', format($q$select * from public.get_match_predictions(%L, %L)$q$, pg_temp.v('pe'), pg_temp.v('m')), true, 'predictions_hidden');
select pg_temp.check('R3 y por consulta directa (RLS)', (select count(*) from public.predictions where match_id = pg_temp.v('m')::uuid and user_id <> pg_temp.v('b')::uuid) = 0);
select pg_temp.try('R4 no puntúan por su cuenta (columna points)', format($q$update public.predictions set points = 99 where match_id = %L$q$, pg_temp.v('m')), true, 'permission denied%');
select pg_temp.try('R4 no ejecutan funciones privilegiadas', format($q$select private.score_match(%L)$q$, pg_temp.v('m')), true, 'permission denied%');
select pg_temp.try('R4 ni control_rescore_match', format($q$select public.control_rescore_match(%L)$q$, pg_temp.v('m')), true, 'not_platform_admin');
select pg_temp.as_admin();
update public.matches set starts_at = now() - interval '2 hours', status = 'live', home_score = 0, away_score = 0 where id = pg_temp.v('m')::uuid;
update public.matches set status = 'finished', home_score = 2, away_score = 1 where id = pg_temp.v('m')::uuid;
select pg_temp.check('R5 finalizar puntúa: exacto 3 y resultado 1 (event_stages)',
  (select points = 3 and points_reason = 'exact' from public.predictions where user_id = pg_temp.v('a')::uuid and match_id = pg_temp.v('m')::uuid)
  and (select points = 1 and points_reason = 'result' from public.predictions where user_id = pg_temp.v('b')::uuid and match_id = pg_temp.v('m')::uuid));
select pg_temp.as_user(pg_temp.v('a')::uuid);
select pg_temp.check('R6 clasificación del parche: A primero con 3, B segundo con 1; superadmin excluido',
  (select string_agg(user_id::text || ':' || total_points || ':' || rank, ',' order by rank) from public.get_parche_event_leaderboard(pg_temp.v('pe')::uuid) where user_id in (pg_temp.v('a')::uuid, pg_temp.v('b')::uuid))
    = pg_temp.v('a') || ':3:1,' || pg_temp.v('b') || ':1:2'
  and not exists (select 1 from public.get_parche_event_leaderboard(pg_temp.v('pe')::uuid) where user_id = pg_temp.v('sa')::uuid));
select pg_temp.check('R7 tras finalizar, los pronósticos ajenos ya se ven', (select count(*) from public.get_match_predictions(pg_temp.v('pe')::uuid, pg_temp.v('m')::uuid)) = 2);
select pg_temp.as_user(pg_temp.v('sa')::uuid);
select public.control_reopen_match(pg_temp.v('m')::uuid, 'Reapertura de prueba remota', 0);
select pg_temp.as_admin();
select pg_temp.check('R8 reabrir retira los puntos y conserva los pronósticos',
  (select count(*) from public.predictions where match_id = pg_temp.v('m')::uuid) = 2
  and (select count(*) from public.predictions where match_id = pg_temp.v('m')::uuid and points is not null) = 0
  and (select status = 'live' from public.matches where id = pg_temp.v('m')::uuid));
update public.matches set status = 'finished', home_score = 1, away_score = 0 where id = pg_temp.v('m')::uuid;
select pg_temp.check('R9 volver a finalizar recalcula con el marcador definitivo (1-0)',
  (select points = 1 from public.predictions where user_id = pg_temp.v('a')::uuid and match_id = pg_temp.v('m')::uuid)
  and (select points = 3 from public.predictions where user_id = pg_temp.v('b')::uuid and match_id = pg_temp.v('m')::uuid));
select pg_temp.check('R10 el Mundial histórico y Copa de prueba intactos dentro de la transacción',
  (select md5(string_agg(m::text, '|' order by m.id)) from public.matches m where event_id = pg_temp.v('mundial')::uuid) = (select matches from before)
  and (select md5(string_agg(m::text, '|' order by m.id)) from public.matches m where event_id = 'e67ed98a-1929-49e0-bcc8-6ff9eb74169c') = (select copa from before)
  and (select rows_checksum from public.standing_snapshots limit 1) = (select checksum from before)
  and (select bool_and(private.verify_standing_snapshot(id)) from public.standing_snapshots)
  and (select count(*) from public.predictions where event_id = pg_temp.v('mundial')::uuid) = 0);
select pg_temp.try('R11 el Mundial histórico no se puntúa', format($q$select private.score_match((select id from public.matches where event_id = %L limit 1))$q$, pg_temp.v('mundial')), true, 'event_locked_history');

select 'FALLO' as resultado, name, detail from results where not ok
union all
select 'TOTAL', count(*) filter (where ok) || ' OK', count(*) filter (where not ok) || ' fallos' from results;
rollback;
