-- Pruebas de La Canchita Control (migración 20261030100000): superadministración, borradores,
-- torneos, fases, equipos, partidos, resultados, auditoría e inscripción en parches.
-- SOLO Postgres local desechable (cluster_name = lacanchita-local-test) con stub + todas las migraciones
-- + importación histórica. Usuarios, torneos y parches FICTICIOS; todo termina en ROLLBACK.
--   psql -h 127.0.0.1 -p 55432 -U postgres -d canchita_test -v ON_ERROR_STOP=1 -f <este archivo>
begin;
do $$ begin
  if current_setting('cluster_name', true) is distinct from 'lacanchita-local-test' then
    raise exception 'pruebas_solo_local';
  end if;
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
begin
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
end $$;
create function pg_temp.check(p_name text, p_ok boolean, p_detail text default null) returns void language sql as $$
  insert into results (name, ok, detail) values (p_name, coalesce(p_ok, false), p_detail);
$$;
create function pg_temp.try(p_name text, p_sql text, p_expect_error boolean, p_error_like text default null) returns void language plpgsql as $$
declare n bigint;
begin
  begin
    execute p_sql;
    get diagnostics n = row_count;
    insert into results (name, ok, detail) values (p_name, not p_expect_error, 'sin error, filas=' || n);
  exception when others then
    insert into results (name, ok, detail)
    values (p_name, p_expect_error and (p_error_like is null or sqlerrm like p_error_like), sqlerrm);
  end;
end $$;
create function pg_temp.v(p_k text) returns text language sql as $$ select v from vars where k = p_k $$;
grant execute on all functions in schema pg_temp to authenticated, anon;

-- SA: superadmin. N: usuario normal. O: creador de P1. PA: admin de P1. M: miembro de P1. X: ajeno. D: admin deshabilitado.
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-4000-8000-0000000000a1', 'sa@ejemplo.test', '{"username": "SA"}'),
  ('00000000-0000-4000-8000-0000000000b2', 'normal@ejemplo.test', '{"username": "Normal"}'),
  ('00000000-0000-4000-8000-0000000000c3', 'owner@ejemplo.test', '{"username": "Owner"}'),
  ('00000000-0000-4000-8000-0000000000d4', 'padmin@ejemplo.test', '{"username": "PAdmin"}'),
  ('00000000-0000-4000-8000-0000000000e5', 'member@ejemplo.test', '{"username": "Member"}'),
  ('00000000-0000-4000-8000-0000000000f6', 'ajeno@ejemplo.test', '{"username": "Ajeno"}'),
  ('00000000-0000-4000-8000-000000000007', 'dis@ejemplo.test', '{"username": "Dis"}');
insert into private.platform_admins (user_id, note) values ('00000000-0000-4000-8000-0000000000a1', 'prueba local');
insert into public.parches (id, name, created_by) values
  ('10000000-0000-4000-8000-0000000000a1', 'P1', '00000000-0000-4000-8000-0000000000c3'),
  ('10000000-0000-4000-8000-0000000000a2', 'P2', '00000000-0000-4000-8000-0000000000f6');
insert into public.parche_members (parche_id, user_id, role, status, disabled_at) values
  ('10000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000c3', 'owner', 'active', null),
  ('10000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000d4', 'admin', 'active', null),
  ('10000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000e5', 'member', 'active', null),
  ('10000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000007', 'admin', 'disabled', now()),
  ('10000000-0000-4000-8000-0000000000a2', '00000000-0000-4000-8000-0000000000f6', 'owner', 'active', null);

-- Huellas históricas previas.
create temp table hist_before as
  select (select md5(string_agg(m::text, '|' order by m.id)) from public.matches m where m.event_id = 'daaebb9b-8e92-5644-824f-bf826114446a') matches,
         (select md5(string_agg(t::text, '|' order by t.id)) from public.teams t where t.id in (select team_id from public.event_teams where event_id = 'daaebb9b-8e92-5644-824f-bf826114446a')) teams,
         (select md5(string_agg(s::text, '|' order by s.id)) from public.event_stages s where s.event_id = 'daaebb9b-8e92-5644-824f-bf826114446a') stages,
         (select md5(string_agg(e::text, '|' order by e.id)) from public.events e where e.id = 'daaebb9b-8e92-5644-824f-bf826114446a') events,
         (select md5(string_agg(r::text, '|' order by r.event_id, r.result_key)) from public.event_results r) results,
         (select md5(string_agg(et::text, '|' order by et.team_id)) from public.event_teams et where et.event_id = 'daaebb9b-8e92-5644-824f-bf826114446a') event_teams,
         (select md5(string_agg(pe::text, '|' order by pe.id)) from public.parche_events pe) pe,
         (select rows_checksum from public.standing_snapshots limit 1) checksum;

-- ── 1. Autorización ─────────────────────────────────────────────────────────
select pg_temp.as_user('00000000-0000-4000-8000-0000000000a1');
select pg_temp.check('superadmin: is_platform_admin() = true', public.is_platform_admin());
select pg_temp.as_user('00000000-0000-4000-8000-0000000000b2');
select pg_temp.check('usuario normal: is_platform_admin() = false', not public.is_platform_admin());
select pg_temp.try('normal no crea torneos', $q$select public.control_create_event('x-prueba', 'Prueba X', 'America/Bogota')$q$, true, 'not_platform_admin');
select pg_temp.try('normal no consulta requisitos de publicación', $q$select public.control_event_publish_issues(gen_random_uuid())$q$, true, 'not_platform_admin');
select pg_temp.try('normal no guarda marcadores', $q$select public.control_update_match_live(gen_random_uuid(), 'live', 1, 0, null, 0, null)$q$, true, 'not_platform_admin');
select pg_temp.try('normal no resuelve pendientes heredados', $q$select public.control_resolve_pending_result(gen_random_uuid(), 0, 'discard')$q$, true, 'not_platform_admin');
select pg_temp.try('normal no guarda equipos', $q$select public.control_save_team(null, 'Equipo Z', null, 'club', null)$q$, true, 'not_platform_admin');
select pg_temp.try('normal no guarda partidos', $q$select public.control_save_match(null, gen_random_uuid(), gen_random_uuid(), 1, null, now(), null, null, null, 'a', 'b', null)$q$, true, 'not_platform_admin');
select pg_temp.try('normal no escribe en private.platform_admins', $q$insert into private.platform_admins (user_id) values ('00000000-0000-4000-8000-0000000000b2')$q$, true, 'permission denied%');
select pg_temp.try('normal no lee private.platform_admins', $q$select * from private.platform_admins$q$, true, 'permission denied%');
select pg_temp.try('normal no escribe en events', $q$insert into public.events (slug, name) values ('hack-ev', 'Hack')$q$, true, 'permission denied%');
select pg_temp.try('normal no modifica matches', $q$update public.matches set home_score = 9$q$, true, 'permission denied%');
select pg_temp.try('normal no escribe la auditoría', $q$insert into public.control_audit_log (action, entity_type) values ('x', 'y')$q$, true, 'permission denied%');
select pg_temp.try('normal no ejecuta private.audit', $q$select private.audit('x', 'y', null, null, null, null, null)$q$, true, 'permission denied%');
-- Escalamiento por metadata (user_metadata/app_metadata en el JWT): irrelevante.
do $$ begin
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-4000-8000-0000000000b2', 'role', 'authenticated',
    'user_metadata', json_build_object('is_platform_admin', true, 'role', 'superadmin'),
    'app_metadata', json_build_object('role', 'service_role', 'platform_admin', true))::text, true);
  execute 'set local role authenticated';
