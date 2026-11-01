-- La Canchita — historial permanente de clasificaciones y trazabilidad del cierre.
--
-- * standing_snapshots: fotografía de la clasificación COMPLETA de un parche en un evento.
--     kind = 'final_close'     → producida por un cierre definitivo (event_close_runs).
--     kind = 'historical_cut'  → corte histórico verificable (p. ej. importado de La Penúltima)
--                                que todavía no es un cierre oficial; puede formalizarse
--                                después con un close run sin alterar sus filas.
-- * standing_snapshot_rows: una fila por miembro incluido en la fotografía, clasificado o no.
--   La clasificación no depende de los pronósticos: sigue siendo consultable tras purgarlos.
-- * Una fotografía sellada (sealed_at) es inmutable: sus filas no se insertan, cambian ni borran.
--   Al sellar se exige que rows_checksum coincida con la huella calculada de las filas.
-- * event_close_runs: máquina de estados del cierre (manual o automático). Este archivo NO
--   implementa ni programa ninguna purga; solo la estructura y las transiciones válidas.
-- * data_imports: registro de importaciones (idempotencia y procedencia).
--
-- Valores ausentes: stats_status distingue 'verified' (cifras reales, incluido el cero),
-- 'unknown' (sin evidencia) y 'not_applicable'; participation distingue clasificado de no clasificado.

create table public.event_close_runs (
  id            uuid primary key default gen_random_uuid(),
  event_id      uuid not null references public.events (id),
  mode          text not null check (mode in ('manual', 'automatic')),
  status        text not null default 'pending'
                check (status in ('pending', 'consolidated', 'verified', 'purged', 'closed', 'failed', 'cancelled')),
  requested_by  uuid references auth.users (id) on delete set null,
  -- Referencia al respaldo frío tomado antes de cualquier purga (obligatorio para pasar a 'purged').
  backup_ref    text,
  error         text,
  details       jsonb not null default '{}'::jsonb,
  started_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  finished_at   timestamptz,
  constraint event_close_runs_purge_needs_backup check (status not in ('purged', 'closed') or backup_ref is not null),
  constraint event_close_runs_failed_has_error check (status <> 'failed' or error is not null)
);
-- Un único cierre en curso o completado por evento (los fallidos/cancelados no bloquean reintentos).
create unique index event_close_runs_one_active_idx on public.event_close_runs (event_id)
  where status not in ('failed', 'cancelled');

create or replace function private.event_close_runs_transition()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  allowed text[];
begin
  if tg_op = 'INSERT' then
    if new.status <> 'pending' then
      raise exception 'event_close_runs: un cierre siempre empieza en pending';
    end if;
    return new;
  end if;
  if new.event_id <> old.event_id or new.mode <> old.mode then
    raise exception 'event_close_runs: event_id y mode son inmutables';
  end if;
  if new.status <> old.status then
    allowed := case old.status
      when 'pending'      then array['consolidated', 'failed', 'cancelled']
      when 'consolidated' then array['verified', 'failed', 'cancelled']
      when 'verified'     then array['purged', 'failed', 'cancelled']
      when 'purged'       then array['closed', 'failed']
      else array[]::text[]
    end;
    if not new.status = any (allowed) then
      raise exception 'event_close_runs: transición % → % no permitida', old.status, new.status;
    end if;
  end if;
  new.updated_at := now();
  if new.status in ('closed', 'failed', 'cancelled') and new.finished_at is null then
    new.finished_at := now();
  end if;
  return new;
end;
$$;
create trigger event_close_runs_transition before insert or update on public.event_close_runs
  for each row execute function private.event_close_runs_transition();

create table public.standing_snapshots (
  id               uuid primary key default gen_random_uuid(),
  parche_event_id  uuid not null references public.parche_events (id),
  version          integer not null check (version >= 1),
  kind             text not null check (kind in ('final_close', 'historical_cut')),
  close_run_id     uuid references public.event_close_runs (id),
  -- Procedencia: 'legacy_import' (La Penúltima) o 'close_run'.
  source           text not null check (source in ('legacy_import', 'close_run')),
  source_ref       text,
  -- Reglas efectivamente aplicadas (puntos por fase, criterios de orden y desempate).
  scoring_rules    jsonb not null,
  ranking_rules    jsonb not null,
  -- Información de premios con su base de evidencia; NULL = el parche no tenía premios.
  prize_info       jsonb,
  member_count     integer not null check (member_count >= 0),
  ranked_count     integer not null check (ranked_count >= 0 and ranked_count <= member_count),
  computed_at      timestamptz not null,
  data_cutoff_at   timestamptz,
  notes            text,
  rows_checksum    text check (rows_checksum ~ '^[0-9a-f]{64}$'),
  sealed_at        timestamptz,
  created_at       timestamptz not null default now(),
  unique (parche_event_id, version),
  constraint standing_snapshots_sealed_checksum check ((sealed_at is null) = (rows_checksum is null)),
  constraint standing_snapshots_final_has_run check (kind <> 'final_close' or close_run_id is not null),
  constraint standing_snapshots_source_run check ((source = 'close_run') = (close_run_id is not null))
);
-- Como máximo una clasificación final oficial por parche y evento.
create unique index standing_snapshots_one_final_idx on public.standing_snapshots (parche_event_id)
  where kind = 'final_close';

