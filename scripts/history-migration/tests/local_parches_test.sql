-- Pruebas de gestión de parches, participantes e invitaciones (migración 20261029240000).
-- SOLO Postgres local desechable (cluster_name = lacanchita-local-test) con stub + todas las migraciones.
-- Usuarios y parches FICTICIOS; todo termina en ROLLBACK.
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

-- A: creador. B: invitado. C: invitado. D: ajeno. E: sin parches.
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-4000-8000-0000000000a1', 'ana@ejemplo.test', '{"username": "Ana"}'),
  ('00000000-0000-4000-8000-0000000000b2', 'beto@ejemplo.test', '{"username": "Beto"}'),
  ('00000000-0000-4000-8000-0000000000c3', 'caro@ejemplo.test', '{}'),
  ('00000000-0000-4000-8000-0000000000d4', 'dani@ejemplo.test', '{"username": "Dani"}'),
  ('00000000-0000-4000-8000-0000000000e5', 'eli@ejemplo.test', '{"username": "Eli"}');
create temp table hist_before as select * from public.parche_members;

-- ── Crear parche ─────────────────────────────────────────────────────────────
select pg_temp.as_user('00000000-0000-4000-8000-0000000000a1');
insert into vars select 'p1', public.create_parche('  Los del barrio  ', '11111111-1111-4111-8111-111111111111')::text;
select pg_temp.check('crear parche devuelve id', pg_temp.v('p1') is not null);
select pg_temp.check('reintento con el mismo request_id devuelve el mismo parche',
  public.create_parche('Los del barrio', '11111111-1111-4111-8111-111111111111')::text = pg_temp.v('p1'));
select pg_temp.check('una sola fila y nombre recortado',
  (select count(*) from public.parches where name = 'Los del barrio') = 1);
select pg_temp.check('creador queda como owner activo (atómico)',
  (select role || '/' || status from public.parche_members where parche_id = pg_temp.v('p1')::uuid
   and user_id = '00000000-0000-4000-8000-0000000000a1') = 'owner/active');
select pg_temp.check('created_by es el usuario autenticado',
  (select created_by from public.parches where id = pg_temp.v('p1')::uuid) = '00000000-0000-4000-8000-0000000000a1');
insert into vars select 'p2', public.create_parche('Oficina', '22222222-2222-4222-8222-222222222222')::text;
select pg_temp.check('un usuario puede crear y pertenecer a varios parches',
  (select count(*) from public.parche_members where user_id = '00000000-0000-4000-8000-0000000000a1'
   and parche_id in (pg_temp.v('p1')::uuid, pg_temp.v('p2')::uuid)) = 2);
select pg_temp.try('nombre demasiado corto', $q$select public.create_parche(' x ', gen_random_uuid())$q$, true, 'invalid_name');
select pg_temp.try('sin request_id', $q$select public.create_parche('Válido', null)$q$, true, 'invalid_request');
select pg_temp.try('no se inserta directamente un parche', $q$insert into public.parches (name) values ('Directo')$q$, true);
select pg_temp.try('no se cambia el creador', $q$update public.parches set created_by = '00000000-0000-4000-8000-0000000000d4'$q$, true);
select pg_temp.try('no se insertan membresías directamente',
  $q$insert into public.parche_members (parche_id, user_id, role) select id, '00000000-0000-4000-8000-0000000000d4', 'admin' from public.parches limit 1$q$, true);

-- ── Invitaciones ─────────────────────────────────────────────────────────────
insert into vars select 'tok1', token from public.create_parche_invitation(pg_temp.v('p1')::uuid);
select pg_temp.check('token de 43 caracteres base64url', pg_temp.v('tok1') ~ '^[A-Za-z0-9_-]{43}$');
select pg_temp.check('admin ve el estado del enlace', (select count(*) from public.parche_invitations where revoked_at is null and parche_id = pg_temp.v('p1')::uuid) = 1);
select pg_temp.try('admin no lee el hash del token', $q$select token_hash from public.parche_invitations$q$, true, 'permission denied%');

select pg_temp.as_user('00000000-0000-4000-8000-0000000000b2');
select pg_temp.check('B no ve el parche antes de unirse', (select count(*) from public.parches where id = pg_temp.v('p1')::uuid) = 0);
select pg_temp.check('B no ve el enlace de un parche ajeno', (select count(*) from public.parche_invitations) = 0);
select pg_temp.check('vista previa válida revela solo el nombre',
  (select status || '|' || coalesce(parche_id::text, '∅') || '|' || parche_name from public.get_parche_invitation(pg_temp.v('tok1')))
  = 'valid|∅|Los del barrio');