end $$;
select pg_temp.check('metadata del JWT no concede privilegios', not public.is_platform_admin());
select pg_temp.try('metadata del JWT no permite crear torneos', $q$select public.control_create_event('meta-ev', 'Meta', 'America/Bogota')$q$, true, 'not_platform_admin');
-- Owner y admin de parche: sin privilegios globales.
select pg_temp.as_user('00000000-0000-4000-8000-0000000000c3');
select pg_temp.check('owner de parche no es superadmin', not public.is_platform_admin());
select pg_temp.try('owner de parche no crea torneos', $q$select public.control_create_event('owner-ev', 'Owner', 'America/Bogota')$q$, true, 'not_platform_admin');
select pg_temp.as_user('00000000-0000-4000-8000-0000000000d4');
select pg_temp.try('admin de parche no crea torneos', $q$select public.control_create_event('adm-ev', 'Adm', 'America/Bogota')$q$, true, 'not_platform_admin');
do $$ begin execute 'reset role'; execute 'set local role anon'; end $$;
select pg_temp.try('anon no ejecuta is_platform_admin', $q$select public.is_platform_admin()$q$, true, 'permission denied%');
select pg_temp.try('anon no ejecuta control_create_event', $q$select public.control_create_event('anon-ev', 'Anon', 'America/Bogota')$q$, true, 'permission denied%');
select pg_temp.try('anon no ejecuta add_event_to_parche', $q$select public.add_event_to_parche(gen_random_uuid(), gen_random_uuid())$q$, true, 'permission denied%');

-- ── 2. Torneo, fases, equipos, partidos (superadmin) ────────────────────────
select pg_temp.as_user('00000000-0000-4000-8000-0000000000a1');
select pg_temp.try('slug inválido', $q$select public.control_create_event('Copa Prueba', 'Copa', 'America/Bogota')$q$, true, 'invalid_slug');
select pg_temp.try('zona horaria inválida', $q$select public.control_create_event('copa-x', 'Copa', 'Marte/Olimpo')$q$, true, 'invalid_timezone');
select pg_temp.try('nombre muy corto', $q$select public.control_create_event('copa-x', 'C', 'America/Bogota')$q$, true, 'invalid_name');
insert into vars select 'e1', public.control_create_event('copa-prueba', 'Copa de Prueba', 'America/New_York')::text;
select pg_temp.check('torneo creado en borrador', (select status from public.events where id = pg_temp.v('e1')::uuid) = 'draft');
select pg_temp.try('slug repetido', $q$select public.control_create_event('copa-prueba', 'Otra', 'America/Bogota')$q$, true, 'slug_taken');
select pg_temp.try('slug mundial repetido', $q$select public.control_create_event('mundial-2026', 'Otra', 'America/Bogota')$q$, true, 'slug_taken');

-- Fases
insert into vars select 'sg', public.control_save_stage(pg_temp.v('e1')::uuid, null, 'group', 'Fase de grupos', 1, false, 3, 1)::text;
insert into vars select 'sf', public.control_save_stage(pg_temp.v('e1')::uuid, null, 'final', 'Final', 2, true, 8, 6)::text;
select pg_temp.try('fase con código repetido', format($q$select public.control_save_stage(%L, null, 'group', 'Otra', 9, false, 1, 1)$q$, pg_temp.v('e1')), true, 'stage_code_taken');
select pg_temp.try('fase con orden repetido', format($q$select public.control_save_stage(%L, null, 'semi', 'Semifinal', 2, true, 1, 1)$q$, pg_temp.v('e1')), true, 'stage_order_taken');
select pg_temp.try('fase con puntos inválidos', format($q$select public.control_save_stage(%L, null, 'semi', 'Semifinal', 3, true, -1, 1)$q$, pg_temp.v('e1')), true, 'invalid_points');
select pg_temp.try('fase con código inválido', format($q$select public.control_save_stage(%L, null, 'Semi Final', 'Semifinal', 3, true, 1, 1)$q$, pg_temp.v('e1')), true, 'invalid_code');
select pg_temp.try('fase ajena al torneo no se edita', format($q$select public.control_save_stage(%L, %L, 'group', 'Fase X', 5, false, 1, 1)$q$,
  pg_temp.v('e1'), (select id from public.event_stages where event_id = 'daaebb9b-8e92-5644-824f-bf826114446a' limit 1)), true, 'stage_not_found');
select public.control_save_stage(pg_temp.v('e1')::uuid, pg_temp.v('sg')::uuid, 'group', 'Grupos', 1, false, 3, 1);
select pg_temp.check('fase editada', (select name from public.event_stages where id = pg_temp.v('sg')::uuid) = 'Grupos');

-- Equipos
insert into vars select 'ta', public.control_save_team(null, 'Aguilas Prueba', 'AGU', 'club', '🦅')::text;
insert into vars select 'tb', public.control_save_team(null, 'Bravos Prueba', 'BRA', 'club', null)::text;
insert into vars select 'tc', public.control_save_team(null, 'Cóndores Prueba', 'CON', 'club', null)::text;
select pg_temp.try('equipo duplicado (mayúsculas distintas)', $q$select public.control_save_team(null, '  aguilas PRUEBA ', null, 'club', null)$q$, true, 'team_exists');
select pg_temp.try('tipo de equipo inválido', $q$select public.control_save_team(null, 'Zeta Prueba', null, 'planeta', null)$q$, true, 'invalid_kind');
select pg_temp.try('código de equipo inválido', $q$select public.control_save_team(null, 'Zeta Prueba', 'a b', 'club', null)$q$, true, 'invalid_code');
select public.control_save_team(pg_temp.v('tc')::uuid, 'Cóndores FC Prueba', 'CON', 'club', null);
select pg_temp.check('equipo editado', (select name from public.teams where id = pg_temp.v('tc')::uuid) = 'Cóndores FC Prueba');
select pg_temp.check('asociar equipo', public.control_set_event_team(pg_temp.v('e1')::uuid, pg_temp.v('ta')::uuid, 'a') = 'added');
select pg_temp.check('asociar el mismo equipo no duplica', public.control_set_event_team(pg_temp.v('e1')::uuid, pg_temp.v('ta')::uuid, 'A') = 'updated'
  and (select count(*) from public.event_teams where event_id = pg_temp.v('e1')::uuid) = 1);
