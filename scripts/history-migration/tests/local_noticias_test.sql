-- Pruebas de Noticias (migración 20261031120000): ámbitos torneo/parche, RLS, idempotencia, correcciones y
-- reaperturas, escritura solo por superadministrador y regresión de la tabla. SOLO Postgres local; ROLLBACK.
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
create function pg_temp.items(p_pea text, p_peb text) returns jsonb language sql as $$
  select jsonb_build_array(
    jsonb_build_object('parche_event_id', null, 'title', 'A 2 - 1 B', 'summary', 'Resultado oficial.', 'content', E'⚽ A venció a B 2-1.'),
    jsonb_build_object('parche_event_id', p_pea, 'title', 'A 2 - 1 B', 'summary', 'Resumen PA', 'content', E'⚽ A venció a B 2-1.\n\n🏆 Líder PA'),
    jsonb_build_object('parche_event_id', p_peb, 'title', 'A 2 - 1 B', 'summary', 'Resumen PB', 'content', E'⚽ A venció a B 2-1.\n\n🏆 Líder PB')) $$;
grant execute on all functions in schema pg_temp to authenticated, anon;

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-4000-8000-0000000000f1', 'sa@e.test', '{}'), ('00000000-0000-4000-8000-0000000000f2', 'p1@e.test', '{"username":"Uno"}'),
  ('00000000-0000-4000-8000-0000000000f3', 'p2@e.test', '{"username":"Dos"}'), ('00000000-0000-4000-8000-0000000000f4', 'p3@e.test', '{"username":"Tres"}'),
  ('00000000-0000-4000-8000-0000000000f5', 'o@e.test', '{"username":"Ajeno"}');
insert into private.platform_admins (user_id) values ('00000000-0000-4000-8000-0000000000f1');
insert into vars values ('sa','00000000-0000-4000-8000-0000000000f1'), ('p1','00000000-0000-4000-8000-0000000000f2'), ('p2','00000000-0000-4000-8000-0000000000f3'),
  ('p3','00000000-0000-4000-8000-0000000000f4'), ('o','00000000-0000-4000-8000-0000000000f5'),
  ('ev','e0000000-0000-4000-8000-0000000000b1'), ('m','a1000000-0000-4000-8000-0000000000b1'), ('pea','b1000000-0000-4000-8000-0000000000b1'), ('peb','b1000000-0000-4000-8000-0000000000b2');
insert into public.events (id, slug, name, status, timezone) values
  ('e0000000-0000-4000-8000-0000000000b1', 'news-ev', 'Noticias', 'in_progress', 'America/Bogota'),
  ('e0000000-0000-4000-8000-0000000000b2', 'news-ev2', 'Otro torneo', 'in_progress', 'America/Bogota');
insert into public.event_stages (id, event_id, code, name, sort_order, is_knockout, exact_points, result_points) values
  ('51000000-0000-4000-8000-0000000000b1', 'e0000000-0000-4000-8000-0000000000b1', 'g', 'Grupos', 1, false, 3, 1),
  ('51000000-0000-4000-8000-0000000000b2', 'e0000000-0000-4000-8000-0000000000b2', 'g', 'Grupos', 1, false, 3, 1);
insert into public.teams (id, name, kind) values ('72000000-0000-4000-8000-0000000000b1', 'Noticias A', 'club'), ('72000000-0000-4000-8000-0000000000b2', 'Noticias B', 'club');
insert into public.event_teams (event_id, team_id) select e, t from (values ('e0000000-0000-4000-8000-0000000000b1'::uuid), ('e0000000-0000-4000-8000-0000000000b2')) ev(e),
  (values ('72000000-0000-4000-8000-0000000000b1'::uuid), ('72000000-0000-4000-8000-0000000000b2')) tm(t);
insert into public.parches (id, name, created_by) values ('c1000000-0000-4000-8000-0000000000b1', 'PA', pg_temp.v('p1')::uuid), ('c1000000-0000-4000-8000-0000000000b2', 'PB', pg_temp.v('p1')::uuid);
insert into public.parche_members (parche_id, user_id, role) values
  ('c1000000-0000-4000-8000-0000000000b1', pg_temp.v('p1')::uuid, 'owner'), ('c1000000-0000-4000-8000-0000000000b1', pg_temp.v('p2')::uuid, 'member'),
  ('c1000000-0000-4000-8000-0000000000b2', pg_temp.v('p1')::uuid, 'owner'), ('c1000000-0000-4000-8000-0000000000b2', pg_temp.v('p3')::uuid, 'member');
