-- Recorrido del JUGADOR contra el proyecto REAL en el torneo de QA "qa-jugador" (parche ParchePrueba1), TODO dentro
-- de una transacción con ROLLBACK: no deja datos. Identidades simuladas con claims JWT (no toca auth.*).
-- Jugador = el administrador NO superadministrador de ParchePrueba1; ajeno = un miembro de La Penúltima.
-- Incluye el escenario multiparche (usuario en dos parches, pronósticos distintos del mismo partido).
--   npx supabase db query --linked -f scripts/history-migration/tests/remote_jugador_test.sql
begin;
do $$ begin
  if not exists (select 1 from public.events where slug = 'mundial-2026') then raise exception 'proyecto_inesperado'; end if;
  if not exists (select 1 from public.events where slug = 'qa-jugador') then raise exception 'falta_qa_jugador'; end if;
end $$;
create temp table results (n serial, name text, ok boolean, detail text);
create temp table vars (k text primary key, v text);
grant insert, select on results to authenticated;
grant select, insert, update on vars to authenticated;
grant usage on sequence results_n_seq to authenticated;
create function pg_temp.as_user(p uuid) returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;
create function pg_temp.as_admin() returns void language plpgsql as $$
begin execute 'reset role'; perform set_config('request.jwt.claims', '', true); end $$;
create function pg_temp.check(p_name text, p_ok boolean, p_detail text default null) returns void language sql as $$
  insert into results (name, ok, detail) values (p_name, coalesce(p_ok, false), p_detail);
$$;
create function pg_temp.try(p_name text, p_sql text, p_expect_error boolean, p_error_like text default null) returns void language plpgsql as $$
begin
  begin
    execute p_sql;
    insert into results (name, ok, detail) values (p_name, not p_expect_error, 'sin error');
  exception when others then
    insert into results (name, ok, detail) values (p_name, p_expect_error and (p_error_like is null or sqlerrm like p_error_like), sqlerrm);
  end;
end $$;
create function pg_temp.v(p_k text) returns text language sql as $$ select v from vars where k = p_k $$;
grant execute on all functions in schema pg_temp to authenticated;

insert into vars select 'sa', '95d77e57-b6cb-4359-bc86-e70b3b9f44dd';
insert into vars select 'ev', id::text from public.events where slug = 'qa-jugador';
insert into vars select 'pe', pe.id::text from public.parche_events pe join public.parches p on p.id = pe.parche_id where pe.event_id = (select id from public.events where slug = 'qa-jugador') and p.name = 'ParchePrueba1';
insert into vars select 'pa', parche_id::text from public.parche_events where id = pg_temp.v('pe')::uuid;
insert into vars select 'player', user_id::text from public.parche_members where parche_id = pg_temp.v('pa')::uuid and role = 'admin' and status = 'active'
  and user_id not in (select user_id from private.platform_admins);
insert into vars select 'outsider', user_id::text from public.parche_members where parche_id = '91ad5d8d-414c-4e74-bf57-2ca476652de0' and role = 'member' and status = 'active'
  and user_id not in (select user_id from public.parche_members where parche_id = pg_temp.v('pa')::uuid) limit 1;
insert into vars select 'm2', id::text from public.matches where event_id = pg_temp.v('ev')::uuid and match_number = 2;
insert into vars select 'm6', id::text from public.matches where event_id = pg_temp.v('ev')::uuid and match_number = 6;
insert into vars select 'copa_m2', m.id::text from public.matches m join public.events e on e.id = m.event_id where e.slug = 'copa-de-prueba' and m.match_number = 2;

-- ── Escenario preparado ──
select pg_temp.check('QA: 1 torneo publicado, 6 partidos, 1 inscripción (solo ParchePrueba1)',
  (select count(*) from public.matches where event_id = pg_temp.v('ev')::uuid) = 6
  and (select status from public.events where id = pg_temp.v('ev')::uuid) = 'scheduled'
  and (select count(*) from public.parche_events where event_id = pg_temp.v('ev')::uuid) = 1);
