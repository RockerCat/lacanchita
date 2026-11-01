-- Pruebas del motor de pronósticos, puntuación y clasificación (migración 20261031100000).
-- SOLO Postgres local desechable (cluster_name = lacanchita-local-test) con stub + todas las migraciones
-- + importación histórica. Usuarios, torneos y parches FICTICIOS; todo termina en ROLLBACK.
--   psql -h 127.0.0.1 -p 55432 -U postgres -d canchita_test -v ON_ERROR_STOP=1 -f <este archivo>
begin;
do $$ begin
  if current_setting('cluster_name', true) is distinct from 'lacanchita-local-test' then
    raise exception 'pruebas_solo_local';
  end if;
end $$;

create temp table results (n serial, name text, ok boolean, detail text);
create temp table vars (k text primary key, v text);
grant insert, select on results to authenticated, anon;
grant select, insert, update on vars to authenticated, anon;
grant usage on sequence results_n_seq to authenticated, anon;

create function pg_temp.as_user(p uuid) returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;
create function pg_temp.as_admin() returns void language plpgsql as $$
begin execute 'reset role'; perform set_config('request.jwt.claims', '', true); end $$;
create function pg_temp.check(p_name text, p_ok boolean, p_detail text default null) returns void language sql as $$
  insert into results (name, ok, detail) values (p_name, coalesce(p_ok, false), p_detail);
$$;
create function pg_temp.try(p_name text, p_sql text, p_expect_error boolean, p_error_like text default null) returns void language plpgsql as $$
begin
  begin
    execute p_sql;
    insert into results (name, ok, detail) values (p_name, not p_expect_error, 'sin error');
  exception when others then
    insert into results (name, ok, detail) values (p_name, p_expect_error and (p_error_like is null or sqlerrm like p_error_like), sqlerrm);
  end;
end $$;
create function pg_temp.v(p_k text) returns text language sql as $$ select v from vars where k = p_k $$;
create function pg_temp.pts(p_parche_event uuid, p_match uuid, p_user uuid) returns text language sql as $$
  select coalesce(points::text, 'null') || '/' || coalesce(points_reason, 'null') from public.predictions
  where parche_event_id = p_parche_event and match_id = p_match and user_id = p_user $$;
create function pg_temp.rows_affected(p_sql text) returns bigint language plpgsql as $$
declare n bigint; begin execute p_sql; get diagnostics n = row_count; return n; end $$;
grant execute on all functions in schema pg_temp to authenticated, anon;

-- Usuarios ficticios (SA = superadmin, además dueño del parche P1).
insert into auth.users (id, email, raw_user_meta_data)
select ('00000000-0000-4000-8000-0000000000' || lpad(i::text, 2, '0'))::uuid, 'u' || i || '@e.test',
       json_build_object('username', case when i = 1 then 'SA' when i between 2 and 6 then 'U' || (i - 1) when i = 7 then 'X' else 'U' || (i - 2) end)::jsonb
from generate_series(1, 12) i;
-- 01 = SA · 02 = U1 (P1+P2) · 03 = U2 (P1) · 04 = U3 (P2) · 05 = U4 (P1, se deshabilita) · 06 = U5 (sin pronósticos)
-- 07 = X (sin parches) · 08 = U6 · 09 = U7 · 10 = U8 · 11 = U9
insert into private.platform_admins (user_id) values ('00000000-0000-4000-8000-000000000001');
insert into vars values ('sa','00000000-0000-4000-8000-000000000001'), ('u1','00000000-0000-4000-8000-000000000002'),
  ('u2','00000000-0000-4000-8000-000000000003'), ('u3','00000000-0000-4000-8000-000000000004'), ('u4','00000000-0000-4000-8000-000000000005'),
  ('u5','00000000-0000-4000-8000-000000000006'), ('x','00000000-0000-4000-8000-000000000007'), ('u6','00000000-0000-4000-8000-000000000008'),
  ('u7','00000000-0000-4000-8000-000000000009'), ('u8','00000000-0000-4000-8000-000000000010'), ('u9','00000000-0000-4000-8000-000000000011');

-- Torneo EV (grupos 3/1, eliminatoria 10/7 → configuraciones distintas por fase) y EV2 (otro torneo).
insert into public.events (id, slug, name, status) values
  ('e0000000-0000-4000-8000-000000000001', 'ev-motor', 'EV Motor', 'in_progress'),
  ('e0000000-0000-4000-8000-000000000002', 'ev-otro', 'EV Otro', 'in_progress'),
  ('e0000000-0000-4000-8000-000000000003', 'ev-tabla', 'EV Tabla', 'in_progress');
insert into public.event_stages (id, event_id, code, name, sort_order, is_knockout, exact_points, result_points) values
  ('51000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000001', 'g', 'Grupos', 1, false, 3, 1),
  ('51000000-0000-4000-8000-000000000002', 'e0000000-0000-4000-8000-000000000001', 'ko', 'Eliminatoria', 2, true, 10, 7),
  ('51000000-0000-4000-8000-000000000003', 'e0000000-0000-4000-8000-000000000002', 'g', 'Grupos', 1, false, 3, 1),
  ('51000000-0000-4000-8000-000000000004', 'e0000000-0000-4000-8000-000000000003', 'g', 'Grupos', 1, false, 3, 1);
insert into public.teams (id, name, kind) values ('72000000-0000-4000-8000-000000000001', 'Eq Uno', 'club'), ('72000000-0000-4000-8000-000000000002', 'Eq Dos', 'club');
insert into public.event_teams (event_id, team_id) select e, t from (values
  ('e0000000-0000-4000-8000-000000000001'::uuid), ('e0000000-0000-4000-8000-000000000002'), ('e0000000-0000-4000-8000-000000000003')) ev(e),
  (values ('72000000-0000-4000-8000-000000000001'::uuid), ('72000000-0000-4000-8000-000000000002')) tm(t);

create function pg_temp.mk_match(p_id text, p_event uuid, p_stage uuid, p_n int) returns void language sql as $$
  insert into public.matches (id, event_id, stage_id, match_number, starts_at, home_team_id, away_team_id, teams_source, status)
  values (p_id::uuid, p_event, p_stage, p_n, now() + interval '2 days', '72000000-0000-4000-8000-000000000001', '72000000-0000-4000-8000-000000000002', 'assigned', 'scheduled') $$;
