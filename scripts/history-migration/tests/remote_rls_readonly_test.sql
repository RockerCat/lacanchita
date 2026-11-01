-- Pruebas RLS de SOLO LECTURA sobre lacanchita (cfzxentitxytnvvumfpv) con los datos históricos reales.
-- No crea usuarios ni toca auth.*: simula identidades con request.jwt.claims y SET LOCAL ROLE.
-- Los intentos de escritura deben fallar; toda la transacción termina en ROLLBACK de todos modos.
--   npx supabase db query --linked -f scripts/history-migration/tests/remote_rls_readonly_test.sql
begin;
create temp table results (n serial, name text, ok boolean, detail text);
grant insert, select on results to authenticated, anon;
grant usage on sequence results_n_seq to authenticated, anon;
create temp table ids as select
  (select user_id from public.parche_members where role = 'member' and status = 'active' limit 1) as member,
  (select user_id from public.parche_members where status = 'disabled' limit 1) as disabled_member,
  '00000000-0000-4000-8000-0000000000ff'::uuid as outsider;
grant select on ids to authenticated, anon;

create function pg_temp.as_user(p uuid) returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;
create function pg_temp.check(p_name text, p_ok boolean, p_detail text default null) returns void language sql as $$
  insert into results (name, ok, detail) values (p_name, coalesce(p_ok, false), p_detail);
$$;
create function pg_temp.try(p_name text, p_sql text, p_expect_error boolean) returns void language plpgsql as $$
declare n bigint;
begin
  begin
    execute p_sql;
    get diagnostics n = row_count;
    insert into results (name, ok, detail) values (p_name, not p_expect_error, 'sin error, filas=' || n);
  exception when others then
    insert into results (name, ok, detail) values (p_name, p_expect_error, sqlerrm);
  end;
end $$;
grant execute on all functions in schema pg_temp to authenticated, anon;

select pg_temp.as_user((select member from ids));
select pg_temp.check('miembro ve su parche', (select count(*) from public.parches) = 1);
select pg_temp.check('miembro ve las 18 membresías', (select count(*) from public.parche_members) = 18);
select pg_temp.check('miembro ve la clasificación completa', (select count(*) from public.standing_snapshot_rows) = 18);
select pg_temp.check('miembro ve los 104 partidos y resultados del evento',
  (select count(*) from public.matches where event_id = (select id from public.events where slug = 'mundial-2026')) = 104 and (select count(*) from public.event_results) = 4);
select pg_temp.try('miembro no modifica la clasificación', $q$update public.standing_snapshot_rows set points = 999$q$, true);
select pg_temp.try('miembro no borra la clasificación', $q$delete from public.standing_snapshot_rows$q$, true);
select pg_temp.try('miembro no altera la fotografía', $q$update public.standing_snapshots set notes = 'x'$q$, true);
select pg_temp.try('miembro no cambia su rol', $q$update public.parche_members set role = 'owner'$q$, true);
select pg_temp.try('miembro no cambia resultados', $q$update public.matches set home_score = 9$q$, true);
select pg_temp.try('miembro no pronostica en evento terminado',
  $q$insert into public.predictions (parche_event_id, event_id, match_id, user_id, home_score, away_score)
     select pe.id, pe.event_id, m.id, (select member from ids), 1, 0 from public.parche_events pe join public.matches m on m.event_id = pe.event_id limit 1$q$, true);
select pg_temp.try('miembro no lee importaciones ni cierres', $q$select * from public.data_imports$q$, true);

select pg_temp.as_user((select disabled_member from ids));
select pg_temp.check('miembro deshabilitado conserva acceso de lectura al historial', (select count(*) from public.standing_snapshot_rows) = 18);

select pg_temp.as_user((select outsider from ids));
select pg_temp.check('usuario ajeno no ve parches, membresías, parche_events, pronósticos ni historial',
  (select count(*) from public.parches) + (select count(*) from public.parche_members) + (select count(*) from public.parche_events)
  + (select count(*) from public.predictions) + (select count(*) from public.standing_snapshots)
  + (select count(*) from public.standing_snapshot_rows) = 0);
select pg_temp.try('usuario ajeno no se une al parche',
  $q$insert into public.parche_members (parche_id, user_id) select id, (select outsider from ids) from public.parches$q$, true);

do $$ begin execute 'reset role'; execute 'set local role anon'; end $$;
select pg_temp.try('anon no lee parches', $q$select * from public.parches$q$, true);
select pg_temp.try('anon no lee clasificaciones', $q$select * from public.standing_snapshot_rows$q$, true);
select pg_temp.try('anon no lee partidos', $q$select * from public.matches$q$, true);

do $$ begin execute 'reset role'; end $$;
select pg_temp.try('ni el rol privilegiado modifica la fotografía sellada',
  $q$update public.standing_snapshot_rows set points = points where row_number = 1$q$, true);
select pg_temp.check('fotografía sigue íntegra', (select bool_and(private.verify_standing_snapshot(id)) from public.standing_snapshots));

select json_agg(json_build_object('n', n, 'ok', ok, 'name', name, 'detail', detail) order by n) as results,
       count(*) filter (where ok) as ok, count(*) filter (where not ok) as fallos from results;
rollback;
