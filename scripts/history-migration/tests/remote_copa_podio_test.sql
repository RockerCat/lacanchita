-- Fase 3.4 (Copa, podio, multitenencia) contra el proyecto REAL con el torneo de QA "qa-jugador", TODO dentro
-- de una transacción con ROLLBACK: no deja datos. Identidades simuladas con claims JWT (no toca auth.*).
-- Jugador = el administrador NO superadministrador de ParchePrueba1; ajeno = un miembro de La Penúltima.
-- Dos parches en el mismo torneo: partidos compartidos, clasificaciones y podios independientes.
--   npx supabase db query --linked -f scripts/history-migration/tests/remote_copa_podio_test.sql
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


insert into vars select 'mp', id::text from public.matches where event_id = pg_temp.v('ev')::uuid and status = 'scheduled' and starts_at > now() + interval '1 minute' and home_team_id is not null and away_team_id is not null order by starts_at desc limit 1;
insert into vars select 'copa_ev', id::text from public.events where slug = 'copa-de-prueba';
insert into vars select 'wc_ev', id::text from public.events where slug = 'mundial-2026';
create temp table before_fp as select
  (select count(*) from public.matches where event_id = pg_temp.v('wc_ev')::uuid) wc_matches,
  (select count(*) from public.standing_snapshots where sealed_at is not null) sealed,
  (select count(*) from public.matches where event_id = pg_temp.v('copa_ev')::uuid) copa_matches,
  (select string_agg(m.id::text || m.status || coalesce(m.home_score::text,'') || coalesce(m.away_score::text,''), ',' order by m.id) from public.matches m where m.event_id = pg_temp.v('copa_ev')::uuid) copa_fp,
  (select string_agg(m.id::text || m.status || coalesce(m.home_score::text,'') || coalesce(m.away_score::text,''), ',' order by m.id) from public.matches m where m.event_id = pg_temp.v('wc_ev')::uuid) wc_fp;

-- ── Segundo parche en el MISMO torneo ──
select pg_temp.as_user(pg_temp.v('player')::uuid);
insert into vars select 'pb', (public.create_parche('Parche B (QA Copa)', gen_random_uuid()))::text;
select pg_temp.as_admin();
insert into vars select 'pb', coalesce((select parche_id::text from public.parche_members where user_id = pg_temp.v('player')::uuid and parche_id <> pg_temp.v('pa')::uuid order by joined_at desc limit 1), 'x') where not exists (select 1 from vars where k = 'pb');
select pg_temp.as_user(pg_temp.v('player')::uuid);
insert into vars select 'peb', (public.add_event_to_parche(pg_temp.v('pb')::uuid, pg_temp.v('ev')::uuid))::text;
select pg_temp.as_admin();
insert into public.parche_members (parche_id, user_id, role, status) values (pg_temp.v('pb')::uuid, pg_temp.v('outsider')::uuid, 'member', 'active');
select pg_temp.check('escenario: dos parches inscritos al mismo torneo', (select count(distinct parche_id) from public.parche_events where event_id = pg_temp.v('ev')::uuid) = 2);

-- ── Partidos compartidos, clasificaciones independientes ──
select pg_temp.as_user(pg_temp.v('player')::uuid);
select pg_temp.try('jugador: pronostica en el parche A', format('select public.save_prediction(%L::uuid, %L::uuid, 3, 0)', pg_temp.v('pe'), pg_temp.v('mp')), false);
select pg_temp.as_user(pg_temp.v('outsider')::uuid);
select pg_temp.try('segundo miembro: pronostica distinto en el parche B', format('select public.save_prediction(%L::uuid, %L::uuid, 0, 2)', pg_temp.v('peb'), pg_temp.v('mp')), false);
select pg_temp.as_user(pg_temp.v('player')::uuid);
select pg_temp.check('Copa: las consultas del cuadro funcionan con la sesión del jugador (fases, partidos con result_confirmed_at, equipos)',
  (select count(*) from public.event_stages where event_id = pg_temp.v('ev')::uuid) = 2
  and (select count(*) from (select id, stage_id, match_number, starts_at, venue, status, home_score, away_score, winner_side, group_code, home_placeholder, away_placeholder, home_team_id, away_team_id, result_confirmed_at from public.matches where event_id = pg_temp.v('ev')::uuid) q) = 6);
select pg_temp.check('partidos compartidos: ambos parches leen exactamente los mismos 6 partidos del torneo',
  (select count(*) from public.matches where event_id = (select event_id from public.parche_events where id = pg_temp.v('pe')::uuid)) = 6
  and (select count(*) from public.matches where event_id = (select event_id from public.parche_events where id = pg_temp.v('peb')::uuid)) = 6
  and (select event_id from public.parche_events where id = pg_temp.v('pe')::uuid) = (select event_id from public.parche_events where id = pg_temp.v('peb')::uuid));