select pg_temp.mk_match('a1000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000001', '51000000-0000-4000-8000-000000000001', 1);  -- M1
select pg_temp.mk_match('a1000000-0000-4000-8000-000000000002', 'e0000000-0000-4000-8000-000000000001', '51000000-0000-4000-8000-000000000001', 2);  -- M2
select pg_temp.mk_match('a1000000-0000-4000-8000-000000000003', 'e0000000-0000-4000-8000-000000000001', '51000000-0000-4000-8000-000000000002', 3);  -- M3 KO
select pg_temp.mk_match('a1000000-0000-4000-8000-000000000004', 'e0000000-0000-4000-8000-000000000001', '51000000-0000-4000-8000-000000000001', 4);  -- M4 (se cancela)
select pg_temp.mk_match('a1000000-0000-4000-8000-000000000005', 'e0000000-0000-4000-8000-000000000001', '51000000-0000-4000-8000-000000000001', 5);  -- M5 (se aplaza)
select pg_temp.mk_match('a1000000-0000-4000-8000-000000000006', 'e0000000-0000-4000-8000-000000000001', '51000000-0000-4000-8000-000000000001', 6);  -- M6 (flujo de Control)
select pg_temp.mk_match('a1000000-0000-4000-8000-0000000000f1', 'e0000000-0000-4000-8000-000000000002', '51000000-0000-4000-8000-000000000003', 1);  -- MX (otro torneo)
insert into vars values ('m1','a1000000-0000-4000-8000-000000000001'), ('m2','a1000000-0000-4000-8000-000000000002'), ('m3','a1000000-0000-4000-8000-000000000003'),
  ('m4','a1000000-0000-4000-8000-000000000004'), ('m5','a1000000-0000-4000-8000-000000000005'), ('m6','a1000000-0000-4000-8000-000000000006'),
  ('mx','a1000000-0000-4000-8000-0000000000f1'), ('ev','e0000000-0000-4000-8000-000000000001'), ('ev2','e0000000-0000-4000-8000-000000000002'),
  ('pe1','b1000000-0000-4000-8000-000000000001'), ('pe2','b1000000-0000-4000-8000-000000000002'), ('p1','c1000000-0000-4000-8000-000000000001'), ('p2','c1000000-0000-4000-8000-000000000002');
insert into public.parches (id, name, created_by) values (pg_temp.v('p1')::uuid, 'P1', pg_temp.v('sa')::uuid), (pg_temp.v('p2')::uuid, 'P2', pg_temp.v('u3')::uuid);
insert into public.parche_members (parche_id, user_id, role, status, disabled_at) values
  (pg_temp.v('p1')::uuid, pg_temp.v('sa')::uuid, 'owner', 'active', null),
  (pg_temp.v('p1')::uuid, pg_temp.v('u1')::uuid, 'member', 'active', null), (pg_temp.v('p1')::uuid, pg_temp.v('u2')::uuid, 'member', 'active', null),
  (pg_temp.v('p1')::uuid, pg_temp.v('u4')::uuid, 'member', 'active', null), (pg_temp.v('p1')::uuid, pg_temp.v('u5')::uuid, 'member', 'active', null),
  (pg_temp.v('p2')::uuid, pg_temp.v('u3')::uuid, 'owner', 'active', null), (pg_temp.v('p2')::uuid, pg_temp.v('u1')::uuid, 'member', 'active', null);
insert into public.parche_events (id, parche_id, event_id) values
  (pg_temp.v('pe1')::uuid, pg_temp.v('p1')::uuid, pg_temp.v('ev')::uuid), (pg_temp.v('pe2')::uuid, pg_temp.v('p2')::uuid, pg_temp.v('ev')::uuid);

create temp table hist_before as select
  (select md5(string_agg(m::text, '|' order by m.id)) from public.matches m where event_id = 'daaebb9b-8e92-5644-824f-bf826114446a') matches,
  (select rows_checksum from public.standing_snapshots limit 1) checksum,
  (select count(*) from public.predictions) preds;

-- ═══ A. PRONÓSTICOS ═════════════════════════════════════════════════════════
select pg_temp.as_user(pg_temp.v('u1')::uuid);
select public.save_prediction(pg_temp.v('pe1')::uuid, pg_temp.v('m1')::uuid, 2, 1);
select pg_temp.check('A1 crear pronóstico (parche P1)', (select count(*) from public.predictions where user_id = pg_temp.v('u1')::uuid and match_id = pg_temp.v('m1')::uuid) = 1
  and (select home_score = 2 and away_score = 1 and event_id = pg_temp.v('ev')::uuid and points is null from public.predictions where parche_event_id = pg_temp.v('pe1')::uuid and match_id = pg_temp.v('m1')::uuid));
select public.save_prediction(pg_temp.v('pe1')::uuid, pg_temp.v('m1')::uuid, 1, 0);
select pg_temp.check('A2 editar antes del inicio sin duplicar', (select count(*) from public.predictions where parche_event_id = pg_temp.v('pe1')::uuid and match_id = pg_temp.v('m1')::uuid and user_id = pg_temp.v('u1')::uuid) = 1
  and (select home_score = 1 and away_score = 0 from public.predictions where parche_event_id = pg_temp.v('pe1')::uuid and match_id = pg_temp.v('m1')::uuid and user_id = pg_temp.v('u1')::uuid));
select public.save_prediction(pg_temp.v('pe1')::uuid, pg_temp.v('m1')::uuid, 2, 1);
select public.save_prediction(pg_temp.v('pe2')::uuid, pg_temp.v('m1')::uuid, 0, 1);
select pg_temp.check('A3 mismo jugador y partido, pronósticos distintos en parches distintos', (select count(*) from public.predictions where user_id = pg_temp.v('u1')::uuid and match_id = pg_temp.v('m1')::uuid) = 2
  and pg_temp.pts(pg_temp.v('pe1')::uuid, pg_temp.v('m1')::uuid, pg_temp.v('u1')::uuid) = 'null/null'
  and (select home_score from public.predictions where parche_event_id = pg_temp.v('pe1')::uuid and match_id = pg_temp.v('m1')::uuid) = 2
  and (select home_score from public.predictions where parche_event_id = pg_temp.v('pe2')::uuid and match_id = pg_temp.v('m1')::uuid) = 0);
