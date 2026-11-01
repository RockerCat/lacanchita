-- Portada pública (torneos destacados) contra el proyecto REAL, TODO dentro
-- de una transacción con ROLLBACK: no deja datos. Identidades simuladas con claims JWT (no toca auth.*).
-- Jugador = el administrador NO superadministrador de ParchePrueba1; ajeno = un miembro de La Penúltima.
-- Requiere la migración 20261101100000 aplicada (para ensayarla antes: cat la migración + este archivo, sin su "begin;").
--   npx supabase db query --linked -f scripts/history-migration/tests/remote_portada_test.sql
begin;
do $$ begin
  if not exists (select 1 from public.events where slug = 'mundial-2026') then raise exception 'proyecto_inesperado'; end if;
  if not exists (select 1 from public.events where slug = 'qa-jugador') then raise exception 'falta_qa_jugador'; end if;
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

insert into vars select 'sa', '95d77e57-b6cb-4359-bc86-e70b3b9f44dd';

create function pg_temp.as_anon() returns void language plpgsql as $$
begin execute 'reset role'; perform set_config('request.jwt.claims', '', true); execute 'set local role anon'; end $$;
grant execute on function pg_temp.as_anon() to anon, authenticated;
insert into vars select 'qa', id::text from public.events where slug = 'qa-jugador';
insert into vars select 'copa', id::text from public.events where slug = 'copa-de-prueba';
insert into vars select 'wc', id::text from public.events where slug = 'mundial-2026';
insert into vars select 'player', user_id::text from public.parche_members where role = 'admin' and status = 'active' and user_id not in (select user_id from private.platform_admins) limit 1;
create temp table before_fp as select
  (select string_agg(id::text || status, ',' order by id) from public.events) events_fp,
  (select count(*) from public.matches) matches_n;

-- El estado real puede tener torneos autorizados por el superadministrador: el ensayo parte de cero (se revierte).
update public.events set landing_visible = false;
update public.landing_settings set featured_event_id = null;
select pg_temp.check('sin autorizaciones ningún torneo es visible en la portada (QA, Copa de prueba y Mundial incluidos)',
  (select count(*) from public.events where landing_visible) = 0);
select pg_temp.as_anon();
select pg_temp.check('anónimo: la lista pública está vacía mientras nadie autorice torneos', (select count(*) from public.get_landing_tournaments()) = 0);
select pg_temp.try('anónimo: no lee torneos ni la configuración', 'select count(*) from public.events', true, '%permission denied%');
select pg_temp.try('anónimo: no lee landing_settings', 'select * from public.landing_settings', true, '%permission denied%');
select pg_temp.try('anónimo: no puede destacar ni mostrar torneos', format('select public.control_set_landing_visible(%L::uuid, true)', pg_temp.v('qa')), true, '%permission denied%');

select pg_temp.as_user(pg_temp.v('player')::uuid);
select pg_temp.try('usuario normal: no puede mostrar un torneo', format('select public.control_set_landing_visible(%L::uuid, true)', pg_temp.v('qa')), true, '%not_platform_admin%');
select pg_temp.try('usuario normal: no puede destacar', format('select public.control_set_featured_event(%L::uuid)', pg_temp.v('qa')), true, '%not_platform_admin%');
select pg_temp.try('usuario normal: no lee el destacado administrativo', 'select public.control_landing_featured()', true, '%not_platform_admin%');
select pg_temp.try('usuario normal: no lee landing_settings', 'select * from public.landing_settings', true, '%permission denied%');