select pg_temp.check('QA: hay un jugador normal y un ajeno de prueba', pg_temp.v('player') is not null and pg_temp.v('outsider') is not null);

-- ── Jugador normal ──
select pg_temp.as_user(pg_temp.v('player')::uuid);
select pg_temp.check('jugador: ve la inscripción de su parche y el torneo (consulta de getGameContext)',
  (select count(*) from public.parche_events pe join public.events e on e.id = pe.event_id where pe.id = pg_temp.v('pe')::uuid and pe.parche_id = pg_temp.v('pa')::uuid) = 1);
select pg_temp.check('jugador: ve los 6 partidos, 2 fases y 6 equipos del torneo',
  (select count(*) from public.matches where event_id = pg_temp.v('ev')::uuid) = 6
  and (select count(*) from public.event_stages where event_id = pg_temp.v('ev')::uuid) = 2
  and (select count(*) from public.event_teams where event_id = pg_temp.v('ev')::uuid) = 6);
select pg_temp.check('jugador: el partido con equipos por definir conserva sus descripciones',
  (select home_placeholder = 'Ganador del grupo A' and home_team_id is null from public.matches where id = pg_temp.v('m6')::uuid));
select pg_temp.check('jugador: sin pronósticos al inicio, la tabla muestra 1 participante con 0 puntos',
  (select count(*) from public.get_parche_event_leaderboard(pg_temp.v('pe')::uuid)) = 1
  and (select total_points from public.get_parche_event_leaderboard(pg_temp.v('pe')::uuid)) = 0);
select pg_temp.check('jugador: la tabla no incluye al superadministrador',
  not exists (select 1 from public.get_parche_event_leaderboard(pg_temp.v('pe')::uuid) where user_id = pg_temp.v('sa')::uuid));
select pg_temp.try('jugador: guarda un pronóstico de un partido futuro',
  format('select public.save_prediction(%L::uuid, %L::uuid, 2, 1)', pg_temp.v('pe'), pg_temp.v('m2')), false);
select pg_temp.try('jugador: lo edita (sin duplicar)',
  format('select public.save_prediction(%L::uuid, %L::uuid, 1, 1)', pg_temp.v('pe'), pg_temp.v('m2')), false);
select pg_temp.check('jugador: persiste una sola fila con el último valor',
  (select count(*) from public.predictions where parche_event_id = pg_temp.v('pe')::uuid and match_id = pg_temp.v('m2')::uuid) = 1
  and (select home_score || '-' || away_score from public.predictions where parche_event_id = pg_temp.v('pe')::uuid and match_id = pg_temp.v('m2')::uuid) = '1-1');
select pg_temp.try('jugador: marcador inválido rechazado', format('select public.save_prediction(%L::uuid, %L::uuid, -1, 1)', pg_temp.v('pe'), pg_temp.v('m2')), true, 'invalid_scores');
select pg_temp.try('jugador: no puede escribir puntos directamente', format('update public.predictions set points = 9 where parche_event_id = %L::uuid', pg_temp.v('pe')), true);
select pg_temp.try('jugador: antes del inicio no ve pronósticos ajenos (RPC valida)', format('select * from public.get_match_predictions(%L::uuid, %L::uuid)', pg_temp.v('pe'), pg_temp.v('m2')), true, '%predictions_hidden%');
select pg_temp.check('jugador: la tabla ya cuenta su pronóstico (pred_count 1) y sigue en 0 puntos',
  (select pred_count from public.get_parche_event_leaderboard(pg_temp.v('pe')::uuid)) = 1
  and (select total_points from public.get_parche_event_leaderboard(pg_temp.v('pe')::uuid)) = 0);
select pg_temp.try('jugador: la sincronización perezosa no falla', 'select public.sync_due_matches()', false);

-- ── Multiparche: el mismo usuario en un segundo parche, mismo partido, otro pronóstico ──
select pg_temp.try('jugador: crea un segundo parche (transacción de prueba)',
  $q$insert into vars select 'pb', (public.create_parche('QA multiparche (borrar)', gen_random_uuid()))::text$q$, false);