select pg_temp.check('token inexistente → not_found',
  (select status from public.get_parche_invitation('AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA')) = 'not_found');
select pg_temp.check('token con formato inválido → not_found', (select status from public.get_parche_invitation('x'' or 1=1 --')) = 'not_found');
select pg_temp.check('B acepta → joined',
  (select status || '|' || parche_id from public.accept_parche_invitation(pg_temp.v('tok1'))) = 'joined|' || pg_temp.v('p1'));
select pg_temp.check('B acepta otra vez → already_member (sin duplicar)',
  (select status from public.accept_parche_invitation(pg_temp.v('tok1'))) = 'already_member'
  and (select count(*) from public.parche_members where parche_id = pg_temp.v('p1')::uuid and user_id = '00000000-0000-4000-8000-0000000000b2') = 1);
select pg_temp.check('B queda como member activo', (select role || '/' || status from public.parche_members
  where parche_id = pg_temp.v('p1')::uuid and user_id = '00000000-0000-4000-8000-0000000000b2') = 'member/active');
select pg_temp.check('vista previa para miembro → already_member con id', (select status from public.get_parche_invitation(pg_temp.v('tok1'))) = 'already_member');
select pg_temp.check('B ve ahora los participantes con nombres, sin correos',
  (select count(*) from public.get_parche_members(pg_temp.v('p1')::uuid)) = 2
  and not exists (select 1 from public.get_parche_members(pg_temp.v('p1')::uuid) where display_name like '%@%'));
select pg_temp.try('B (member) no puede invitar', $q$select * from public.create_parche_invitation(pg_temp.v('p1')::uuid)$q$, true, 'not_authorized');
select pg_temp.try('B no se hace admin a sí mismo',
  $q$select public.set_parche_member_role(pg_temp.v('p1')::uuid, '00000000-0000-4000-8000-0000000000b2', 'admin')$q$, true, 'not_authorized');
select pg_temp.try('B no deshabilita al creador',
  $q$select public.set_parche_member_status(pg_temp.v('p1')::uuid, '00000000-0000-4000-8000-0000000000a1', 'disabled')$q$, true, 'not_authorized');
select pg_temp.try('B no cambia su rol por UPDATE directo', $q$update public.parche_members set role = 'owner'$q$, true);

select pg_temp.as_user('00000000-0000-4000-8000-0000000000c3');
select pg_temp.check('C se une con el mismo enlace (varios usos)', (select status from public.accept_parche_invitation(pg_temp.v('tok1'))) = 'joined');
select pg_temp.check('nombre sin username → prefijo del correo',
  exists (select 1 from public.get_parche_members(pg_temp.v('p1')::uuid) where display_name = 'caro'));

select pg_temp.as_admin();
select pg_temp.check('use_count = 2 (los reintentos no cuentan)',
  (select use_count from public.parche_invitations where parche_id = pg_temp.v('p1')::uuid and revoked_at is null) = 2);

-- ── Administración de miembros ───────────────────────────────────────────────
select pg_temp.as_user('00000000-0000-4000-8000-0000000000a1');
select pg_temp.try('owner promueve a B a admin',
  $q$select public.set_parche_member_role(pg_temp.v('p1')::uuid, '00000000-0000-4000-8000-0000000000b2', 'admin')$q$, false);
select pg_temp.try('owner no se cambia a sí mismo',
  $q$select public.set_parche_member_role(pg_temp.v('p1')::uuid, '00000000-0000-4000-8000-0000000000a1', 'member')$q$, true, 'cannot_change_self');
select pg_temp.try('owner no puede salir', $q$select public.leave_parche(pg_temp.v('p1')::uuid)$q$, true, 'owner_cannot_leave');