select pg_temp.try('A4 marcador fuera de rango (31)', format($q$select public.save_prediction(%L, %L, 31, 0)$q$, pg_temp.v('pe1'), pg_temp.v('m1')), true, 'invalid_scores');
select pg_temp.try('A4 marcador negativo', format($q$select public.save_prediction(%L, %L, -1, 0)$q$, pg_temp.v('pe1'), pg_temp.v('m1')), true, 'invalid_scores');
select pg_temp.try('A4 marcador nulo', format($q$select public.save_prediction(%L, %L, null, 0)$q$, pg_temp.v('pe1'), pg_temp.v('m1')), true, 'invalid_scores');
select public.save_prediction(pg_temp.v('pe1')::uuid, pg_temp.v('m1')::uuid, 30, 30);
select public.save_prediction(pg_temp.v('pe1')::uuid, pg_temp.v('m1')::uuid, 2, 1);
select pg_temp.check('A4 el límite 0–30 se acepta', true);
select pg_temp.try('A5 partido de OTRO torneo', format($q$select public.save_prediction(%L, %L, 1, 0)$q$, pg_temp.v('pe1'), pg_temp.v('mx')), true, 'match_not_in_event');
select pg_temp.try('A5 partido inexistente', format($q$select public.save_prediction(%L, gen_random_uuid(), 1, 0)$q$, pg_temp.v('pe1')), true, 'match_not_found');
select pg_temp.try('A5 inscripción inexistente (parche no inscrito en el torneo)', format($q$select public.save_prediction(gen_random_uuid(), %L, 1, 0)$q$, pg_temp.v('m1')), true, 'not_enrolled');
-- Suplantación y cruces
select pg_temp.as_user(pg_temp.v('u2')::uuid);
select pg_temp.try('A6 U2 no usa la inscripción de otro parche (P2)', format($q$select public.save_prediction(%L, %L, 1, 0)$q$, pg_temp.v('pe2'), pg_temp.v('m1')), true, 'not_enrolled');
select pg_temp.try('A6 INSERT directo a nombre de otro usuario', format($q$insert into public.predictions (parche_event_id, event_id, match_id, user_id, home_score, away_score) values (%L, %L, %L, %L, 0, 0)$q$,
  pg_temp.v('pe1'), pg_temp.v('ev'), pg_temp.v('m2'), pg_temp.v('u1')), true, '%row-level security%');
select pg_temp.try('A6 INSERT directo con puntos (sin privilegio de columna)', format($q$insert into public.predictions (parche_event_id, event_id, match_id, user_id, home_score, away_score, points) values (%L, %L, %L, %L, 0, 0, 99)$q$,
  pg_temp.v('pe1'), pg_temp.v('ev'), pg_temp.v('m2'), pg_temp.v('u2')), true, 'permission denied%');
select pg_temp.check('A6 UPDATE ajeno no afecta filas (RLS)', pg_temp.rows_affected(format($q$update public.predictions set home_score = 9 where user_id = %L$q$, pg_temp.v('u1'))) = 0);
select pg_temp.try('A6 UPDATE de puntos denegado', $q$update public.predictions set points = 99$q$, true, 'permission denied%');
select pg_temp.check('A6 U2 no ve pronósticos de U1 antes del inicio', (select count(*) from public.predictions where user_id = pg_temp.v('u1')::uuid) = 0);
select pg_temp.try('A6 U2 no consulta pronósticos ajenos antes del inicio por RPC', format($q$select * from public.get_match_predictions(%L, %L)$q$, pg_temp.v('pe1'), pg_temp.v('m1')), true, 'predictions_hidden');
select public.save_prediction(pg_temp.v('pe1')::uuid, pg_temp.v('m1')::uuid, 1, 0);
-- Usuarios sin derecho
select pg_temp.as_user(pg_temp.v('x')::uuid);
select pg_temp.try('A7 usuario sin membresía', format($q$select public.save_prediction(%L, %L, 1, 0)$q$, pg_temp.v('pe1'), pg_temp.v('m1')), true, 'not_enrolled');
select pg_temp.as_user(pg_temp.v('sa')::uuid);
select pg_temp.try('A8 el superadministrador no pronostica (RPC), aunque sea dueño del parche', format($q$select public.save_prediction(%L, %L, 1, 0)$q$, pg_temp.v('pe1'), pg_temp.v('m1')), true, 'superadmin_cannot_predict');
select pg_temp.try('A8 el superadministrador no pronostica (INSERT directo, RLS)', format($q$insert into public.predictions (parche_event_id, event_id, match_id, user_id, home_score, away_score) values (%L, %L, %L, %L, 0, 0)$q$,
  pg_temp.v('pe1'), pg_temp.v('ev'), pg_temp.v('m2'), pg_temp.v('sa')), true, 'superadmin_cannot_predict');
select pg_temp.as_admin();
select pg_temp.try('A8 ni siquiera el rol dueño inserta un pronóstico del superadministrador (trigger)', format($q$insert into public.predictions (parche_event_id, event_id, match_id, user_id, home_score, away_score) values (%L, %L, %L, %L, 0, 0)$q$,
  pg_temp.v('pe1'), pg_temp.v('ev'), pg_temp.v('m2'), pg_temp.v('sa')), true, 'superadmin_cannot_predict');
-- Más pronósticos (fixtures directos como dueño de la base) para la puntuación
insert into public.predictions (parche_event_id, event_id, match_id, user_id, home_score, away_score) values
  (pg_temp.v('pe2')::uuid, pg_temp.v('ev')::uuid, pg_temp.v('m1')::uuid, pg_temp.v('u3')::uuid, 2, 1),
  (pg_temp.v('pe1')::uuid, pg_temp.v('ev')::uuid, pg_temp.v('m1')::uuid, pg_temp.v('u4')::uuid, 2, 1);
update public.parche_members set status = 'disabled', disabled_at = now() where parche_id = pg_temp.v('p1')::uuid and user_id = pg_temp.v('u4')::uuid;
select pg_temp.as_user(pg_temp.v('u4')::uuid);
select pg_temp.try('A7 miembro deshabilitado', format($q$select public.save_prediction(%L, %L, 1, 0)$q$, pg_temp.v('pe1'), pg_temp.v('m2')), true, 'member_disabled');
select pg_temp.as_user(pg_temp.v('u5')::uuid);
select pg_temp.check('A9 U5 (sin pronósticos) aparece como faltante de M1 y no revela nada de otros antes del inicio',
  (select count(*) from public.get_match_missing_predictions(pg_temp.v('pe1')::uuid, pg_temp.v('m1')::uuid) f where f.user_id = pg_temp.v('u5')::uuid) = 1
  and (select count(*) from public.get_match_missing_predictions(pg_temp.v('pe1')::uuid, pg_temp.v('m1')::uuid)) = 1);   -- solo U5: U1/U2 pronosticaron; U4 deshabilitado y SA excluidos

-- ═══ B. INICIO DEL PARTIDO: BLOQUEO Y REVELACIÓN ════════════════════════════
select pg_temp.as_admin();
update public.matches set starts_at = now() - interval '1 hour' where id = pg_temp.v('m1')::uuid;      -- ya pasó la hora (aún programado)
select pg_temp.as_user(pg_temp.v('u1')::uuid);
select pg_temp.try('B1 tras la hora de inicio: rechazado', format($q$select public.save_prediction(%L, %L, 0, 0)$q$, pg_temp.v('pe1'), pg_temp.v('m1')), true, 'match_started');
select pg_temp.check('B1 UPDATE directo tras el inicio no afecta filas', pg_temp.rows_affected(format($q$update public.predictions set home_score = 7 where match_id = %L$q$, pg_temp.v('m1'))) = 0);
select pg_temp.as_user(pg_temp.v('u2')::uuid);
select pg_temp.check('B2 tras el inicio U2 ve los pronósticos de SU parche (P1), no los de P2',
  (select count(*) from public.predictions where match_id = pg_temp.v('m1')::uuid and parche_event_id = pg_temp.v('pe1')::uuid) >= 3
  and (select count(*) from public.predictions where match_id = pg_temp.v('m1')::uuid and parche_event_id = pg_temp.v('pe2')::uuid) = 0);
