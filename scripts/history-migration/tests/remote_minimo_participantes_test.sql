-- Mínimo de 2 participantes activos para inscribir un parche en un torneo (proyecto REAL, TODO dentro de una
-- transacción con ROLLBACK: no deja datos). Identidades simuladas con claims JWT (no toca auth.*).
-- Ensayo previo a aplicar: el script de ejecución antepone el contenido de la migración 20261105100000 dentro de la
-- misma transacción; con la migración ya aplicada se ejecuta tal cual.
--   npx supabase db query --linked --yes -f scripts/history-migration/tests/remote_minimo_participantes_test.sql
begin;
-- @@MIGRATION@@
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
  (select count(*) from public.parche_events) pe_n, (select count(*) from public.parche_members) pm_n,
  (select count(*) from public.standing_snapshot_rows) ssr_n, (select count(*) from public.predictions) p_n;
insert into vars select 'sa', '95d77e57-b6cb-4359-bc86-e70b3b9f44dd';
insert into vars select 'player', user_id::text from public.parche_members where parche_id = (select id from public.parches where name = 'ParchePrueba1') and role in ('owner','admin') and status='active' and user_id not in (select user_id from private.platform_admins) limit 1;
insert into vars select 'friend', user_id::text from public.parche_members where role = 'member' and status='active' and parche_id = (select id from public.parches where name = 'La Penúltima') limit 1;

-- Dos torneos de ensayo publicados (sin equipos ni partidos: inscripción anticipada).
select pg_temp.as_user(pg_temp.v('sa')::uuid);
select pg_temp.try('torneo 1', $q$insert into vars select 'ev1', public.control_create_event('ensayo-min-1','Ensayo mínimo 1','America/Bogota')::text$q$, false);
select pg_temp.try('torneo 2', $q$insert into vars select 'ev2', public.control_create_event('ensayo-min-2','Ensayo mínimo 2','America/Bogota')::text$q$, false);
select pg_temp.try('fase 1', format($q$select public.control_save_stage(%L,null,'liga','Liga',1,false,3,1)$q$, pg_temp.v('ev1')), false);
select pg_temp.try('fase 2', format($q$select public.control_save_stage(%L,null,'liga','Liga',1,false,3,1)$q$, pg_temp.v('ev2')), false);
select pg_temp.try('publicar 1', format($q$select public.control_publish_event(%L)$q$, pg_temp.v('ev1')), false);
select pg_temp.try('publicar 2', format($q$select public.control_publish_event(%L)$q$, pg_temp.v('ev2')), false);

-- Parche nuevo con solo su creador.
select pg_temp.as_user(pg_temp.v('player')::uuid);
select pg_temp.try('crear parche de ensayo', $q$insert into vars select 'p', public.create_parche('Parche ensayo mínimo', gen_random_uuid())::text$q$, false);
select pg_temp.try('1 participante: no puede inscribirse', format($q$select public.add_event_to_parche(%L,%L)$q$, pg_temp.v('p'), pg_temp.v('ev1')), true, 'min_members');
select pg_temp.try('crear invitación (pendiente)', format($q$insert into vars select 'tok', token from public.create_parche_invitation(%L)$q$, pg_temp.v('p')), false);
select pg_temp.try('1 participante + invitación pendiente: no puede inscribirse', format($q$select public.add_event_to_parche(%L,%L)$q$, pg_temp.v('p'), pg_temp.v('ev1')), true, 'min_members');
select pg_temp.as_admin();
select pg_temp.check('no se inscribió nada', (select count(*) from public.parche_events where parche_id = pg_temp.v('p')::uuid) = 0);

-- Un amigo acepta: ya son 2 activos.
select pg_temp.as_user(pg_temp.v('friend')::uuid);
select pg_temp.try('el amigo acepta la invitación', format($q$select public.accept_parche_invitation(%L)$q$, pg_temp.v('tok')), false);
select pg_temp.as_user(pg_temp.v('player')::uuid);
select pg_temp.try('2 participantes activos: puede inscribirse', format($q$insert into vars select 'pe', public.add_event_to_parche(%L,%L)::text$q$, pg_temp.v('p'), pg_temp.v('ev1')), false);
select pg_temp.try('sigue rechazando una segunda inscripción repetida con already_enrolled', format($q$select public.add_event_to_parche(%L,%L)$q$, pg_temp.v('p'), pg_temp.v('ev1')), true, 'already_enrolled');

-- Un deshabilitado no cuenta: vuelve a haber 1 activo → no se inscribe en otro torneo; lo ya inscrito se conserva.
select pg_temp.try('deshabilitar al amigo', format($q$select public.set_parche_member_status(%L,%L,'disabled')$q$, pg_temp.v('p'), pg_temp.v('friend')), false);
select pg_temp.try('con 1 activo y 1 deshabilitado: no puede inscribirse', format($q$select public.add_event_to_parche(%L,%L)$q$, pg_temp.v('p'), pg_temp.v('ev2')), true, 'min_members');
select pg_temp.as_admin();
select pg_temp.check('la inscripción previa se conserva', (select count(*) from public.parche_events where parche_id = pg_temp.v('p')::uuid) = 1);
select pg_temp.as_user(pg_temp.v('player')::uuid);
select pg_temp.try('reactivar al amigo', format($q$select public.set_parche_member_status(%L,%L,'active')$q$, pg_temp.v('p'), pg_temp.v('friend')), false);
select pg_temp.try('reactivado: puede inscribirse en otro torneo', format($q$select public.add_event_to_parche(%L,%L)$q$, pg_temp.v('p'), pg_temp.v('ev2')), false);

-- Permisos intactos y datos históricos sin cambios.
select pg_temp.as_user(pg_temp.v('friend')::uuid);
select pg_temp.try('un miembro normal sigue sin poder inscribir', format($q$select public.add_event_to_parche(%L,%L)$q$, pg_temp.v('p'), pg_temp.v('ev2')), true, '%');
select pg_temp.as_admin();
select pg_temp.check('históricos intactos', (select count(*) from public.matches m join public.events e on e.id=m.event_id where e.slug='mundial-2026') = 104
  and (select ssr_n from before_fp) = (select count(*) from public.standing_snapshot_rows)
  and (select p_n from before_fp) = (select count(*) from public.predictions));
select count(*) filter (where ok) || '/' || count(*) as passed, string_agg(case when not ok then name || ' [' || coalesce(detail, '') || ']' end, ' | ') as fallos from results;
rollback;
