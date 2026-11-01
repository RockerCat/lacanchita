-- Noticias (recuperadas de La Penúltima, tabla `news` de la migración 041) adaptadas al modelo parche × torneo.
-- Aditiva: una tabla nueva, un trigger y tres funciones; `get_parche_event_leaderboard` delega ahora en una función
-- privada con la MISMA consulta (para que el generador de noticias, que corre como superadministrador, calcule la tabla
-- sin ser miembro). Ámbitos:
--   · torneo  (parche_event_id NULL): noticia deportiva compartida (resultado oficial), visible a miembros de parches inscritos;
--   · parche  (parche_event_id = inscripción): la narrativa original (líder, movimientos, exactos, participación),
--             visible solo a los miembros de ese parche.
-- Las noticias se publican SOLO con control_publish_match_news (superadministrador), ligadas a la revisión oficial del
-- resultado; una corrección o reapertura las retira (superseded_at) sin borrarlas. No hay escritura directa de clientes.

create table public.news (
  id               uuid primary key default gen_random_uuid(),
  event_id         uuid not null,
  parche_event_id  uuid,
  match_id         uuid not null,
  match_revision   integer not null check (match_revision > 0),
  title            text not null check (char_length(title) between 1 and 200),
  summary          text not null check (char_length(summary) between 1 and 500),
  content          text not null check (char_length(content) between 1 and 4000),
  created_at       timestamptz not null default now(),
  superseded_at    timestamptz,
  superseded_reason text,
  constraint news_match_fk foreign key (match_id, event_id) references public.matches (id, event_id),
  constraint news_parche_event_fk foreign key (parche_event_id, event_id) references public.parche_events (id, event_id),
  constraint news_superseded_reason check ((superseded_at is null) = (superseded_reason is null))
);
-- Idempotencia: una noticia por partido, revisión y ámbito.
create unique index news_event_scope_uidx on public.news (match_id, match_revision) where parche_event_id is null;
create unique index news_parche_scope_uidx on public.news (match_id, match_revision, parche_event_id) where parche_event_id is not null;
create index news_parche_feed_idx on public.news (parche_event_id, created_at desc) where superseded_at is null and parche_event_id is not null;
create index news_event_feed_idx on public.news (event_id, created_at desc) where superseded_at is null and parche_event_id is null;
create index news_match_idx on public.news (match_id);

alter table public.news enable row level security;
revoke all on public.news from public, anon, authenticated, service_role;
grant select on public.news to authenticated;

create policy news_read on public.news for select to authenticated using (
  private.is_platform_admin()
  or (
    superseded_at is null
    and (
      (parche_event_id is not null and exists (
        select 1 from public.parche_events pe where pe.id = news.parche_event_id and private.is_parche_member(pe.parche_id)))
      or (parche_event_id is null and exists (
        select 1 from public.parche_events pe where pe.event_id = news.event_id and private.is_parche_member(pe.parche_id)))
    )
  )
);

