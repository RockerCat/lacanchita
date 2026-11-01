-- Saneamiento monetario definitivo (AUTORIZADO por Alex el 2026-10-29; ver CLAUDE.md §5.8 y §5.10).
-- La Canchita no gestiona dinero. Retira los datos y estructuras monetarias heredadas de La Penúltima
-- sin alterar ningún dato deportivo:
--   1. Si existe la fotografía v1 del Mundial 2026 (con montos), verifica su sello (017e0c18…),
--      copia sus campos deportivos y calcula una huella deportiva.
--   2. Desactiva los triggers de inmutabilidad SOLO para borrar la v1 y los reactiva de inmediato.
--   3. Elimina las seis columnas monetarias, la restricción ssr_prize y las guardas *_no_money.
--   4. Redefine la huella canónica sin campos monetarios.
--   5. Crea y sella la v2 (5aeb192e…) con los mismos datos deportivos y exige huella deportiva idéntica.
-- En un entorno sin la v1 (p. ej. una base nueva) solo aplica los cambios de esquema (pasos 3 y 4).
-- Debe ejecutarse dentro de UNA transacción (db push lo hace; para db query, envolver en BEGIN/COMMIT).
-- Respaldo previo de la v1: archivo privado fuera del repo; la v1 exacta también se regenera desde el
-- dump original con scripts/history-migration/prepare_wc2026_import.py.

do $$
begin
  if to_regclass('public.data_imports') is not null
     and exists (select 1 from public.data_imports where source_key = 'saneamiento-monetario:v1') then
    raise exception 'saneamiento: ya aplicado';
  end if;
end $$;

create temp table v1_snapshot on commit drop as
  select * from public.standing_snapshots where id = '3112d842-c149-5ae6-a459-5594b59b4656';
create temp table v1_rows on commit drop as
  select snapshot_id, row_number, user_id, display_name, membership_role, membership_status, participation,
         unranked_reason, position, position_shared, stats_status, points, exact_hits, result_hits, misses,
         predictions_count, tiebreak_values
  from public.standing_snapshot_rows where snapshot_id = '3112d842-c149-5ae6-a459-5594b59b4656';

do $$
begin
  if exists (select 1 from pg_temp.v1_snapshot) then
    if not exists (select 1 from pg_temp.v1_snapshot where sealed_at is not null
                   and rows_checksum = '017e0c18bbb04e7efc1209d6bd7c374841b8d4ff6d0f94cf371154b7bec17b8f') then
      raise exception 'saneamiento: la v1 no está sellada con la huella esperada';
    end if;
    if not private.verify_standing_snapshot('3112d842-c149-5ae6-a459-5594b59b4656') then
      raise exception 'saneamiento: la v1 no verifica';
    end if;
    if (select count(*) from pg_temp.v1_rows) <> 18 then raise exception 'saneamiento: la v1 no tiene 18 filas'; end if;
  end if;
  -- Cualquier otra fotografía con datos monetarios quedaría sin sanear: no continuar.
  if exists (select 1 from public.standing_snapshots
             where id <> '3112d842-c149-5ae6-a459-5594b59b4656' and prize_info is not null)
     or exists (select 1 from public.standing_snapshot_rows
                where snapshot_id <> '3112d842-c149-5ae6-a459-5594b59b4656'
                  and (prize_status <> 'not_applicable' or prize_amount is not null)) then
    raise exception 'saneamiento: hay otras fotografías con datos monetarios';
  end if;
end $$;

-- Huella deportiva: todos los campos no monetarios, en orden.
create function pg_temp.sports_fingerprint(p_snapshot uuid, p_from_temp boolean) returns text language sql as $$
  select encode(sha256(convert_to(string_agg(concat_ws('|',
    r.row_number, coalesce(r.user_id::text, '∅'), r.display_name, r.membership_role, r.membership_status,
    r.participation, coalesce(r.unranked_reason, '∅'), coalesce(r.position::text, '∅'),
    coalesce(r.position_shared::text, '∅'), r.stats_status, coalesce(r.points::text, '∅'),
    coalesce(r.exact_hits::text, '∅'), coalesce(r.result_hits::text, '∅'), coalesce(r.misses::text, '∅'),
    coalesce(r.predictions_count::text, '∅'), coalesce(r.tiebreak_values::text, '∅')), E'\n' order by r.row_number), 'UTF8')), 'hex')
  from (
    select row_number, user_id, display_name, membership_role, membership_status, participation, unranked_reason,
           position, position_shared, stats_status, points, exact_hits, result_hits, misses, predictions_count, tiebreak_values
    from pg_temp.v1_rows where p_from_temp
    union all
    select row_number, user_id, display_name, membership_role, membership_status, participation, unranked_reason,
           position, position_shared, stats_status, points, exact_hits, result_hits, misses, predictions_count, tiebreak_values
    from public.standing_snapshot_rows where not p_from_temp and snapshot_id = p_snapshot
  ) r;
$$;
create temp table fp on commit drop as select pg_temp.sports_fingerprint(null, true) as before;