select public.control_set_event_team(pg_temp.v('e1')::uuid, pg_temp.v('tb')::uuid, 'A');
select public.control_set_event_team(pg_temp.v('e1')::uuid, pg_temp.v('tc')::uuid, 'B');
select pg_temp.try('grupo inválido', format($q$select public.control_set_event_team(%L, %L, 'grupo muy largo')$q$, pg_temp.v('e1'), pg_temp.v('ta')), true, 'invalid_group');
-- El mismo equipo en otro torneo no se duplica.
insert into vars select 'e2', public.control_create_event('copa-dos', 'Copa Dos', 'America/Bogota')::text;
select pg_temp.check('un equipo participa en varios torneos', public.control_set_event_team(pg_temp.v('e2')::uuid, pg_temp.v('ta')::uuid, null) = 'added');
select public.control_remove_event_team(pg_temp.v('e2')::uuid, pg_temp.v('ta')::uuid);
select pg_temp.check('quitar equipo sin uso', not exists (select 1 from public.event_teams where event_id = pg_temp.v('e2')::uuid));

-- Partidos (hora local de Nueva York convertida a UTC: 2027-06-10 15:00 EDT = 19:00 UTC)
insert into vars select 'm1', public.control_save_match(null, pg_temp.v('e1')::uuid, pg_temp.v('sg')::uuid, 1, 'A',
  '2027-06-10T19:00:00Z', 'Estadio Uno', pg_temp.v('ta')::uuid, pg_temp.v('tb')::uuid, null, null, null)::text;
select pg_temp.check('la hora se guarda como instante UTC',
  (select starts_at from public.matches where id = pg_temp.v('m1')::uuid) = '2027-06-10 19:00:00+00'::timestamptz
  and (select (starts_at at time zone e.timezone)::text from public.matches m join public.events e on e.id = m.event_id where m.id = pg_temp.v('m1')::uuid) = '2027-06-10 15:00:00');
insert into vars select 'm2', public.control_save_match(null, pg_temp.v('e1')::uuid, pg_temp.v('sf')::uuid, 2, null,
  '2027-06-20T19:00:00Z', null, null, null, 'Ganador M1', 'Segundo del grupo B', null)::text;
insert into vars select 'm3', public.control_save_match(null, pg_temp.v('e1')::uuid, pg_temp.v('sg')::uuid, 3, 'B',
  '2027-06-12T19:00:00Z', null, pg_temp.v('tb')::uuid, pg_temp.v('tc')::uuid, null, null, null)::text;
select pg_temp.check('partido con placeholders sin equipos (llave manual)',
  (select teams_source is null and home_placeholder = 'Ganador M1' from public.matches where id = pg_temp.v('m2')::uuid));
select pg_temp.try('mismo equipo local y visitante', format($q$select public.control_save_match(null, %L, %L, 9, null, now(), null, %L, %L, null, null, null)$q$,
  pg_temp.v('e1'), pg_temp.v('sg'), pg_temp.v('ta'), pg_temp.v('ta')), true, 'same_team');
select pg_temp.try('lado sin equipo ni placeholder', format($q$select public.control_save_match(null, %L, %L, 9, null, now(), null, %L, null, null, null, null)$q$,
  pg_temp.v('e1'), pg_temp.v('sg'), pg_temp.v('ta')), true, 'side_required');
insert into vars select 'sg2', public.control_save_stage(pg_temp.v('e2')::uuid, null, 'group', 'Grupos', 1, false, 3, 1)::text;
select pg_temp.try('equipo que no pertenece al torneo', format($q$select public.control_save_match(null, %L, %L, 9, null, now(), null, %L, null, null, 'x', null)$q$,
  pg_temp.v('e2'), pg_temp.v('sg2'), pg_temp.v('ta')), true, 'team_not_in_event');
select pg_temp.try('fase de otro torneo', format($q$select public.control_save_match(null, %L, %L, 9, null, now(), null, null, null, 'a', 'b', null)$q$,
  pg_temp.v('e1'), pg_temp.v('sg2')), true, 'stage_not_in_event');
select pg_temp.try('número de partido repetido', format($q$select public.control_save_match(null, %L, %L, 1, null, now(), null, null, null, 'a', 'b', null)$q$,
  pg_temp.v('e1'), pg_temp.v('sg')), true, 'match_number_taken');
select pg_temp.try('el número de partido puede repetirse en otro torneo (numeración propia)', format($q$select public.control_save_match(null, %L, %L, 1, null, now(), null, null, null, 'a', 'b', null)$q$,
  pg_temp.v('e2'), pg_temp.v('sg2')), false);
select pg_temp.try('estado inválido en partido nuevo', format($q$select public.control_save_match(null, %L, %L, 10, null, now(), null, null, null, 'a', 'b', 'finished')$q$,
  pg_temp.v('e1'), pg_temp.v('sg')), true, 'invalid_status');
select public.control_save_match(pg_temp.v('m3')::uuid, null, pg_temp.v('sg')::uuid, 3, 'B', '2027-06-12T20:00:00Z', 'Estadio Dos',
  pg_temp.v('tb')::uuid, pg_temp.v('tc')::uuid, null, null, 'scheduled');
select pg_temp.check('programación editada', (select starts_at = '2027-06-12 20:00:00+00' and venue = 'Estadio Dos' from public.matches where id = pg_temp.v('m3')::uuid));
select pg_temp.try('quitar un equipo con partidos', format($q$select public.control_remove_event_team(%L, %L)$q$, pg_temp.v('e1'), pg_temp.v('ta')), true, 'team_in_use');

-- Borradores: invisibles para usuarios normales y visibles para el superadmin.
select pg_temp.check('superadmin ve el borrador y sus datos',
  (select count(*) from public.events where id = pg_temp.v('e1')::uuid) = 1
  and (select count(*) from public.matches where event_id = pg_temp.v('e1')::uuid) = 3
  and (select count(*) from public.event_stages where event_id = pg_temp.v('e1')::uuid) = 2
  and (select count(*) from public.event_teams where event_id = pg_temp.v('e1')::uuid) = 3
  and (select count(*) from public.teams where id = pg_temp.v('ta')::uuid) = 1);
select pg_temp.as_user('00000000-0000-4000-8000-0000000000b2');
select pg_temp.check('usuario normal NO ve el borrador',
  (select count(*) from public.events where id = pg_temp.v('e1')::uuid) = 0
  and (select count(*) from public.events where slug = 'copa-dos') = 0);
select pg_temp.check('usuario normal NO ve partidos, fases, equipos asociados ni equipos del borrador',
  (select count(*) from public.matches where event_id in (pg_temp.v('e1')::uuid, pg_temp.v('e2')::uuid)) = 0
  and (select count(*) from public.event_stages where event_id in (pg_temp.v('e1')::uuid, pg_temp.v('e2')::uuid)) = 0
  and (select count(*) from public.event_teams where event_id in (pg_temp.v('e1')::uuid, pg_temp.v('e2')::uuid)) = 0
  and (select count(*) from public.event_results where event_id in (pg_temp.v('e1')::uuid, pg_temp.v('e2')::uuid)) = 0
  and (select count(*) from public.teams where id in (pg_temp.v('ta')::uuid, pg_temp.v('tb')::uuid, pg_temp.v('tc')::uuid)) = 0);