select pg_temp.check('B2 RPC de pronósticos: excluye deshabilitados y superadmin; incluye los propios y de P1',
  (select count(*) from public.get_match_predictions(pg_temp.v('pe1')::uuid, pg_temp.v('m1')::uuid)) = 2   -- U1 y U2 (U4 deshabilitado fuera)
  and not exists (select 1 from public.get_match_predictions(pg_temp.v('pe1')::uuid, pg_temp.v('m1')::uuid) where user_id in (pg_temp.v('u4')::uuid, pg_temp.v('sa')::uuid)));
select pg_temp.try('B2 U2 no consulta pronósticos de otro parche', format($q$select * from public.get_match_predictions(%L, %L)$q$, pg_temp.v('pe2'), pg_temp.v('m1')), true, 'not_member');
select pg_temp.as_user(pg_temp.v('u3')::uuid);
select pg_temp.check('B2 U3 (P2) ve solo pronósticos de P2', (select count(*) from public.get_match_predictions(pg_temp.v('pe2')::uuid, pg_temp.v('m1')::uuid)) = 2
  and not exists (select 1 from public.predictions where parche_event_id = pg_temp.v('pe1')::uuid));
select pg_temp.as_admin();
update public.matches set status = 'live', home_score = 0, away_score = 0 where id = pg_temp.v('m1')::uuid;  -- inicio (como la transición automática del original)
select pg_temp.as_user(pg_temp.v('u1')::uuid);
select pg_temp.try('B3 partido en vivo: pronósticos cerrados', format($q$select public.save_prediction(%L, %L, 0, 0)$q$, pg_temp.v('pe1'), pg_temp.v('m1')), true, 'match_not_open');

-- ═══ C. PUNTUACIÓN ══════════════════════════════════════════════════════════
select pg_temp.as_admin();
select pg_temp.check('C0 en vivo no se puntúa', (select count(*) from public.predictions where match_id = pg_temp.v('m1')::uuid and points is not null) = 0);
create temp table ua as select id, updated_at from public.predictions;
update public.matches set status = 'finished', home_score = 2, away_score = 1 where id = pg_temp.v('m1')::uuid;     -- finalizar 2-1
select pg_temp.check('C1 exacto: U1 en P1 (2-1) = 3', pg_temp.pts(pg_temp.v('pe1')::uuid, pg_temp.v('m1')::uuid, pg_temp.v('u1')::uuid) = '3/exact');
select pg_temp.check('C2 incorrecto: el MISMO U1 en P2 (0-1) = 0', pg_temp.pts(pg_temp.v('pe2')::uuid, pg_temp.v('m1')::uuid, pg_temp.v('u1')::uuid) = '0/miss');
select pg_temp.check('C3 resultado acertado: U2 (1-0 vs 2-1) = 1, excluyente con el exacto', pg_temp.pts(pg_temp.v('pe1')::uuid, pg_temp.v('m1')::uuid, pg_temp.v('u2')::uuid) = '1/result');
select pg_temp.check('C4 el resultado único se comparte: U3 en P2 acierta (3)', pg_temp.pts(pg_temp.v('pe2')::uuid, pg_temp.v('m1')::uuid, pg_temp.v('u3')::uuid) = '3/exact');
select pg_temp.check('C5 la puntuación conserva la hora del pronóstico (updated_at no cambia al puntuar)',
  not exists (select 1 from public.predictions p join ua on ua.id = p.id where p.updated_at is distinct from ua.updated_at)
  and (select count(*) from public.predictions where match_id = pg_temp.v('m1')::uuid and scored_at is not null) = 5);
-- Idempotencia
create temp table snap1 as select id, points, points_reason, parche_event_id, user_id from public.predictions order by id;
select private.score_match(pg_temp.v('m1')::uuid); select private.score_match(pg_temp.v('m1')::uuid); select private.score_match(pg_temp.v('m1')::uuid);
select pg_temp.check('C6 recalcular ×3 no duplica ni acumula', (select count(*) from public.predictions) = (select count(*) from snap1)
  and not exists (select 1 from public.predictions p join snap1 s on s.id = p.id where p.points is distinct from s.points or p.points_reason is distinct from s.points_reason));
-- Cambiar el marcador final y recalcular
update public.matches set home_score = 1, away_score = 0 where id = pg_temp.v('m1')::uuid;                          -- ahora 1-0 (edición de un finalizado)
select pg_temp.check('C7 editar el marcador final recalcula (reemplaza, no acumula)',
  pg_temp.pts(pg_temp.v('pe1')::uuid, pg_temp.v('m1')::uuid, pg_temp.v('u1')::uuid) = '1/result'
  and pg_temp.pts(pg_temp.v('pe1')::uuid, pg_temp.v('m1')::uuid, pg_temp.v('u2')::uuid) = '3/exact'
  and pg_temp.pts(pg_temp.v('pe2')::uuid, pg_temp.v('m1')::uuid, pg_temp.v('u1')::uuid) = '0/miss'
  and pg_temp.pts(pg_temp.v('pe2')::uuid, pg_temp.v('m1')::uuid, pg_temp.v('u3')::uuid) = '1/result');
-- Un no finalizado no es puntuable; el torneo histórico nunca se puntúa
select pg_temp.try('C8 partido no finalizado no es puntuable', format($q$select private.score_match(%L)$q$, pg_temp.v('m2')), true, 'match_not_scorable');
select pg_temp.try('C8 el Mundial histórico no se puntúa (bloqueado)', $q$select private.score_match((select id from public.matches where event_id = 'daaebb9b-8e92-5644-824f-bf826114446a' limit 1))$q$, true, 'event_locked_history');
select pg_temp.as_user(pg_temp.v('u1')::uuid);
select pg_temp.try('C9 un jugador no ejecuta funciones de puntuación', format($q$select private.score_match(%L)$q$, pg_temp.v('m1')), true, 'permission denied%');
select pg_temp.try('C9 ni control_rescore_match', format($q$select public.control_rescore_match(%L)$q$, pg_temp.v('m1')), true, 'not_platform_admin');
select pg_temp.try('C9 ni reabrir', format($q$select public.control_reopen_match(%L, 'quiero reabrir', 0)$q$, pg_temp.v('m1')), true, 'not_platform_admin');
-- Eliminatoria: configuración propia de la fase (10/7) y penales
select pg_temp.as_admin();
insert into public.predictions (parche_event_id, event_id, match_id, user_id, home_score, away_score) values
  (pg_temp.v('pe1')::uuid, pg_temp.v('ev')::uuid, pg_temp.v('m3')::uuid, pg_temp.v('u1')::uuid, 1, 1),
  (pg_temp.v('pe1')::uuid, pg_temp.v('ev')::uuid, pg_temp.v('m3')::uuid, pg_temp.v('u2')::uuid, 0, 0),
  (pg_temp.v('pe1')::uuid, pg_temp.v('ev')::uuid, pg_temp.v('m3')::uuid, pg_temp.v('u5')::uuid, 2, 1);
