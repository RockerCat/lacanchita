-- Operación de partidos de punta a punta (administrador ↔ jugador ↔ puntos ↔ noticias) contra el proyecto REAL,
-- en el torneo de QA "qa-jugador" (parche ParchePrueba1), TODO dentro de una transacción con ROLLBACK: no deja datos.
-- Identidades simuladas con claims JWT. Se usa el partido 2 (programado); el 1 ya está cancelado (definitivo).
--   npx supabase db query --linked -f scripts/history-migration/tests/remote_operacion_partidos_test.sql
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
insert into vars select 'pe', pe.id::text from public.parche_events pe join public.parches p on p.id = pe.parche_id where pe.event_id = pg_temp.v('ev')::uuid and p.name = 'ParchePrueba1';
insert into vars select 'pa', parche_id::text from public.parche_events where id = pg_temp.v('pe')::uuid;
insert into vars select 'player', user_id::text from public.parche_members where parche_id = pg_temp.v('pa')::uuid and role = 'admin' and status = 'active' and user_id not in (select user_id from private.platform_admins);
insert into vars select 'm1', id::text from public.matches where event_id = pg_temp.v('ev')::uuid and match_number = 1;
insert into vars select 'm2', id::text from public.matches where event_id = pg_temp.v('ev')::uuid and match_number = 2;
create temp table copa_before as select (select count(*) from public.news n join public.events e on e.id = n.event_id where e.slug = 'copa-de-prueba') news, (select count(*) from private.match_result_drafts) drafts,
  (select string_agg(m.id || ':' || m.status || ':' || m.result_revision || ':' || coalesce(m.home_score::text, '-'), ',' order by m.id) from public.matches m join public.events e on e.id = m.event_id where e.slug = 'copa-de-prueba') st;
create temp table wc_before as select (select string_agg(id || ':' || status || ':' || coalesce(home_score::text, '-') || coalesce(away_score::text, '-') || ':' || result_revision, ',' order by id) from public.matches m where event_id = (select id from public.events where slug = 'mundial-2026')) st,
  (select count(*) from public.standing_snapshot_rows) rows_;
grant select on copa_before, wc_before to authenticated;

-- 0. Estado de partida: mismo partido para administrador y jugador
select pg_temp.as_user(pg_temp.v('sa')::uuid);
select pg_temp.check('el partido 2 es del torneo QA, programado y sin marcador (vista del administrador)',
  (select status = 'scheduled' and home_score is null and event_id = pg_temp.v('ev')::uuid from public.matches where id = pg_temp.v('m2')::uuid));
select pg_temp.as_user(pg_temp.v('player')::uuid);
select pg_temp.check('el jugador consulta el MISMO match_id en el torneo QA', exists (select 1 from public.matches where id = pg_temp.v('m2')::uuid and event_id = pg_temp.v('ev')::uuid));
select public.save_prediction(pg_temp.v('pe')::uuid, pg_temp.v('m2')::uuid, 2, 1);

-- 1. Seguridad: ni el jugador (administrador de su parche) ni un anónimo operan resultados
select pg_temp.try('el administrador del parche NO guarda marcadores oficiales', format('select public.control_update_match_live(%L::uuid, ''live'', 0, 0, null, 0, null)', pg_temp.v('m2')), true, '%not_platform_admin%');
select pg_temp.try('tampoco puede reabrir ni reprogramar', format('select public.control_reopen_match(%L::uuid, ''x'', 0)', pg_temp.v('m2')), true, '%not_platform_admin%');
select pg_temp.try('ni escribir puntos ni noticias directamente', 'update public.predictions set points = 99', true);
select pg_temp.try('ni publicar una noticia arbitraria', format('select public.control_publish_match_news(%L::uuid, 0, ''[]''::jsonb)', pg_temp.v('m2')), true, '%not_platform_admin%');

-- 2. Iniciar y guardar marcador en vivo: visible al instante, sin puntos ni noticias
select pg_temp.as_user(pg_temp.v('sa')::uuid);
select public.control_update_match_live(pg_temp.v('m2')::uuid, 'live', 0, 0, null, 0, null);
select public.control_update_match_live(pg_temp.v('m2')::uuid, 'live', 1, 0, null, 1, null);
create temp table adm as select status, home_score, away_score, result_revision from public.matches where id = pg_temp.v('m2')::uuid;
grant select on adm to authenticated;
select pg_temp.as_user(pg_temp.v('player')::uuid);
select pg_temp.check('el jugador ve el mismo estado, marcador y revisión que guardó el administrador (en vivo 1-0)',
  (select a.status = m.status and a.home_score = m.home_score and a.away_score = m.away_score and a.result_revision = m.result_revision from adm a, public.matches m where m.id = pg_temp.v('m2')::uuid)
  and (select status from adm) = 'live' and (select home_score from adm) = 1);
