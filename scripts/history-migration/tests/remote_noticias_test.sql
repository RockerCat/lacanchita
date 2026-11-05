-- Noticias contra el proyecto REAL en el torneo de QA "qa-jugador" (parche ParchePrueba1), TODO dentro
-- de una transacción con ROLLBACK: no deja datos. Identidades simuladas con claims JWT (no toca auth.*).
-- Jugador = el administrador NO superadministrador de ParchePrueba1; ajeno = un miembro de La Penúltima.
-- Incluye el escenario multiparche (usuario en dos parches, pronósticos distintos del mismo partido).
--   npx supabase db query --linked -f scripts/history-migration/tests/remote_noticias_test.sql
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
insert into vars select 'player', user_id::text from public.parche_members where parche_id = pg_temp.v('pa')::uuid and role = 'admin' and status = 'active' and user_id not in (select user_id from private.platform_admins);
insert into vars select 'outsider', user_id::text from public.parche_members where parche_id = '91ad5d8d-414c-4e74-bf57-2ca476652de0' and role = 'member' and status = 'active'
  and user_id not in (select user_id from public.parche_members where parche_id = pg_temp.v('pa')::uuid) limit 1;
insert into vars select 'm2', id::text from public.matches where event_id = pg_temp.v('ev')::uuid and match_number = 2;
insert into vars select 'copa_m2', m.id::text from public.matches m join public.events e on e.id = m.event_id where e.slug = 'copa-de-prueba' and m.match_number = 2;
create temp table before_counts as select (select count(*) from public.news where event_id = pg_temp.v('ev')::uuid) n;

select pg_temp.check('la migración está aplicada y el torneo QA no tiene noticias', (select n from before_counts) = 0);
select pg_temp.as_user(pg_temp.v('player')::uuid);
insert into vars select 'pb', (public.create_parche('QA noticias (borrar)', gen_random_uuid()))::text;
-- La regla de inscripción exige ≥2 participantes activos: se añade un amigo al parche de ensayo (dentro de la transacción con ROLLBACK).
select pg_temp.as_admin();
insert into public.parche_members (parche_id, user_id)
  select pg_temp.v('pb')::uuid, user_id from public.parche_members
  where parche_id = '91ad5d8d-414c-4e74-bf57-2ca476652de0' and role = 'member' and status = 'active' and user_id <> pg_temp.v('player')::uuid limit 1;
select pg_temp.as_user(pg_temp.v('player')::uuid);
select public.add_event_to_parche(pg_temp.v('pb')::uuid, pg_temp.v('ev')::uuid);
insert into vars select 'pe2', id::text from public.parche_events where parche_id = pg_temp.v('pb')::uuid;
select public.save_prediction(pg_temp.v('pe')::uuid, pg_temp.v('m2')::uuid, 2, 1);
select public.save_prediction(pg_temp.v('pe2')::uuid, pg_temp.v('m2')::uuid, 0, 0);
select pg_temp.as_user(pg_temp.v('sa')::uuid);
select public.control_update_match_live(pg_temp.v('m2')::uuid, 'live', 0, 0, null, 0, null);
select public.control_update_match_live(pg_temp.v('m2')::uuid, 'finished', 2, 1, null, 1, null);
create temp table ctx as select public.control_news_context(pg_temp.v('m2')::uuid) j;
grant select on ctx to authenticated;
select pg_temp.check('contexto: 2 inscripciones activas (ParchePrueba1 y el parche de prueba)', (select jsonb_array_length(j->'items') from ctx) = 2);
select pg_temp.check('contexto: forma esperada por el generador (claves y tipos)',
  (select j->'match' ?& array['id','event_id','revision','home_score','away_score','winner_side','home','away'] from ctx)
  and (select (j->'items'->0) ?& array['parche_event_id','leaderboard','predictions'] from ctx)
  and (select jsonb_typeof(j->'match'->'revision') = 'number' from ctx));