update public.matches set starts_at = now() - interval '2 hours', status = 'live', home_score = 0, away_score = 0 where id = pg_temp.v('m3')::uuid;
update public.matches set status = 'finished', home_score = 1, away_score = 1, winner_side = 'away' where id = pg_temp.v('m3')::uuid;
select pg_temp.check('C10 fase eliminatoria usa su configuración (exacto 10 / resultado 7); el empate con penales no suma extra',
  pg_temp.pts(pg_temp.v('pe1')::uuid, pg_temp.v('m3')::uuid, pg_temp.v('u1')::uuid) = '10/exact'
  and pg_temp.pts(pg_temp.v('pe1')::uuid, pg_temp.v('m3')::uuid, pg_temp.v('u2')::uuid) = '7/result'
  and pg_temp.pts(pg_temp.v('pe1')::uuid, pg_temp.v('m3')::uuid, pg_temp.v('u5')::uuid) = '0/miss');

-- ═══ D. REAPERTURA EXCEPCIONAL ══════════════════════════════════════════════
select pg_temp.as_user(pg_temp.v('sa')::uuid);
select pg_temp.try('D1 reabrir exige motivo', format($q$select public.control_reopen_match(%L, '', 0)$q$, pg_temp.v('m1')), true, 'reason_required');
select pg_temp.try('D1 reabrir con revisión desactualizada', format($q$select public.control_reopen_match(%L, 'corrección del acta', 5)$q$, pg_temp.v('m1')), true, 'stale_revision');
select pg_temp.try('D1 solo se reabre un finalizado', format($q$select public.control_reopen_match(%L, 'corrección del acta', 0)$q$, pg_temp.v('m2')), true, 'not_finished');
select public.control_reopen_match(pg_temp.v('m1')::uuid, 'El acta cambió el gol 88', 0);
select pg_temp.as_admin();
select pg_temp.check('D2 reabrir: estado En vivo, puntos retirados (sin huérfanos), pronósticos intactos',
  (select status = 'live' and result_confirmed_at is null and result_revision = 1 from public.matches where id = pg_temp.v('m1')::uuid)
  and (select count(*) from public.predictions where match_id = pg_temp.v('m1')::uuid) = 5
  and (select count(*) from public.predictions where match_id = pg_temp.v('m1')::uuid and (points is not null or points_reason is not null or scored_at is not null)) = 0
  and (select home_score = 1 and away_score = 0 from public.matches where id = pg_temp.v('m1')::uuid));
select pg_temp.check('D2 otros partidos finalizados conservan sus puntos', pg_temp.pts(pg_temp.v('pe1')::uuid, pg_temp.v('m3')::uuid, pg_temp.v('u1')::uuid) = '10/exact');
select pg_temp.check('D3 reapertura auditada con motivo', (select count(*) from public.control_audit_log where action = 'match_reopened' and entity_id = pg_temp.v('m1')::uuid and reason = 'El acta cambió el gol 88') = 1);
select pg_temp.as_user(pg_temp.v('u1')::uuid);
select pg_temp.try('D4 reabrir NO reabre los pronósticos', format($q$select public.save_prediction(%L, %L, 0, 0)$q$, pg_temp.v('pe1'), pg_temp.v('m1')), true, 'match_not_open');
select pg_temp.as_admin();
update public.matches set home_score = 3, away_score = 0, status = 'finished' where id = pg_temp.v('m1')::uuid;      -- nuevo marcador definitivo
select pg_temp.check('D5 volver a finalizar recalcula con el marcador definitivo (3-0)',
  pg_temp.pts(pg_temp.v('pe1')::uuid, pg_temp.v('m1')::uuid, pg_temp.v('u1')::uuid) = '1/result'
  and pg_temp.pts(pg_temp.v('pe1')::uuid, pg_temp.v('m1')::uuid, pg_temp.v('u2')::uuid) = '1/result'
  and pg_temp.pts(pg_temp.v('pe2')::uuid, pg_temp.v('m1')::uuid, pg_temp.v('u1')::uuid) = '0/miss'
  and pg_temp.pts(pg_temp.v('pe2')::uuid, pg_temp.v('m1')::uuid, pg_temp.v('u3')::uuid) = '1/result');
select pg_temp.try('D6 un finalizado solo puede volver a En vivo (no a programado)', format($q$update public.matches set status = 'scheduled' where id = %L$q$, pg_temp.v('m1')), true, 'invalid_transition');
select pg_temp.try('D6 ni cancelarse', format($q$update public.matches set status = 'cancelled' where id = %L$q$, pg_temp.v('m1')), true, 'invalid_transition');

-- ═══ E. APLAZAMIENTO Y CANCELACIÓN ══════════════════════════════════════════
select pg_temp.as_user(pg_temp.v('u1')::uuid);
select public.save_prediction(pg_temp.v('pe1')::uuid, pg_temp.v('m5')::uuid, 1, 1);
select public.save_prediction(pg_temp.v('pe1')::uuid, pg_temp.v('m4')::uuid, 2, 2);
select pg_temp.as_user(pg_temp.v('u2')::uuid);
select public.save_prediction(pg_temp.v('pe1')::uuid, pg_temp.v('m5')::uuid, 0, 2);
select pg_temp.as_user(pg_temp.v('sa')::uuid);
select public.control_save_match(pg_temp.v('m5')::uuid, null, '51000000-0000-4000-8000-000000000001', 5, null, now() + interval '5 days', null,
  '72000000-0000-4000-8000-000000000001', '72000000-0000-4000-8000-000000000002', null, null, 'postponed');
select pg_temp.as_user(pg_temp.v('u1')::uuid);
select pg_temp.check('E1 aplazado: se conservan los pronósticos', (select count(*) from public.predictions where match_id = pg_temp.v('m5')::uuid) >= 1
  and (select home_score = 1 from public.predictions where match_id = pg_temp.v('m5')::uuid and user_id = pg_temp.v('u1')::uuid and parche_event_id = pg_temp.v('pe1')::uuid));