select pg_temp.check('el torneo histórico sigue visible para usuarios normales',
  (select count(*) from public.events where slug = 'mundial-2026') = 1
  and (select count(*) from public.matches where event_id = 'daaebb9b-8e92-5644-824f-bf826114446a') = 104
  and (select count(*) from public.event_stages where event_id = 'daaebb9b-8e92-5644-824f-bf826114446a') = 7
  and (select count(*) from public.event_teams where event_id = 'daaebb9b-8e92-5644-824f-bf826114446a') = 48
  and (select count(*) from public.teams) = 48
  and (select count(*) from public.event_results) = 4);
select pg_temp.try('normal no inscribe un borrador (no se revela)', format($q$select public.add_event_to_parche('10000000-0000-4000-8000-0000000000a1', %L)$q$, pg_temp.v('e1')), true, 'not_authorized');

-- Publicación
select pg_temp.as_user('00000000-0000-4000-8000-0000000000a1');
select pg_temp.try('publicar torneo vacío: bloqueado con detalle', format($q$select public.control_publish_event(%L)$q$, pg_temp.v('e2')), true, 'publish_blocked');
select pg_temp.check('requisitos del torneo vacío', public.control_event_publish_issues(pg_temp.v('e2')::uuid) @> array['no_stages']::text[]);
select pg_temp.check('requisitos del torneo completo: ninguno', cardinality(public.control_event_publish_issues(pg_temp.v('e1')::uuid)) = 0);
select pg_temp.try('guardar marcador en un borrador', format($q$select public.control_update_match_live(%L, 'live', 1, 0, null, 0, null)$q$, pg_temp.v('m1')), true, 'event_not_published');
select pg_temp.try('inscribir borrador (superadmin sin ser miembro)', format($q$select public.add_event_to_parche('10000000-0000-4000-8000-0000000000a1', %L)$q$, pg_temp.v('e1')), true, 'not_authorized');
select public.control_publish_event(pg_temp.v('e1')::uuid);
select pg_temp.check('torneo publicado', (select status from public.events where id = pg_temp.v('e1')::uuid) = 'scheduled');
select pg_temp.try('publicar dos veces', format($q$select public.control_publish_event(%L)$q$, pg_temp.v('e1')), true, 'invalid_transition');
select pg_temp.try('cambiar slug de un torneo publicado', format($q$select public.control_update_event(%L, 'Copa de Prueba', 'otro-slug', 'America/New_York', null)$q$, pg_temp.v('e1')), true, 'slug_locked');
select public.control_update_event(pg_temp.v('e1')::uuid, 'Copa de Prueba 2027', 'copa-prueba', 'America/Bogota', '2027-07-01T00:00:00Z');
select pg_temp.check('torneo editado', (select name = 'Copa de Prueba 2027' and timezone = 'America/Bogota' from public.events where id = pg_temp.v('e1')::uuid));
select pg_temp.as_user('00000000-0000-4000-8000-0000000000b2');
select pg_temp.check('tras publicar, el usuario normal ve el torneo y sus datos',
  (select count(*) from public.events where id = pg_temp.v('e1')::uuid) = 1
  and (select count(*) from public.matches where event_id = pg_temp.v('e1')::uuid) = 3
  and (select count(*) from public.event_stages where event_id = pg_temp.v('e1')::uuid) = 2
  and (select count(*) from public.teams where id = pg_temp.v('ta')::uuid) = 1);
select pg_temp.check('el borrador restante (copa-dos) sigue oculto', (select count(*) from public.events where slug = 'copa-dos') = 0);

-- ── 3. Inscripción de torneos en parches ────────────────────────────────────
select pg_temp.as_user('00000000-0000-4000-8000-0000000000c3');
insert into vars select 'pe1', public.add_event_to_parche('10000000-0000-4000-8000-0000000000a1', pg_temp.v('e1')::uuid)::text;
select pg_temp.check('owner inscribe un torneo publicado', pg_temp.v('pe1') is not null
  and (select status from public.parche_events where id = pg_temp.v('pe1')::uuid) = 'active');
select pg_temp.try('el mismo parche no inscribe dos veces', format($q$select public.add_event_to_parche('10000000-0000-4000-8000-0000000000a1', %L)$q$, pg_temp.v('e1')), true, 'already_enrolled');
select pg_temp.as_user('00000000-0000-4000-8000-0000000000e5');
select pg_temp.try('miembro no inscribe', format($q$select public.add_event_to_parche('10000000-0000-4000-8000-0000000000a1', %L)$q$, pg_temp.v('e1')), true, 'not_authorized');
select pg_temp.as_user('00000000-0000-4000-8000-0000000000f6');
select pg_temp.try('ajeno al parche no inscribe', format($q$select public.add_event_to_parche('10000000-0000-4000-8000-0000000000a1', %L)$q$, pg_temp.v('e1')), true, 'not_authorized');
select pg_temp.try('parche inexistente', format($q$select public.add_event_to_parche(gen_random_uuid(), %L)$q$, pg_temp.v('e1')), true, 'not_authorized');
select pg_temp.as_user('00000000-0000-4000-8000-000000000007');
select pg_temp.try('admin deshabilitado no inscribe', format($q$select public.add_event_to_parche('10000000-0000-4000-8000-0000000000a1', %L)$q$, pg_temp.v('e1')), true, 'not_authorized');
select pg_temp.as_user('00000000-0000-4000-8000-0000000000f6');
insert into vars select 'pe2', public.add_event_to_parche('10000000-0000-4000-8000-0000000000a2', pg_temp.v('e1')::uuid)::text;
select pg_temp.check('otro parche inscribe el mismo torneo', pg_temp.v('pe2') is not null and pg_temp.v('pe2') <> pg_temp.v('pe1'));
select pg_temp.try('torneo histórico finalizado: no inscribible', $q$select public.add_event_to_parche('10000000-0000-4000-8000-0000000000a2', 'daaebb9b-8e92-5644-824f-bf826114446a')$q$, true, 'event_not_open');
select pg_temp.check('sin cruce de datos: cada parche solo ve su inscripción',
  (select count(*) from public.parche_events where id = pg_temp.v('pe1')::uuid) = 0
  and (select count(*) from public.parche_events where id = pg_temp.v('pe2')::uuid) = 1);
select pg_temp.as_user('00000000-0000-4000-8000-0000000000d4');
select pg_temp.check('el admin del parche ve la inscripción de su parche',
  (select count(*) from public.parche_events where id = pg_temp.v('pe1')::uuid) = 1);
select pg_temp.as_admin();
select pg_temp.check('inscripción registrada en la auditoría del parche',
  (select count(*) from public.parche_member_events where action = 'event_enrolled') = 2);

-- ── 4. Resultados: guardado directo en vivo → cierre → corrección (Fase 3.2) ──
-- Un miembro pronostica M1 y M3 (antes del inicio) para comprobar el efecto en los puntos.
select pg_temp.as_user('00000000-0000-4000-8000-0000000000e5');
insert into public.predictions (parche_event_id, event_id, match_id, user_id, home_score, away_score)
values (pg_temp.v('pe1')::uuid, pg_temp.v('e1')::uuid, pg_temp.v('m1')::uuid, '00000000-0000-4000-8000-0000000000e5', 2, 1);
insert into public.predictions (parche_event_id, event_id, match_id, user_id, home_score, away_score)
values (pg_temp.v('pe1')::uuid, pg_temp.v('e1')::uuid, pg_temp.v('m3')::uuid, '00000000-0000-4000-8000-0000000000e5', 0, 0);

