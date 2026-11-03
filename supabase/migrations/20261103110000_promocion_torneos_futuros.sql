-- Promoción de torneos futuros: fecha anunciada (civil, sin hora) y texto breve de portada por torneo, y la lectura
-- pública deja de exigir partidos a un torneo programado (se puede anunciar antes de tener calendario). Aditiva.
-- La fecha anunciada NO es la del primer partido: es solo un anuncio tentativo; los partidos reales no se tocan.
alter table public.events add column if not exists announced_start_date date;
alter table public.events add column if not exists landing_blurb text;
do $$ begin
  alter table public.events add constraint events_landing_blurb_len check (landing_blurb is null or char_length(landing_blurb) between 1 and 280);
exception when duplicate_object then null; end $$;

create or replace function public.control_set_event_promo(p_event_id uuid, p_announced_start date, p_blurb text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := private.require_platform_admin();
  v_ev public.events;
  v_blurb text := nullif(btrim(coalesce(p_blurb, '')), '');
begin
  v_ev := private.lock_event(p_event_id, true);
  if v_blurb is not null and char_length(v_blurb) > 280 then
    raise exception 'invalid_blurb' using errcode = '22023';
  end if;
  if v_ev.announced_start_date is not distinct from p_announced_start and v_ev.landing_blurb is not distinct from v_blurb then
    return;
  end if;
  update public.events set announced_start_date = p_announced_start, landing_blurb = v_blurb where id = p_event_id;
  perform private.audit('event_promo_updated', 'event', p_event_id, p_event_id,
    jsonb_build_object('announced_start_date', v_ev.announced_start_date, 'landing_blurb', v_ev.landing_blurb),
    jsonb_build_object('announced_start_date', p_announced_start, 'landing_blurb', v_blurb), null);
end;
$$;
revoke all on function public.control_set_event_promo(uuid, date, text) from public, anon;
grant execute on function public.control_set_event_promo(uuid, date, text) to authenticated;

drop function public.get_landing_tournaments();
create function public.get_landing_tournaments()
returns table (
  slug text, name text, status text, timezone text,
  first_match_at timestamptz, next_match_at timestamptz, last_match_at timestamptz,
  has_live boolean, is_manual boolean, announced_start_date date, blurb text
)
language sql
stable
security definer
set search_path = ''
as $$
  select e.slug, e.name, e.status, e.timezone, m.first_at, m.next_at, m.last_at, m.has_live,
         coalesce(e.id = s.featured_event_id, false), e.announced_start_date, e.landing_blurb
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
    -- Programado: puede no tener partidos todavía (inscripciones anticipadas). En curso: debe tener algo por jugar.
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
