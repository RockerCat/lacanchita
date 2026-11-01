-- La Canchita — gestión de parches, participantes e invitaciones.
--
-- Reglas (CLAUDE.md §5.10):
--   * Roles: owner (creador; no puede salir, ser deshabilitado ni perder su rol), admin, member.
--   * Administran (invitar, deshabilitar/reactivar miembros) solo owner/admin con membresía ACTIVA.
--     Solo el owner cambia roles (member ↔ admin) y deshabilita/reactiva administradores.
--   * Nadie se autoasigna roles ni modifica su propia membresía salvo para salir del parche.
--   * Salir borra la fila de membresía (no la cuenta); queda constancia en parche_member_events.
--   * Invitaciones: un enlace activo por parche, de varios usos, que vence (7 días) y se puede revocar.
--     Solo se guarda el SHA-256 del token; el token se muestra una vez al crearlo.
-- Todas las escrituras pasan por funciones SECURITY DEFINER (search_path vacío) que validan
-- auth.uid() en la base; las tablas siguen sin privilegios de escritura para clientes.

-- ─── Esquema ────────────────────────────────────────────────────────────────

-- Idempotencia de la creación (doble clic / reintentos): mismo request_id → mismo parche.
alter table public.parches add column creation_request_id uuid;
create unique index parches_creation_request_idx on public.parches (created_by, creation_request_id)
  where creation_request_id is not null;

create table public.parche_invitations (
  id            uuid primary key default gen_random_uuid(),
  parche_id     uuid not null references public.parches (id) on delete cascade,
  token_hash    text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  created_by    uuid references auth.users (id) on delete set null,
  created_at    timestamptz not null default now(),
  expires_at    timestamptz not null,
  revoked_at    timestamptz,
  revoked_by    uuid references auth.users (id) on delete set null,
  max_uses      integer check (max_uses is null or max_uses > 0),
  use_count     integer not null default 0 check (use_count >= 0),
  last_used_at  timestamptz,
  constraint parche_invitations_expiry check (expires_at > created_at),
  constraint parche_invitations_uses check (max_uses is null or use_count <= max_uses)
);
-- Un único enlace no revocado por parche (generar uno nuevo revoca el anterior).
create unique index parche_invitations_one_open_idx on public.parche_invitations (parche_id) where revoked_at is null;
create index parche_invitations_created_by_idx on public.parche_invitations (created_by);
create index parche_invitations_revoked_by_idx on public.parche_invitations (revoked_by);

