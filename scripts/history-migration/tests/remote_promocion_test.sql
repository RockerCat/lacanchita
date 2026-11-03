-- Promoción de torneos futuros (proyecto real, todo dentro de una transacción con ROLLBACK).
begin;
create temp table r(name text, ok boolean);
grant all on r to public;
do $$
declare ev uuid; sa constant uuid := '95d77e57-b6cb-4359-bc86-e70b3b9f44dd'; n int; ok boolean; v_hist bigint;
begin
  select count(*) into v_hist from public.matches;
  select id into ev from public.events where slug = 'liga-primera-division-colombiana-2026-ii';
  insert into r values ('el torneo real existe una sola vez', (select count(*) from public.events where slug like 'liga-%') = 1);
  -- usuario normal no puede fijar la promoción
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
  begin set local role authenticated; perform public.control_set_event_promo(ev, date '2030-01-01', 'x'); ok := false;
  exception when others then ok := true; end;
  reset role;
  insert into r values ('un usuario normal no puede fijar la promoción', ok);
  -- anon tampoco
  begin set local role anon; perform public.control_set_event_promo(ev, date '2030-01-01', 'x'); ok := false;
  exception when others then ok := true; end;
  reset role;
  insert into r values ('anon no puede fijar la promoción', ok);
  -- superadministrador: valida longitud y guarda
  perform set_config('request.jwt.claims', json_build_object('sub', sa, 'role', 'authenticated')::text, true);
  begin perform public.control_set_event_promo(ev, date '2026-11-14', repeat('x', 281)); ok := false;
  exception when others then ok := true; end;
  insert into r values ('texto > 280 rechazado', ok);
  perform public.control_set_event_promo(ev, date '2026-11-14', null);
  insert into r values ('fecha anunciada guardada como fecha civil sin partidos', (select announced_start_date = date '2026-11-14' and (select count(*) from public.matches where event_id = ev) = 0 from public.events where id = ev));
  insert into r values ('auditada', exists (select 1 from public.control_audit_log where action = 'event_promo_updated' and event_id = ev));
  -- lectura pública
  update public.events set landing_visible = true where id = ev;
  set local role anon;
  select count(*) into n from public.get_landing_tournaments() where slug = 'liga-primera-division-colombiana-2026-ii' and announced_start_date = date '2026-11-14' and first_match_at is null;
  reset role;
  insert into r values ('anon ve el torneo sin partidos con su fecha anunciada', n = 1);
  update public.events set landing_visible = false where id = ev;
  set local role anon;
  select count(*) into n from public.get_landing_tournaments() where slug = 'liga-primera-division-colombiana-2026-ii';
  reset role;
  insert into r values ('respeta landing_visible', n = 0);
  update public.events set landing_visible = true, status = 'draft' where id = ev;
  set local role anon;
  select count(*) into n from public.get_landing_tournaments() where slug = 'liga-primera-division-colombiana-2026-ii';
  reset role;
  insert into r values ('un borrador nunca se promociona', n = 0);
  insert into r values ('el Mundial histórico sigue sin aparecer', not exists (select 1 from public.get_landing_tournaments() where slug = 'mundial-2026'));
  insert into r values ('partidos intactos', (select count(*) from public.matches) = v_hist);
end $$;
select count(*) filter (where ok) || '/' || count(*) as passed, string_agg(case when not ok then name end, ' | ') as fallos from r;
rollback;