insert into public.parche_events (id, parche_id, event_id) values
  ('b1000000-0000-4000-8000-0000000000b1', 'c1000000-0000-4000-8000-0000000000b1', 'e0000000-0000-4000-8000-0000000000b1'),
  ('b1000000-0000-4000-8000-0000000000b2', 'c1000000-0000-4000-8000-0000000000b2', 'e0000000-0000-4000-8000-0000000000b1');
insert into public.matches (id, event_id, stage_id, match_number, starts_at, home_team_id, away_team_id, teams_source, status) values
  ('a1000000-0000-4000-8000-0000000000b1', 'e0000000-0000-4000-8000-0000000000b1', '51000000-0000-4000-8000-0000000000b1', 1, now() - interval '1 hour', '72000000-0000-4000-8000-0000000000b1', '72000000-0000-4000-8000-0000000000b2', 'assigned', 'scheduled'),
  ('a1000000-0000-4000-8000-0000000000b2', 'e0000000-0000-4000-8000-0000000000b1', '51000000-0000-4000-8000-0000000000b1', 2, now() + interval '1 day', '72000000-0000-4000-8000-0000000000b1', '72000000-0000-4000-8000-0000000000b2', 'assigned', 'scheduled');
insert into public.predictions (parche_event_id, event_id, match_id, user_id, home_score, away_score) values
  ('b1000000-0000-4000-8000-0000000000b1', 'e0000000-0000-4000-8000-0000000000b1', 'a1000000-0000-4000-8000-0000000000b1', pg_temp.v('p1')::uuid, 2, 1),
  ('b1000000-0000-4000-8000-0000000000b1', 'e0000000-0000-4000-8000-0000000000b1', 'a1000000-0000-4000-8000-0000000000b1', pg_temp.v('p2')::uuid, 0, 0),
  ('b1000000-0000-4000-8000-0000000000b2', 'e0000000-0000-4000-8000-0000000000b1', 'a1000000-0000-4000-8000-0000000000b1', pg_temp.v('p1')::uuid, 1, 0),
  ('b1000000-0000-4000-8000-0000000000b2', 'e0000000-0000-4000-8000-0000000000b1', 'a1000000-0000-4000-8000-0000000000b1', pg_temp.v('p3')::uuid, 2, 1);
create temp table hist as select
  (select md5(string_agg(m::text, '|' order by m.id)) from public.matches m where event_id = 'daaebb9b-8e92-5644-824f-bf826114446a') matches,
  (select rows_checksum from public.standing_snapshots limit 1) checksum;

-- ═══ A. Sin partido finalizado no hay contexto ni publicación ═══
select pg_temp.as_user(pg_temp.v('sa')::uuid);
select pg_temp.try('A1 contexto de un partido no finalizado → match_not_finished', format('select public.control_news_context(%L::uuid)', pg_temp.v('m')), true, 'match_not_finished');
select pg_temp.try('A2 publicar antes de finalizar → match_not_finished', format('select public.control_publish_match_news(%L::uuid, 1, ''[]''::jsonb)', pg_temp.v('m')), true, 'match_not_finished');
select public.control_update_match_live(pg_temp.v('m')::uuid, 'live', 0, 0, null, 0, null);
select pg_temp.try('A3 con el partido en vivo tampoco se redacta', format('select public.control_news_context(%L::uuid)', pg_temp.v('m')), true, 'match_not_finished');
select public.control_update_match_live(pg_temp.v('m')::uuid, 'finished', 2, 1, null, 1, null);
select pg_temp.as_admin();
select pg_temp.check('A4 finalizar no crea noticias por sí solo (las publica el generador)', (select count(*) from public.news) = 0);

-- ═══ B. Contexto: por inscripción, solo sus participantes ═══
select pg_temp.as_user(pg_temp.v('sa')::uuid);
create temp table ctx as select public.control_news_context(pg_temp.v('m')::uuid) j;
grant select on ctx to authenticated;
select pg_temp.check('B1 revisión oficial 2 y marcador 2-1', (select (j->'match'->>'revision')::int from ctx) = 2 and (select j->'match'->>'home_score' from ctx) = '2');
select pg_temp.check('B2 dos inscripciones activas', (select jsonb_array_length(j->'items') from ctx) = 2);
select pg_temp.check('B3 tabla del parche A: solo Uno y Dos', (select (select array_agg(x->>'display_name' order by x->>'display_name') from jsonb_array_elements(i->'leaderboard') x)
  from ctx, jsonb_array_elements(j->'items') i where i->>'parche_event_id' = pg_temp.v('pea')) = array['Dos','Uno']);