-- 2. Borrado de la v1: única operación que desactiva la protección, dentro de esta transacción.
do $$
begin
  if exists (select 1 from pg_temp.v1_snapshot) then
    alter table public.standing_snapshot_rows disable trigger standing_snapshot_rows_guard;
    delete from public.standing_snapshot_rows where snapshot_id = '3112d842-c149-5ae6-a459-5594b59b4656';
    alter table public.standing_snapshot_rows enable trigger standing_snapshot_rows_guard;
    alter table public.standing_snapshots disable trigger standing_snapshots_guard;
    delete from public.standing_snapshots where id = '3112d842-c149-5ae6-a459-5594b59b4656';
    alter table public.standing_snapshots enable trigger standing_snapshots_guard;
  end if;
end $$;

-- 3. Estructuras monetarias fuera.
drop trigger if exists parche_events_no_money on public.parche_events;
drop trigger if exists standing_snapshots_no_money on public.standing_snapshots;
drop trigger if exists standing_snapshot_rows_no_money on public.standing_snapshot_rows;
drop function if exists private.reject_monetary_values();
alter table public.parche_events drop constraint if exists parche_events_fee_currency;
alter table public.parche_events
  drop column if exists entry_fee, drop column if exists currency, drop column if exists prize_distribution;
alter table public.standing_snapshots drop column if exists prize_info;
alter table public.standing_snapshot_rows drop constraint if exists ssr_prize;
alter table public.standing_snapshot_rows drop column if exists prize_status, drop column if exists prize_amount;

-- 4. Huella canónica sin campos monetarios.
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
      coalesce(r.predictions_count::text, '∅'), coalesce(r.tiebreak_values::text, '∅')),
    E'\n' order by r.row_number), ''), 'UTF8')), 'hex')
  from public.standing_snapshot_rows r
  where r.snapshot_id = p_snapshot_id;
$$;

-- 5. Fotografía v2 con los mismos datos deportivos, sellada y verificada.
do $$
declare
  v2 constant uuid := '5aeb192e-01fd-55cb-b436-602f2fcce5ff';
begin
  if not exists (select 1 from pg_temp.v1_snapshot) then
    return;
  end if;
  insert into public.standing_snapshots (id, parche_event_id, version, kind, close_run_id, source, source_ref, scoring_rules,
    ranking_rules, member_count, ranked_count, computed_at, data_cutoff_at, notes)
  select v2, parche_event_id, 2, kind, close_run_id, source, source_ref, scoring_rules, ranking_rules, member_count,
    ranked_count, computed_at, data_cutoff_at,
    notes || ' v2: misma clasificación deportiva que la v1 (huella 017e0c18…), sin datos monetarios (La Canchita no gestiona dinero).'
  from pg_temp.v1_snapshot;
  insert into public.standing_snapshot_rows (snapshot_id, row_number, user_id, display_name, membership_role, membership_status,
    participation, unranked_reason, position, position_shared, stats_status, points, exact_hits, result_hits, misses,
    predictions_count, tiebreak_values)
  select v2, row_number, user_id, display_name, membership_role, membership_status, participation, unranked_reason,
    position, position_shared, stats_status, points, exact_hits, result_hits, misses, predictions_count, tiebreak_values
  from pg_temp.v1_rows;
  update public.standing_snapshots set rows_checksum = private.standing_rows_checksum(id), sealed_at = now() where id = v2;

  if pg_temp.sports_fingerprint(v2, false) is distinct from (select before from pg_temp.fp) then
    raise exception 'saneamiento: la clasificación deportiva cambió';
  end if;
  if (select count(*) from public.standing_snapshot_rows where snapshot_id = v2) <> 18
     or (select count(*) from public.standing_snapshot_rows where snapshot_id = v2 and participation = 'ranked' and position is not null) <> 13
     or (select count(*) from public.standing_snapshot_rows where snapshot_id = v2 and position is null) <> 5 then
    raise exception 'saneamiento: conteos';
  end if;
  if not private.verify_standing_snapshot(v2) then raise exception 'saneamiento: sello v2'; end if;
  if (select count(*) from public.standing_snapshots) <> 1 then raise exception 'saneamiento: fotografías inesperadas'; end if;

  insert into public.data_imports (id, source_key, source_sha256, script, summary)
  values ('fed41a0b-f088-53c7-a10c-08305eb3b73d', 'saneamiento-monetario:v1',
    'cef1ce449d98faed8dcf0ee109b7f877d11ccd42b6e984b9fee6940000366703',
    'supabase/migrations/20261029230000_saneamiento_monetario.sql',
    jsonb_build_object('replaced_snapshot', '3112d842-c149-5ae6-a459-5594b59b4656',
      'replaced_checksum', '017e0c18bbb04e7efc1209d6bd7c374841b8d4ff6d0f94cf371154b7bec17b8f',
      'new_snapshot', v2,
      'new_checksum', (select rows_checksum from public.standing_snapshots where id = v2),
      'sports_fingerprint', (select before from pg_temp.fp)));
end $$;

do $$
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public'
             and column_name in ('entry_fee', 'currency', 'prize_distribution', 'prize_info', 'prize_status', 'prize_amount')) then
    raise exception 'saneamiento: quedan columnas monetarias';
  end if;
end $$;