-- ── Tabla del parche sin comprobación de pertenencia (uso interno del generador y de la función pública) ──
create or replace function private.parche_event_leaderboard(p_parche_event_id uuid)
returns table (
  user_id uuid, display_name text, total_points bigint, exact_count bigint, result_count bigint, pred_count bigint, rank bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_parche uuid;
begin
  select pe.parche_id into v_parche from public.parche_events pe where pe.id = p_parche_event_id;
  if v_parche is null then
    return;
  end if;
  return query
  with participants as (
    select pm.user_id as uid,
           coalesce(nullif(btrim(u.raw_user_meta_data ->> 'username'), ''), nullif(split_part(u.email, '@', 1), ''), 'Participante')::text as name
    from public.parche_members pm
    join auth.users u on u.id = pm.user_id
    where pm.parche_id = v_parche and pm.status = 'active'
      and not exists (select 1 from private.platform_admins pa where pa.user_id = pm.user_id)
  ), scores as (
    select pt.uid, pt.name,
           coalesce(sum(p.points), 0)::bigint as total_points,
           count(*) filter (where p.points_reason = 'exact')::bigint as exact_count,
           count(*) filter (where p.points_reason = 'result')::bigint as result_count,
           count(p.id) filter (where m.status is distinct from 'cancelled')::bigint as pred_count
    from participants pt
    left join public.predictions p on p.user_id = pt.uid and p.parche_event_id = p_parche_event_id
    left join public.matches m on m.id = p.match_id
    group by pt.uid, pt.name
  ), ranked as (
    select s.*, rank() over (order by s.total_points desc, s.exact_count desc, s.result_count desc)::bigint as rnk
    from scores s
  )
  select r.uid, r.name, r.total_points, r.exact_count, r.result_count, r.pred_count, r.rnk
  from ranked r
  order by r.rnk, r.total_points desc, r.name;
end;
$$;
revoke all on function private.parche_event_leaderboard(uuid) from public, anon, authenticated;

create or replace function public.get_parche_event_leaderboard(p_parche_event_id uuid)
returns table (
  user_id uuid, display_name text, total_points bigint, exact_count bigint, result_count bigint, pred_count bigint, rank bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  uid uuid := private.require_uid();
  v_parche uuid;
begin
  select pe.parche_id into v_parche from public.parche_events pe where pe.id = p_parche_event_id;
  if v_parche is null or not private.is_parche_member(v_parche) then
    raise exception 'not_member' using errcode = '42501';
  end if;
  return query select * from private.parche_event_leaderboard(p_parche_event_id);
end;
$$;

-- ── Una corrección o reapertura retira las noticias que afirmaban el resultado anterior ──
create or replace function private.news_supersede_on_result_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status = 'finished'
     and (new.status is distinct from 'finished'
          or (new.home_score, new.away_score, new.winner_side) is distinct from (old.home_score, old.away_score, old.winner_side)
          or new.result_revision is distinct from old.result_revision) then
    update public.news
    set superseded_at = now(),
        superseded_reason = case when new.status is distinct from 'finished' then 'reopened' else 'corrected' end
    where match_id = new.id and superseded_at is null;
  end if;
  return null;
end;
$$;
revoke all on function private.news_supersede_on_result_change() from public, anon, authenticated;
create trigger matches_news_supersede after update on public.matches
  for each row execute function private.news_supersede_on_result_change();

-- ── Contexto para redactar (solo superadministrador): datos oficiales del partido y, por inscripción, tabla y pronósticos ──
create or replace function public.control_news_context(p_match_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_m public.matches;
  v_items jsonb;
begin
  perform private.require_platform_admin();
  select * into v_m from public.matches where id = p_match_id;
  if not found then raise exception 'match_not_found' using errcode = 'P0002'; end if;
  if v_m.status <> 'finished' or v_m.result_confirmed_at is null or v_m.home_team_id is null or v_m.away_team_id is null then
    raise exception 'match_not_finished';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'parche_event_id', pe.id,
    'leaderboard', (select coalesce(jsonb_agg(jsonb_build_object(
        'user_id', l.user_id, 'display_name', l.display_name, 'total_points', l.total_points,
        'exact_count', l.exact_count, 'result_count', l.result_count, 'rank', l.rank) order by l.rank, l.display_name), '[]'::jsonb)
      from private.parche_event_leaderboard(pe.id) l),
    'predictions', (select coalesce(jsonb_agg(jsonb_build_object(
        'user_id', p.user_id, 'points', coalesce(p.points, 0), 'points_reason', p.points_reason,
        'home', p.home_score, 'away', p.away_score) order by p.user_id), '[]'::jsonb)
      from public.predictions p
      where p.parche_event_id = pe.id and p.match_id = p_match_id
        and exists (select 1 from private.parche_event_leaderboard(pe.id) l where l.user_id = p.user_id))
  ) order by pe.id), '[]'::jsonb) into v_items
  from public.parche_events pe
  where pe.event_id = v_m.event_id and pe.status = 'active';

  return jsonb_build_object(
    'match', jsonb_build_object(
      'id', v_m.id, 'event_id', v_m.event_id, 'revision', v_m.result_revision,
      'home_score', v_m.home_score, 'away_score', v_m.away_score, 'winner_side', v_m.winner_side,
      'home', (select jsonb_build_object('id', t.id, 'name', t.name, 'flag', t.flag_emoji) from public.teams t where t.id = v_m.home_team_id),
      'away', (select jsonb_build_object('id', t.id, 'name', t.name, 'flag', t.flag_emoji) from public.teams t where t.id = v_m.away_team_id)),
    'items', v_items);
