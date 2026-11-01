-- Pruebas funcionales de aislamiento entre parches, RLS e inmutabilidad del historial.
-- SOLO para el Postgres local desechable (cluster_name = lacanchita-local-test) con
-- local_supabase_stub.sql + migraciones + importación histórica aplicadas.
-- Usa usuarios, parches y evento FICTICIOS; todo ocurre en una transacción que termina en ROLLBACK.
--   psql -h 127.0.0.1 -p 55432 -U postgres -d canchita_test -v ON_ERROR_STOP=1 -f <este archivo>
begin;
do $$ begin
  if current_setting('cluster_name', true) is distinct from 'lacanchita-local-test' then
    raise exception 'pruebas_solo_local';
  end if;
end $$;

create temp table results (n serial, name text, ok boolean, detail text);
grant insert, select on results to authenticated, anon;
grant usage on sequence results_n_seq to authenticated, anon;

create function pg_temp.as_user(p uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;
create function pg_temp.as_admin() returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
end $$;
create function pg_temp.check(p_name text, p_ok boolean, p_detail text default null) returns void language sql as $$
  insert into results (name, ok, detail) values (p_name, coalesce(p_ok, false), p_detail);
$$;
-- Ejecuta SQL y registra si falló como se esperaba (p_expect_error) o si funcionó.
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
-- Variante: la sentencia no falla pero no debe afectar filas (filtrada por RLS).
create function pg_temp.affects_none(p_name text, p_sql text) returns void language plpgsql as $$
declare n bigint;
begin
  begin
    execute p_sql;
    get diagnostics n = row_count;
    insert into results (name, ok, detail) values (p_name, n = 0, 'filas=' || n);
  exception when others then
    insert into results (name, ok, detail) values (p_name, true, 'denegado: ' || sqlerrm);
  end;
end $$;

grant execute on all functions in schema pg_temp to authenticated, anon;

-- ── Datos ficticios ──────────────────────────────────────────────────────────
-- A: miembro de P1 y P2. B: solo P1. C: solo P2. D: P1 deshabilitado. X: sin parches.
insert into auth.users (id) values
  ('00000000-0000-4000-8000-00000000000a'), ('00000000-0000-4000-8000-00000000000b'),
  ('00000000-0000-4000-8000-00000000000c'), ('00000000-0000-4000-8000-00000000000d'),
  ('00000000-0000-4000-8000-0000000000ff');
insert into public.events (id, slug, name, status) values
  ('10000000-0000-4000-8000-000000000001', 'prueba-ficticia', 'Evento ficticio', 'in_progress');
insert into public.event_stages (id, event_id, code, name, sort_order, exact_points, result_points) values
  ('10000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', 'group', 'Grupos', 1, 3, 1);
insert into public.teams (id, name) values
  ('10000000-0000-4000-8000-0000000000a1', 'Ficticio A'), ('10000000-0000-4000-8000-0000000000a2', 'Ficticio B');
insert into public.event_teams (event_id, team_id) values
  ('10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-0000000000a1'),
  ('10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-0000000000a2');
insert into public.matches (id, event_id, stage_id, starts_at, home_team_id, away_team_id, teams_source, status) values
  -- abierto (futuro) y ya iniciado
  ('10000000-0000-4000-8000-0000000000f1', '10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002',
   now() + interval '2 days', '10000000-0000-4000-8000-0000000000a1', '10000000-0000-4000-8000-0000000000a2', 'assigned', 'scheduled'),
  ('10000000-0000-4000-8000-0000000000f2', '10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002',
   now() - interval '1 hour', '10000000-0000-4000-8000-0000000000a2', '10000000-0000-4000-8000-0000000000a1', 'assigned', 'live');
insert into public.parches (id, name) values
  ('20000000-0000-4000-8000-000000000001', 'Parche Uno'), ('20000000-0000-4000-8000-000000000002', 'Parche Dos');
insert into public.parche_members (parche_id, user_id, status, disabled_at) values
  ('20000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-00000000000a', 'active', null),
  ('20000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-00000000000b', 'active', null),
  ('20000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-00000000000d', 'disabled', now()),
  ('20000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-00000000000a', 'active', null),
  ('20000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-00000000000c', 'active', null);
insert into public.parche_events (id, parche_id, event_id) values
  ('30000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001'),
  ('30000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001');
-- Pronóstico de A en el partido ya iniciado (cargado por backend antes del inicio).
insert into public.predictions (parche_event_id, event_id, match_id, user_id, home_score, away_score) values
  ('30000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-0000000000f2',
   '00000000-0000-4000-8000-00000000000a', 1, 1);
select pg_temp.check('dos parches participan en el mismo evento',
  (select count(*) from public.parche_events where event_id = '10000000-0000-4000-8000-000000000001') = 2);
select pg_temp.check('un usuario pertenece a varios parches',
  (select count(*) from public.parche_members where user_id = '00000000-0000-4000-8000-00000000000a') = 2);

-- ── Usuario A ────────────────────────────────────────────────────────────────
select pg_temp.as_user('00000000-0000-4000-8000-00000000000a');
select pg_temp.try('A pronostica el partido abierto en P1',
  $q$insert into public.predictions (parche_event_id, event_id, match_id, user_id, home_score, away_score) values
    ('30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-0000000000f1','00000000-0000-4000-8000-00000000000a',2,1)$q$, false);
select pg_temp.try('A pronostica DISTINTO el mismo partido en P2',
  $q$insert into public.predictions (parche_event_id, event_id, match_id, user_id, home_score, away_score) values
    ('30000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-0000000000f1','00000000-0000-4000-8000-00000000000a',0,3)$q$, false);
select pg_temp.check('A ve sus dos pronósticos diferentes del mismo partido',
  (select count(distinct (home_score, away_score)) from public.predictions
   where match_id = '10000000-0000-4000-8000-0000000000f1' and user_id = '00000000-0000-4000-8000-00000000000a') = 2);
select pg_temp.try('A no puede duplicar su pronóstico en P1',
  $q$insert into public.predictions (parche_event_id, event_id, match_id, user_id, home_score, away_score) values
    ('30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-0000000000f1','00000000-0000-4000-8000-00000000000a',5,5)$q$, true);
select pg_temp.try('A no puede escribir puntos (privilegio de columna)',
  $q$insert into public.predictions (parche_event_id, event_id, match_id, user_id, home_score, away_score, points, points_reason, scored_at) values
    ('30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-0000000000f1','00000000-0000-4000-8000-00000000000a',1,0,99,'exact',now())$q$, true);
select pg_temp.try('A no puede modificar sus puntos',
  $q$update public.predictions set points = 99 where user_id = '00000000-0000-4000-8000-00000000000a'$q$, true);
select pg_temp.try('A no puede cambiar user_id (escalada)',
  $q$update public.predictions set user_id = '00000000-0000-4000-8000-00000000000b' where user_id = '00000000-0000-4000-8000-00000000000a'$q$, true);
select pg_temp.try('A no puede pronosticar a nombre de B',
  $q$insert into public.predictions (parche_event_id, event_id, match_id, user_id, home_score, away_score) values
    ('30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-0000000000f1','00000000-0000-4000-8000-00000000000b',1,0)$q$, true);
select pg_temp.try('A no puede pronosticar un partido ya iniciado',
  $q$insert into public.predictions (parche_event_id, event_id, match_id, user_id, home_score, away_score) values
    ('30000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-0000000000f2','00000000-0000-4000-8000-00000000000a',1,0)$q$, true);
select pg_temp.affects_none('A no puede editar su pronóstico de un partido iniciado',
  $q$update public.predictions set home_score = 4 where match_id = '10000000-0000-4000-8000-0000000000f2'$q$);
select pg_temp.try('A edita su pronóstico abierto en P1',
  $q$update public.predictions set home_score = 3 where match_id = '10000000-0000-4000-8000-0000000000f1'
     and parche_event_id = '30000000-0000-4000-8000-000000000001'$q$, false);
select pg_temp.try('A no puede crear parches', $q$insert into public.parches (name) values ('Intruso')$q$, true);
select pg_temp.try('A no puede añadirse a otro parche',
  $q$insert into public.parche_members (parche_id, user_id) values ('91ad5d8d-414c-4e74-bf57-2ca476652de0','00000000-0000-4000-8000-00000000000a')$q$, true);
select pg_temp.try('A no puede cambiar su rol', $q$update public.parche_members set role = 'owner'$q$, true);
select pg_temp.try('A no puede modificar resultados', $q$update public.matches set home_score = 9$q$, true);
select pg_temp.check('A no ve el parche histórico ajeno',
  (select count(*) from public.parches where id = '91ad5d8d-414c-4e74-bf57-2ca476652de0') = 0);
select pg_temp.check('A no ve la clasificación histórica ajena',
  (select count(*) from public.standing_snapshot_rows) = 0 and (select count(*) from public.standing_snapshots) = 0);
select pg_temp.check('A ve solo sus dos parches', (select count(*) from public.parches) = 2);

-- ── Usuario B (solo P1) ──────────────────────────────────────────────────────
select pg_temp.as_user('00000000-0000-4000-8000-00000000000b');
select pg_temp.check('B no ve pronósticos ajenos antes del inicio',
  (select count(*) from public.predictions where match_id = '10000000-0000-4000-8000-0000000000f1') = 0);
select pg_temp.check('B ve el pronóstico de A en P1 tras el inicio',
  (select count(*) from public.predictions where match_id = '10000000-0000-4000-8000-0000000000f2') = 1);
select pg_temp.check('B no ve P2 ni sus miembros',
  (select count(*) from public.parches where id = '20000000-0000-4000-8000-000000000002') = 0
  and (select count(*) from public.parche_members where parche_id = '20000000-0000-4000-8000-000000000002') = 0);
select pg_temp.try('B no puede pronosticar en P2 (no es miembro)',
  $q$insert into public.predictions (parche_event_id, event_id, match_id, user_id, home_score, away_score) values
    ('30000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-0000000000f1','00000000-0000-4000-8000-00000000000b',1,0)$q$, true);
select pg_temp.affects_none('B no puede borrar pronósticos de A',
  $q$delete from public.predictions where user_id = '00000000-0000-4000-8000-00000000000a'$q$);

-- ── Usuario C (solo P2) ──────────────────────────────────────────────────────
select pg_temp.as_user('00000000-0000-4000-8000-00000000000c');
select pg_temp.check('C no ve pronósticos de P1 ni siquiera tras el inicio',
  (select count(*) from public.predictions where parche_event_id = '30000000-0000-4000-8000-000000000001') = 0);
select pg_temp.check('C no ve el pronóstico abierto de A en P2',
  (select count(*) from public.predictions) = 0);

-- ── Usuario D (deshabilitado en P1) y X (sin parches) ───────────────────────
select pg_temp.as_user('00000000-0000-4000-8000-00000000000d');
select pg_temp.try('D deshabilitado no puede pronosticar',
  $q$insert into public.predictions (parche_event_id, event_id, match_id, user_id, home_score, away_score) values
    ('30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-0000000000f1','00000000-0000-4000-8000-00000000000d',1,0)$q$, true);
select pg_temp.as_user('00000000-0000-4000-8000-0000000000ff');
select pg_temp.check('X sin parches no ve parches, membresías, pronósticos ni historial',
  (select count(*) from public.parches) + (select count(*) from public.parche_members) + (select count(*) from public.parche_events)
  + (select count(*) from public.predictions) + (select count(*) from public.standing_snapshot_rows) = 0);
select pg_temp.check('X sí ve datos deportivos globales', (select count(*) from public.matches) = 106);
select pg_temp.try('X no lee cierres ni importaciones', $q$select * from public.data_imports$q$, true);

-- ── Miembro real del parche histórico (solo lectura) ────────────────────────
select pg_temp.as_admin();
create temp table real_member as
  select user_id from public.parche_members
  where parche_id = '91ad5d8d-414c-4e74-bf57-2ca476652de0' and role = 'member' and status = 'active' limit 1;
grant select on real_member to authenticated;
select pg_temp.as_user((select user_id from real_member));
select pg_temp.check('Miembro histórico ve la clasificación completa (18 filas)',
  (select count(*) from public.standing_snapshot_rows) = 18);
select pg_temp.check('Miembro histórico ve las 18 membresías del parche', (select count(*) from public.parche_members) = 18);
select pg_temp.try('Ya no existen columnas de premio en la clasificación', $q$select prize_amount from public.standing_snapshot_rows$q$, true);
select pg_temp.try('Ya no existe la cuota en parche_events', $q$select entry_fee from public.parche_events$q$, true);
select pg_temp.check('Miembro lee las columnas deportivas',
  (select count(*) from (select position, points, exact_hits, result_hits, misses, predictions_count from public.standing_snapshot_rows) x) = 18);
select pg_temp.try('Miembro no puede modificar la clasificación',
  $q$update public.standing_snapshot_rows set points = 999$q$, true);
select pg_temp.try('Miembro no puede borrar la clasificación', $q$delete from public.standing_snapshot_rows$q$, true);
select pg_temp.try('Miembro no puede insertar filas históricas',
  $q$insert into public.standing_snapshot_rows (snapshot_id, row_number, display_name, membership_role, membership_status, participation, unranked_reason, stats_status)
     values ('5aeb192e-01fd-55cb-b436-602f2fcce5ff', 99, 'x', 'member', 'active', 'unranked', 'other', 'unknown')$q$, true);
select pg_temp.try('Miembro no puede alterar el sello', $q$update public.standing_snapshots set sealed_at = null$q$, true);

-- ── Anónimo ─────────────────────────────────────────────────────────────────
select pg_temp.as_admin();
do $$ begin execute 'set local role anon'; end $$;
select pg_temp.try('anon no lee parches', $q$select * from public.parches$q$, true);
select pg_temp.try('anon no lee clasificaciones', $q$select * from public.standing_snapshot_rows$q$, true);
select pg_temp.try('anon no lee partidos', $q$select * from public.matches$q$, true);

-- ── Backend (rol privilegiado): el historial sellado es inmutable ───────────
select pg_temp.as_admin();
select pg_temp.try('Ni el backend modifica una fila sellada',
  $q$update public.standing_snapshot_rows set points = 1 where snapshot_id = '5aeb192e-01fd-55cb-b436-602f2fcce5ff' and row_number = 1$q$, true);
select pg_temp.try('Ni el backend borra una fotografía sellada',
  $q$delete from public.standing_snapshots where id = '5aeb192e-01fd-55cb-b436-602f2fcce5ff'$q$, true);
select pg_temp.try('Ni el backend añade filas a una fotografía sellada',
  $q$insert into public.standing_snapshot_rows (snapshot_id, row_number, display_name, membership_role, membership_status, participation, unranked_reason, stats_status)
     values ('5aeb192e-01fd-55cb-b436-602f2fcce5ff', 99, 'x', 'member', 'active', 'unranked', 'other', 'unknown')$q$, true);
select pg_temp.try('Crear fotografía de prueba sin sellar',
  $q$with s as (insert into public.standing_snapshots (parche_event_id, version, kind, source, scoring_rules, ranking_rules, member_count, ranked_count, computed_at)
     values ('30000000-0000-4000-8000-000000000001', 1, 'historical_cut', 'legacy_import', '{}', '{}', 0, 0, now()) returning id)
     update public.standing_snapshots set rows_checksum = repeat('0', 64), sealed_at = now() where id = (select id from s)$q$, false);
select pg_temp.try('Sellar fotografía con huella incorrecta (paso 2)',
  $q$update public.standing_snapshots set rows_checksum = repeat('0', 64), sealed_at = now()
     where parche_event_id = '30000000-0000-4000-8000-000000000001'$q$, true);
select pg_temp.try('Fila con valores inventados para no clasificado es rechazada',
  $q$insert into public.standing_snapshot_rows (snapshot_id, row_number, display_name, membership_role, membership_status, participation, unranked_reason, position, stats_status)
     select id, 1, 'x', 'member', 'active', 'unranked', 'disabled', 5, 'unknown' from public.standing_snapshots
     where parche_event_id = '30000000-0000-4000-8000-000000000001'$q$, true);
select pg_temp.try('Estadística desconocida no admite cifras',
  $q$insert into public.standing_snapshot_rows (snapshot_id, row_number, display_name, membership_role, membership_status, participation, unranked_reason, stats_status, points)
     select id, 1, 'x', 'member', 'active', 'unranked', 'other', 'unknown', 0 from public.standing_snapshots
     where parche_event_id = '30000000-0000-4000-8000-000000000001'$q$, true);
select pg_temp.try('Fila válida de no clasificado con estadística desconocida (sin premio por defecto)',
  $q$insert into public.standing_snapshot_rows (snapshot_id, row_number, display_name, membership_role, membership_status, participation, unranked_reason, stats_status)
     select id, 1, 'x', 'member', 'active', 'unranked', 'other', 'unknown' from public.standing_snapshots
     where parche_event_id = '30000000-0000-4000-8000-000000000001'$q$, false);
select pg_temp.try('Cierre: no se puede saltar a purged',
  $q$do $d$ declare r uuid; begin
       insert into public.event_close_runs (event_id, mode) values ('10000000-0000-4000-8000-000000000001', 'manual') returning id into r;
       update public.event_close_runs set status = 'purged', backup_ref = 'x' where id = r;
     end $d$$q$, true);
select pg_temp.try('Cierre: un solo cierre activo por evento',
  $q$insert into public.event_close_runs (event_id, mode) values ('10000000-0000-4000-8000-000000000001', 'manual'),
     ('10000000-0000-4000-8000-000000000001', 'automatic')$q$, true);
select pg_temp.try('Cierre: no puede crearse ya verificado',
  $q$insert into public.event_close_runs (event_id, mode, status) values ('10000000-0000-4000-8000-000000000001', 'manual', 'verified')$q$, true);
select pg_temp.try('Cierre: no se purga sin respaldo',
  $q$do $d$ declare r uuid; begin
       insert into public.event_close_runs (event_id, mode) values ('10000000-0000-4000-8000-000000000001', 'manual') returning id into r;
       update public.event_close_runs set status = 'consolidated' where id = r;
       update public.event_close_runs set status = 'verified' where id = r;
       update public.event_close_runs set status = 'purged' where id = r;
     end $d$$q$, true);
select pg_temp.try('Cierre: transiciones válidas hasta closed con respaldo',
  $q$do $d$ declare r uuid; begin
       insert into public.event_close_runs (event_id, mode) values ('10000000-0000-4000-8000-000000000001', 'manual') returning id into r;
       update public.event_close_runs set status = 'consolidated' where id = r;
       update public.event_close_runs set status = 'verified' where id = r;
       update public.event_close_runs set status = 'purged', backup_ref = 'respaldo-ficticio' where id = r;
       update public.event_close_runs set status = 'closed' where id = r;
     end $d$$q$, false);
select pg_temp.try('Evento cerrado congela sus partidos',
  $q$do $d$ begin
       update public.events set status = 'closed', closed_at = now() where id = '10000000-0000-4000-8000-000000000001';
       update public.matches set home_score = 1, away_score = 0 where id = '10000000-0000-4000-8000-0000000000f2';
     end $d$$q$, true);
select pg_temp.check('El historial importado sigue íntegro',
  private.verify_standing_snapshot('5aeb192e-01fd-55cb-b436-602f2fcce5ff'));

select n, case when ok then 'OK' else 'FALLO' end as resultado, name, detail from results order by n;
select count(*) filter (where ok) as ok, count(*) filter (where not ok) as fallos from results;
rollback;