-- Trazabilidad de membresías. user_id/actor_id sin FK: el registro sobrevive a la cuenta.
create table public.parche_member_events (
  id          bigint generated always as identity primary key,
  parche_id   uuid not null references public.parches (id) on delete cascade,
  user_id     uuid,
  actor_id    uuid,
  action      text not null check (action in ('parche_created', 'joined', 'left', 'disabled', 'reactivated',
                                              'role_changed', 'invitation_created', 'invitation_revoked')),
  details     jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
create index parche_member_events_parche_idx on public.parche_member_events (parche_id, created_at);

-- ─── Autorización ───────────────────────────────────────────────────────────

create or replace function private.is_parche_admin(p_parche_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.parche_members pm
    where pm.parche_id = p_parche_id and pm.user_id = (select auth.uid())
      and pm.role in ('owner', 'admin') and pm.status = 'active'
  );
$$;

create or replace function private.require_uid()
returns uuid
language plpgsql
stable
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  return uid;
end;
$$;

create or replace function private.log_member_event(p_parche_id uuid, p_user_id uuid, p_actor_id uuid, p_action text, p_details jsonb)
returns void
language sql
set search_path = ''
as $$
  insert into public.parche_member_events (parche_id, user_id, actor_id, action, details)
  values (p_parche_id, p_user_id, p_actor_id, p_action, coalesce(p_details, '{}'::jsonb));
$$;

create or replace function private.invitation_token_hash(p_token text)
returns text
language sql
immutable
set search_path = ''
as $$
  select encode(sha256(convert_to(p_token, 'UTF8')), 'hex');
$$;

-- ─── Parches ────────────────────────────────────────────────────────────────

create or replace function public.create_parche(p_name text, p_request_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := private.require_uid();
  v_name text := btrim(coalesce(p_name, ''));
  v_id uuid;
begin
  if char_length(v_name) not between 2 and 50 then
    raise exception 'invalid_name' using errcode = '22023';
  end if;
  if p_request_id is null then
    raise exception 'invalid_request' using errcode = '22023';
  end if;

  insert into public.parches (name, created_by, creation_request_id)
  values (v_name, uid, p_request_id)
  on conflict (created_by, creation_request_id) where creation_request_id is not null do nothing
  returning id into v_id;

  if v_id is null then
    -- Reintento del mismo formulario: devolver el parche ya creado.
    select id into v_id from public.parches where created_by = uid and creation_request_id = p_request_id;
    return v_id;
  end if;

  insert into public.parche_members (parche_id, user_id, role, status) values (v_id, uid, 'owner', 'active');
  perform private.log_member_event(v_id, uid, uid, 'parche_created', jsonb_build_object('name', v_name));
  return v_id;
end;
$$;

-- Participantes visibles para cualquier miembro del parche (incluidos deshabilitados, como el resto del
-- parche). Nombre: username de los metadatos o prefijo del correo (mismo criterio que La Penúltima).
-- Nunca devuelve correos completos.
create or replace function public.get_parche_members(p_parche_id uuid)
returns table (user_id uuid, display_name text, role text, status text, joined_at timestamptz, is_me boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select pm.user_id,
         coalesce(nullif(btrim(u.raw_user_meta_data ->> 'username'), ''), nullif(split_part(u.email, '@', 1), ''), 'Participante'),
         pm.role, pm.status, pm.joined_at, pm.user_id = (select auth.uid())
  from public.parche_members pm
  join auth.users u on u.id = pm.user_id
  where pm.parche_id = p_parche_id
    and private.is_parche_member(p_parche_id)
  order by case pm.role when 'owner' then 0 when 'admin' then 1 else 2 end,
           pm.status, lower(coalesce(u.raw_user_meta_data ->> 'username', u.email));
$$;

create or replace function public.set_parche_member_status(p_parche_id uuid, p_user_id uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := private.require_uid();
  v_actor_role text;
  v_target record;
begin
  if p_status not in ('active', 'disabled') then
    raise exception 'invalid_status' using errcode = '22023';
  end if;
  -- Serializa las operaciones administrativas del parche.
  perform 1 from public.parches where id = p_parche_id for update;

  select role into v_actor_role from public.parche_members
  where parche_id = p_parche_id and user_id = uid and status = 'active' and role in ('owner', 'admin');
  if v_actor_role is null then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if p_user_id = uid then
    raise exception 'cannot_change_self' using errcode = '42501';
  end if;

  select role, status into v_target from public.parche_members where parche_id = p_parche_id and user_id = p_user_id for update;
  if not found then
    raise exception 'member_not_found' using errcode = 'P0002';
  end if;
  if v_target.role = 'owner' then
    raise exception 'owner_protected' using errcode = '42501';
  end if;
  if v_target.role = 'admin' and v_actor_role <> 'owner' then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if v_target.status = p_status then
    return;
  end if;

  update public.parche_members
  set status = p_status, disabled_at = case when p_status = 'disabled' then now() else null end
  where parche_id = p_parche_id and user_id = p_user_id;
  perform private.log_member_event(p_parche_id, p_user_id, uid,
    case when p_status = 'disabled' then 'disabled' else 'reactivated' end, '{}'::jsonb);
end;
$$;

create or replace function public.set_parche_member_role(p_parche_id uuid, p_user_id uuid, p_role text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := private.require_uid();
  v_target record;
begin
  if p_role not in ('admin', 'member') then
    raise exception 'invalid_role' using errcode = '22023';
  end if;
  perform 1 from public.parches where id = p_parche_id for update;

  if not exists (select 1 from public.parche_members
                 where parche_id = p_parche_id and user_id = uid and role = 'owner' and status = 'active') then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if p_user_id = uid then
    raise exception 'cannot_change_self' using errcode = '42501';
  end if;

  select role, status into v_target from public.parche_members where parche_id = p_parche_id and user_id = p_user_id for update;
  if not found then
    raise exception 'member_not_found' using errcode = 'P0002';
  end if;
  if v_target.role = 'owner' then
    raise exception 'owner_protected' using errcode = '42501';
  end if;
  if p_role = 'admin' and v_target.status <> 'active' then
    raise exception 'member_disabled' using errcode = '22023';
  end if;
  if v_target.role = p_role then
    return;
  end if;

  update public.parche_members set role = p_role where parche_id = p_parche_id and user_id = p_user_id;
  perform private.log_member_event(p_parche_id, p_user_id, uid, 'role_changed',
    jsonb_build_object('from', v_target.role, 'to', p_role));
end;
$$;

create or replace function public.leave_parche(p_parche_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := private.require_uid();
  v_me record;
begin
  perform 1 from public.parches where id = p_parche_id for update;
  select role, status into v_me from public.parche_members where parche_id = p_parche_id and user_id = uid for update;
  if not found then
    raise exception 'member_not_found' using errcode = 'P0002';
  end if;
  if v_me.role = 'owner' then
    raise exception 'owner_cannot_leave' using errcode = '42501';
  end if;
  -- Nunca dejar el parche sin una administración activa.
  if v_me.role = 'admin' and not exists (
    select 1 from public.parche_members
    where parche_id = p_parche_id and user_id <> uid and role in ('owner', 'admin') and status = 'active') then
    raise exception 'last_admin' using errcode = '42501';
  end if;

  delete from public.parche_members where parche_id = p_parche_id and user_id = uid;
  perform private.log_member_event(p_parche_id, uid, uid, 'left',
    jsonb_build_object('role', v_me.role, 'status', v_me.status));
end;
$$;

-- ─── Invitaciones ───────────────────────────────────────────────────────────

create or replace function public.create_parche_invitation(p_parche_id uuid)
returns table (token text, expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  uid uuid := private.require_uid();
  v_token text;
  v_expires timestamptz := now() + interval '7 days';
  v_id uuid;
  v_revoked uuid[];
begin
  perform 1 from public.parches where id = p_parche_id for update;
  if not private.is_parche_admin(p_parche_id) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  with r as (
    update public.parche_invitations set revoked_at = now(), revoked_by = uid
    where parche_id = p_parche_id and revoked_at is null
    returning id)
  select array_agg(id) into v_revoked from r;
  if v_revoked is not null then
    perform private.log_member_event(p_parche_id, null, uid, 'invitation_revoked',
      jsonb_build_object('invitation_ids', v_revoked, 'reason', 'replaced'));
  end if;

  -- 32 bytes aleatorios en base64url (sin relleno): 43 caracteres no predecibles.
  v_token := rtrim(translate(encode(extensions.gen_random_bytes(32), 'base64'), '+/', '-_'), '=');
  insert into public.parche_invitations (parche_id, token_hash, created_by, expires_at)
  values (p_parche_id, private.invitation_token_hash(v_token), uid, v_expires)
  returning id into v_id;
  perform private.log_member_event(p_parche_id, null, uid, 'invitation_created',
    jsonb_build_object('invitation_id', v_id, 'expires_at', v_expires));

  return query select v_token, v_expires;
end;
$$;

create or replace function public.revoke_parche_invitation(p_parche_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := private.require_uid();
  v_ids uuid[];
begin
  perform 1 from public.parches where id = p_parche_id for update;
  if not private.is_parche_admin(p_parche_id) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  with r as (
    update public.parche_invitations set revoked_at = now(), revoked_by = uid
    where parche_id = p_parche_id and revoked_at is null
    returning id)
  select array_agg(id) into v_ids from r;
  if v_ids is not null then
    perform private.log_member_event(p_parche_id, null, uid, 'invitation_revoked', jsonb_build_object('invitation_ids', v_ids));
  end if;
end;
$$;

-- Estado de una invitación para el usuario autenticado. Solo revela el nombre del parche a quien tiene
-- un enlace válido (o ya es miembro); nunca participantes ni datos internos.
create or replace function public.get_parche_invitation(p_token text)
returns table (status text, parche_id uuid, parche_name text, expires_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  uid uuid := private.require_uid();
  v_inv record;
  v_member record;
begin
  if p_token is null or p_token !~ '^[A-Za-z0-9_-]{20,100}$' then
    return query select 'not_found'::text, null::uuid, null::text, null::timestamptz;
    return;
  end if;
  select i.*, p.name as parche_name into v_inv
  from public.parche_invitations i join public.parches p on p.id = i.parche_id
  where i.token_hash = private.invitation_token_hash(p_token);
  if not found then
    return query select 'not_found'::text, null::uuid, null::text, null::timestamptz;
    return;
  end if;

  select role, status into v_member from public.parche_members where parche_id = v_inv.parche_id and user_id = uid;
  if found then
    return query select case when v_member.status = 'disabled' then 'disabled_member' else 'already_member' end,
                        v_inv.parche_id, v_inv.parche_name, v_inv.expires_at;
    return;
  end if;
  if v_inv.revoked_at is not null then
    return query select 'revoked'::text, null::uuid, null::text, null::timestamptz;
    return;
  end if;
  if v_inv.expires_at <= now() then
    return query select 'expired'::text, null::uuid, null::text, null::timestamptz;
    return;
  end if;
  if v_inv.max_uses is not null and v_inv.use_count >= v_inv.max_uses then
    return query select 'exhausted'::text, null::uuid, null::text, null::timestamptz;
    return;
  end if;
  return query select 'valid'::text, null::uuid, v_inv.parche_name, v_inv.expires_at;
end;
$$;

-- Acepta una invitación: atómico y seguro ante reintentos (bloquea la invitación; la membresía es única).
create or replace function public.accept_parche_invitation(p_token text)
returns table (status text, parche_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  uid uuid := private.require_uid();
  v_inv record;
  v_member record;
  v_inserted int;
begin
  if p_token is null or p_token !~ '^[A-Za-z0-9_-]{20,100}$' then
    return query select 'not_found'::text, null::uuid;
    return;
  end if;
  select * into v_inv from public.parche_invitations
  where token_hash = private.invitation_token_hash(p_token) for update;
  if not found then
    return query select 'not_found'::text, null::uuid;
    return;
  end if;

  select role, status into v_member from public.parche_members where parche_id = v_inv.parche_id and user_id = uid;
  if found then
    -- Un miembro deshabilitado no se reactiva con un enlace: lo decide un administrador.
    return query select case when v_member.status = 'disabled' then 'disabled_member' else 'already_member' end, v_inv.parche_id;
    return;
  end if;
  if v_inv.revoked_at is not null then
    return query select 'revoked'::text, null::uuid;
    return;
  end if;
  if v_inv.expires_at <= now() then
    return query select 'expired'::text, null::uuid;
    return;
  end if;
  if v_inv.max_uses is not null and v_inv.use_count >= v_inv.max_uses then
    return query select 'exhausted'::text, null::uuid;
    return;
  end if;

  insert into public.parche_members (parche_id, user_id, role, status)
  values (v_inv.parche_id, uid, 'member', 'active')
  on conflict (parche_id, user_id) do nothing;
  get diagnostics v_inserted = row_count;
  if v_inserted = 0 then
    return query select 'already_member'::text, v_inv.parche_id;
    return;
  end if;

  update public.parche_invitations set use_count = use_count + 1, last_used_at = now() where id = v_inv.id;
  perform private.log_member_event(v_inv.parche_id, uid, uid, 'joined', jsonb_build_object('invitation_id', v_inv.id));
  return query select 'joined'::text, v_inv.parche_id;
end;
$$;

-- ─── Privilegios y RLS ──────────────────────────────────────────────────────

revoke all on function private.is_parche_admin(uuid), private.require_uid(),
  private.log_member_event(uuid, uuid, uuid, text, jsonb), private.invitation_token_hash(text)
  from public, anon, authenticated;
grant execute on function private.is_parche_admin(uuid) to authenticated;

revoke all on function public.create_parche(text, uuid), public.get_parche_members(uuid),
  public.set_parche_member_status(uuid, uuid, text), public.set_parche_member_role(uuid, uuid, text),
  public.leave_parche(uuid), public.create_parche_invitation(uuid), public.revoke_parche_invitation(uuid),
  public.get_parche_invitation(text), public.accept_parche_invitation(text)
  from public, anon;
grant execute on function public.create_parche(text, uuid), public.get_parche_members(uuid),
  public.set_parche_member_status(uuid, uuid, text), public.set_parche_member_role(uuid, uuid, text),
  public.leave_parche(uuid), public.create_parche_invitation(uuid), public.revoke_parche_invitation(uuid),
  public.get_parche_invitation(text), public.accept_parche_invitation(text)
  to authenticated, service_role;

alter table public.parche_invitations enable row level security;
alter table public.parche_member_events enable row level security;
revoke all on public.parche_invitations, public.parche_member_events from anon, authenticated;
grant select, insert, update, delete on public.parche_invitations, public.parche_member_events to service_role;

-- Los administradores ven el estado del enlace de su parche, nunca el hash del token.
grant select (id, parche_id, created_by, created_at, expires_at, revoked_at, max_uses, use_count, last_used_at)
  on public.parche_invitations to authenticated;
create policy parche_invitations_admin_read on public.parche_invitations
  for select to authenticated using ((select private.is_parche_admin(parche_id)));
-- parche_member_events: sin acceso de clientes (trazabilidad para backend/soporte).
