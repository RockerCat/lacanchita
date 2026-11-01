-- La Canchita no gestiona dinero (decisión definitiva 2026-10-29): sin cuotas, bolsas, premios
-- monetarios ni pagos. Esta migración NO borra ni modifica datos; solo:
--   1. Retira a los clientes (rol authenticated) la lectura de las columnas monetarias.
--   2. Impide escribir valores monetarios nuevos (incluido el backend).
--   3. Marca las columnas como obsoletas.
-- Los valores históricos que quedan (1 fila de parche_events, prize_info y prize_status/prize_amount
-- de la fotografía sellada del Mundial 2026) se retiran con supabase/pending/saneamiento_monetario.sql,
-- que exige autorización explícita porque reemplaza una fotografía sellada.

-- 1. Lectura por columnas: todo menos lo monetario.
revoke select on public.parche_events, public.standing_snapshots, public.standing_snapshot_rows from authenticated;
grant select (id, parche_id, event_id, status, predictions_visibility, created_at)
  on public.parche_events to authenticated;
grant select (id, parche_event_id, version, kind, close_run_id, source, source_ref, scoring_rules, ranking_rules,
              member_count, ranked_count, computed_at, data_cutoff_at, notes, rows_checksum, sealed_at, created_at)
  on public.standing_snapshots to authenticated;
grant select (snapshot_id, row_number, user_id, display_name, membership_role, membership_status, participation,
              unranked_reason, position, position_shared, stats_status, points, exact_hits, result_hits, misses,
              predictions_count, tiebreak_values)
  on public.standing_snapshot_rows to authenticated;

-- 2. Sin valores monetarios nuevos. Se permite poner a NULL (saneamiento) y actualizar otras columnas.
create or replace function private.reject_monetary_values()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_table_name = 'parche_events' then
    if (new.entry_fee is not null and (tg_op = 'INSERT' or new.entry_fee is distinct from old.entry_fee))
       or (new.currency is not null and (tg_op = 'INSERT' or new.currency is distinct from old.currency))
       or (new.prize_distribution is not null and (tg_op = 'INSERT' or new.prize_distribution is distinct from old.prize_distribution)) then
      raise exception 'La Canchita no gestiona cuotas, monedas ni premios (parche_events)';
    end if;
  elsif tg_table_name = 'standing_snapshots' then
    if new.prize_info is not null then
      raise exception 'La Canchita no registra premios (standing_snapshots.prize_info)';
    end if;
  elsif tg_table_name = 'standing_snapshot_rows' then
    if new.prize_status <> 'not_applicable' or new.prize_amount is not null then
      raise exception 'La Canchita no registra premios (standing_snapshot_rows)';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function private.reject_monetary_values() from public, anon, authenticated;

create trigger parche_events_no_money before insert or update on public.parche_events
  for each row execute function private.reject_monetary_values();
create trigger standing_snapshots_no_money before insert on public.standing_snapshots
  for each row execute function private.reject_monetary_values();
create trigger standing_snapshot_rows_no_money before insert on public.standing_snapshot_rows
  for each row execute function private.reject_monetary_values();

-- Las filas nuevas no necesitan mencionar premios.
alter table public.standing_snapshot_rows alter column prize_status set default 'not_applicable';

-- 3. Columnas obsoletas.
comment on column public.parche_events.entry_fee is 'OBSOLETA: La Canchita no gestiona dinero. Pendiente de retirar (supabase/pending/saneamiento_monetario.sql).';
comment on column public.parche_events.currency is 'OBSOLETA: La Canchita no gestiona dinero. Pendiente de retirar.';
comment on column public.parche_events.prize_distribution is 'OBSOLETA: La Canchita no gestiona premios. Pendiente de retirar.';
comment on column public.standing_snapshots.prize_info is 'OBSOLETA: dato histórico de La Penúltima dentro de una fotografía sellada. Pendiente de retirar con autorización.';
comment on column public.standing_snapshot_rows.prize_status is 'OBSOLETA: solo admite not_applicable en filas nuevas. Pendiente de retirar con autorización.';
comment on column public.standing_snapshot_rows.prize_amount is 'OBSOLETA: solo admite NULL en filas nuevas. Pendiente de retirar con autorización.';