create table public.standing_snapshot_rows (
  snapshot_id        uuid not null references public.standing_snapshots (id),
  row_number         integer not null check (row_number >= 1),
  -- Si la cuenta se elimina, la fila se conserva con user_id NULL y el nombre histórico.
  user_id            uuid references auth.users (id) on delete set null,
  display_name       text not null,
  membership_role    text not null check (membership_role in ('owner', 'admin', 'member')),
  membership_status  text not null check (membership_status in ('active', 'disabled')),
  participation      text not null check (participation in ('ranked', 'unranked')),
  unranked_reason    text check (unranked_reason in ('disabled', 'platform_admin', 'no_participation', 'other')),
  position           integer check (position >= 1),
  position_shared    boolean,
  stats_status       text not null check (stats_status in ('verified', 'unknown', 'not_applicable')),
  points             integer check (points >= 0),
  exact_hits         integer check (exact_hits >= 0),
  result_hits        integer check (result_hits >= 0),
  misses             integer check (misses >= 0),
  predictions_count  integer check (predictions_count >= 0),
  -- Valores usados por los criterios de desempate de ranking_rules.
  tiebreak_values    jsonb,
  prize_status       text not null check (prize_status in ('not_applicable', 'none', 'calculated', 'paid', 'unknown')),
  prize_amount       numeric(12, 2) check (prize_amount >= 0),
  primary key (snapshot_id, row_number),
  unique (snapshot_id, user_id),
  constraint ssr_ranked_has_position check ((participation = 'ranked') = (position is not null)),
  constraint ssr_ranked_fields check (participation <> 'ranked'
    or (unranked_reason is null and position_shared is not null and stats_status = 'verified' and tiebreak_values is not null)),
  constraint ssr_unranked_fields check (participation <> 'unranked'
    or (unranked_reason is not null and position_shared is null and tiebreak_values is null)),
  constraint ssr_stats_verified check (stats_status <> 'verified'
    or (points is not null and exact_hits is not null and result_hits is not null and misses is not null
        and predictions_count is not null and exact_hits + result_hits + misses <= predictions_count)),
  constraint ssr_stats_absent check (stats_status = 'verified'
    or (points is null and exact_hits is null and result_hits is null and misses is null and predictions_count is null)),
  -- 'calculated' = derivado de las reglas del parche, sin evidencia de pago; 'paid' = pago con evidencia;
  -- 'none' = cero real (sin premio según las reglas); 'unknown'/'not_applicable' = sin monto.
  constraint ssr_prize check (case prize_status
    when 'calculated' then coalesce(prize_amount > 0, false)
    when 'paid'       then coalesce(prize_amount > 0, false)
    when 'none'       then coalesce(prize_amount = 0, false)
    else prize_amount is null end)
);

-- Huella canónica de las filas de una fotografía (orden por row_number).
create or replace function private.standing_rows_checksum(p_snapshot_id uuid)
returns text
language sql
stable
set search_path = ''
as $$
  select encode(sha256(convert_to(coalesce(string_agg(
    concat_ws('|',
      r.row_number, coalesce(r.user_id::text, '∅'), r.display_name, r.membership_role, r.membership_status,
      r.participation, coalesce(r.unranked_reason, '∅'), coalesce(r.position::text, '∅'),
      coalesce(r.position_shared::text, '∅'), r.stats_status, coalesce(r.points::text, '∅'),
      coalesce(r.exact_hits::text, '∅'), coalesce(r.result_hits::text, '∅'), coalesce(r.misses::text, '∅'),
      coalesce(r.predictions_count::text, '∅'), coalesce(r.tiebreak_values::text, '∅'),
      r.prize_status, coalesce(r.prize_amount::text, '∅')),
    E'\n' order by r.row_number), ''), 'UTF8')), 'hex')
  from public.standing_snapshot_rows r
  where r.snapshot_id = p_snapshot_id;
$$;