select pg_temp.as_user('00000000-0000-4000-8000-0000000000b2');
select pg_temp.try('B (admin) deshabilita a C', $q$select public.set_parche_member_status(pg_temp.v('p1')::uuid, '00000000-0000-4000-8000-0000000000c3', 'disabled')$q$, false);
select pg_temp.try('repetir la operación es idempotente', $q$select public.set_parche_member_status(pg_temp.v('p1')::uuid, '00000000-0000-4000-8000-0000000000c3', 'disabled')$q$, false);
select pg_temp.try('B (admin) no deshabilita al owner', $q$select public.set_parche_member_status(pg_temp.v('p1')::uuid, '00000000-0000-4000-8000-0000000000a1', 'disabled')$q$, true, 'owner_protected');
select pg_temp.try('B (admin) no cambia roles', $q$select public.set_parche_member_role(pg_temp.v('p1')::uuid, '00000000-0000-4000-8000-0000000000c3', 'admin')$q$, true, 'not_authorized');
select pg_temp.try('B (admin) no administra otro parche', $q$select public.set_parche_member_status(pg_temp.v('p2')::uuid, '00000000-0000-4000-8000-0000000000a1', 'disabled')$q$, true, 'not_authorized');
select pg_temp.try('B (admin) genera un enlace nuevo', $q$select * from public.create_parche_invitation(pg_temp.v('p1')::uuid)$q$, false);

select pg_temp.as_user('00000000-0000-4000-8000-0000000000c3');
select pg_temp.check('C deshabilitado sigue viendo el parche (comportamiento existente)', (select count(*) from public.parches where id = pg_temp.v('p1')::uuid) = 1);
select pg_temp.try('C deshabilitado no invita', $q$select * from public.create_parche_invitation(pg_temp.v('p1')::uuid)$q$, true, 'not_authorized');
select pg_temp.check('enlace anterior quedó revocado al generar otro', (select status from public.get_parche_invitation(pg_temp.v('tok1'))) = 'disabled_member');

select pg_temp.as_user('00000000-0000-4000-8000-0000000000d4');
select pg_temp.check('enlace revocado → revoked', (select status from public.get_parche_invitation(pg_temp.v('tok1'))) = 'revoked');
select pg_temp.check('aceptar enlace revocado → revoked, sin membresía',
  (select status from public.accept_parche_invitation(pg_temp.v('tok1'))) = 'revoked'
  and (select count(*) from public.parche_members where user_id = '00000000-0000-4000-8000-0000000000d4') = 0);
select pg_temp.check('ajeno no ve participantes', (select count(*) from public.get_parche_members(pg_temp.v('p1')::uuid)) = 0);
select pg_temp.try('ajeno no deshabilita', $q$select public.set_parche_member_status(pg_temp.v('p1')::uuid, '00000000-0000-4000-8000-0000000000b2', 'disabled')$q$, true, 'not_authorized');
select pg_temp.try('ajeno no revoca', $q$select public.revoke_parche_invitation(pg_temp.v('p1')::uuid)$q$, true, 'not_authorized');
select pg_temp.try('ajeno no sale de un parche ajeno', $q$select public.leave_parche(pg_temp.v('p1')::uuid)$q$, true, 'member_not_found');

-- ── Enlace vencido, agotado y miembro deshabilitado ─────────────────────────
select pg_temp.as_user('00000000-0000-4000-8000-0000000000a1');
insert into vars select 'tok2', token from public.create_parche_invitation(pg_temp.v('p1')::uuid);
select pg_temp.as_admin();
update public.parche_invitations set created_at = now() - interval '9 days', expires_at = now() - interval '1 day'
  where parche_id = pg_temp.v('p1')::uuid and revoked_at is null;
select pg_temp.as_user('00000000-0000-4000-8000-0000000000d4');
select pg_temp.check('enlace vencido → expired', (select status from public.get_parche_invitation(pg_temp.v('tok2'))) = 'expired');
select pg_temp.check('aceptar vencido → expired', (select status from public.accept_parche_invitation(pg_temp.v('tok2'))) = 'expired');
select pg_temp.as_admin();
update public.parche_invitations set expires_at = now() + interval '1 day', max_uses = 2, use_count = 2
  where parche_id = pg_temp.v('p1')::uuid and revoked_at is null;
select pg_temp.as_user('00000000-0000-4000-8000-0000000000d4');
select pg_temp.check('enlace agotado → exhausted', (select status from public.accept_parche_invitation(pg_temp.v('tok2'))) = 'exhausted');
select pg_temp.as_user('00000000-0000-4000-8000-0000000000c3');
select pg_temp.check('miembro deshabilitado con enlace → disabled_member (no se reactiva solo)',
  (select status from public.accept_parche_invitation(pg_temp.v('tok2'))) = 'disabled_member'
  and (select status from public.parche_members where parche_id = pg_temp.v('p1')::uuid and user_id = '00000000-0000-4000-8000-0000000000c3') = 'disabled');

