-- La Canchita — modelo mínimo multitorneo y multiparche.
--
-- Datos deportivos globales (un partido existe una sola vez) + tenencia por parche
-- + pronósticos aislados por (parche_event, partido, usuario).
-- Las cuentas viven en auth.users (UUID migrados de La Penúltima); este archivo no toca auth.
--
-- Seguridad:
--   * RLS activado en todas las tablas; los clientes (rol authenticated) solo leen,
--     salvo pronósticos propios en partidos abiertos de parches donde son miembros activos.
--   * Los datos deportivos, parches, membresías y puntos solo los escribe el backend
--     (service_role) o migraciones; no hay políticas de escritura para clientes.
--   * Privilegios por columna: un cliente nunca puede escribir points/points_reason/scored_at.
--   * Funciones auxiliares SECURITY DEFINER en el esquema `private` (no expuesto por la API),
--     con search_path vacío; evitan recursión de RLS en parche_members.

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated, service_role;

create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ─── Datos deportivos ────────────────────────────────────────────────────────

create table public.events (
  id               uuid primary key default gen_random_uuid(),
  slug             text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name             text not null check (char_length(btrim(name)) between 2 and 120),
  timezone         text not null default 'America/Bogota',
  status           text not null default 'draft'
                   check (status in ('draft', 'scheduled', 'in_progress', 'finished', 'closed', 'cancelled')),
  -- Fin oficial según fuente oficial; base del plazo de cierre automático (30 días). NULL = no registrado.
  official_end_at  timestamptz,
  closed_at        timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint events_closed_consistent check ((status = 'closed') = (closed_at is not null))
);
comment on table public.events is 'Torneo o competición. status=closed solo tras un cierre definitivo verificado (event_close_runs).';

create table public.event_stages (
  id             uuid primary key default gen_random_uuid(),
  event_id       uuid not null references public.events (id),
  code           text not null check (code ~ '^[a-z0-9_]+$'),
  name           text not null,
  sort_order     integer not null,
  is_knockout    boolean not null default false,
  -- Puntos por pronóstico: exact_points por marcador exacto (no se suma result_points),
  -- result_points por acertar ganador/empate.
  exact_points   integer not null check (exact_points >= 0),
  result_points  integer not null check (result_points >= 0),
  unique (event_id, code),
  unique (event_id, sort_order),
  unique (id, event_id)
);
comment on table public.event_stages is 'Fases de un evento con su configuración de puntuación.';

create table public.teams (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  code        text,
  kind        text not null default 'national' check (kind in ('national', 'club', 'other')),
  flag_emoji  text,
  created_at  timestamptz not null default now()
);
comment on table public.teams is 'Equipos o selecciones reutilizables entre eventos. code no es único globalmente.';

create table public.event_teams (
  event_id    uuid not null references public.events (id),
  team_id     uuid not null references public.teams (id),
  group_code  text,
  primary key (event_id, team_id)
);

create table public.matches (
  id                   uuid primary key default gen_random_uuid(),
  event_id             uuid not null references public.events (id),
  stage_id             uuid not null,
  match_number         integer,
  group_code           text,
  starts_at            timestamptz not null,
  venue                text,
  home_team_id         uuid,
  away_team_id         uuid,
  home_placeholder     text,
  away_placeholder     text,
  -- Cómo se conocen los equipos: 'assigned' (cargados explícitamente) o
  -- 'derived_legacy_logic' (derivados con la lógica original de La Penúltima).
  teams_source         text check (teams_source in ('assigned', 'derived_legacy_logic')),
  status               text not null default 'scheduled'
                       check (status in ('scheduled', 'live', 'finished', 'postponed', 'cancelled')),
  home_score           integer check (home_score >= 0),
  away_score           integer check (away_score >= 0),
  -- Ganador cuando el marcador termina empatado en eliminatoria (penales). No suma puntos.
  winner_side          text check (winner_side in ('home', 'away')),
  -- Confirmación explícita del resultado; precondición del cierre definitivo. NULL = no confirmado.
  result_confirmed_at  timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (event_id, match_number),
  unique (id, event_id),
  foreign key (stage_id, event_id) references public.event_stages (id, event_id),
  foreign key (event_id, home_team_id) references public.event_teams (event_id, team_id),
  foreign key (event_id, away_team_id) references public.event_teams (event_id, team_id),
  constraint matches_different_teams check (home_team_id is null or away_team_id is null or home_team_id <> away_team_id),
  constraint matches_score_pair check ((home_score is null) = (away_score is null)),
  constraint matches_finished_has_score check (status <> 'finished' or home_score is not null),
  constraint matches_confirmed_only_finished check (result_confirmed_at is null or status = 'finished'),
  constraint matches_teams_source check ((teams_source is null) = (home_team_id is null and away_team_id is null))
);
create index matches_event_starts_idx on public.matches (event_id, starts_at);
create index matches_stage_idx on public.matches (stage_id);
create trigger matches_updated_at before update on public.matches
  for each row execute function private.set_updated_at();