select pg_temp.try('jugador: inscribe el torneo en el segundo parche', format('select public.add_event_to_parche(%L::uuid, %L::uuid)', pg_temp.v('pb'), pg_temp.v('ev')), false);
insert into vars select 'pe2', id::text from public.parche_events where parche_id = pg_temp.v('pb')::uuid;
select pg_temp.try('jugador: pronostica 3-0 el mismo partido en el segundo parche', format('select public.save_prediction(%L::uuid, %L::uuid, 3, 0)', pg_temp.v('pe2'), pg_temp.v('m2')), false);
select pg_temp.check('multiparche: dos pronósticos distintos para el mismo partido, cada uno en su contexto',
  (select home_score || '-' || away_score from public.predictions where parche_event_id = pg_temp.v('pe')::uuid and match_id = pg_temp.v('m2')::uuid) = '1-1'
  and (select home_score || '-' || away_score from public.predictions where parche_event_id = pg_temp.v('pe2')::uuid and match_id = pg_temp.v('m2')::uuid) = '3-0');
select pg_temp.check('multiparche: clasificaciones independientes (cada una con 1 participante y 1 pronóstico)',
  (select count(*) from public.get_parche_event_leaderboard(pg_temp.v('pe2')::uuid)) = 1
  and (select pred_count from public.get_parche_event_leaderboard(pg_temp.v('pe2')::uuid)) = 1
  and (select pred_count from public.get_parche_event_leaderboard(pg_temp.v('pe')::uuid)) = 1);

-- ── Ajeno a ParchePrueba1 (miembro de La Penúltima) ──
select pg_temp.as_user(pg_temp.v('outsider')::uuid);
select pg_temp.check('ajeno: no ve la inscripción de ParchePrueba1 ni la del segundo parche',
  (select count(*) from public.parche_events where id in (pg_temp.v('pe')::uuid, pg_temp.v('pe2')::uuid)) = 0);
select pg_temp.check('ajeno: no ve pronósticos de ninguno de los dos parches',
  (select count(*) from public.predictions where parche_event_id in (pg_temp.v('pe')::uuid, pg_temp.v('pe2')::uuid)) = 0);
select pg_temp.try('ajeno: no pronostica en una inscripción ajena', format('select public.save_prediction(%L::uuid, %L::uuid, 1, 0)', pg_temp.v('pe'), pg_temp.v('m2')), true, 'not_enrolled');
select pg_temp.try('ajeno: no consulta la clasificación ajena', format('select * from public.get_parche_event_leaderboard(%L::uuid)', pg_temp.v('pe')), true);
select pg_temp.check('ajeno: no ve los miembros de ParchePrueba1',
  (select count(*) from public.parche_members where parche_id = pg_temp.v('pa')::uuid) = 0);

-- ── Superadministrador ──
select pg_temp.as_user(pg_temp.v('sa')::uuid);
select pg_temp.try('superadmin: no puede pronosticar (ni como owner del parche)', format('select public.save_prediction(%L::uuid, %L::uuid, 1, 0)', pg_temp.v('pe'), pg_temp.v('m2')), true, 'superadmin_cannot_predict');

-- ── Protección de datos existentes ──
select pg_temp.as_admin();
select pg_temp.check('Copa de prueba intacta: sigue en borrador, su partido 2 programado y su marcador pendiente conservado',
  (select status from public.events where slug = 'copa-de-prueba') = 'draft'
  and (select status from public.matches where id = pg_temp.v('copa_m2')::uuid) = 'scheduled'
  and (select count(*) from private.match_result_drafts where match_id = pg_temp.v('copa_m2')::uuid) = 1);
select pg_temp.check('Mundial 2026 intacto: 104 partidos finalizados', (select count(*) from public.matches m join public.events e on e.id = m.event_id where e.slug = 'mundial-2026' and m.status = 'finished') = 104);

select case when count(*) filter (where not ok) = 0 then 'TOTAL' else 'FALLOS' end as resultado, count(*) filter (where ok) || ' OK' as name, count(*) filter (where not ok) || ' fallos' as detail from results
union all select 'FALLO', name, detail from results where not ok;
rollback;