select pg_temp.as_user('00000000-0000-4000-8000-0000000000a1');
select pg_temp.try('marcador fuera de rango', format($q$select public.control_update_match_live(%L, 'live', 31, 0, null, 0, null)$q$, pg_temp.v('m1')), true, 'invalid_scores');
select pg_temp.try('marcador negativo', format($q$select public.control_update_match_live(%L, 'live', -1, 0, null, 0, null)$q$, pg_temp.v('m1')), true, 'invalid_scores');
select pg_temp.try('estado no permitido en esta operación', format($q$select public.control_update_match_live(%L, 'scheduled', 0, 0, null, 0, null)$q$, pg_temp.v('m1')), true, 'invalid_status');
select pg_temp.try('partido sin equipos no admite marcador', format($q$select public.control_update_match_live(%L, 'live', 0, 0, null, 0, null)$q$, pg_temp.v('m2')), true, 'teams_required');
select pg_temp.try('empate de grupos con ganador', format($q$select public.control_update_match_live(%L, 'finished', 1, 1, 'home', 0, null)$q$, pg_temp.v('m1')), true, 'winner_not_applicable');
select pg_temp.try('ganador con marcador no empatado', format($q$select public.control_update_match_live(%L, 'finished', 2, 1, 'home', 0, null)$q$, pg_temp.v('m1')), true, 'winner_not_applicable');
select pg_temp.try('revisión desactualizada', format($q$select public.control_update_match_live(%L, 'live', 0, 0, null, 5, null)$q$, pg_temp.v('m1')), true, 'stale_revision');
create temp table audit_n0 as select count(*) c from public.control_audit_log;
grant select on audit_n0 to authenticated;
select pg_temp.check('operaciones rechazadas no dejan auditoría ni cambios',
  (select count(*) from public.control_audit_log) = (select c from audit_n0)
  and (select status = 'scheduled' and home_score is null and result_revision = 0 from public.matches where id = pg_temp.v('m1')::uuid));
select pg_temp.try('partido con pronósticos no cambia de equipos', format($q$select public.control_save_match(%L, null, %L, 3, 'B', now(), null, %L, %L, null, null, null)$q$,
  pg_temp.v('m3'), pg_temp.v('sg'), pg_temp.v('ta'), pg_temp.v('tc')), true, 'match_has_predictions');

-- Inicio manual (excepcional) sin marcador → 0-0, visible al instante para un usuario normal.
insert into vars select 's1', public.control_update_match_live(pg_temp.v('m1')::uuid, 'live', null, null, null, 0, null)::text;
select pg_temp.check('iniciar sin marcador deja 0-0 en vivo, sin confirmar, revisión 1',
  (select status = 'live' and home_score = 0 and away_score = 0 and result_confirmed_at is null and result_revision = 1 from public.matches where id = pg_temp.v('m1')::uuid) and pg_temp.v('s1') = '1');
select pg_temp.as_user('00000000-0000-4000-8000-0000000000b2');
select pg_temp.check('un usuario normal ve el marcador en vivo de inmediato', (select status = 'live' and home_score = 0 and away_score = 0 from public.matches where id = pg_temp.v('m1')::uuid));
select pg_temp.as_user('00000000-0000-4000-8000-0000000000a1');
select public.control_update_match_live(pg_temp.v('m1')::uuid, 'live', 1, 0, null, 1, null);
select public.control_update_match_live(pg_temp.v('m1')::uuid, 'live', 1, 1, null, 2, null);
select pg_temp.check('varios guardados en vivo suben la revisión', (select home_score = 1 and away_score = 1 and result_revision = 3 from public.matches where id = pg_temp.v('m1')::uuid));
select pg_temp.check('guardar el mismo marcador no cambia la revisión', public.control_update_match_live(pg_temp.v('m1')::uuid, 'live', 1, 1, null, 3, null) = 3);
select pg_temp.try('guardado obsoleto no sobrescribe', format($q$select public.control_update_match_live(%L, 'live', 2, 0, null, 1, null)$q$, pg_temp.v('m1')), true, 'stale_revision');
select public.control_update_match_live(pg_temp.v('m1')::uuid, 'live', 2, 1, 'home', 3, null);
select pg_temp.check('en vivo el ganador por penales se ignora (se define al cerrar)', (select home_score = 2 and away_score = 1 and winner_side is null and result_revision = 4 from public.matches where id = pg_temp.v('m1')::uuid));
select pg_temp.as_admin();
select pg_temp.check('en vivo no hay puntos', (select count(*) from public.predictions where match_id = pg_temp.v('m1')::uuid and points is not null) = 0);
select pg_temp.as_user('00000000-0000-4000-8000-0000000000a1');
-- Cierre: oficial + puntos (motor de la Fase 3.1)
insert into vars select 's2', public.control_update_match_live(pg_temp.v('m1')::uuid, 'finished', 2, 1, null, 4, null)::text;
select pg_temp.as_admin();
select pg_temp.check('cerrar: resultado oficial y puntos del motor (pronóstico 2-1 = exacto 3)',
  (select status = 'finished' and result_confirmed_at is not null and result_confirmed_by = '00000000-0000-4000-8000-0000000000a1' and result_revision = 5 from public.matches where id = pg_temp.v('m1')::uuid)
  and (select points = 3 and points_reason = 'exact' from public.predictions where match_id = pg_temp.v('m1')::uuid));
select pg_temp.check('auditoría del ciclo: inicio, goles, cierre',
  (select count(*) from public.control_audit_log where entity_id = pg_temp.v('m1')::uuid and action = 'match_started') = 1
  and (select count(*) from public.control_audit_log where entity_id = pg_temp.v('m1')::uuid and action = 'score_updated') = 3
  and (select count(*) from public.control_audit_log where entity_id = pg_temp.v('m1')::uuid and action = 'match_finished'
        and actor_id = '00000000-0000-4000-8000-0000000000a1' and (old_values ->> 'status') = 'live' and (new_values ->> 'confirmed') = 'true') = 1);
select pg_temp.as_user('00000000-0000-4000-8000-0000000000a1');
select pg_temp.try('corregir un finalizado exige motivo', format($q$select public.control_update_match_live(%L, 'finished', 2, 2, null, 5, '')$q$, pg_temp.v('m1')), true, 'reason_required');
select pg_temp.try('corrección sin cambios', format($q$select public.control_update_match_live(%L, 'finished', 2, 1, null, 5, 'Sin cambios reales')$q$, pg_temp.v('m1')), true, 'no_changes');
select pg_temp.try('corrección obsoleta', format($q$select public.control_update_match_live(%L, 'finished', 2, 2, null, 4, 'Error de captura del acta')$q$, pg_temp.v('m1')), true, 'stale_revision');
select pg_temp.try('un finalizado no vuelve a En vivo con el guardado ordinario (usa la reapertura)', format($q$select public.control_update_match_live(%L, 'live', 2, 1, null, 5, null)$q$, pg_temp.v('m1')), true, 'use_reopen');
select pg_temp.try('no se edita la programación de un partido oficial', format($q$select public.control_save_match(%L, null, %L, 1, 'A', now(), null, %L, %L, null, null, null)$q$,
  pg_temp.v('m1'), pg_temp.v('sg'), pg_temp.v('ta'), pg_temp.v('tb')), true, 'match_confirmed');