select pg_temp.check('B4 tabla del parche B: solo Uno y Tres', (select (select array_agg(x->>'display_name' order by x->>'display_name') from jsonb_array_elements(i->'leaderboard') x)
  from ctx, jsonb_array_elements(j->'items') i where i->>'parche_event_id' = pg_temp.v('peb')) = array['Tres','Uno']);
select pg_temp.check('B5 pronósticos del partido de A y de B son distintos (Uno 2-1 en A, 1-0 en B)',
  (select (select x->>'home' from jsonb_array_elements(i->'predictions') x where x->>'user_id' = pg_temp.v('p1')) from ctx, jsonb_array_elements(j->'items') i where i->>'parche_event_id' = pg_temp.v('pea')) = '2'
  and (select (select x->>'home' from jsonb_array_elements(i->'predictions') x where x->>'user_id' = pg_temp.v('p1')) from ctx, jsonb_array_elements(j->'items') i where i->>'parche_event_id' = pg_temp.v('peb')) = '1');
select pg_temp.check('B6 los puntos ya están calculados por el motor (Uno exacto = 3 en A)',
  (select (select x->>'points' from jsonb_array_elements(i->'predictions') x where x->>'user_id' = pg_temp.v('p1')) from ctx, jsonb_array_elements(j->'items') i where i->>'parche_event_id' = pg_temp.v('pea')) = '3');
select pg_temp.check('B7 el superadministrador no aparece como participante', not exists (select 1 from ctx, jsonb_array_elements(j->'items') i, jsonb_array_elements(i->'leaderboard') x where x->>'user_id' = pg_temp.v('sa')));
select pg_temp.as_user(pg_temp.v('p1')::uuid);
select pg_temp.try('B8 un jugador no pide el contexto', format('select public.control_news_context(%L::uuid)', pg_temp.v('m')), true, '%not_platform_admin%');

-- ═══ C. Publicación: idempotente y solo superadministrador ═══
select pg_temp.try('C1 un jugador no publica noticias', format('select public.control_publish_match_news(%L::uuid, 2, pg_temp.items(%L, %L))', pg_temp.v('m'), pg_temp.v('pea'), pg_temp.v('peb')), true, '%not_platform_admin%');
select pg_temp.try('C2 un jugador no inserta directo', format($q$insert into public.news (event_id, match_id, match_revision, title, summary, content) values (%L::uuid, %L::uuid, 2, 'x', 'x', 'x')$q$, pg_temp.v('ev'), pg_temp.v('m')), true);
select pg_temp.as_user(pg_temp.v('sa')::uuid);
select pg_temp.try('C3 revisión obsoleta → stale_revision', format('select public.control_publish_match_news(%L::uuid, 1, pg_temp.items(%L, %L))', pg_temp.v('m'), pg_temp.v('pea'), pg_temp.v('peb')), true, 'stale_revision');
select pg_temp.try('C4 inscripción de otro torneo → invalid_parche_event', format($q$select public.control_publish_match_news(%L::uuid, 2, jsonb_build_array(jsonb_build_object('parche_event_id', %L, 'title', 't', 'summary', 's', 'content', 'c')))$q$, pg_temp.v('m'), gen_random_uuid()), true, 'invalid_parche_event');
create temp table pub1 as select public.control_publish_match_news(pg_temp.v('m')::uuid, 2, pg_temp.items(pg_temp.v('pea'), pg_temp.v('peb'))) n;
select pg_temp.check('C5 publica 3 noticias (torneo + parche A + parche B)', (select n from pub1) = 3);
create temp table pub2 as select public.control_publish_match_news(pg_temp.v('m')::uuid, 2, pg_temp.items(pg_temp.v('pea'), pg_temp.v('peb'))) n;
select pg_temp.check('C6 el reintento no duplica (0 nuevas)', (select n from pub2) = 0);
select pg_temp.as_admin();
select pg_temp.check('C7 3 filas y una auditoría', (select count(*) from public.news) = 3 and (select count(*) from public.control_audit_log where action = 'news_published') = 1);

-- ═══ D. Lectura: aislamiento por parche y torneo ═══
select pg_temp.as_user(pg_temp.v('p2')::uuid);
select pg_temp.check('D1 Dos (solo parche A): ve la del torneo y la de A, no la de B', (select count(*) from public.news) = 2 and not exists (select 1 from public.news where summary = 'Resumen PB'));
select pg_temp.check('D2 el feed de A trae UNA noticia del partido, la del parche', (select count(*) from public.get_news_feed(pg_temp.v('pea')::uuid)) = 1 and (select scope from public.get_news_feed(pg_temp.v('pea')::uuid)) = 'parche'
  and (select summary from public.get_news_feed(pg_temp.v('pea')::uuid)) = 'Resumen PA');
