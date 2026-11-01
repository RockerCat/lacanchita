-- Landing pública: torneo destacado y torneos mostrados en la portada.
-- Aditiva. El catálogo de torneos es solo para usuarios autenticados (RLS), así que la portada (anónima) lee una
-- proyección mínima mediante una función SECURITY DEFINER con campos expresamente públicos. Qué torneos se muestran
-- lo decide el superadministrador (landing_visible, por defecto FALSE: ni los torneos de QA, ni Copa de prueba ni el
-- Mundial histórico aparecen). El destacado manual vive en una tabla de un solo registro, sin acceso directo.

alter table public.events add column landing_visible boolean not null default false;
comment on column public.events.landing_visible is 'El superadministrador autoriza mostrar este torneo en la portada pública (solo se muestra si además está publicado y admite participantes).';

create table public.landing_settings (
  id                boolean primary key default true check (id),
  featured_event_id uuid references public.events (id) on delete set null,
  updated_by        uuid,
  updated_at        timestamptz not null default now()
);
comment on table public.landing_settings is 'Configuración global de la portada (un solo registro). Sin acceso directo: se lee y escribe con funciones.';
insert into public.landing_settings (id) values (true);
create index landing_settings_featured_event_idx on public.landing_settings (featured_event_id);
alter table public.landing_settings enable row level security;
revoke all on public.landing_settings from anon, authenticated;

-- ─── Lectura pública mínima ──────────────────────────────────────────────────
-- Elegible: autorizado en la portada, publicado (programado o en juego), con partidos, sin historial sellado y, si ya
-- está en juego, con al menos un partido por jugar (que haya partidos en vivo no basta para poder participar).
create or replace function public.get_landing_tournaments()
returns table (
  slug text, name text, status text,
  first_match_at timestamptz, next_match_at timestamptz, last_match_at timestamptz,
  has_live boolean, is_manual boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select e.slug, e.name, e.status, m.first_at, m.next_at, m.last_at, m.has_live, coalesce(e.id = s.featured_event_id, false)
  from public.events e
  cross join public.landing_settings s
  cross join lateral (
    select count(*) as n,
           min(x.starts_at) as first_at,
           max(x.starts_at) as last_at,
           min(x.starts_at) filter (where x.status = 'scheduled' and x.starts_at > now()) as next_at,
           bool_or(x.status = 'live') as has_live
    from public.matches x
    where x.event_id = e.id and x.status <> 'cancelled'
  ) m
  where e.landing_visible
    and e.status in ('scheduled', 'in_progress')
    and m.n > 0
    and (e.status = 'scheduled' or m.next_at is not null)
    and not exists (
      select 1 from public.parche_events pe
      join public.standing_snapshots ss on ss.parche_event_id = pe.id and ss.sealed_at is not null
      where pe.event_id = e.id
    )
  order by e.slug;
$$;
revoke all on function public.get_landing_tournaments() from public;
grant execute on function public.get_landing_tournaments() to anon, authenticated;

-- ─── Administración (solo superadministrador) ───────────────────────────────

create or replace function public.control_set_landing_visible(p_event_id uuid, p_visible boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ev public.events;
begin
  perform private.require_platform_admin();
  select * into v_ev from public.events where id = p_event_id for update;
  if not found then
    raise exception 'event_not_found' using errcode = 'P0002';
  end if;
  if p_visible is null then
    raise exception 'invalid_request' using errcode = '22023';
  end if;
  if p_visible and v_ev.status not in ('scheduled', 'in_progress') then
    raise exception 'event_not_published';
  end if;
  if v_ev.landing_visible = p_visible then
    return;
  end if;
  update public.events set landing_visible = p_visible where id = p_event_id;
  perform private.audit('landing_visibility_changed', 'event', p_event_id, p_event_id,
    jsonb_build_object('landing_visible', v_ev.landing_visible), jsonb_build_object('landing_visible', p_visible), null);
end;
$$;

-- Destacado manual (NULL = volver al modo automático). Se conserva aunque el torneo deje de ser elegible: mientras
-- no lo sea, la portada aplica la selección automática sin perder esta preferencia.
create or replace function public.control_set_featured_event(p_event_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old uuid;
begin
  perform private.require_platform_admin();
  if p_event_id is not null and not exists (select 1 from public.events where id = p_event_id and landing_visible) then
    raise exception 'event_not_visible';
  end if;
  select featured_event_id into v_old from public.landing_settings where id for update;
  if v_old is not distinct from p_event_id then
    return;
  end if;
  update public.landing_settings set featured_event_id = p_event_id, updated_by = (select auth.uid()), updated_at = now() where id;
  perform private.audit('landing_featured_changed', 'landing', coalesce(p_event_id, v_old), coalesce(p_event_id, v_old),
    jsonb_build_object('featured_event_id', v_old), jsonb_build_object('featured_event_id', p_event_id), null);
end;
$$;

create or replace function public.control_landing_featured()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_platform_admin();
  return (select featured_event_id from public.landing_settings where id);
end;
$$;

revoke all on function public.control_set_landing_visible(uuid, boolean), public.control_set_featured_event(uuid), public.control_landing_featured() from public, anon;
grant execute on function public.control_set_landing_visible(uuid, boolean), public.control_set_featured_event(uuid), public.control_landing_featured() to authenticated;