insert into vars select 's3', public.control_update_match_live(pg_temp.v('m1')::uuid, 'finished', 2, 2, null, 5, 'El marcador oficial fue 2-2')::text;
select pg_temp.as_admin();
select pg_temp.check('corregir recalcula (reemplaza, no acumula): 2-1 pronosticado vs 2-2 = fallo',
  (select points = 0 and points_reason = 'miss' from public.predictions where match_id = pg_temp.v('m1')::uuid)
  and (select count(*) from public.control_audit_log where action = 'result_corrected' and entity_id = pg_temp.v('m1')::uuid and reason = 'El marcador oficial fue 2-2'
        and (old_values ->> 'home_score')::int = 2 and (old_values ->> 'away_score')::int = 1 and (new_values ->> 'away_score')::int = 2) = 1);
select pg_temp.as_user('00000000-0000-4000-8000-0000000000a1');
select public.control_reopen_match(pg_temp.v('m1')::uuid, 'Reapertura de prueba del acta', 6);
select pg_temp.as_admin();
select pg_temp.check('reabrir: En vivo, sin oficial y sin puntos', (select status = 'live' and result_confirmed_at is null from public.matches where id = pg_temp.v('m1')::uuid)
  and (select count(*) from public.predictions where match_id = pg_temp.v('m1')::uuid and points is not null) = 0);
select pg_temp.as_user('00000000-0000-4000-8000-0000000000a1');
select public.control_update_match_live(pg_temp.v('m1')::uuid, 'finished', 3, 1, null, 7, null);
select pg_temp.as_admin();
select pg_temp.check('volver a finalizar recalcula con el marcador definitivo (3-1 → resultado 1)',
  (select points = 1 and points_reason = 'result' from public.predictions where match_id = pg_temp.v('m1')::uuid));
select pg_temp.as_user('00000000-0000-4000-8000-0000000000a1');

-- Eliminatorias: el ganador de la llave se guarda JUNTO al marcador (atómico)
select public.control_set_event_team(pg_temp.v('e1')::uuid, pg_temp.v('tc')::uuid, 'B');
insert into vars select 'm4', public.control_save_match(null, pg_temp.v('e1')::uuid, pg_temp.v('sf')::uuid, 4, null, '2027-06-25T19:00:00Z', null,
  pg_temp.v('ta')::uuid, pg_temp.v('tc')::uuid, null, null, null)::text;
select pg_temp.try('eliminatoria empatada sin ganador', format($q$select public.control_update_match_live(%L, 'finished', 1, 1, null, 0, null)$q$, pg_temp.v('m4')), true, 'winner_required');
select pg_temp.check('el rechazo no dejó nada a medias (ni marcador ni estado)', (select status = 'scheduled' and home_score is null and winner_side is null and result_revision = 0 from public.matches where id = pg_temp.v('m4')::uuid));
select public.control_update_match_live(pg_temp.v('m4')::uuid, 'finished', 1, 1, 'away', 0, null);
select pg_temp.check('eliminatoria empatada con ganador por penales: marcador, ganador y oficial en una operación',
  (select status = 'finished' and winner_side = 'away' and home_score = 1 and away_score = 1 and result_confirmed_at is not null from public.matches where id = pg_temp.v('m4')::uuid));
select pg_temp.as_admin();
select pg_temp.try('restricción: ganador solo con marcador empatado', format($q$update public.matches set home_score = 1, away_score = 2, winner_side = 'home' where id = %L$q$, pg_temp.v('m4')), true, '%matches_winner_only_on_tie%');
select pg_temp.as_user('00000000-0000-4000-8000-0000000000a1');

-- Marcadores pendientes del flujo anterior: se conservan y se resuelven de forma explícita (nada se publica solo)
select pg_temp.as_admin();
insert into private.match_result_drafts (match_id, home_score, away_score, revision) values (pg_temp.v('m3')::uuid, 2, 1, 1), (pg_temp.v('m2')::uuid, 0, 0, 1);
select pg_temp.as_user('00000000-0000-4000-8000-0000000000a1');
select pg_temp.check('el pendiente heredado sigue consultable solo por el superadministrador y no está en matches',
  (select count(*) from public.control_pending_results(pg_temp.v('e1')::uuid)) = 2
  and (select home_score is null and status = 'scheduled' from public.matches where id = pg_temp.v('m3')::uuid));
select pg_temp.as_user('00000000-0000-4000-8000-0000000000b2');
select pg_temp.try('un usuario normal no lee pendientes heredados', format($q$select * from public.control_pending_results(%L)$q$, pg_temp.v('e1')), true, 'not_platform_admin');
select pg_temp.try('ni los resuelve', format($q$select public.control_resolve_pending_result(%L, 1, 'apply_live')$q$, pg_temp.v('m3')), true, 'not_platform_admin');
select pg_temp.as_user('00000000-0000-4000-8000-0000000000a1');
select pg_temp.try('resolver con revisión desactualizada', format($q$select public.control_resolve_pending_result(%L, 9, 'apply_live')$q$, pg_temp.v('m3')), true, 'stale_revision');
select pg_temp.try('acción inválida', format($q$select public.control_resolve_pending_result(%L, 1, 'publicar')$q$, pg_temp.v('m3')), true, 'invalid_action');
select public.control_resolve_pending_result(pg_temp.v('m3')::uuid, 1, 'apply_live');
select pg_temp.check('aplicar un pendiente lo deja EN VIVO (no finaliza) y elimina el borrador, auditado',
  (select status = 'live' and home_score = 2 and away_score = 1 and result_confirmed_at is null from public.matches where id = pg_temp.v('m3')::uuid)
  and (select count(*) from public.control_pending_results(pg_temp.v('e1')::uuid) where match_id = pg_temp.v('m3')::uuid) = 0
  and (select count(*) from public.control_audit_log where action = 'pending_converted' and entity_id = pg_temp.v('m3')::uuid) = 1);
select public.control_resolve_pending_result(pg_temp.v('m2')::uuid, 1, 'discard');
select pg_temp.check('descartar un pendiente lo elimina sin tocar el partido, auditado',
  (select count(*) from public.control_pending_results(pg_temp.v('e1')::uuid)) = 0
  and (select count(*) from public.control_audit_log where action = 'pending_discarded' and entity_id = pg_temp.v('m2')::uuid) = 1);