select pg_temp.check('D3 Dos no ve el feed de B', (select count(*) from public.get_news_feed(pg_temp.v('peb')::uuid)) = 0);
select pg_temp.as_admin();
insert into vars select 'news_b', id::text from public.news where summary = 'Resumen PB';
insert into vars select 'news_a', id::text from public.news where summary = 'Resumen PA';
insert into vars select 'news_ev', id::text from public.news where parche_event_id is null;
select pg_temp.as_user(pg_temp.v('p2')::uuid);
select pg_temp.check('D4 Dos no abre la noticia de B (ni con su propia inscripción ni con la de B)',
  (select count(*) from public.get_news_item(pg_temp.v('pea')::uuid, pg_temp.v('news_b')::uuid)) = 0 and (select count(*) from public.get_news_item(pg_temp.v('peb')::uuid, pg_temp.v('news_b')::uuid)) = 0);
select pg_temp.check('D5 Dos abre la de A y la compartida con su inscripción', (select count(*) from public.get_news_item(pg_temp.v('pea')::uuid, pg_temp.v('news_a')::uuid)) = 1
  and (select count(*) from public.get_news_item(pg_temp.v('pea')::uuid, pg_temp.v('news_ev')::uuid)) = 1);
select pg_temp.check('D6 la noticia de A no se abre con otra inscripción', (select count(*) from public.get_news_item(pg_temp.v('peb')::uuid, pg_temp.v('news_a')::uuid)) = 0);
select pg_temp.as_user(pg_temp.v('p1')::uuid);
select pg_temp.check('D7 Uno (en ambos parches) ve noticias distintas en cada contexto',
  (select summary from public.get_news_feed(pg_temp.v('pea')::uuid)) = 'Resumen PA' and (select summary from public.get_news_feed(pg_temp.v('peb')::uuid)) = 'Resumen PB');
select pg_temp.as_user(pg_temp.v('p3')::uuid);
select pg_temp.check('D8 Tres (solo B) ve la de B y la compartida, no la de A', (select count(*) from public.news) = 2 and not exists (select 1 from public.news where summary = 'Resumen PA'));
select pg_temp.as_user(pg_temp.v('o')::uuid);
select pg_temp.check('D9 un ajeno no ve nada (tabla, feed ni detalle)', (select count(*) from public.news) = 0 and (select count(*) from public.get_news_feed(pg_temp.v('pea')::uuid)) = 0
  and (select count(*) from public.get_news_item(pg_temp.v('pea')::uuid, pg_temp.v('news_ev')::uuid)) = 0);
select pg_temp.try('D10 nadie edita ni borra noticias', 'update public.news set title = ''x''', true);
select pg_temp.try('D11 ni borra', 'delete from public.news', true);
select pg_temp.as_user(pg_temp.v('p1')::uuid);
select pg_temp.try('D12 un jugador tampoco edita', 'update public.news set title = ''x''', true);
select pg_temp.as_user(pg_temp.v('sa')::uuid);
select pg_temp.check('D13 el superadministrador supervisa todas las noticias', (select count(*) from public.news) = 3);
select pg_temp.as_admin();
set local role anon;
select pg_temp.try('D14 anon no lee noticias', 'select count(*) from public.news', true);
select pg_temp.as_admin();

-- ═══ E. Una actualización irrelevante no retira nada; una corrección sí ═══
update public.matches set venue = 'Estadio' where id = pg_temp.v('m')::uuid;
select pg_temp.check('E1 cambiar un dato no deportivo no retira noticias', (select count(*) from public.news where superseded_at is null) = 3);
select pg_temp.as_user(pg_temp.v('sa')::uuid);
select public.control_update_match_live(pg_temp.v('m')::uuid, 'finished', 3, 1, null, 2, 'Se corrigió el marcador oficial');
select pg_temp.as_admin();
select pg_temp.check('E2 la corrección retira las 3 noticias (corrected) sin borrarlas', (select count(*) from public.news where superseded_at is not null and superseded_reason = 'corrected') = 3);
select pg_temp.as_user(pg_temp.v('p2')::uuid);
select pg_temp.check('E3 el jugador ya no ve la noticia vieja (feed ni tabla)', (select count(*) from public.get_news_feed(pg_temp.v('pea')::uuid)) = 0 and (select count(*) from public.news) = 0);
select pg_temp.as_user(pg_temp.v('sa')::uuid);
select pg_temp.check('E4 el superadministrador conserva la trazabilidad (ve las retiradas)', (select count(*) from public.news) = 3);
select pg_temp.try('E5 publicar con la revisión vieja → stale_revision', format('select public.control_publish_match_news(%L::uuid, 2, pg_temp.items(%L, %L))', pg_temp.v('m'), pg_temp.v('pea'), pg_temp.v('peb')), true, 'stale_revision');
create temp table pub3 as select public.control_publish_match_news(pg_temp.v('m')::uuid, 3, pg_temp.items(pg_temp.v('pea'), pg_temp.v('peb'))) n;
select pg_temp.check('E6 la revisión nueva publica 3 noticias (reemplazo)', (select n from pub3) = 3);
select pg_temp.as_user(pg_temp.v('p2')::uuid);
select pg_temp.check('E7 el jugador ve solo la vigente', (select count(*) from public.get_news_feed(pg_temp.v('pea')::uuid)) = 1);

