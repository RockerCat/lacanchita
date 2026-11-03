-- Inscripciones anticipadas (torneo publicado sin equipos ni partidos) contra el proyecto REAL, TODO dentro
-- de una transacción con ROLLBACK: no deja datos. Identidades simuladas con claims JWT (no toca auth.*).
-- Jugador = el administrador NO superadministrador de ParchePrueba1; ajeno = un miembro de La Penúltima.
-- Requiere la migración 20261103100000 aplicada. Crea su propio torneo de ensayo (revertido); no usa el real.
--   npx supabase db query --linked --yes -f scripts/history-migration/tests/remote_inscripcion_anticipada_test.sql
begin;
do $$ begin
  if not exists (select 1 from public.events where slug = 'mundial-2026') then raise exception 'proyecto_inesperado'; end if;
end $$;
create temp table results (n serial, name text, ok boolean, detail text);
create temp table vars (k text primary key, v text);
grant insert, select on results to authenticated, anon;
grant select, insert, update on vars to authenticated, anon;
grant usage on sequence results_n_seq to authenticated, anon;
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
grant execute on all functions in schema pg_temp to authenticated, anon;

create temp table before_fp as select
  (select count(*) from public.events) ev_n, (select count(*) from public.matches) m_n, (select count(*) from public.predictions) p_n,
  (select count(*) from public.parche_events) pe_n, (select count(*) from public.parche_members) pm_n, (select count(*) from public.standing_snapshot_rows) ssr_n;
insert into vars select 'sa', '95d77e57-b6cb-4359-bc86-e70b3b9f44dd';
insert into vars select 'parche', id::text from public.parches where name = 'ParchePrueba1';
insert into vars select 'player', user_id::text from public.parche_members where parche_id = (select v::uuid from vars where k='parche') and role in ('owner','admin') and status='active' and user_id not in (select user_id from private.platform_admins) limit 1;
insert into vars select 'other', user_id::text from public.parche_members where role = 'member' and status='active' and parche_id = (select id from public.parches where name = 'La Penúltima') limit 1;
insert into vars select 'ta', id::text from public.teams where name = 'Colombia' and kind='national';
insert into vars select 'tb', id::text from public.teams where name = 'Argentina' and kind='national';

-- Un usuario normal no crea ni publica torneos.
select pg_temp.as_user(pg_temp.v('player')::uuid);
select pg_temp.try('usuario normal no crea torneos', $q$select public.control_create_event('x-no','No permitido','America/Bogota')$q$, true, '%');

-- El superadministrador crea y publica un torneo sin equipos ni partidos.
select pg_temp.as_user(pg_temp.v('sa')::uuid);
select pg_temp.try('crear torneo de ensayo', $q$insert into vars select 'ev', public.control_create_event('ensayo-anticipado','Ensayo anticipado','America/Bogota')::text$q$, false);
select pg_temp.try('fase cuadrangulares', format($q$select public.control_save_stage(%L,null,'cuadrangulares','Cuadrangulares semifinales',1,false,3,1)$q$, pg_temp.v('ev')), false);
select pg_temp.try('fase final', format($q$select public.control_save_stage(%L,null,'final','Final',2,false,8,6)$q$, pg_temp.v('ev')), false);
select pg_temp.check('sin fases pendientes: no quedan requisitos de publicación', cardinality(public.control_event_publish_issues(pg_temp.v('ev')::uuid)) = 0);
select pg_temp.try('publicar sin equipos ni partidos', format($q$select public.control_publish_event(%L)$q$, pg_temp.v('ev')), false);
select pg_temp.as_admin();
select pg_temp.check('estado scheduled, sin equipos ni partidos, sin fin oficial', (select status = 'scheduled' and official_end_at is null and timezone = 'America/Bogota' and landing_visible = false from public.events where slug='ensayo-anticipado')
  and not exists (select 1 from public.matches where event_id = pg_temp.v('ev')::uuid) and not exists (select 1 from public.event_teams where event_id = pg_temp.v('ev')::uuid));