select pg_temp.check('contexto: el superadministrador no figura en ninguna tabla', not exists (select 1 from ctx, jsonb_array_elements(j->'items') i, jsonb_array_elements(i->'leaderboard') x where x->>'user_id' = pg_temp.v('sa')));
create temp table pub as select public.control_publish_match_news(pg_temp.v('m2')::uuid, (select (j->'match'->>'revision')::int from ctx),
  jsonb_build_array(
    jsonb_build_object('parche_event_id', null, 'title', 'QA prueba', 'summary', 'Resultado oficial', 'content', '⚽ QA compartida'),
    jsonb_build_object('parche_event_id', pg_temp.v('pe'), 'title', 'QA prueba', 'summary', 'Resumen PA', 'content', '⚽ QA parche A'),
    jsonb_build_object('parche_event_id', pg_temp.v('pe2'), 'title', 'QA prueba', 'summary', 'Resumen PB', 'content', '⚽ QA parche B'))) n;
select pg_temp.check('publica 3 noticias y el reintento 0', (select n from pub) = 3
  and public.control_publish_match_news(pg_temp.v('m2')::uuid, (select (j->'match'->>'revision')::int from ctx), jsonb_build_array(jsonb_build_object('parche_event_id', null, 'title', 'x', 'summary', 'x', 'content', 'x'))) = 0);
select pg_temp.as_user(pg_temp.v('player')::uuid);
select pg_temp.try('un jugador no publica', format('select public.control_publish_match_news(%L::uuid, 2, ''[]''::jsonb)', pg_temp.v('m2')), true, '%not_platform_admin%');
select pg_temp.check('jugador (en ambos parches): una noticia por partido en cada contexto y distintas',
  (select summary from public.get_news_feed(pg_temp.v('pe')::uuid)) = 'Resumen PA' and (select summary from public.get_news_feed(pg_temp.v('pe2')::uuid)) = 'Resumen PB');
select pg_temp.try('el jugador no edita noticias', 'update public.news set title = ''x''', true);
select pg_temp.as_user(pg_temp.v('outsider')::uuid);
select pg_temp.check('un miembro ajeno a esos parches no ve noticias (tabla, feed, detalle)',
  (select count(*) from public.news) = 0 and (select count(*) from public.get_news_feed(pg_temp.v('pe')::uuid)) = 0
  and (select count(*) from public.get_news_item(pg_temp.v('pe')::uuid, gen_random_uuid())) = 0);
select pg_temp.as_user(pg_temp.v('sa')::uuid);
select pg_temp.check('el superadministrador supervisa las 3', (select count(*) from public.news where event_id = pg_temp.v('ev')::uuid) = 3);
select public.control_update_match_live(pg_temp.v('m2')::uuid, 'finished', 3, 1, null, 2, 'Corrección de prueba (transacción)');
select pg_temp.as_user(pg_temp.v('player')::uuid);
select pg_temp.check('tras corregir el resultado el jugador ya no ve la noticia anterior', (select count(*) from public.get_news_feed(pg_temp.v('pe')::uuid)) = 0);
select pg_temp.as_admin();
select pg_temp.check('las anteriores quedan retiradas (corrected), no borradas', (select count(*) from public.news where superseded_reason = 'corrected') = 3);
select pg_temp.check('Copa de prueba intacta (borrador, partido 2 programado, marcador pendiente conservado)',
  (select status from public.events where slug = 'copa-de-prueba') = 'draft' and (select status from public.matches where id = pg_temp.v('copa_m2')::uuid) = 'scheduled'
  and (select count(*) from private.match_result_drafts where match_id = pg_temp.v('copa_m2')::uuid) = 1);
select pg_temp.check('Mundial 2026: sin noticias y 104 partidos finalizados', (select count(*) from public.news n join public.events e on e.id = n.event_id where e.slug = 'mundial-2026') = 0
  and (select count(*) from public.matches m join public.events e on e.id = m.event_id where e.slug = 'mundial-2026' and m.status = 'finished') = 104);

select case when count(*) filter (where not ok) = 0 then 'TOTAL' else 'FALLOS' end as resultado, count(*) filter (where ok) || ' OK' as name, count(*) filter (where not ok) || ' fallos' as detail from results
union all select 'FALLO', name, detail from results where not ok;
rollback;
