-- Gestión de parches en el destino real: SOLO operaciones que deben ser rechazadas o lecturas.
-- No crea parches, invitaciones ni membresías (ninguna escritura llega a efectuarse) y termina en ROLLBACK.
-- No toca auth.*: simula identidades con request.jwt.claims.
--   npx supabase db query --linked -f scripts/history-migration/tests/remote_parches_readonly_test.sql
begin;
create temp table results (n serial, name text, ok boolean, detail text);
grant insert, select on results to authenticated, anon;
grant usage on sequence results_n_seq to authenticated, anon;
create temp table ids as select
  (select id from public.parches where id = '91ad5d8d-414c-4e74-bf57-2ca476652de0') as parche,
  (select user_id from public.parche_members where parche_id = '91ad5d8d-414c-4e74-bf57-2ca476652de0' and role = 'member' and status = 'active' limit 1) as member,
  (select user_id from public.parche_members where parche_id = '91ad5d8d-414c-4e74-bf57-2ca476652de0' and role = 'owner') as owner,
  '00000000-0000-4000-8000-0000000000ff'::uuid as outsider;
grant select on ids to authenticated, anon;
create temp table before as select * from public.parche_members;
create temp table counts_before as select (select count(*) from public.parche_invitations) inv, (select count(*) from public.parche_member_events) ev;

create function pg_temp.as_user(p uuid) returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;
create function pg_temp.check(p_name text, p_ok boolean) returns void language sql as $$
  insert into results (name, ok) values (p_name, coalesce(p_ok, false));
$$;
create function pg_temp.denied(p_name text, p_sql text, p_error_like text) returns void language plpgsql as $$
begin
  begin
    execute p_sql;
    insert into results (name, ok, detail) values (p_name, false, 'NO fue rechazado');
  exception when others then
    insert into results (name, ok, detail) values (p_name, sqlerrm like p_error_like, sqlerrm);
  end;
end $$;
grant execute on all functions in schema pg_temp to authenticated, anon;

select pg_temp.as_user((select member from ids));
select pg_temp.check('miembro ve los 18 participantes, sin correos',
  (select count(*) from public.get_parche_members((select parche from ids))) = 18
  and not exists (select 1 from public.get_parche_members((select parche from ids)) where display_name like '%@%'));
select pg_temp.check('el creador aparece como owner', (select count(*) from public.get_parche_members((select parche from ids)) where role = 'owner') = 1);
select pg_temp.denied('miembro no invita', $q$select * from public.create_parche_invitation((select parche from ids))$q$, 'not_authorized');
select pg_temp.denied('miembro no se hace admin', $q$select public.set_parche_member_role((select parche from ids), (select member from ids), 'admin')$q$, 'not_authorized');
select pg_temp.denied('miembro no deshabilita al creador', $q$select public.set_parche_member_status((select parche from ids), (select owner from ids), 'disabled')$q$, 'not_authorized');
select pg_temp.denied('miembro no modifica membresías por UPDATE', $q$update public.parche_members set role = 'admin'$q$, 'permission denied%');
select pg_temp.denied('miembro no lee invitaciones de un parche donde no administra', $q$select token_hash from public.parche_invitations$q$, 'permission denied%');
select pg_temp.check('miembro no ve invitaciones (RLS)', (select count(*) from public.parche_invitations) = 0);

select pg_temp.as_user((select owner from ids));
select pg_temp.denied('el creador no puede salir', $q$select public.leave_parche((select parche from ids))$q$, 'owner_cannot_leave');
select pg_temp.denied('el creador no cambia su propio rol', $q$select public.set_parche_member_role((select parche from ids), (select owner from ids), 'member')$q$, 'cannot_change_self');

select pg_temp.as_user((select outsider from ids));
select pg_temp.check('ajeno no ve participantes', (select count(*) from public.get_parche_members((select parche from ids))) = 0);
select pg_temp.denied('ajeno no administra', $q$select public.set_parche_member_status((select parche from ids), (select member from ids), 'disabled')$q$, 'not_authorized');
select pg_temp.denied('ajeno no invita', $q$select * from public.create_parche_invitation((select parche from ids))$q$, 'not_authorized');
select pg_temp.check('token inventado → not_found', (select status from public.get_parche_invitation('AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA')) = 'not_found');
select pg_temp.check('aceptar token inventado → not_found', (select status from public.accept_parche_invitation('AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA')) = 'not_found');
select pg_temp.denied('ajeno no lee la auditoría', $q$select * from public.parche_member_events$q$, 'permission denied%');

do $$ begin execute 'reset role'; execute 'set local role anon'; end $$;
select pg_temp.denied('anon no ejecuta create_parche', $q$select public.create_parche('x', gen_random_uuid())$q$, 'permission denied%');
select pg_temp.denied('anon no consulta invitaciones', $q$select * from public.get_parche_invitation('AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA')$q$, 'permission denied%');

do $$ begin execute 'reset role'; end $$;
select pg_temp.check('membresías intactas', (select count(*) from (select * from before except select * from public.parche_members) x) = 0
  and (select count(*) from public.parche_members) = (select count(*) from before));
select pg_temp.check('sin invitaciones ni eventos creados por la prueba',
  (select count(*) from public.parche_invitations) = (select inv from counts_before)
  and (select count(*) from public.parche_member_events) = (select ev from counts_before));

select json_agg(json_build_object('ok', ok, 'name', name, 'detail', detail) order by n) as results,
       count(*) filter (where ok) as ok, count(*) filter (where not ok) as fallos from results;
rollback;