-- Inscripciones anticipadas.
select pg_temp.as_user(pg_temp.v('other')::uuid);
select pg_temp.try('miembro normal de otro parche no inscribe', format($q$select public.add_event_to_parche(%L,%L)$q$, pg_temp.v('parche'), pg_temp.v('ev')), true, 'not_authorized');
select pg_temp.as_user(pg_temp.v('player')::uuid);
select pg_temp.try('admin del parche inscribe su parche', format($q$insert into vars select 'pe', public.add_event_to_parche(%L,%L)::text$q$, pg_temp.v('parche'), pg_temp.v('ev')), false);
select pg_temp.try('no se inscribe dos veces', format($q$select public.add_event_to_parche(%L,%L)$q$, pg_temp.v('parche'), pg_temp.v('ev')), true, 'already_enrolled');
select pg_temp.check('el torneo es visible para jugadores sin partidos', (select count(*) from public.events where slug='ensayo-anticipado') = 1);
select pg_temp.check('sin pronósticos ficticios', (select count(*) from public.predictions where event_id = pg_temp.v('ev')::uuid) = 0);
select pg_temp.check('la clasificación no inventa posiciones con pronósticos (0 partidos)', (select count(*) from public.get_parche_event_leaderboard(pg_temp.v('pe')::uuid) where total_points <> 0 or pred_count <> 0) = 0);
select pg_temp.as_user(pg_temp.v('other')::uuid);
select pg_temp.check('quien no pertenece al parche no ve la inscripción', (select count(*) from public.parche_events where id = pg_temp.v('pe')::uuid) = 0);
select pg_temp.as_user(pg_temp.v('player')::uuid);
select pg_temp.try('el jugador no agrega partidos', format($q$select public.control_save_match(null,%L,(select id from public.event_stages where event_id=%L and code='final'),1,null,now()+interval '1 day',null,null,null,'A','B','scheduled')$q$, pg_temp.v('ev'), pg_temp.v('ev')), true, '%');

-- Carga progresiva: equipos, cuadrangulares y después la final, en el mismo torneo e inscripción.
select pg_temp.as_user(pg_temp.v('sa')::uuid);
select pg_temp.try('agregar equipos después', format($q$select public.control_set_event_team(%L,%L,'A'), public.control_set_event_team(%L,%L,'A')$q$, pg_temp.v('ev'), pg_temp.v('ta'), pg_temp.v('ev'), pg_temp.v('tb')), false);
select pg_temp.try('partido de cuadrangular el 14/11 20:00 hora de Bogotá', format($q$select public.control_save_match(null,%L,(select id from public.event_stages where event_id=%L and code='cuadrangulares'),1,'A',timestamptz '2026-11-14 20:00 America/Bogota',null,%L,%L,null,null,'scheduled')$q$, pg_temp.v('ev'), pg_temp.v('ev'), pg_temp.v('ta'), pg_temp.v('tb')), false);
select pg_temp.try('ida y vuelta de la final después (sin ganador exigido)', format($q$select public.control_save_match(null,%L,(select id from public.event_stages where event_id=%L and code='final'),%s,null,timestamptz '2026-12-10 19:00 America/Bogota',null,null,null,'Finalista 1','Finalista 2','scheduled')$q$, pg_temp.v('ev'), pg_temp.v('ev'), 2), false);
select pg_temp.try('segundo partido de la final', format($q$select public.control_save_match(null,%L,(select id from public.event_stages where event_id=%L and code='final'),3,null,timestamptz '2026-12-13 19:00 America/Bogota',null,null,null,'Finalista 2','Finalista 1','scheduled')$q$, pg_temp.v('ev'), pg_temp.v('ev')), false);
select pg_temp.as_admin();
select pg_temp.check('hora guardada en UTC desde horario colombiano', (select starts_at = timestamptz '2026-11-15 01:00:00+00' from public.matches where event_id = pg_temp.v('ev')::uuid and match_number = 1));
select pg_temp.check('misma inscripción, un solo torneo', (select count(*) from public.parche_events where event_id = pg_temp.v('ev')::uuid) = 1 and (select count(*) from public.events where slug='ensayo-anticipado') = 1);
select pg_temp.as_user(pg_temp.v('player')::uuid);
select pg_temp.try('el jugador pronostica el partido ya cargado', format($q$select public.save_prediction(%L,%L,1,0)$q$, pg_temp.v('pe'), (select id from public.matches where event_id = pg_temp.v('ev')::uuid and match_number=1)), false);
select pg_temp.check('la clasificación acumula sobre ambas fases (una sola tabla del parche_event)', (select count(*) from public.get_parche_event_leaderboard(pg_temp.v('pe')::uuid)) >= 1);
select pg_temp.as_admin();

-- Eventos históricos y de QA intactos (el ensayo se revierte).
select pg_temp.check('el torneo real aún no existe en este ensayo o existe una sola vez', (select count(*) from public.events where slug='liga-primera-division-colombiana-2026-ii') <= 1);
select pg_temp.check('históricos intactos: Mundial finalizado con 104 partidos', (select count(*) from public.matches m join public.events e on e.id=m.event_id where e.slug='mundial-2026') = 104 and (select status from public.events where slug='mundial-2026') = 'finished');
select pg_temp.check('no cambiaron filas históricas ni de membresía', (select ssr_n from before_fp) = (select count(*) from public.standing_snapshot_rows) and (select pm_n from before_fp) = (select count(*) from public.parche_members));
select count(*) filter (where ok) || '/' || count(*) as passed, string_agg(case when not ok then name || ' [' || coalesce(detail, '') || ']' end, ' | ') as fallos from results;
rollback;