-- Verificación posterior: ¿la fotografía sellada sigue coincidiendo con su huella?
create or replace function private.verify_standing_snapshot(p_snapshot_id uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select s.sealed_at is not null and s.rows_checksum = private.standing_rows_checksum(s.id)
  from public.standing_snapshots s where s.id = p_snapshot_id;
$$;

create or replace function private.standing_snapshots_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  n_rows integer;
  n_ranked integer;
begin
  if tg_op = 'DELETE' then
    if old.sealed_at is not null then
      raise exception 'standing_snapshots: una fotografía sellada no se puede borrar';
    end if;
    return old;
  end if;
  if old.sealed_at is not null then
    raise exception 'standing_snapshots: una fotografía sellada es inmutable';
  end if;
  if new.sealed_at is not null then
    select count(*), count(*) filter (where participation = 'ranked')
      into n_rows, n_ranked
      from public.standing_snapshot_rows where snapshot_id = new.id;
    if n_rows <> new.member_count or n_ranked <> new.ranked_count then
      raise exception 'standing_snapshots: conteos (% / %) no coinciden con las filas (% / %)',
        new.member_count, new.ranked_count, n_rows, n_ranked;
    end if;
    if new.rows_checksum is distinct from private.standing_rows_checksum(new.id) then
      raise exception 'standing_snapshots: rows_checksum no coincide con las filas';
    end if;
  end if;
  return new;
end;
$$;
create trigger standing_snapshots_guard before update or delete on public.standing_snapshots
  for each row execute function private.standing_snapshots_guard();

create or replace function private.standing_snapshot_rows_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  sid uuid := case when tg_op = 'INSERT' then new.snapshot_id else old.snapshot_id end;
begin
  if exists (select 1 from public.standing_snapshots s where s.id = sid and s.sealed_at is not null) then
    -- Única excepción: ON DELETE SET NULL al eliminar la cuenta del usuario.
    if tg_op = 'UPDATE' and new.user_id is null and old.user_id is not null
       and (to_jsonb(new) - 'user_id') = (to_jsonb(old) - 'user_id') then
      return new;
    end if;
    raise exception 'standing_snapshot_rows: la fotografía % está sellada', sid;
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;
create trigger standing_snapshot_rows_guard before insert or update or delete on public.standing_snapshot_rows
  for each row execute function private.standing_snapshot_rows_guard();

-- Un evento cerrado congela sus partidos y no admite pronósticos nuevos ni cambios
-- (la purga futura, si se autoriza, solo borrará pronósticos).
create or replace function private.block_closed_event_changes()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  eid uuid := case when tg_op = 'DELETE' then old.event_id else new.event_id end;
begin
  if tg_table_name = 'predictions' and tg_op = 'DELETE' then
    return old;
  end if;
  if exists (select 1 from public.events e where e.id = eid and e.status = 'closed')
     or (tg_op = 'UPDATE' and exists (select 1 from public.events e where e.id = old.event_id and e.status = 'closed')) then
    raise exception '%: el evento % está cerrado', tg_table_name, eid;
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;
create trigger matches_closed_event before insert or update or delete on public.matches
  for each row execute function private.block_closed_event_changes();
create trigger predictions_closed_event before insert or update on public.predictions
  for each row execute function private.block_closed_event_changes();

create table public.data_imports (
  id             uuid primary key default gen_random_uuid(),
  source_key     text not null unique,
  source_sha256  text not null check (source_sha256 ~ '^[0-9a-f]{64}$'),
  script         text not null,
  summary        jsonb not null,
  imported_at    timestamptz not null default now()
);
comment on table public.data_imports is 'Importaciones aplicadas; source_key único impide repetir una importación.';

create or replace function private.can_view_snapshot(p_snapshot_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.standing_snapshots s
    join public.parche_events pe on pe.id = s.parche_event_id
    join public.parche_members pm on pm.parche_id = pe.parche_id
    where s.id = p_snapshot_id and s.sealed_at is not null and pm.user_id = (select auth.uid())
  );
$$;

revoke all on all functions in schema private from public, anon, authenticated;
grant execute on function private.is_parche_member(uuid),
                          private.is_parche_event_member(uuid),
                          private.can_write_prediction(uuid, uuid),
                          private.can_view_others_predictions(uuid, uuid),
                          private.can_view_snapshot(uuid)
  to authenticated;

alter table public.event_close_runs        enable row level security;
alter table public.standing_snapshots      enable row level security;
alter table public.standing_snapshot_rows  enable row level security;
alter table public.data_imports            enable row level security;

revoke all on public.event_close_runs, public.standing_snapshots, public.standing_snapshot_rows, public.data_imports
  from anon, authenticated;
grant select, insert, update, delete on public.event_close_runs, public.standing_snapshots,
              public.standing_snapshot_rows, public.data_imports
  to service_role;

-- Historial: solo lectura para miembros del parche y solo de fotografías selladas.
-- Ningún cliente puede crear, modificar ni borrar clasificaciones (sin privilegios ni políticas de escritura).
grant select on public.standing_snapshots, public.standing_snapshot_rows to authenticated;
create policy standing_snapshots_member_read on public.standing_snapshots
  for select to authenticated using ((select private.can_view_snapshot(id)));
create policy standing_snapshot_rows_member_read on public.standing_snapshot_rows
  for select to authenticated using ((select private.can_view_snapshot(snapshot_id)));
-- event_close_runs y data_imports: sin políticas para clientes (solo backend/migraciones).
