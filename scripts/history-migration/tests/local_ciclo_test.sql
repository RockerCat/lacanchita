-- Pruebas del ciclo de vida de partidos (migración 20261031110000): inicio automático, marcador en vivo,
-- aplazamiento, reprogramación, cancelación y seguridad. SOLO Postgres local desechable; datos ficticios; ROLLBACK.
--   psql -h 127.0.0.1 -p 55432 -U postgres -d canchita_test -v ON_ERROR_STOP=1 -f <este archivo>
begin;
do $$ begin
  if current_setting('cluster_name', true) is distinct from 'lacanchita-local-test' then raise exception 'pruebas_solo_local'; end if;
end $$;
create temp table results (n serial, name text, ok boolean, detail text);
create temp table vars (k text primary key, v text);
grant insert, select on results to authenticated, anon;
grant select, insert, update on vars to authenticated, anon;
grant usage on sequence results_n_seq to authenticated, anon;
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
create function pg_temp.st(p_id text) returns text language sql as $$
  select status || ' ' || coalesce(home_score::text, '·') || '-' || coalesce(away_score::text, '·') from public.matches where id = p_id::uuid $$;
grant execute on all functions in schema pg_temp to authenticated, anon;

insert into auth.users (id, email) values ('00000000-0000-4000-8000-000000000001', 'sa@e.test'), ('00000000-0000-4000-8000-000000000002', 'p@e.test');
insert into private.platform_admins (user_id) values ('00000000-0000-4000-8000-000000000001');
insert into vars values ('sa','00000000-0000-4000-8000-000000000001'), ('p','00000000-0000-4000-8000-000000000002');
-- Torneos: EV (en curso, huso Asia/Tokyo), EVD (borrador), Mundial histórico (sellado).
insert into public.events (id, slug, name, status, timezone) values
  ('e0000000-0000-4000-8000-0000000000a1', 'ciclo-ev', 'Ciclo', 'in_progress', 'Asia/Tokyo'),
  ('e0000000-0000-4000-8000-0000000000a2', 'ciclo-draft', 'Ciclo borrador', 'draft', 'America/Bogota');
insert into public.event_stages (id, event_id, code, name, sort_order, is_knockout, exact_points, result_points) values
  ('51000000-0000-4000-8000-0000000000a1', 'e0000000-0000-4000-8000-0000000000a1', 'g', 'Grupos', 1, false, 3, 1),
  ('51000000-0000-4000-8000-0000000000a2', 'e0000000-0000-4000-8000-0000000000a2', 'g', 'Grupos', 1, false, 3, 1);
insert into public.teams (id, name, kind) values ('72000000-0000-4000-8000-0000000000a1', 'Ciclo A', 'club'), ('72000000-0000-4000-8000-0000000000a2', 'Ciclo B', 'club');
insert into public.event_teams (event_id, team_id) select e, t from (values ('e0000000-0000-4000-8000-0000000000a1'::uuid), ('e0000000-0000-4000-8000-0000000000a2')) ev(e),
  (values ('72000000-0000-4000-8000-0000000000a1'::uuid), ('72000000-0000-4000-8000-0000000000a2')) tm(t);
insert into public.parches (id, name, created_by) values ('c1000000-0000-4000-8000-0000000000a1', 'PC', pg_temp.v('p')::uuid);
insert into public.parche_members (parche_id, user_id, role) values ('c1000000-0000-4000-8000-0000000000a1', pg_temp.v('p')::uuid, 'owner');
insert into public.parche_events (id, parche_id, event_id) values ('b1000000-0000-4000-8000-0000000000a1', 'c1000000-0000-4000-8000-0000000000a1', 'e0000000-0000-4000-8000-0000000000a1');