select public.save_prediction(pg_temp.v('pe1')::uuid, pg_temp.v('m5')::uuid, 2, 2);
select pg_temp.check('E2 aplazado: se puede modificar hasta la nueva hora', (select home_score = 2 from public.predictions where match_id = pg_temp.v('m5')::uuid and user_id = pg_temp.v('u1')::uuid and parche_event_id = pg_temp.v('pe1')::uuid));
select pg_temp.try('E3 aplazado: los pronósticos ajenos siguen ocultos', format($q$select * from public.get_match_predictions(%L, %L)$q$, pg_temp.v('pe1'), pg_temp.v('m5')), true, 'predictions_hidden');
select pg_temp.as_admin();
select pg_temp.check('E4 aplazado: sin puntos', (select count(*) from public.predictions where match_id = pg_temp.v('m5')::uuid and points is not null) = 0);
select pg_temp.try('E4 un aplazado no es puntuable', format($q$select private.score_match(%L)$q$, pg_temp.v('m5')), true, 'match_not_scorable');
select pg_temp.as_user(pg_temp.v('sa')::uuid);
select public.control_save_match(pg_temp.v('m5')::uuid, null, '51000000-0000-4000-8000-000000000001', 5, null, now() + interval '9 days', null,
  '72000000-0000-4000-8000-000000000001', '72000000-0000-4000-8000-000000000002', null, null, 'scheduled');   -- reprogramar
select pg_temp.as_user(pg_temp.v('u1')::uuid);
select public.save_prediction(pg_temp.v('pe1')::uuid, pg_temp.v('m5')::uuid, 3, 3);
select pg_temp.check('E5 reprogramado: transición válida a programado y sigue editable hasta la nueva hora', (select home_score = 3 from public.predictions where match_id = pg_temp.v('m5')::uuid and user_id = pg_temp.v('u1')::uuid and parche_event_id = pg_temp.v('pe1')::uuid));
select pg_temp.as_admin();
update public.matches set status = 'postponed', starts_at = now() - interval '1 day' where id = pg_temp.v('m5')::uuid;
select pg_temp.as_user(pg_temp.v('u1')::uuid);
select pg_temp.try('E6 aplazado cuya hora ya pasó: bloqueado hasta reprogramar', format($q$select public.save_prediction(%L, %L, 0, 0)$q$, pg_temp.v('pe1'), pg_temp.v('m5')), true, 'match_started');
-- Cancelación definitiva
select pg_temp.as_user(pg_temp.v('sa')::uuid);
select public.control_save_match(pg_temp.v('m4')::uuid, null, '51000000-0000-4000-8000-000000000001', 4, null, now() + interval '2 days', null,
  '72000000-0000-4000-8000-000000000001', '72000000-0000-4000-8000-000000000002', null, null, 'cancelled');
select pg_temp.as_user(pg_temp.v('u1')::uuid);
select pg_temp.try('E7 cancelado: no se aceptan pronósticos', format($q$select public.save_prediction(%L, %L, 1, 1)$q$, pg_temp.v('pe1'), pg_temp.v('m4')), true, 'match_not_open');
select pg_temp.check('E7 cancelado: el pronóstico queda como historial, sin puntos',
  (select home_score = 2 and points is null from public.predictions where match_id = pg_temp.v('m4')::uuid and user_id = pg_temp.v('u1')::uuid));
select pg_temp.as_user(pg_temp.v('sa')::uuid);
select pg_temp.try('E8 la cancelación es definitiva (no se reactiva)', format($q$select public.control_save_match(%L, null, '51000000-0000-4000-8000-000000000001', 4, null, now() + interval '3 days', null, '72000000-0000-4000-8000-000000000001', '72000000-0000-4000-8000-000000000002', null, null, 'scheduled')$q$, pg_temp.v('m4')), true, 'match_cancelled');
select pg_temp.as_admin();
select pg_temp.try('E8 tampoco por SQL directo', format($q$update public.matches set status = 'live' where id = %L$q$, pg_temp.v('m4')), true, 'match_cancelled');
select pg_temp.try('E9 un cancelado no es puntuable', format($q$select private.score_match(%L)$q$, pg_temp.v('m4')), true, 'match_not_scorable');

-- ═══ F. FLUJO DE CONTROL (guardar en vivo → cerrar → corregir → reabrir) PUNTÚA SOLO ═══
insert into public.predictions (parche_event_id, event_id, match_id, user_id, home_score, away_score) values
  (pg_temp.v('pe1')::uuid, pg_temp.v('ev')::uuid, pg_temp.v('m6')::uuid, pg_temp.v('u1')::uuid, 2, 0),
  (pg_temp.v('pe2')::uuid, pg_temp.v('ev')::uuid, pg_temp.v('m6')::uuid, pg_temp.v('u1')::uuid, 0, 2);
update public.matches set starts_at = now() - interval '3 hours' where id = pg_temp.v('m6')::uuid;
select pg_temp.as_user(pg_temp.v('sa')::uuid);
select public.control_update_match_live(pg_temp.v('m6')::uuid, 'live', null, null, null, 0, null);
select public.control_update_match_live(pg_temp.v('m6')::uuid, 'live', 2, 0, null, 1, null);
select pg_temp.as_admin();
select pg_temp.check('F1 un marcador en vivo no puntúa', pg_temp.pts(pg_temp.v('pe1')::uuid, pg_temp.v('m6')::uuid, pg_temp.v('u1')::uuid) = 'null/null');
select pg_temp.as_user(pg_temp.v('sa')::uuid);
select public.control_update_match_live(pg_temp.v('m6')::uuid, 'finished', 2, 0, null, 2, null);
select pg_temp.as_admin();
select pg_temp.check('F2 cerrar puntúa a todos los parches (U1: P1 exacto, P2 fallo)',
  pg_temp.pts(pg_temp.v('pe1')::uuid, pg_temp.v('m6')::uuid, pg_temp.v('u1')::uuid) = '3/exact' and pg_temp.pts(pg_temp.v('pe2')::uuid, pg_temp.v('m6')::uuid, pg_temp.v('u1')::uuid) = '0/miss');
select pg_temp.as_user(pg_temp.v('sa')::uuid);
select public.control_update_match_live(pg_temp.v('m6')::uuid, 'finished', 0, 2, null, 3, 'Error de captura del marcador');
select pg_temp.as_admin();
select pg_temp.check('F3 corregir recalcula (invierte los puntos entre parches)',
  pg_temp.pts(pg_temp.v('pe1')::uuid, pg_temp.v('m6')::uuid, pg_temp.v('u1')::uuid) = '0/miss' and pg_temp.pts(pg_temp.v('pe2')::uuid, pg_temp.v('m6')::uuid, pg_temp.v('u1')::uuid) = '3/exact');
select pg_temp.as_user(pg_temp.v('sa')::uuid);
select public.control_reopen_match(pg_temp.v('m6')::uuid, 'Reapertura de prueba del flujo', 4);
select pg_temp.as_admin();
select pg_temp.check('F4 reabrir desde el flujo de Control retira los puntos de todos los parches', (select count(*) from public.predictions where match_id = pg_temp.v('m6')::uuid and points is not null) = 0);
select pg_temp.as_user(pg_temp.v('sa')::uuid);
select pg_temp.check('F5 recálculo explícito de un finalizado devuelve cuántos pronósticos tocó', public.control_rescore_match(pg_temp.v('m1')::uuid) = 5);