end;
$$;

-- ── Publicación (solo superadministrador; idempotente; ligada a la revisión oficial vigente) ──
create or replace function public.control_publish_match_news(p_match_id uuid, p_revision integer, p_items jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_m public.matches;
  v_it jsonb;
  v_pe uuid;
  v_n integer := 0;
  v_rows integer;
begin
  perform private.require_platform_admin();
  select * into v_m from public.matches where id = p_match_id for share;
  if not found then raise exception 'match_not_found' using errcode = 'P0002'; end if;
  if v_m.status <> 'finished' or v_m.result_confirmed_at is null then raise exception 'match_not_finished'; end if;
  if v_m.result_revision is distinct from p_revision then raise exception 'stale_revision'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) > 500 then raise exception 'invalid_items' using errcode = '22023'; end if;
  for v_it in select * from jsonb_array_elements(p_items) loop
    v_pe := nullif(v_it ->> 'parche_event_id', '')::uuid;
    if v_pe is not null and not exists (select 1 from public.parche_events pe where pe.id = v_pe and pe.event_id = v_m.event_id and pe.status = 'active') then
      raise exception 'invalid_parche_event' using errcode = '22023';
    end if;
    insert into public.news (event_id, parche_event_id, match_id, match_revision, title, summary, content)
    values (v_m.event_id, v_pe, p_match_id, p_revision, btrim(v_it ->> 'title'), btrim(v_it ->> 'summary'), btrim(v_it ->> 'content'))
    on conflict do nothing;
    get diagnostics v_rows = row_count;
    v_n := v_n + v_rows;
  end loop;
  if v_n > 0 then
    perform private.audit('news_published', 'match', p_match_id, v_m.event_id, null, jsonb_build_object('revision', p_revision, 'items', v_n), null);
  end if;
  return v_n;
end;
$$;

-- ── Lectura del jugador (SECURITY INVOKER: la RLS decide; sin pertenencia no hay filas) ──
-- Por partido se muestra la noticia del parche si existe y, si no, la deportiva del torneo.
create or replace function public.get_news_feed(p_parche_event_id uuid, p_limit integer default 20, p_before timestamptz default null)
returns table (id uuid, title text, summary text, match_id uuid, scope text, created_at timestamptz)
language sql
stable
set search_path = ''
as $$
  with pe as (select e.id, e.event_id from public.parche_events e where e.id = p_parche_event_id),
  vis as (
    select distinct on (n.match_id) n.id, n.title, n.summary, n.match_id,
           case when n.parche_event_id is null then 'event' else 'parche' end as scope, n.created_at
    from public.news n, pe
    where n.event_id = pe.event_id and n.superseded_at is null
      and (n.parche_event_id is null or n.parche_event_id = pe.id)
    order by n.match_id, (n.parche_event_id is null), n.created_at desc
  )
  select v.id, v.title, v.summary, v.match_id, v.scope, v.created_at
  from vis v
  where p_before is null or v.created_at < p_before
  order by v.created_at desc
  limit least(greatest(coalesce(p_limit, 20), 1), 50);
$$;

create or replace function public.get_news_item(p_parche_event_id uuid, p_news_id uuid)
returns table (id uuid, title text, summary text, content text, match_id uuid, scope text, created_at timestamptz)
language sql
stable
set search_path = ''
as $$
  select n.id, n.title, n.summary, n.content, n.match_id,
         case when n.parche_event_id is null then 'event' else 'parche' end, n.created_at
  from public.news n
  join public.parche_events pe on pe.id = p_parche_event_id and pe.event_id = n.event_id
  where n.id = p_news_id and n.superseded_at is null
    and (n.parche_event_id is null or n.parche_event_id = pe.id);
$$;

revoke all on function public.control_news_context(uuid), public.control_publish_match_news(uuid, integer, jsonb),
  public.get_news_feed(uuid, integer, timestamptz), public.get_news_item(uuid, uuid) from public, anon;
grant execute on function public.control_news_context(uuid), public.control_publish_match_news(uuid, integer, jsonb),
  public.get_news_feed(uuid, integer, timestamptz), public.get_news_item(uuid, uuid) to authenticated;