select pg_temp.check('en vivo: ningún punto otorgado (pronóstico propio sin puntos, clasificación en 0)',
  (select points from public.predictions where match_id = pg_temp.v('m2')::uuid and user_id = pg_temp.v('player')::uuid) is null
  and (select coalesce(sum(total_points), 0) from public.get_parche_event_leaderboard(pg_temp.v('pe')::uuid)) = 0);
select pg_temp.as_user(pg_temp.v('sa')::uuid);
select pg_temp.try('en vivo no hay noticias: publicar se rechaza', format('select public.control_news_context(%L::uuid)', pg_temp.v('m2')), true, '%match_not_finished%');
select pg_temp.try('dos administradores: el segundo, con la revisión vieja, recibe conflicto', format('select public.control_update_match_live(%L::uuid, ''live'', 5, 5, null, 1, null)', pg_temp.v('m2')), true, '%stale_revision%');
select pg_temp.check('el conflicto no sobrescribió el marcador del primero', (select home_score = 1 and away_score = 0 from public.matches where id = pg_temp.v('m2')::uuid));
select pg_temp.try('marcador inválido rechazado', format('select public.control_update_match_live(%L::uuid, ''live'', -1, 0, null, 2, null)', pg_temp.v('m2')), true);

-- 3. Finalizar: puntos, clasificación y noticias
select public.control_update_match_live(pg_temp.v('m2')::uuid, 'finished', 2, 1, null, 2, null);
select pg_temp.as_user(pg_temp.v('player')::uuid);
select pg_temp.check('finalizado: marcador oficial visible y pronóstico exacto puntuado (3 en fase de grupos del QA)',
  (select status = 'finished' and home_score = 2 from public.matches where id = pg_temp.v('m2')::uuid)
  and (select points > 0 and points_reason = 'exact' from public.predictions where match_id = pg_temp.v('m2')::uuid and user_id = pg_temp.v('player')::uuid));
select pg_temp.check('la clasificación del parche refleja los puntos', (select total_points > 0 and exact_count = 1 and rank = 1 from public.get_parche_event_leaderboard(pg_temp.v('pe')::uuid) where user_id = pg_temp.v('player')::uuid));
select pg_temp.as_user(pg_temp.v('sa')::uuid);
create temp table ctx as select public.control_news_context(pg_temp.v('m2')::uuid) j;
grant select on ctx to authenticated;
select pg_temp.check('contexto de noticias: ParchePrueba1 presente y sin el superadministrador', (select jsonb_array_length(j->'items') >= 1 from ctx)
  and not exists (select 1 from ctx, jsonb_array_elements(j->'items') i, jsonb_array_elements(i->'leaderboard') x where x->>'user_id' = pg_temp.v('sa')));
create temp table pub as select public.control_publish_match_news(pg_temp.v('m2')::uuid, (select (j->'match'->>'revision')::int from ctx),
  (select jsonb_agg(jsonb_build_object('parche_event_id', i->>'parche_event_id', 'title', 'QA', 'summary', 's', 'content', '⚽ QA')) || jsonb_build_array(jsonb_build_object('parche_event_id', null, 'title', 'QA', 'summary', 's', 'content', '⚽ QA')) from ctx, jsonb_array_elements(j->'items') i)) n;
select pg_temp.check('publica una noticia por parche inscrito + la del torneo; el reintento publica 0 (sin duplicados)',
  (select n from pub) = (select jsonb_array_length(j->'items') + 1 from ctx)
  and public.control_publish_match_news(pg_temp.v('m2')::uuid, (select (j->'match'->>'revision')::int from ctx), jsonb_build_array(jsonb_build_object('parche_event_id', null, 'title', 'x', 'summary', 'x', 'content', 'x'))) = 0);
select pg_temp.as_user(pg_temp.v('player')::uuid);
select pg_temp.check('el jugador lee la noticia en su parche (get_news_feed)', (select count(*) from public.get_news_feed(pg_temp.v('pe')::uuid) where match_id = pg_temp.v('m2')::uuid) = 1);