create function pg_temp.mk(p_id text, p_event text, p_stage text, p_n int, p_starts timestamptz, p_status text, p_teams boolean default true, p_h int default null, p_a int default null) returns void language sql as $$
  insert into public.matches (id, event_id, stage_id, match_number, starts_at, home_team_id, away_team_id, home_placeholder, away_placeholder, teams_source, status, home_score, away_score)
  values (p_id::uuid, p_event::uuid, p_stage::uuid, p_n, p_starts,
          case when p_teams then '72000000-0000-4000-8000-0000000000a1'::uuid end, case when p_teams then '72000000-0000-4000-8000-0000000000a2'::uuid end,
          case when p_teams then null else 'Por definir A' end, case when p_teams then null else 'Por definir B' end,
          case when p_teams then 'assigned' end, p_status, p_h, p_a) $$;
-- A: debe iniciar · B: futuro · C: aplazado · D: cancelado · E: torneo borrador · F: sin equipos · G: con marcador previo · I: ya en vivo · J: finalizado · K: hora futura (huso lejano) · L: hora pasada (huso lejano)
\set ev 'e0000000-0000-4000-8000-0000000000a1'
\set st 'a1000000-0000-4000-8000-0000000000'
select pg_temp.mk('a1000000-0000-4000-8000-0000000000a1', :'ev', '51000000-0000-4000-8000-0000000000a1', 1, now() - interval '5 minutes', 'scheduled');
select pg_temp.mk('a1000000-0000-4000-8000-0000000000b1', :'ev', '51000000-0000-4000-8000-0000000000a1', 2, now() + interval '2 hours', 'scheduled');
select pg_temp.mk('a1000000-0000-4000-8000-0000000000c1', :'ev', '51000000-0000-4000-8000-0000000000a1', 3, now() - interval '1 hour', 'postponed');
select pg_temp.mk('a1000000-0000-4000-8000-0000000000d1', :'ev', '51000000-0000-4000-8000-0000000000a1', 4, now() - interval '1 hour', 'cancelled');
select pg_temp.mk('a1000000-0000-4000-8000-0000000000e1', 'e0000000-0000-4000-8000-0000000000a2', '51000000-0000-4000-8000-0000000000a2', 1, now() - interval '1 hour', 'scheduled');
select pg_temp.mk('a1000000-0000-4000-8000-0000000000f1', :'ev', '51000000-0000-4000-8000-0000000000a1', 5, now() - interval '1 hour', 'scheduled', false);
select pg_temp.mk('a1000000-0000-4000-8000-0000000000a2', :'ev', '51000000-0000-4000-8000-0000000000a1', 6, now() - interval '1 hour', 'scheduled', true, 3, 1);
select pg_temp.mk('a1000000-0000-4000-8000-0000000000a3', :'ev', '51000000-0000-4000-8000-0000000000a1', 7, now() - interval '2 hours', 'live', true, 1, 0);
select pg_temp.mk('a1000000-0000-4000-8000-0000000000a4', :'ev', '51000000-0000-4000-8000-0000000000a1', 8, now() - interval '3 hours', 'finished', true, 2, 2);
select pg_temp.mk('a1000000-0000-4000-8000-0000000000a5', :'ev', '51000000-0000-4000-8000-0000000000a1', 9, now() + interval '1 hour', 'scheduled');      -- hora futura en un huso adelantado
select pg_temp.mk('a1000000-0000-4000-8000-0000000000a6', :'ev', '51000000-0000-4000-8000-0000000000a1', 10, now() - interval '1 minute', 'scheduled');   -- hora recién pasada
-- Un partido «programado» y vencido dentro del torneo histórico sellado: nunca se inicia.
insert into public.matches (id, event_id, stage_id, match_number, starts_at, home_team_id, away_team_id, teams_source, status)
select 'a1000000-0000-4000-8000-0000000000aa', e.id, (select id from public.event_stages where event_id = e.id limit 1), 999, now() - interval '1 day',
       (select team_id from public.event_teams where event_id = e.id order by team_id limit 1), (select team_id from public.event_teams where event_id = e.id order by team_id offset 1 limit 1), 'assigned', 'scheduled'
from public.events e where e.slug = 'mundial-2026';
-- Un pronóstico previo en A (para comprobar el bloqueo y la ausencia de puntos al iniciar).
insert into public.predictions (parche_event_id, event_id, match_id, user_id, home_score, away_score)
values ('b1000000-0000-4000-8000-0000000000a1', :'ev', 'a1000000-0000-4000-8000-0000000000a1', pg_temp.v('p')::uuid, 1, 0);