select pg_temp.as_user(pg_temp.v('sa')::uuid);
select pg_temp.try('superadmin: autoriza el torneo de prueba para ensayar', format('select public.control_set_landing_visible(%L::uuid, true)', pg_temp.v('qa')), false);
select pg_temp.try('superadmin: un borrador/finalizado no se puede mostrar (Mundial)', format('select public.control_set_landing_visible(%L::uuid, true)', pg_temp.v('wc')), true, '%event_not_published%');
select pg_temp.try('superadmin: no se destaca un torneo no autorizado (Copa de prueba)', format('select public.control_set_featured_event(%L::uuid)', pg_temp.v('copa')), true, '%event_not_visible%');
select pg_temp.as_anon();
select pg_temp.check('anónimo: ve solo el torneo autorizado, con campos mínimos y sin destacado manual',
  (select count(*) from public.get_landing_tournaments()) = 1
  and (select slug from public.get_landing_tournaments()) = 'qa-jugador'
  and (select is_manual from public.get_landing_tournaments()) = false
  and (select first_match_at is not null and next_match_at is not null from public.get_landing_tournaments()));
select pg_temp.check('la proyección pública no incluye identificadores internos ni datos de parches',
  (select array_agg(attname::text order by attnum) from pg_attribute where attrelid = 'public.get_landing_tournaments'::regproc::oid and false) is null
  and (select pg_get_function_result('public.get_landing_tournaments'::regproc)) !~* '(parche|user|email|invit|prediction|\mid\M)');
select pg_temp.as_user(pg_temp.v('sa')::uuid);
select pg_temp.try('superadmin: destaca el torneo autorizado', format('select public.control_set_featured_event(%L::uuid)', pg_temp.v('qa')), false);
select pg_temp.check('superadmin: lee su destacado', public.control_landing_featured() = pg_temp.v('qa')::uuid);
select pg_temp.as_anon();
select pg_temp.check('anónimo: el torneo aparece marcado como destacado manual', (select is_manual from public.get_landing_tournaments()));

-- Cambio de disponibilidad: el torneo deja de aceptar participantes → desaparece, pero la preferencia se conserva.
select pg_temp.as_admin();
update public.events set status = 'finished' where id = pg_temp.v('qa')::uuid;
select pg_temp.as_anon();
select pg_temp.check('torneo finalizado: no se ofrece en la portada', (select count(*) from public.get_landing_tournaments()) = 0);
select pg_temp.as_admin();
select pg_temp.check('la preferencia del destacado se conserva aunque el torneo ya no sea elegible', (select featured_event_id from public.landing_settings) = pg_temp.v('qa')::uuid);
update public.events set status = 'scheduled' where id = pg_temp.v('qa')::uuid;
update public.events set landing_visible = false where id = pg_temp.v('qa')::uuid;
select pg_temp.as_anon();
select pg_temp.check('torneo des-autorizado: tampoco se muestra', (select count(*) from public.get_landing_tournaments()) = 0);

-- Histórico sellado y torneos no publicados nunca aparecen, aunque alguien los marque directamente.
select pg_temp.as_admin();
update public.events set landing_visible = true where id in (pg_temp.v('wc')::uuid, pg_temp.v('copa')::uuid);
select pg_temp.as_anon();
select pg_temp.check('Mundial (finalizado y sellado) y Copa de prueba (borrador) no aparecen aunque estén marcados', (select count(*) from public.get_landing_tournaments()) = 0);

select pg_temp.as_user(pg_temp.v('sa')::uuid);
select pg_temp.try('superadmin: quitar el destacado vuelve al modo automático', 'select public.control_set_featured_event(null)', false);
select pg_temp.as_admin();
select pg_temp.check('modo automático: sin destacado manual', (select featured_event_id from public.landing_settings) is null);
select pg_temp.check('las operaciones quedaron auditadas', (select count(*) from public.control_audit_log where action in ('landing_visibility_changed', 'landing_featured_changed')) >= 3);
select pg_temp.check('torneos y partidos intactos (salvo el ensayo revertido)', (select matches_n from before_fp) = (select count(*) from public.matches));

select pg_temp.as_admin();
update public.events set landing_visible = true where slug = 'qa-jugador';
select pg_temp.as_anon();
select pg_temp.check('la proyección trae la zona horaria del torneo', (select timezone from public.get_landing_tournaments() where slug='qa-jugador') = 'America/Bogota');
select count(*) filter (where ok) || '/' || count(*) as passed, string_agg(case when not ok then name || ' [' || coalesce(detail, '') || ']' end, ' | ') as fallos from results;
rollback;
