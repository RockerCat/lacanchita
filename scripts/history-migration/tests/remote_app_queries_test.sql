-- Reproduce, bajo RLS, las lecturas que hace la app (src/lib/data.ts) para distintas identidades
-- simuladas: miembro activo, miembro deshabilitado y usuario ajeno. SOLO LECTURA; termina en ROLLBACK.
-- No crea usuarios ni toca auth.*.
--   npx supabase db query --linked -f scripts/history-migration/tests/remote_app_queries_test.sql
begin;
create temp table results (n serial, name text, ok boolean, detail text);
grant insert, select on results to authenticated;
grant usage on sequence results_n_seq to authenticated;
create temp table ids as select
  (select user_id from public.parche_members where role = 'member' and status = 'active' limit 1) as member,
  (select user_id from public.parche_members where status = 'disabled' limit 1) as disabled_member,
  '00000000-0000-4000-8000-0000000000ff'::uuid as outsider,
  (select id from public.parches limit 1) as parche,
  (select id from public.parche_events limit 1) as parche_event;
grant select on ids to authenticated;

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
grant execute on all functions in schema pg_temp to authenticated;

-- getMemberships: parche_members(role, status, parches!inner(id, name)) where user_id = yo
select pg_temp.as_user((select member from ids));
select pg_temp.check('miembro: getMemberships devuelve 1 parche activo (entra directo)',
  (select count(*) = 1 and bool_and(pm.status = 'active') from public.parche_members pm join public.parches p on p.id = pm.parche_id
   where pm.user_id = (select member from ids)));
select pg_temp.check('miembro: getParcheEvents ve 1 torneo con fotografía sellada',
  (select count(*) from public.parche_events pe join public.events e on e.id = pe.event_id
   join public.standing_snapshots s on s.parche_event_id = pe.id and s.sealed_at is not null
   where pe.parche_id = (select parche from ids)) = 1);
select pg_temp.check('miembro: getHistory 18 filas = 13 clasificadas + 5 sin posición',
  (select count(*) filter (where participation = 'ranked' and position is not null) = 13
      and count(*) filter (where position is null) = 5 and count(*) = 18
   from public.standing_snapshot_rows r join public.standing_snapshots s on s.id = r.snapshot_id
   where s.parche_event_id = (select parche_event from ids)));
select pg_temp.check('miembro: getHistory 1.º y 2.º con 124 y 123 puntos (columnas deportivas legibles)',
  (select array_agg(points order by position) from public.standing_snapshot_rows where position <= 2) = array[124, 123]);
select pg_temp.check('sin columnas monetarias en public',
  (select count(*) from information_schema.columns where table_schema = 'public'
   and column_name in ('entry_fee', 'currency', 'prize_distribution', 'prize_info', 'prize_status', 'prize_amount')) = 0);
select pg_temp.try('miembro: select * de la clasificación funciona (no quedan columnas restringidas)', $q$select * from public.standing_snapshot_rows$q$, false);
select pg_temp.check('miembro: corte histórico, no cierre oficial',
  (select bool_and(kind = 'historical_cut') from public.standing_snapshots));
select pg_temp.check('miembro: 4 resultados con equipo y partido fuente derivado',
  (select count(*) from public.event_results er join public.teams t on t.id = er.team_id
   join public.matches m on m.id = er.source_match_id and m.teams_source = 'derived_legacy_logic') = 4);

select pg_temp.as_user((select disabled_member from ids));
select pg_temp.check('deshabilitado: getMemberships devuelve su parche con estado disabled',
  (select count(*) = 1 and bool_and(status = 'disabled') from public.parche_members where user_id = (select disabled_member from ids)));
select pg_temp.check('deshabilitado: puede leer el historial (política existente)',
  (select count(*) from public.standing_snapshot_rows) = 18);

select pg_temp.as_user((select outsider from ids));
select pg_temp.check('ajeno: getMemberships vacío (estado "sin parches")',
  (select count(*) from public.parche_members where user_id = (select outsider from ids)) = 0);
select pg_temp.check('ajeno: getMembership del parche histórico → null (404)',
  (select count(*) from public.parche_members where parche_id = (select parche from ids)) = 0
  and (select count(*) from public.parches) = 0);
select pg_temp.check('ajeno: getHistory del parche histórico → null (404)',
  (select count(*) from public.parche_events where id = (select parche_event from ids)) = 0
  and (select count(*) from public.standing_snapshots) = 0 and (select count(*) from public.standing_snapshot_rows) = 0);

do $$ begin execute 'reset role'; end $$;
select json_agg(json_build_object('ok', ok, 'name', name) order by n) as results,
       count(*) filter (where ok) as ok, count(*) filter (where not ok) as fallos from results;
rollback;