create temp table hist as select
  (select md5(string_agg(m::text, '|' order by m.id)) from public.matches m where event_id = 'daaebb9b-8e92-5644-824f-bf826114446a' and match_number <> 999) matches,
  (select rows_checksum from public.standing_snapshots limit 1) checksum;

-- ═══ A. INICIO AUTOMÁTICO ═══════════════════════════════════════════════════
select pg_temp.as_user(pg_temp.v('p')::uuid);
select pg_temp.check('A1 antes de sincronizar nada ha cambiado', pg_temp.st('a1000000-0000-4000-8000-0000000000a1') = 'scheduled ·-·');
create temp table sync1 as select public.sync_due_matches() n;
select pg_temp.check('A2 un jugador sincroniza: inicia solo A, G y L (hora llegada, torneo habilitado, con equipos)', (select n from sync1) = 3);
select pg_temp.check('A3 A inicia en 0-0', pg_temp.st('a1000000-0000-4000-8000-0000000000a1') = 'live 0-0');
select pg_temp.check('A4 L (hora recién pasada) también', pg_temp.st('a1000000-0000-4000-8000-0000000000a6') = 'live 0-0');
select pg_temp.check('A5 G conserva su marcador previo (no se sobrescribe)', pg_temp.st('a1000000-0000-4000-8000-0000000000a2') = 'live 3-1');
select pg_temp.check('A6 no se inicia antes de hora (B ni K aunque el torneo sea Asia/Tokyo: se comparan instantes)', pg_temp.st('a1000000-0000-4000-8000-0000000000b1') = 'scheduled ·-·'
  and pg_temp.st('a1000000-0000-4000-8000-0000000000a5') = 'scheduled ·-·');
select pg_temp.check('A7 no se inician aplazados ni cancelados', pg_temp.st('a1000000-0000-4000-8000-0000000000c1') = 'postponed ·-·' and pg_temp.st('a1000000-0000-4000-8000-0000000000d1') = 'cancelled ·-·');
select pg_temp.check('A9 no se toca el torneo histórico', pg_temp.st('a1000000-0000-4000-8000-0000000000aa') = 'scheduled ·-·');
select pg_temp.check('A10 los partidos en vivo y finalizados no cambian', pg_temp.st('a1000000-0000-4000-8000-0000000000a3') = 'live 1-0' and pg_temp.st('a1000000-0000-4000-8000-0000000000a4') = 'finished 2-2');
select pg_temp.check('A11 idempotente: una segunda sincronización no inicia nada', public.sync_due_matches() = 0);
select pg_temp.as_admin();
select pg_temp.check('A8 no se inician torneos no publicados ni partidos sin equipos', pg_temp.st('a1000000-0000-4000-8000-0000000000e1') = 'scheduled ·-·' and pg_temp.st('a1000000-0000-4000-8000-0000000000f1') = 'scheduled ·-·');
select pg_temp.check('A12 sin puntos al iniciar y sin cambios en revisión', (select count(*) from public.predictions where points is not null) = 0
  and (select result_revision = 0 from public.matches where id = 'a1000000-0000-4000-8000-0000000000a1'));
select pg_temp.check('A13 auditoría de sistema (actor nulo) una sola vez por partido',
  (select count(*) from public.control_audit_log where action = 'match_auto_started') = 3
  and (select count(*) from public.control_audit_log where action = 'match_auto_started' and actor_id is not null) = 0);