-- ═══ G. FALLO TRANSACCIONAL: SIN PUNTUACIONES PARCIALES ═════════════════════
select pg_temp.as_admin();
create temp table before_fail as select id, points, points_reason from public.predictions where match_id = pg_temp.v('m1')::uuid;
create function public.test_fail_fn() returns trigger language plpgsql as $$ begin
  if new.user_id = '00000000-0000-4000-8000-000000000004'::uuid and new.points is distinct from old.points then raise exception 'fallo_simulado'; end if; return new; end $$;
create trigger test_fail before update on public.predictions for each row execute function public.test_fail_fn();
do $$ begin
  begin
    update public.matches set home_score = 0, away_score = 0 where id = 'a1000000-0000-4000-8000-000000000001';   -- fuerza recálculo y falla en la fila de U3
    insert into results (name, ok, detail) values ('G1 el fallo debe propagarse', false, 'sin error');
  exception when others then
    insert into results (name, ok, detail) values ('G1 el fallo se propaga (no se oculta)', sqlerrm like '%fallo_simulado%', sqlerrm);
  end;
end $$;
select pg_temp.check('G2 atómico: ni el marcador ni ningún punto cambiaron',
  (select home_score = 3 and away_score = 0 from public.matches where id = pg_temp.v('m1')::uuid)
  and not exists (select 1 from public.predictions p join before_fail b on b.id = p.id where p.points is distinct from b.points or p.points_reason is distinct from b.points_reason));
drop trigger test_fail on public.predictions;
drop function public.test_fail_fn();

-- ═══ H. CLASIFICACIÓN POR PARCHE Y TORNEO ═══════════════════════════════════
-- Torneo EV Tabla (e…03), parche T (Tabla) y parche T2 (otro parche del mismo torneo).
insert into vars values ('evt','e0000000-0000-4000-8000-000000000003'), ('pt','c1000000-0000-4000-8000-0000000000a1'), ('pt2','c1000000-0000-4000-8000-0000000000a2'),
  ('pet','b1000000-0000-4000-8000-0000000000a1'), ('pet2','b1000000-0000-4000-8000-0000000000a2'),
  ('l1','a1000000-0000-4000-8000-0000000000b1'), ('l2','a1000000-0000-4000-8000-0000000000b2'), ('l3','a1000000-0000-4000-8000-0000000000b3');
insert into public.parches (id, name, created_by) values (pg_temp.v('pt')::uuid, 'Tabla', pg_temp.v('u1')::uuid), (pg_temp.v('pt2')::uuid, 'Tabla2', pg_temp.v('u9')::uuid);
insert into public.parche_members (parche_id, user_id, role, status, disabled_at) values
  (pg_temp.v('pt')::uuid, pg_temp.v('u1')::uuid, 'owner', 'active', null), (pg_temp.v('pt')::uuid, pg_temp.v('u2')::uuid, 'member', 'active', null),
  (pg_temp.v('pt')::uuid, pg_temp.v('u5')::uuid, 'member', 'active', null), (pg_temp.v('pt')::uuid, pg_temp.v('u6')::uuid, 'member', 'active', null),
  (pg_temp.v('pt')::uuid, pg_temp.v('u7')::uuid, 'member', 'active', null), (pg_temp.v('pt')::uuid, pg_temp.v('u8')::uuid, 'member', 'active', null),
  (pg_temp.v('pt')::uuid, pg_temp.v('sa')::uuid, 'admin', 'active', null), (pg_temp.v('pt')::uuid, pg_temp.v('u4')::uuid, 'member', 'disabled', now()),
  (pg_temp.v('pt2')::uuid, pg_temp.v('u9')::uuid, 'owner', 'active', null), (pg_temp.v('pt2')::uuid, pg_temp.v('u1')::uuid, 'member', 'active', null);
insert into public.parche_events (id, parche_id, event_id) values (pg_temp.v('pet')::uuid, pg_temp.v('pt')::uuid, pg_temp.v('evt')::uuid), (pg_temp.v('pet2')::uuid, pg_temp.v('pt2')::uuid, pg_temp.v('evt')::uuid);
select pg_temp.mk_match('a1000000-0000-4000-8000-0000000000b1', 'e0000000-0000-4000-8000-000000000003', '51000000-0000-4000-8000-000000000004', 1);
select pg_temp.mk_match('a1000000-0000-4000-8000-0000000000b2', 'e0000000-0000-4000-8000-000000000003', '51000000-0000-4000-8000-000000000004', 2);
select pg_temp.mk_match('a1000000-0000-4000-8000-0000000000b3', 'e0000000-0000-4000-8000-000000000003', '51000000-0000-4000-8000-000000000004', 3);
-- Resultados finales: L1 2-1, L2 1-0, L3 0-0. Pronósticos por (usuario): [L1, L2, L3]
create function pg_temp.pr(p_pe uuid, p_u text, p_l1 text, p_l2 text, p_l3 text) returns void language plpgsql as $$
declare ms text[] := array['l1','l2','l3']; ps text[] := array[p_l1, p_l2, p_l3]; i int;
begin
  for i in 1..3 loop
    if ps[i] is not null then
      insert into public.predictions (parche_event_id, event_id, match_id, user_id, home_score, away_score)
      values (p_pe, 'e0000000-0000-4000-8000-000000000003', pg_temp.v(ms[i])::uuid, pg_temp.v(p_u)::uuid, split_part(ps[i], '-', 1)::int, split_part(ps[i], '-', 2)::int);
    end if;
  end loop;