-- Resultados globales del evento (campeón, subcampeón…), respaldados por un partido.
create table public.event_results (
  event_id         uuid not null references public.events (id),
  result_key       text not null check (result_key in ('champion', 'runner_up', 'third_place', 'fourth_place')),
  team_id          uuid not null,
  source_match_id  uuid not null,
  primary key (event_id, result_key),
  foreign key (event_id, team_id) references public.event_teams (event_id, team_id),
  foreign key (source_match_id, event_id) references public.matches (id, event_id)
);

-- ─── Tenencia: parches ───────────────────────────────────────────────────────

create table public.parches (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(btrim(name)) between 2 and 50),
  created_by  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create trigger parches_updated_at before update on public.parches
  for each row execute function private.set_updated_at();

create table public.parche_members (
  id           uuid not null unique default gen_random_uuid(),
  parche_id    uuid not null references public.parches (id) on delete cascade,
  user_id      uuid not null references auth.users (id) on delete cascade,
  role         text not null default 'member' check (role in ('owner', 'admin', 'member')),
  status       text not null default 'active' check (status in ('active', 'disabled')),
  joined_at    timestamptz not null default now(),
  disabled_at  timestamptz,
  primary key (parche_id, user_id),
  constraint parche_members_disabled_at check ((status = 'disabled') = (disabled_at is not null))
);
create index parche_members_user_idx on public.parche_members (user_id);

create table public.parche_events (
  id                      uuid primary key default gen_random_uuid(),
  parche_id               uuid not null references public.parches (id),
  event_id                uuid not null references public.events (id),
  status                  text not null default 'active' check (status in ('active', 'finished', 'closed')),
  -- Cuándo ven los miembros los pronósticos ajenos de un partido.
  predictions_visibility  text not null default 'after_kickoff'
                          check (predictions_visibility in ('after_kickoff', 'after_finish')),
  -- Configuración informativa de premios del parche en este evento (NULL = sin premios).
  entry_fee               numeric(12, 2) check (entry_fee >= 0),
  currency                text check (currency ~ '^[A-Z]{3}$'),
  prize_distribution      jsonb check (prize_distribution is null or jsonb_typeof(prize_distribution) = 'array'),
  created_at              timestamptz not null default now(),
  unique (parche_id, event_id),
  unique (id, event_id),
  constraint parche_events_fee_currency check (entry_fee is null or currency is not null)
);
create index parche_events_event_idx on public.parche_events (event_id);

-- ─── Pronósticos por parche ─────────────────────────────────────────────────

create table public.predictions (
  id               uuid primary key default gen_random_uuid(),
  parche_event_id  uuid not null,
  event_id         uuid not null,
  match_id         uuid not null,
  user_id          uuid not null references auth.users (id) on delete cascade,
  home_score       smallint not null check (home_score between 0 and 30),
  away_score       smallint not null check (away_score between 0 and 30),
  points           integer check (points >= 0),
  points_reason    text check (points_reason in ('exact', 'result', 'miss')),
  scored_at        timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  -- El contexto del parche es parte de la identidad: el mismo usuario puede pronosticar
  -- distinto el mismo partido en otro parche. NO existe unicidad global (match_id, user_id).
  unique (parche_event_id, match_id, user_id),
  foreign key (parche_event_id, event_id) references public.parche_events (id, event_id),
  foreign key (match_id, event_id) references public.matches (id, event_id),
  constraint predictions_scoring_consistent check ((points is null) = (points_reason is null) and (points is null) = (scored_at is null))
);
create index predictions_match_idx on public.predictions (match_id);
create index predictions_user_idx on public.predictions (user_id);
create trigger predictions_updated_at before update on public.predictions
  for each row execute function private.set_updated_at();

-- ─── Funciones auxiliares de autorización ───────────────────────────────────

create or replace function private.is_parche_member(p_parche_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.parche_members pm
    where pm.parche_id = p_parche_id and pm.user_id = (select auth.uid())
  );
$$;

create or replace function private.is_parche_event_member(p_parche_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.parche_events pe
    join public.parche_members pm on pm.parche_id = pe.parche_id
    where pe.id = p_parche_event_id and pm.user_id = (select auth.uid())
  );
$$;