select pg_temp.as_user(pg_temp.v('p')::uuid);
select pg_temp.try('A14 el pronóstico queda bloqueado al iniciar', $q$select public.save_prediction('b1000000-0000-4000-8000-0000000000a1', 'a1000000-0000-4000-8000-0000000000a1', 2, 2)$q$, true, 'match_not_open');
do $$ begin execute 'reset role'; execute 'set local role anon'; end $$;
select pg_temp.try('A15 anon no ejecuta la sincronización', $q$select public.sync_due_matches()$q$, true, 'permission denied%');
select pg_temp.as_admin();
select pg_temp.try('A16 sin sesión no hay sincronización', $q$select public.sync_due_matches()$q$, true, 'not_authenticated');
-- El inicio automático no revierte una acción administrativa: un partido devuelto a «programado» con hora futura no vuelve a iniciarse.
select pg_temp.as_user(pg_temp.v('sa')::uuid);
select public.control_save_match('a1000000-0000-4000-8000-0000000000a6'::uuid, null, '51000000-0000-4000-8000-0000000000a1', 10, null, now() + interval '3 hours', null,
  '72000000-0000-4000-8000-0000000000a1', '72000000-0000-4000-8000-0000000000a2', null, null, 'scheduled');
select pg_temp.check('A17 revertir un inicio (live → programado) limpia el marcador y se audita', pg_temp.st('a1000000-0000-4000-8000-0000000000a6') = 'scheduled ·-·'
  and (select count(*) from public.control_audit_log where action = 'match_start_reverted' and entity_id = 'a1000000-0000-4000-8000-0000000000a6') = 1);
select pg_temp.as_user(pg_temp.v('p')::uuid);
select pg_temp.check('A18 …y una nueva sincronización no lo vuelve a iniciar', public.sync_due_matches() = 0 and pg_temp.st('a1000000-0000-4000-8000-0000000000a6') = 'scheduled ·-·');

-- ═══ B. APLAZAMIENTO, REPROGRAMACIÓN Y CANCELACIÓN (auditoría) ══════════════
select pg_temp.as_user(pg_temp.v('sa')::uuid);
select public.control_save_match('a1000000-0000-4000-8000-0000000000a3'::uuid, null, '51000000-0000-4000-8000-0000000000a1', 7, null, now() + interval '4 days', null,
  '72000000-0000-4000-8000-0000000000a1', '72000000-0000-4000-8000-0000000000a2', null, null, 'postponed');
select pg_temp.check('B1 aplazar un partido en vivo: limpia el marcador y se audita', pg_temp.st('a1000000-0000-4000-8000-0000000000a3') = 'postponed ·-·'
  and (select count(*) from public.control_audit_log where action = 'match_postponed' and entity_id = 'a1000000-0000-4000-8000-0000000000a3') = 1);
select public.control_save_match('a1000000-0000-4000-8000-0000000000a3'::uuid, null, '51000000-0000-4000-8000-0000000000a1', 7, null, now() + interval '6 days', null,
  '72000000-0000-4000-8000-0000000000a1', '72000000-0000-4000-8000-0000000000a2', null, null, 'postponed');
select pg_temp.check('B2 cambiar la fecha de un aplazado = reprogramación auditada', (select count(*) from public.control_audit_log where action = 'match_rescheduled' and entity_id = 'a1000000-0000-4000-8000-0000000000a3') = 1);
select public.control_save_match('a1000000-0000-4000-8000-0000000000a3'::uuid, null, '51000000-0000-4000-8000-0000000000a1', 7, null, now() + interval '7 days', null,
  '72000000-0000-4000-8000-0000000000a1', '72000000-0000-4000-8000-0000000000a2', null, null, 'scheduled');
select pg_temp.check('B3 aplazado → programado con nueva fecha (válido) y auditado', pg_temp.st('a1000000-0000-4000-8000-0000000000a3') = 'scheduled ·-·'
  and (select count(*) from public.control_audit_log where action = 'match_rescheduled' and entity_id = 'a1000000-0000-4000-8000-0000000000a3') = 2);
select pg_temp.try('B4 ‘En vivo’ ya no se fija desde la edición de partido', format($q$select public.control_save_match(%L, null, '51000000-0000-4000-8000-0000000000a1', 7, null, now() + interval '7 days', null, '72000000-0000-4000-8000-0000000000a1', '72000000-0000-4000-8000-0000000000a2', null, null, 'live')$q$, 'a1000000-0000-4000-8000-0000000000a3'), true, 'invalid_status');
select public.control_save_match('a1000000-0000-4000-8000-0000000000b1'::uuid, null, '51000000-0000-4000-8000-0000000000a1', 2, null, now() + interval '2 hours', null,
  '72000000-0000-4000-8000-0000000000a1', '72000000-0000-4000-8000-0000000000a2', null, null, 'cancelled');