end $$;
select pg_temp.pr(pg_temp.v('pet')::uuid, 'u1', '2-1', '3-0', '1-1');   -- 3+1+1 = 5 (1 exacto, 2 resultados)
select pg_temp.pr(pg_temp.v('pet')::uuid, 'u2', '1-0', '1-0', '0-0');   -- 1+3+3 = 7 (2 exactos, 1 resultado)
select pg_temp.pr(pg_temp.v('pet')::uuid, 'u6', '3-0', '2-0', '1-1');   -- 1+1+1 = 3 (0 exactos, 3 resultados)
select pg_temp.pr(pg_temp.v('pet')::uuid, 'u7', '2-1', '0-1', '1-0');   -- 3+0+0 = 3 (1 exacto)
select pg_temp.pr(pg_temp.v('pet')::uuid, 'u8', '2-1', '0-1', '1-0');   -- idéntico a u7 → empate total
select pg_temp.pr(pg_temp.v('pet')::uuid, 'u4', '2-1', '1-0', '0-0');   -- deshabilitado con 9 pts: no aparece
select pg_temp.pr(pg_temp.v('pet2')::uuid, 'u1', '0-0', '0-0', '0-0');  -- el mismo u1 en OTRO parche: pronósticos distintos
select pg_temp.pr(pg_temp.v('pet2')::uuid, 'u9', '2-1', '1-0', '0-0');
update public.matches set starts_at = now() - interval '3 hours' where event_id = pg_temp.v('evt')::uuid;
update public.matches set status = 'finished', home_score = 2, away_score = 1 where id = pg_temp.v('l1')::uuid;
update public.matches set status = 'finished', home_score = 1, away_score = 0 where id = pg_temp.v('l2')::uuid;
update public.matches set status = 'finished', home_score = 0, away_score = 0 where id = pg_temp.v('l3')::uuid;
select pg_temp.as_user(pg_temp.v('u1')::uuid);
create temp table board as select * from public.get_parche_event_leaderboard(pg_temp.v('pet')::uuid);
grant select on board to authenticated;
select pg_temp.check('H1 orden: puntos, luego exactos, luego resultados',
  (select string_agg(display_name, ',' order by rank, display_name) from board) = 'U2,U1,U7,U8,U6,U5');
select pg_temp.check('H2 posiciones: empate total comparte posición y la siguiente se salta (RANK)',
  (select string_agg(display_name || ':' || rank, ',' order by rank, display_name) from board) = 'U2:1,U1:2,U7:3,U8:3,U6:5,U5:6');
select pg_temp.check('H3 totales, exactos y resultados correctos',
  (select string_agg(display_name || '=' || total_points || '/' || exact_count || '/' || result_count || '/' || pred_count, ',' order by rank, display_name) from board)
    = 'U2=7/2/1/3,U1=5/1/2/3,U7=3/1/0/3,U8=3/1/0/3,U6=3/0/3/3,U5=0/0/0/0');
select pg_temp.check('H4 sin pronóstico = 0 puntos (U5 aparece)', exists (select 1 from board where display_name = 'U5' and total_points = 0));
select pg_temp.check('H5 excluye al superadministrador (miembro admin del parche) y al deshabilitado (aunque tenga 9 pts)',
  not exists (select 1 from board where user_id in (pg_temp.v('sa')::uuid, pg_temp.v('u4')::uuid)));
select pg_temp.as_user(pg_temp.v('u9')::uuid);
select pg_temp.check('H6 clasificación independiente del otro parche (mismo torneo)',
  (select string_agg(display_name || ':' || total_points, ',' order by rank, display_name) from public.get_parche_event_leaderboard(pg_temp.v('pet2')::uuid)) = 'U9:9,U1:3'
  );
select pg_temp.try('H7 un miembro de otro parche no consulta la tabla', format($q$select * from public.get_parche_event_leaderboard(%L)$q$, pg_temp.v('pet')), true, 'not_member');
select pg_temp.as_user(pg_temp.v('x')::uuid);
select pg_temp.try('H7 un usuario sin parches no consulta ninguna tabla', format($q$select * from public.get_parche_event_leaderboard(%L)$q$, pg_temp.v('pet2')), true, 'not_member');
select pg_temp.as_user(pg_temp.v('u1')::uuid);
select pg_temp.check('H8 U1 tiene puntuaciones distintas en cada parche del mismo torneo (5 vs 3)',
  (select total_points from public.get_parche_event_leaderboard(pg_temp.v('pet')::uuid) where user_id = pg_temp.v('u1')::uuid) = 5
  and (select total_points from public.get_parche_event_leaderboard(pg_temp.v('pet2')::uuid) where user_id = pg_temp.v('u1')::uuid) = 3);
-- Partido cancelado: no distorsiona
select pg_temp.as_admin();
select pg_temp.mk_match('a1000000-0000-4000-8000-0000000000b4', 'e0000000-0000-4000-8000-000000000003', '51000000-0000-4000-8000-000000000004', 4);
insert into public.predictions (parche_event_id, event_id, match_id, user_id, home_score, away_score) values
  (pg_temp.v('pet')::uuid, pg_temp.v('evt')::uuid, 'a1000000-0000-4000-8000-0000000000b4', pg_temp.v('u5')::uuid, 1, 1);
update public.matches set status = 'cancelled' where id = 'a1000000-0000-4000-8000-0000000000b4';
select pg_temp.as_user(pg_temp.v('u1')::uuid);
select pg_temp.check('H9 pronósticos de partidos cancelados no suman ni cuentan en la clasificación',
  (select pred_count = 0 and total_points = 0 from public.get_parche_event_leaderboard(pg_temp.v('pet')::uuid) where user_id = pg_temp.v('u5')::uuid));
select pg_temp.try('H10 anon no ejecuta funciones del motor', $q$select 1$q$, false);
do $$ begin execute 'reset role'; execute 'set local role anon'; end $$;
select pg_temp.try('H10 anon no ejecuta save_prediction', $q$select public.save_prediction(gen_random_uuid(), gen_random_uuid(), 1, 1)$q$, true, 'permission denied%');
select pg_temp.try('H10 anon no ejecuta la clasificación', $q$select * from public.get_parche_event_leaderboard(gen_random_uuid())$q$, true, 'permission denied%');

-- ═══ I. INTEGRIDAD HISTÓRICA ════════════════════════════════════════════════
select pg_temp.as_admin();
select pg_temp.check('I1 Mundial 2026 intacto: 104 partidos idénticos y snapshot sellado válido',
  (select md5(string_agg(m::text, '|' order by m.id)) from public.matches m where event_id = 'daaebb9b-8e92-5644-824f-bf826114446a') = (select matches from hist_before)
  and (select rows_checksum from public.standing_snapshots limit 1) = (select checksum from hist_before)
  and (select bool_and(private.verify_standing_snapshot(id)) from public.standing_snapshots)
  and (select count(*) from public.predictions where event_id = 'daaebb9b-8e92-5644-824f-bf826114446a') = 0);
select pg_temp.check('I2 el motor no puntúa partidos del torneo histórico', (select count(*) from public.predictions where event_id = 'daaebb9b-8e92-5644-824f-bf826114446a' and points is not null) = 0);
-- Un UPDATE inocuo sobre un partido histórico no desencadena puntuación ni errores (el trigger lo omite)
update public.matches set venue = venue where id = (select id from public.matches where event_id = 'daaebb9b-8e92-5644-824f-bf826114446a' limit 1);
select pg_temp.check('I3 tocar un partido histórico no puntúa ni crea pronósticos', (select count(*) from public.predictions where event_id = 'daaebb9b-8e92-5644-824f-bf826114446a') = 0);

select 'FALLO' as resultado, name, detail from results where not ok
union all
select 'TOTAL', count(*) filter (where ok) || ' OK', count(*) filter (where not ok) || ' fallos' from results;
rollback;