-- Fases: reordenar
select pg_temp.try('mover primera fase hacia arriba: sin efecto', format($q$select public.control_move_stage(%L, %L, 'up')$q$, pg_temp.v('e1'), pg_temp.v('sg')), false);
select public.control_move_stage(pg_temp.v('e1')::uuid, pg_temp.v('sg')::uuid, 'down');
select pg_temp.check('mover fase intercambia el orden con su vecina',
  (select sort_order from public.event_stages where id = pg_temp.v('sg')::uuid) = 2 and (select sort_order from public.event_stages where id = pg_temp.v('sf')::uuid) = 1);
select pg_temp.try('dirección inválida', format($q$select public.control_move_stage(%L, %L, 'left')$q$, pg_temp.v('e1'), pg_temp.v('sg')), true, 'invalid_order');
select pg_temp.as_user('00000000-0000-4000-8000-0000000000b2');
select pg_temp.try('normal no reordena fases', format($q$select public.control_move_stage(%L, %L, 'up')$q$, pg_temp.v('e1'), pg_temp.v('sg')), true, 'not_platform_admin');
select pg_temp.as_user('00000000-0000-4000-8000-0000000000a1');

-- Estados del torneo
select pg_temp.as_user('00000000-0000-4000-8000-0000000000a1');
select pg_temp.try('finalizar con resultados sin confirmar', format($q$select public.control_set_event_status(%L, 'finished')$q$, pg_temp.v('e1')), true, 'invalid_transition');
select public.control_set_event_status(pg_temp.v('e1')::uuid, 'in_progress');
select pg_temp.try('finalizar con resultados sin confirmar (en curso)', format($q$select public.control_set_event_status(%L, 'finished')$q$, pg_temp.v('e1')), true, 'pending_results');
select pg_temp.try('no se pasa a cerrado desde Control', format($q$select public.control_set_event_status(%L, 'closed')$q$, pg_temp.v('e1')), true, 'invalid_status');
select pg_temp.try('no se despublica un torneo en curso', format($q$select public.control_set_event_status(%L, 'draft')$q$, pg_temp.v('e1')), true, 'invalid_transition');

-- ── 4b. Jornada, descripciones, escudos ────────────────────────────────────
select pg_temp.try('la firma antigua de confirmación (2 argumentos) ya no existe', format($q$select public.control_confirm_match_result(%L, 2)$q$, pg_temp.v('m1')), true, '%does not exist%');
insert into vars select 'm5', public.control_save_match(null, pg_temp.v('e1')::uuid, pg_temp.v('sg')::uuid, 5, 'A', '2027-06-15T19:00:00Z', null,
  pg_temp.v('ta')::uuid, null, null, 'Ganador del partido 4', null, 'Jornada 3')::text;
select pg_temp.check('grupo y jornada son campos independientes', (select group_code = 'A' and round_label = 'Jornada 3' from public.matches where id = pg_temp.v('m5')::uuid));
select public.control_save_match(pg_temp.v('m5')::uuid, null, pg_temp.v('sg')::uuid, 5, 'A', '2027-06-15T19:00:00Z', null,
  pg_temp.v('ta')::uuid, pg_temp.v('tb')::uuid, null, 'Ganador del partido 4', 'scheduled', 'Jornada 3');
select pg_temp.check('asignar un equipo conserva la descripción del lado visitante (no se pierde)', (select away_team_id is not null and away_placeholder = 'Ganador del partido 4' from public.matches where id = pg_temp.v('m5')::uuid));
select pg_temp.try('jornada demasiado larga', format($q$select public.control_save_match(null, %L, %L, 6, null, now(), null, null, null, 'a', 'b', null, %L)$q$, pg_temp.v('e1'), pg_temp.v('sg'), repeat('x', 41)), true, 'invalid_group');
select pg_temp.as_admin();
insert into storage.buckets (id, name, public) values ('otro-bucket', 'otro-bucket', true) on conflict do nothing;
select pg_temp.check('bucket de escudos público de lectura, 512 KB, solo png/jpeg/webp (sin SVG)',
  (select public and file_size_limit = 524288 and allowed_mime_types @> array['image/png','image/jpeg','image/webp'] and not allowed_mime_types @> array['image/svg+xml'] from storage.buckets where id = 'team-crests'));
select pg_temp.as_user('00000000-0000-4000-8000-0000000000a1');
insert into vars select 'crest_path', pg_temp.v('ta') || '/' || gen_random_uuid() || '.png';
insert into storage.objects (bucket_id, name) values ('team-crests', pg_temp.v('crest_path'));
select pg_temp.check('superadmin sube un escudo al bucket', (select count(*) from storage.objects where name = pg_temp.v('crest_path')) = 1);
select pg_temp.try('ruta de otro equipo rechazada', format($q$select public.control_set_team_crest(%L, %L)$q$, pg_temp.v('tb'), pg_temp.v('crest_path')), true, 'invalid_crest');
select pg_temp.try('ruta sin archivo rechazada', format($q$select public.control_set_team_crest(%L, %L)$q$, pg_temp.v('ta'), pg_temp.v('ta') || '/' || gen_random_uuid() || '.png'), true, 'invalid_crest');
select public.control_set_team_crest(pg_temp.v('ta')::uuid, pg_temp.v('crest_path'));
select pg_temp.check('escudo asociado al equipo global y auditado', (select crest_path = pg_temp.v('crest_path') from public.teams where id = pg_temp.v('ta')::uuid)
  and exists (select 1 from public.control_audit_log where action = 'team_crest_changed' and entity_id = pg_temp.v('ta')::uuid));
select pg_temp.as_user('00000000-0000-4000-8000-0000000000b2');
select pg_temp.try('NORMAL no sube escudos', format($q$insert into storage.objects (bucket_id, name) values ('team-crests', %L)$q$, pg_temp.v('tb') || '/' || gen_random_uuid() || '.png'), true, '%row-level security%');
select pg_temp.check('NORMAL no lista los objetos del bucket', (select count(*) from storage.objects where bucket_id = 'team-crests') = 0);
select pg_temp.try('NORMAL no asocia escudos', format($q$select public.control_set_team_crest(%L, null)$q$, pg_temp.v('ta')), true, 'not_platform_admin');
select pg_temp.as_user('00000000-0000-4000-8000-0000000000c3');
select pg_temp.try('OWNER de parche no sube escudos', format($q$insert into storage.objects (bucket_id, name) values ('team-crests', %L)$q$, pg_temp.v('tb') || '/' || gen_random_uuid() || '.png'), true, '%row-level security%');
select pg_temp.as_admin();
select pg_temp.try('ruta de escudo con formato inválido (CHECK)', format($q$update public.teams set crest_path = '../../x.png' where id = %L$q$, pg_temp.v('ta')), true, '%teams_crest_path_check%');
select pg_temp.try('SVG rechazado por el CHECK de la ruta', format($q$update public.teams set crest_path = %L where id = %L$q$, pg_temp.v('ta') || '/' || gen_random_uuid() || '.svg', pg_temp.v('ta')), true, '%teams_crest_path_check%');
select pg_temp.as_user('00000000-0000-4000-8000-0000000000a1');
select public.control_set_team_crest(pg_temp.v('ta')::uuid, null);
select pg_temp.check('quitar el escudo deja el equipo sin escudo (fallback a iniciales)', (select crest_path is null from public.teams where id = pg_temp.v('ta')::uuid));
select pg_temp.try('histórico: no se cambia el escudo de un equipo del Mundial', format($q$select public.control_set_team_crest(%L, null)$q$, (select team_id from public.event_teams where event_id = 'daaebb9b-8e92-5644-824f-bf826114446a' limit 1)), true, 'team_in_locked_event');