select pg_temp.check('clasificación del parche A: solo su participante (no ve al del B)',
  (select count(*) from public.get_parche_event_leaderboard(pg_temp.v('pe')::uuid)) = 1
  and not exists (select 1 from public.get_parche_event_leaderboard(pg_temp.v('pe')::uuid) where user_id = pg_temp.v('outsider')::uuid));
select pg_temp.check('clasificación del parche B: sus dos participantes, sin superadministrador',
  (select count(*) from public.get_parche_event_leaderboard(pg_temp.v('peb')::uuid)) = 2
  and not exists (select 1 from public.get_parche_event_leaderboard(pg_temp.v('peb')::uuid) where user_id = pg_temp.v('sa')::uuid));
select pg_temp.as_user(pg_temp.v('outsider')::uuid);
select pg_temp.try('aislamiento: un miembro del parche B no puede pedir la clasificación del parche A',
  format('select * from public.get_parche_event_leaderboard(%L::uuid)', pg_temp.v('pe')), true, '%not_member%');
select pg_temp.check('aislamiento: tampoco ve la inscripción del parche A ni sus pronósticos',
  (select count(*) from public.parche_events where id = pg_temp.v('pe')::uuid) = 0
  and (select count(*) from public.predictions where parche_event_id = pg_temp.v('pe')::uuid) = 0);

-- ── Podio: torneo oficialmente finalizado ──
select pg_temp.as_admin();
update public.events set status = 'finished' where id = pg_temp.v('ev')::uuid;
update public.parche_members set status = 'disabled', disabled_at = now() where parche_id = pg_temp.v('pb')::uuid and user_id = pg_temp.v('outsider')::uuid;
select pg_temp.as_user(pg_temp.v('player')::uuid);
select pg_temp.check('podio: con el torneo finalizado cada parche conserva su clasificación; el deshabilitado no compite',
  (select status from public.events where id = pg_temp.v('ev')::uuid) = 'finished'
  and (select count(*) from public.get_parche_event_leaderboard(pg_temp.v('pe')::uuid)) = 1
  and (select count(*) from public.get_parche_event_leaderboard(pg_temp.v('peb')::uuid)) = 1
  and not exists (select 1 from public.get_parche_event_leaderboard(pg_temp.v('peb')::uuid) where user_id = pg_temp.v('outsider')::uuid));
select pg_temp.check('podio: ranks válidos desde 1 (sin posiciones inventadas)',
  (select min(rank) from public.get_parche_event_leaderboard(pg_temp.v('pe')::uuid)) = 1);

-- ── Escritura: ningún usuario de parche puede tocar resultados ni cupos del cuadro ──
select pg_temp.try('jugador: no puede asignar equipos del cuadro (control_save_match)',
  format('select public.control_save_match(%L::uuid, %L::uuid, (select stage_id from public.matches where id = %L::uuid), 6, null, now() + interval ''1 day'', null, null, null, ''Ganador del grupo A'', ''Segundo del grupo B'', ''scheduled'', null)', pg_temp.v('m6'), pg_temp.v('ev'), pg_temp.v('m6')), true, '%not_platform_admin%');
select pg_temp.try('jugador: no puede reabrir ni corregir resultados', format('select public.control_reopen_match(%L::uuid, ''x'', 0)', pg_temp.v('m2')), true);

-- ── Datos protegidos ──
select pg_temp.as_admin();
select pg_temp.check('Mundial 2026 intacto: 104 partidos, snapshot sellado, mismos estados y marcadores',
  (select wc_matches from before_fp) = 104 and (select sealed from before_fp) >= 1
  and (select wc_fp from before_fp) is not distinct from (select string_agg(m.id::text || m.status || coalesce(m.home_score::text,'') || coalesce(m.away_score::text,''), ',' order by m.id) from public.matches m where m.event_id = pg_temp.v('wc_ev')::uuid));
select pg_temp.check('Copa de prueba intacta y sin eliminatorias (no tiene Copa)',
  (select copa_matches from before_fp) = 3
  and (select copa_fp from before_fp) is not distinct from (select string_agg(m.id::text || m.status || coalesce(m.home_score::text,'') || coalesce(m.away_score::text,''), ',' order by m.id) from public.matches m where m.event_id = pg_temp.v('copa_ev')::uuid)
  and not exists (select 1 from public.event_stages where event_id = pg_temp.v('copa_ev')::uuid and is_knockout));

select count(*) filter (where ok) || '/' || count(*) as passed, string_agg(case when not ok then name || ' [' || coalesce(detail, '') || ']' end, ' | ') as fallos from results;
rollback;