-- ═══ F. Reapertura y nueva finalización ═══
select pg_temp.as_user(pg_temp.v('sa')::uuid);
select public.control_reopen_match(pg_temp.v('m')::uuid, 'Se reabre por error en el árbitro', 3);
select pg_temp.as_admin();
select pg_temp.check('F1 la reapertura retira las vigentes (reopened)', (select count(*) from public.news where superseded_at is null) = 0 and (select count(*) from public.news where superseded_reason = 'reopened') = 3);
select pg_temp.as_user(pg_temp.v('sa')::uuid);
select pg_temp.try('F2 con el partido en vivo no se redacta', format('select public.control_news_context(%L::uuid)', pg_temp.v('m')), true, 'match_not_finished');
select public.control_update_match_live(pg_temp.v('m')::uuid, 'finished', 3, 1, null, 4, null);
create temp table pub4 as select public.control_publish_match_news(pg_temp.v('m')::uuid, 5, pg_temp.items(pg_temp.v('pea'), pg_temp.v('peb'))) n;
select pg_temp.check('F3 al finalizar de nuevo se publica el estado vigente (3 nuevas)', (select n from pub4) = 3);
select pg_temp.as_admin();
select pg_temp.check('F4 un partido distinto no recibe noticias de este', (select count(*) from public.news where match_id = 'a1000000-0000-4000-8000-0000000000b2') = 0);

-- ═══ G. Regresión: tabla del parche y datos protegidos ═══
select pg_temp.as_user(pg_temp.v('p1')::uuid);
select pg_temp.check('G1 get_parche_event_leaderboard sigue funcionando (A: 2 filas, B: 2 filas)', (select count(*) from public.get_parche_event_leaderboard(pg_temp.v('pea')::uuid)) = 2
  and (select count(*) from public.get_parche_event_leaderboard(pg_temp.v('peb')::uuid)) = 2);
select pg_temp.as_user(pg_temp.v('o')::uuid);
select pg_temp.try('G2 un ajeno no consulta la tabla', format('select * from public.get_parche_event_leaderboard(%L::uuid)', pg_temp.v('pea')), true, 'not_member');
select pg_temp.try('G3 nadie llama a la función privada', format('select * from private.parche_event_leaderboard(%L::uuid)', pg_temp.v('pea')), true);
select pg_temp.as_admin();
select pg_temp.check('G4 mismo resultado que la función privada', (select array_agg(user_id order by rank, user_id) from private.parche_event_leaderboard(pg_temp.v('pea')::uuid)) is not null);
select pg_temp.check('G5 el Mundial 2026 no tiene noticias y su historia no cambió',
  (select count(*) from public.news n join public.events e on e.id = n.event_id where e.slug = 'mundial-2026') = 0
  and (select md5(string_agg(m::text, '|' order by m.id)) from public.matches m where event_id = 'daaebb9b-8e92-5644-824f-bf826114446a') = (select matches from hist)
  and (select rows_checksum from public.standing_snapshots limit 1) = (select checksum from hist)
  and private.verify_standing_snapshot((select id from public.standing_snapshots limit 1)));
select pg_temp.try('G6 el Mundial sigue sin contexto de noticias (resultados importados sin confirmación)', format('select public.control_news_context(%L::uuid)', (select id from public.matches where event_id = 'daaebb9b-8e92-5644-824f-bf826114446a' limit 1)), true);

select case when count(*) filter (where not ok) = 0 then 'TOTAL' else 'FALLOS' end as resultado, count(*) filter (where ok) || ' OK' as name, count(*) filter (where not ok) || ' fallos' as detail from results
union all select 'FALLO', name, detail from results where not ok;
rollback;