-- ── 5. Auditoría ────────────────────────────────────────────────────────────
select pg_temp.check('la auditoría cubre torneo, fases, equipos, partidos y resultados',
  (select count(distinct entity_type) from public.control_audit_log) >= 5
  and (select count(*) from public.control_audit_log where action in ('event_created', 'event_published', 'stage_created', 'team_created', 'match_created', 'match_started', 'score_updated', 'match_finished', 'result_corrected')) >= 8);
select pg_temp.as_user('00000000-0000-4000-8000-0000000000b2');
select pg_temp.check('usuario normal no lee la auditoría', (select count(*) from public.control_audit_log) = 0);
select pg_temp.as_user('00000000-0000-4000-8000-0000000000c3');
select pg_temp.check('owner de parche no lee la auditoría', (select count(*) from public.control_audit_log) = 0);
select pg_temp.as_user('00000000-0000-4000-8000-0000000000a1');
select pg_temp.check('superadmin lee la auditoría', (select count(*) from public.control_audit_log) > 0);
select pg_temp.try('superadmin no modifica la auditoría', $q$update public.control_audit_log set reason = 'x'$q$, true, 'permission denied%');
select pg_temp.as_admin();
select pg_temp.try('ni siquiera el dueño modifica la auditoría', $q$update public.control_audit_log set reason = 'x'$q$, true, 'audit_log_immutable');
select pg_temp.try('ni siquiera el dueño borra la auditoría', $q$delete from public.control_audit_log$q$, true, 'audit_log_immutable');
select pg_temp.try('ni siquiera el dueño vacía la auditoría', $q$truncate public.control_audit_log$q$, true, 'audit_log_immutable');

-- ── 6. Torneo histórico intacto ─────────────────────────────────────────────
select pg_temp.as_user('00000000-0000-4000-8000-0000000000a1');
select pg_temp.try('histórico: no se edita el torneo', $q$select public.control_update_event('daaebb9b-8e92-5644-824f-bf826114446a', 'Otro', 'mundial-2026', 'America/Bogota', null)$q$, true, 'event_locked_history');
select pg_temp.try('histórico: no se registra resultado', format($q$select public.control_update_match_live(%L, 'live', 1, 0, null, 0, null)$q$,
  (select id from public.matches where event_id = 'daaebb9b-8e92-5644-824f-bf826114446a' limit 1)), true, 'event_locked_history');
select pg_temp.try('histórico: no se confirma resultado', format($q$select public.control_update_match_live(%L, 'finished', 1, 0, null, 0, null)$q$,
  (select id from public.matches where event_id = 'daaebb9b-8e92-5644-824f-bf826114446a' limit 1)), true, 'event_locked_history');
select pg_temp.try('histórico: no se crean partidos', format($q$select public.control_save_match(null, 'daaebb9b-8e92-5644-824f-bf826114446a', %L, 999, null, now(), null, null, null, 'a', 'b', null)$q$,
  (select id from public.event_stages where event_id = 'daaebb9b-8e92-5644-824f-bf826114446a' limit 1)), true, 'event_locked_history');
select pg_temp.try('histórico: no se editan fases', format($q$select public.control_save_stage('daaebb9b-8e92-5644-824f-bf826114446a', %L, 'group', 'X', 1, false, 9, 9)$q$,
  (select id from public.event_stages where event_id = 'daaebb9b-8e92-5644-824f-bf826114446a' and code = 'group')), true, 'event_locked_history');
select pg_temp.try('histórico: no se quitan equipos', format($q$select public.control_remove_event_team('daaebb9b-8e92-5644-824f-bf826114446a', %L)$q$,
  (select team_id from public.event_teams where event_id = 'daaebb9b-8e92-5644-824f-bf826114446a' limit 1)), true, 'event_locked_history');
select pg_temp.try('histórico: no se renombran sus equipos', format($q$select public.control_save_team(%L, 'Nombre cambiado', null, 'national', null)$q$,
  (select team_id from public.event_teams where event_id = 'daaebb9b-8e92-5644-824f-bf826114446a' limit 1)), true, 'team_in_locked_event');
select pg_temp.as_admin();
select pg_temp.check('histórico intacto: partidos (104, sin confirmar, revisión 0), equipos, fases, torneo, resultados y parche_events idénticos',
  (select md5(string_agg(m::text, '|' order by m.id)) from public.matches m where m.event_id = 'daaebb9b-8e92-5644-824f-bf826114446a') = (select matches from hist_before)
  and (select count(*) from public.matches where event_id = 'daaebb9b-8e92-5644-824f-bf826114446a' and result_confirmed_at is null and result_revision = 0 and status = 'finished') = 104
  and (select md5(string_agg(t::text, '|' order by t.id)) from public.teams t where t.id in (select team_id from public.event_teams where event_id = 'daaebb9b-8e92-5644-824f-bf826114446a')) = (select teams from hist_before)
  and (select md5(string_agg(s::text, '|' order by s.id)) from public.event_stages s where s.event_id = 'daaebb9b-8e92-5644-824f-bf826114446a') = (select stages from hist_before)
  and (select md5(string_agg(e::text, '|' order by e.id)) from public.events e where e.id = 'daaebb9b-8e92-5644-824f-bf826114446a') = (select events from hist_before)
  and (select md5(string_agg(r::text, '|' order by r.event_id, r.result_key)) from public.event_results r) = (select results from hist_before)
  and (select md5(string_agg(et::text, '|' order by et.team_id)) from public.event_teams et where et.event_id = 'daaebb9b-8e92-5644-824f-bf826114446a') = (select event_teams from hist_before));
select pg_temp.check('histórico intacto: fotografía sellada, membresías y la inscripción original',
  (select rows_checksum from public.standing_snapshots limit 1) = (select checksum from hist_before)
  and (select bool_and(private.verify_standing_snapshot(id)) from public.standing_snapshots)
  and (select count(*) from public.parche_members where parche_id = '91ad5d8d-414c-4e74-bf57-2ca476652de0') = 18
  and (select md5(string_agg(pe::text, '|' order by pe.id)) from public.parche_events pe where pe.event_id = 'daaebb9b-8e92-5644-824f-bf826114446a')
      = (select md5(string_agg(pe::text, '|' order by pe.id)) from public.parche_events pe where pe.id in (select id from public.parche_events where event_id = 'daaebb9b-8e92-5644-824f-bf826114446a')));

select n, case when ok then 'OK' else 'FALLO' end as resultado, name, detail from results order by n;
select count(*) filter (where ok) as ok, count(*) filter (where not ok) as fallos from results;
rollback;