select pg_temp.check('B5 cancelar se audita', (select count(*) from public.control_audit_log where action = 'match_cancelled' and entity_id = 'a1000000-0000-4000-8000-0000000000b1') = 1);
select pg_temp.try('B6 la cancelación es definitiva (edición)', format($q$select public.control_save_match(%L, null, '51000000-0000-4000-8000-0000000000a1', 2, null, now() + interval '2 hours', null, '72000000-0000-4000-8000-0000000000a1', '72000000-0000-4000-8000-0000000000a2', null, null, 'scheduled')$q$, 'a1000000-0000-4000-8000-0000000000b1'), true, 'match_cancelled');
select pg_temp.try('B7 un cancelado no admite marcador', format($q$select public.control_update_match_live(%L, 'live', 0, 0, null, 0, null)$q$, 'a1000000-0000-4000-8000-0000000000b1'), true, 'match_not_playable');
select pg_temp.try('B8 un aplazado no admite marcador', format($q$select public.control_update_match_live(%L, 'live', 0, 0, null, 0, null)$q$, 'a1000000-0000-4000-8000-0000000000c1'), true, 'match_not_playable');

-- ═══ C. SEGURIDAD ═══════════════════════════════════════════════════════════
select pg_temp.as_user(pg_temp.v('p')::uuid);
select pg_temp.try('C1 un jugador no guarda marcadores', format($q$select public.control_update_match_live(%L, 'live', 1, 0, null, 0, null)$q$, 'a1000000-0000-4000-8000-0000000000a1'), true, 'not_platform_admin');
select pg_temp.try('C2 un jugador no reabre', format($q$select public.control_reopen_match(%L, 'quiero reabrir', 0)$q$, 'a1000000-0000-4000-8000-0000000000a4'), true, 'not_platform_admin');
select pg_temp.try('C3 un jugador no actualiza matches directamente', $q$update public.matches set home_score = 9$q$, true, 'permission denied%');
select pg_temp.try('C4 un jugador no ejecuta la puntuación privada', $q$select private.score_match('a1000000-0000-4000-8000-0000000000a4')$q$, true, 'permission denied%');
select pg_temp.try('C5 el flujo anterior ya no existe (registrar)', $q$select public.control_record_match_result(gen_random_uuid(), 1, 0, null, 0)$q$, true, '%does not exist%');
select pg_temp.try('C5 …ni confirmar', $q$select public.control_confirm_match_result(gen_random_uuid(), 0, 0, 0, null)$q$, true, '%does not exist%');
select pg_temp.try('C5 …ni corregir', $q$select public.control_correct_match_result(gen_random_uuid(), 0, 0, null, 'motivo largo', 0)$q$, true, '%does not exist%');
select pg_temp.as_user(pg_temp.v('sa')::uuid);
select pg_temp.try('C6 el Mundial histórico no se modifica', $q$select public.control_update_match_live((select id from public.matches where event_id = 'daaebb9b-8e92-5644-824f-bf826114446a' and match_number = 73 limit 1), 'finished', 1, 0, null, 0, 'motivo de prueba')$q$, true, 'event_locked_history');
select pg_temp.as_admin();
select pg_temp.check('C7 integridad histórica (104 partidos y snapshot sellado)',
  (select md5(string_agg(m::text, '|' order by m.id)) from public.matches m where event_id = 'daaebb9b-8e92-5644-824f-bf826114446a' and match_number <> 999) = (select matches from hist)
  and (select rows_checksum from public.standing_snapshots limit 1) = (select checksum from hist) and (select bool_and(private.verify_standing_snapshot(id)) from public.standing_snapshots));

select 'FALLO' as resultado, name, detail from results where not ok
union all
select 'TOTAL', count(*) filter (where ok) || ' OK', count(*) filter (where not ok) || ' fallos' from results;
rollback;
