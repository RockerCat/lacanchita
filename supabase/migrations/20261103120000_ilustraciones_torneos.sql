-- Ilustración opcional de portada por torneo. Aditiva e idempotente.
--  · events.illustration_path: ruta del objeto en el bucket público `event-illustrations` (<event_id>/<uuid>.<ext>).
--    Se guarda la ruta, nunca una URL. Cada subida usa un nombre nuevo, así que no hay caché obsoleta.
--  · Bucket de lectura pública (png/jpeg/webp, ≤ 5 MB; sin SVG). Escribir/reemplazar/borrar objetos: solo superadministradores.
--  · control_set_event_illustration: asocia (o quita, con NULL) la ilustración tras comprobar permiso, bloqueo del
--    torneo, ruta aislada por torneo y existencia del objeto. Auditada.
--  · get_landing_tournaments() devuelve illustration_path.
alter table public.events add column if not exists illustration_path text;
do $$ begin
  alter table public.events add constraint events_illustration_path_fmt check (
    illustration_path is null or illustration_path ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpg|webp)$');
exception when duplicate_object then null; end $$;
comment on column public.events.illustration_path is 'Ruta en el bucket event-illustrations (<event_id>/<uuid>.<ext>). Opcional; sin ilustración la promoción conserva su diseño.';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('event-illustrations', 'event-illustrations', true, 5242880, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update
  set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists event_illustrations_admin_select on storage.objects;
drop policy if exists event_illustrations_admin_insert on storage.objects;
drop policy if exists event_illustrations_admin_update on storage.objects;
drop policy if exists event_illustrations_admin_delete on storage.objects;
create policy event_illustrations_admin_select on storage.objects for select to authenticated
  using (bucket_id = 'event-illustrations' and (select private.is_platform_admin()));
create policy event_illustrations_admin_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'event-illustrations' and (select private.is_platform_admin()));
create policy event_illustrations_admin_update on storage.objects for update to authenticated
  using (bucket_id = 'event-illustrations' and (select private.is_platform_admin()))
  with check (bucket_id = 'event-illustrations' and (select private.is_platform_admin()));
create policy event_illustrations_admin_delete on storage.objects for delete to authenticated
  using (bucket_id = 'event-illustrations' and (select private.is_platform_admin()));

create or replace function public.control_set_event_illustration(p_event_id uuid, p_path text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := private.require_platform_admin();
  v_ev public.events;
begin
  v_ev := private.lock_event(p_event_id, true); -- rechaza torneos cerrados, cancelados o con historial sellado
  if p_path is not null and (p_path not like p_event_id::text || '/%'
      or not exists (select 1 from storage.objects o where o.bucket_id = 'event-illustrations' and o.name = p_path)) then
    raise exception 'invalid_illustration' using errcode = '22023';
  end if;
  if v_ev.illustration_path is not distinct from p_path then
    return;
  end if;
  update public.events set illustration_path = p_path where id = p_event_id;
  perform private.audit('event_illustration_changed', 'event', p_event_id, p_event_id,
    jsonb_build_object('illustration_path', v_ev.illustration_path), jsonb_build_object('illustration_path', p_path), null);
end;
$$;
revoke all on function public.control_set_event_illustration(uuid, text) from public, anon;
grant execute on function public.control_set_event_illustration(uuid, text) to authenticated;

drop function public.get_landing_tournaments();
create function public.get_landing_tournaments()
returns table (
  slug text, name text, status text, timezone text,
  first_match_at timestamptz, next_match_at timestamptz, last_match_at timestamptz,
  has_live boolean, is_manual boolean, announced_start_date date, blurb text, illustration_path text
)
language sql
stable
security definer
set search_path = ''
as $$
  select e.slug, e.name, e.status, e.timezone, m.first_at, m.next_at, m.last_at, m.has_live,
         coalesce(e.id = s.featured_event_id, false), e.announced_start_date, e.landing_blurb, e.illustration_path
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