select pg_temp.as_user('00000000-0000-4000-8000-0000000000a1');
select pg_temp.try('owner reactiva a C', $q$select public.set_parche_member_status(pg_temp.v('p1')::uuid, '00000000-0000-4000-8000-0000000000c3', 'active')$q$, false);
select pg_temp.check('C vuelve a estar activo y sin fecha de deshabilitación',
  (select status = 'active' and disabled_at is null from public.parche_members where parche_id = pg_temp.v('p1')::uuid and user_id = '00000000-0000-4000-8000-0000000000c3'));
select pg_temp.try('owner revoca el enlace', $q$select public.revoke_parche_invitation(pg_temp.v('p1')::uuid)$q$, false);
select pg_temp.as_user('00000000-0000-4000-8000-0000000000d4');
select pg_temp.check('tras revocar → revoked', (select status from public.get_parche_invitation(pg_temp.v('tok2'))) = 'revoked');

-- ── Salir y última administración ───────────────────────────────────────────
select pg_temp.as_user('00000000-0000-4000-8000-0000000000b2');
select pg_temp.try('B (admin) sale: queda el owner', $q$select public.leave_parche(pg_temp.v('p1')::uuid)$q$, false);
select pg_temp.check('B ya no ve el parche', (select count(*) from public.parches where id = pg_temp.v('p1')::uuid) = 0);
select pg_temp.as_admin();
select pg_temp.check('la cuenta de B sigue existiendo', exists (select 1 from auth.users where id = '00000000-0000-4000-8000-0000000000b2'));
-- Parche sin owner activo (caso defensivo): el último admin no puede salir.
insert into public.parches (id, name) values ('99999999-9999-4999-8999-999999999999', 'Sin owner');
insert into public.parche_members (parche_id, user_id, role) values ('99999999-9999-4999-8999-999999999999', '00000000-0000-4000-8000-0000000000e5', 'admin');
select pg_temp.as_user('00000000-0000-4000-8000-0000000000e5');
select pg_temp.try('último admin activo no puede salir', $q$select public.leave_parche('99999999-9999-4999-8999-999999999999')$q$, true, 'last_admin');

-- ── Trazabilidad, anónimo e historial ───────────────────────────────────────
select pg_temp.as_admin();
select pg_temp.check('eventos registrados (creación, uniones, rol, estado, invitaciones, salida)',
  (select count(distinct action) from public.parche_member_events where parche_id = pg_temp.v('p1')::uuid) = 8,
  (select string_agg(distinct action, ',') from public.parche_member_events where parche_id = pg_temp.v('p1')::uuid));
select pg_temp.check('los eventos no guardan tokens',
  not exists (select 1 from public.parche_member_events where details::text like '%' || pg_temp.v('tok1') || '%' or details::text like '%' || pg_temp.v('tok2') || '%'));
select pg_temp.as_user('00000000-0000-4000-8000-0000000000a1');
select pg_temp.try('clientes no leen la auditoría', $q$select * from public.parche_member_events$q$, true, 'permission denied%');
do $$ begin execute 'reset role'; execute 'set local role anon'; end $$;
select pg_temp.try('anon no ejecuta create_parche', $q$select public.create_parche('x', gen_random_uuid())$q$, true, 'permission denied%');
select pg_temp.try('anon no ejecuta accept', $q$select * from public.accept_parche_invitation('AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA')$q$, true, 'permission denied%');
select pg_temp.as_user('00000000-0000-4000-8000-0000000000e5');
select pg_temp.check('usuario sin parches: ninguna membresía visible salvo la propia',
  (select count(*) from public.parche_members where parche_id <> '99999999-9999-4999-8999-999999999999') = 0);
select pg_temp.as_admin();
select pg_temp.check('membresías históricas intactas',
  (select count(*) from (select * from hist_before except select * from public.parche_members) x) = 0
  and (select count(*) from public.parche_members where parche_id = '91ad5d8d-414c-4e74-bf57-2ca476652de0') = 18);
select pg_temp.check('fotografía sellada intacta',
  (select bool_and(private.verify_standing_snapshot(id)) from public.standing_snapshots));

select n, case when ok then 'OK' else 'FALLO' end as resultado, name, detail from results order by n;
select count(*) filter (where ok) as ok, count(*) filter (where not ok) as fallos from results;
rollback;