-- Puede escribir un pronóstico: miembro ACTIVO del parche, parche_event activo y partido abierto.
create or replace function private.can_write_prediction(p_parche_event_id uuid, p_match_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.parche_events pe
    join public.parche_members pm on pm.parche_id = pe.parche_id
    join public.matches m on m.id = p_match_id and m.event_id = pe.event_id
    join public.events e on e.id = pe.event_id
    where pe.id = p_parche_event_id
      and pe.status = 'active'
      and e.status in ('scheduled', 'in_progress')
      and pm.user_id = (select auth.uid())
      and pm.status = 'active'
      and m.status = 'scheduled'
      and now() < m.starts_at
  );
$$;

-- Puede ver pronósticos ajenos: miembro del parche y partido ya visible según la regla del parche.
create or replace function private.can_view_others_predictions(p_parche_event_id uuid, p_match_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.parche_events pe
    join public.parche_members pm on pm.parche_id = pe.parche_id
    join public.matches m on m.id = p_match_id and m.event_id = pe.event_id
    where pe.id = p_parche_event_id
      and pm.user_id = (select auth.uid())
      and case pe.predictions_visibility
            when 'after_kickoff' then m.status <> 'scheduled' or now() >= m.starts_at
            when 'after_finish'  then m.status = 'finished'
            else false
          end
  );
$$;

revoke all on all functions in schema private from public, anon, authenticated;
grant execute on function private.is_parche_member(uuid),
                          private.is_parche_event_member(uuid),
                          private.can_write_prediction(uuid, uuid),
                          private.can_view_others_predictions(uuid, uuid)
  to authenticated;

-- ─── Privilegios y RLS ──────────────────────────────────────────────────────

alter table public.events          enable row level security;
alter table public.event_stages    enable row level security;
alter table public.teams           enable row level security;
alter table public.event_teams     enable row level security;
alter table public.matches         enable row level security;
alter table public.event_results   enable row level security;
alter table public.parches         enable row level security;
alter table public.parche_members  enable row level security;
alter table public.parche_events   enable row level security;
alter table public.predictions     enable row level security;

revoke all on public.events, public.event_stages, public.teams, public.event_teams, public.matches,
              public.event_results, public.parches, public.parche_members, public.parche_events,
              public.predictions
  from anon, authenticated;
grant select, insert, update, delete on public.events, public.event_stages, public.teams, public.event_teams,
              public.matches, public.event_results, public.parches, public.parche_members,
              public.parche_events, public.predictions
  to service_role;

-- Datos deportivos: lectura para usuarios autenticados (no son privados de ningún parche).
grant select on public.events, public.event_stages, public.teams, public.event_teams,
                public.matches, public.event_results
  to authenticated;
create policy events_read        on public.events        for select to authenticated using (true);
create policy event_stages_read  on public.event_stages  for select to authenticated using (true);
create policy teams_read         on public.teams         for select to authenticated using (true);
create policy event_teams_read   on public.event_teams   for select to authenticated using (true);
create policy matches_read       on public.matches       for select to authenticated using (true);
create policy event_results_read on public.event_results for select to authenticated using (true);

-- Parches: solo sus miembros.
grant select on public.parches, public.parche_members, public.parche_events to authenticated;
create policy parches_member_read on public.parches
  for select to authenticated using ((select private.is_parche_member(id)));
create policy parche_members_member_read on public.parche_members
  for select to authenticated using ((select private.is_parche_member(parche_id)));
create policy parche_events_member_read on public.parche_events
  for select to authenticated using ((select private.is_parche_member(parche_id)));

-- Pronósticos: propios siempre; ajenos del mismo parche solo cuando la regla lo permite.
-- Escritura solo de los propios, en partidos abiertos y sin tocar columnas de puntuación.
grant select on public.predictions to authenticated;
grant insert (parche_event_id, event_id, match_id, user_id, home_score, away_score) on public.predictions to authenticated;
grant update (home_score, away_score) on public.predictions to authenticated;
grant delete on public.predictions to authenticated;

create policy predictions_read on public.predictions
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or (select private.can_view_others_predictions(parche_event_id, match_id))
  );
create policy predictions_insert_own on public.predictions
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and (select private.can_write_prediction(parche_event_id, match_id))
  );
create policy predictions_update_own on public.predictions
  for update to authenticated
  using (user_id = (select auth.uid()) and (select private.can_write_prediction(parche_event_id, match_id)))
  with check (user_id = (select auth.uid()) and (select private.can_write_prediction(parche_event_id, match_id)));
create policy predictions_delete_own on public.predictions
  for delete to authenticated
  using (user_id = (select auth.uid()) and (select private.can_write_prediction(parche_event_id, match_id)));
