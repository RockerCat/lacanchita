-- La portada debe describir fechas en la zona horaria del torneo (no en la del servidor): la proyección pública
-- incorpora events.timezone (dato no sensible). Aditiva: reemplaza únicamente la función de lectura de la portada.
drop function public.get_landing_tournaments();

create function public.get_landing_tournaments()
returns table (
  slug text, name text, status text, timezone text,
  first_match_at timestamptz, next_match_at timestamptz, last_match_at timestamptz,
  has_live boolean, is_manual boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select e.slug, e.name, e.status, e.timezone, m.first_at, m.next_at, m.last_at, m.has_live, coalesce(e.id = s.featured_event_id, false)
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