-- 4. Corrección (motivo obligatorio) y reapertura
select pg_temp.as_user(pg_temp.v('sa')::uuid);
select pg_temp.try('corregir exige motivo', format('select public.control_update_match_live(%L::uuid, ''finished'', 3, 1, null, 3, null)', pg_temp.v('m2')), true);
select public.control_update_match_live(pg_temp.v('m2')::uuid, 'finished', 3, 1, null, 3, 'Corrección de prueba (transacción)');
select pg_temp.as_user(pg_temp.v('player')::uuid);
select pg_temp.check('corrección: puntos recalculados sin acumular (el pronóstico 2-1 ya no es exacto: resultado = 1 punto en el QA o menos) y noticia anterior retirada del feed',
  (select points_reason <> 'exact' from public.predictions where match_id = pg_temp.v('m2')::uuid and user_id = pg_temp.v('player')::uuid)
  and (select count(*) from public.get_news_feed(pg_temp.v('pe')::uuid) where match_id = pg_temp.v('m2')::uuid) = 0);
select pg_temp.as_user(pg_temp.v('sa')::uuid);
select public.control_reopen_match(pg_temp.v('m2')::uuid, 'Reapertura de prueba (transacción)', 4);
select pg_temp.as_user(pg_temp.v('player')::uuid);
select pg_temp.check('reapertura: vuelve a En vivo y se retiran los puntos; pronóstico propio sigue (bloqueado)',
  (select status = 'live' from public.matches where id = pg_temp.v('m2')::uuid)
  and (select points is null from public.predictions where match_id = pg_temp.v('m2')::uuid and user_id = pg_temp.v('player')::uuid)
  and (select coalesce(sum(total_points), 0) from public.get_parche_event_leaderboard(pg_temp.v('pe')::uuid)) = 0);
select pg_temp.try('el jugador sigue sin poder pronosticar un partido en vivo', format('select public.save_prediction(%L::uuid, %L::uuid, 0, 0)', pg_temp.v('pe'), pg_temp.v('m2')), true);
select pg_temp.as_admin();
select pg_temp.check('las noticias de las revisiones anteriores quedaron retiradas, no borradas', (select count(*) from public.news where match_id = pg_temp.v('m2')::uuid and superseded_at is not null) >= 1
  and (select count(*) from public.news where match_id = pg_temp.v('m2')::uuid and superseded_at is null) = 0);
select pg_temp.check('la auditoría registra inicio, marcador, cierre, corrección y reapertura',
  (select count(distinct action) from public.control_audit_log where entity_id = pg_temp.v('m2')::uuid and action in ('match_started', 'score_updated', 'match_finished', 'result_corrected', 'match_reopened')) >= 4);

-- 5. Cancelado: definitivo
select pg_temp.as_user(pg_temp.v('sa')::uuid);
select pg_temp.try('un partido cancelado no se reabre ni admite resultado', format('select public.control_update_match_live(%L::uuid, ''live'', 0, 0, null, 0, null)', pg_temp.v('m1')), true);

-- 6. Integridad
select pg_temp.as_admin();
select pg_temp.check('Copa de prueba intacta (partidos, estados, revisiones, marcador pendiente)', (select st from copa_before) = (select string_agg(m.id || ':' || m.status || ':' || m.result_revision || ':' || coalesce(m.home_score::text, '-'), ',' order by m.id) from public.matches m join public.events e on e.id = m.event_id where e.slug = 'copa-de-prueba')
  and (select drafts from copa_before) = (select count(*) from private.match_result_drafts) and (select news from copa_before) = (select count(*) from public.news n join public.events e on e.id = n.event_id where e.slug = 'copa-de-prueba'));
select pg_temp.check('Mundial 2026 intacto (104 partidos, marcadores y revisiones iguales; sin pronósticos; sin noticias)',
  (select st from wc_before) = (select string_agg(id || ':' || status || ':' || coalesce(home_score::text, '-') || coalesce(away_score::text, '-') || ':' || result_revision, ',' order by id) from public.matches where event_id = (select id from public.events where slug = 'mundial-2026'))
  and (select count(*) from public.predictions p join public.parche_events x on x.id = p.parche_event_id where x.event_id = (select id from public.events where slug = 'mundial-2026')) = 0
  and (select count(*) from public.news n join public.events e on e.id = n.event_id where e.slug = 'mundial-2026') = 0
  and (select rows_ from wc_before) = (select count(*) from public.standing_snapshot_rows));
select pg_temp.try('el Mundial sellado no admite cambios de resultado', format('select public.control_update_match_live(%L::uuid, ''finished'', 9, 9, null, 0, ''x'')', (select id from public.matches where event_id = (select id from public.events where slug = 'mundial-2026') limit 1)), true);

select case when count(*) filter (where not ok) = 0 then 'TOTAL' else 'FALLOS' end as resultado, count(*) filter (where ok) || ' OK' as name, count(*) filter (where not ok) || ' fallos' as detail from results
union all select 'FALLO', name, detail from results where not ok;
rollback;
