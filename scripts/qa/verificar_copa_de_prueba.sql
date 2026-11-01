-- Verificación de solo lectura de los datos de QA de "Copa de prueba" (todo en una transacción con ROLLBACK;
-- identidades simuladas con claims JWT, sin tocar auth.*).
--   npx supabase db query --linked -f scripts/qa/verificar_copa_de_prueba.sql
begin;
create temp table results (n serial, name text, ok boolean, detail text);
create function pg_temp.check(p_name text, p_ok boolean, p_detail text default null) returns void language sql as $$
  insert into results (name, ok, detail) values (p_name, coalesce(p_ok, false), p_detail);
$$;
create function pg_temp.as_user(p uuid) returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;
grant insert, select on results to authenticated;
grant usage on sequence results_n_seq to authenticated;
grant execute on all functions in schema pg_temp to authenticated;
create temp table ctx as select
  'e67ed98a-1929-49e0-bcc8-6ff9eb74169c'::uuid ev, '95d77e57-b6cb-4359-bc86-e70b3b9f44dd'::uuid sa,
  (select user_id from public.parche_members where parche_id = '91ad5d8d-414c-4e74-bf57-2ca476652de0' and role = 'member' and status = 'active' order by joined_at limit 1) normal;
grant select on ctx to authenticated;
create temp table hist as select
  (select md5(string_agg(m::text, '|' order by m.id)) from public.matches m where event_id = 'daaebb9b-8e92-5644-824f-bf826114446a') matches,
  (select rows_checksum from public.standing_snapshots limit 1) checksum;

select pg_temp.check('1. existe exactamente el torneo objetivo (UUID + slug)', (select count(*) from public.events where id = (select ev from ctx) and slug = 'copa-de-prueba') = 1
  and (select count(*) from public.events where slug = 'copa-de-prueba') = 1);
select pg_temp.check('2. sigue en borrador', (select status = 'draft' from public.events where id = (select ev from ctx)));
select pg_temp.check('3. una fase «Fase única» (liga, orden 1, 3/1)', (select count(*) from public.event_stages where event_id = (select ev from ctx)) = 1
  and exists (select 1 from public.event_stages where event_id = (select ev from ctx) and name = 'Fase única' and not is_knockout and sort_order = 1 and exact_points = 3 and result_points = 1));
select pg_temp.check('4. Colombia y Argentina asociados una sola vez, sin duplicados en el catálogo',
  (select count(*) from public.event_teams where event_id = (select ev from ctx)) = 2
  and (select count(distinct team_id) from public.event_teams where event_id = (select ev from ctx)) = 2
  and (select count(*) from public.teams where name in ('Colombia', 'Argentina')) = 2);
select pg_temp.check('5. exactamente tres partidos, todos en la fase única',
  (select count(*) from public.matches where event_id = (select ev from ctx)) = 3
  and (select count(distinct match_number) from public.matches where event_id = (select ev from ctx)) = 3
  and (select count(*) from public.matches m join public.event_stages s on s.id = m.stage_id where m.event_id = (select ev from ctx) and s.name = 'Fase única') = 3);
select pg_temp.check('   fechas y equipos (America/Bogota)',
  (select count(*) from public.matches m join public.teams h on h.id = m.home_team_id join public.teams a on a.id = m.away_team_id
    where m.event_id = (select ev from ctx) and (
      (m.match_number = 1 and h.name = 'Colombia' and a.name = 'Argentina' and m.starts_at = '2026-11-02 15:00-05') or
      (m.match_number = 2 and h.name = 'Argentina' and a.name = 'Colombia' and m.starts_at = '2026-10-29 18:00-05') or
      (m.match_number = 3 and h.name = 'Colombia' and a.name = 'Argentina' and m.starts_at = '2026-10-28 18:00-05'))) = 3);
select pg_temp.check('6. partido 1: programado, sin marcador', (select status = 'scheduled' and home_score is null and away_score is null and result_confirmed_at is null and result_revision = 0
  from public.matches where event_id = (select ev from ctx) and match_number = 1));
select pg_temp.check('8. partido 3: oficial 3-0 confirmado por el superadmin', (select status = 'finished' and home_score = 3 and away_score = 0 and result_confirmed_at is not null
  and result_confirmed_by = (select sa from ctx) and result_revision = 1 from public.matches where event_id = (select ev from ctx) and match_number = 3));
select pg_temp.check('   partido 2: matches sin marcador ni estado derivado (el pendiente no está ahí)', (select status = 'scheduled' and home_score is null and away_score is null and winner_side is null
  and result_confirmed_at is null and result_revision = 0 from public.matches where event_id = (select ev from ctx) and match_number = 2));
select pg_temp.check('   fin oficial del torneo ampliado al 3-nov-2026', (select official_end_at >= '2026-11-03 23:59-05' from public.events where id = (select ev from ctx)));

select pg_temp.as_user((select sa from ctx));
select pg_temp.check('7/9/11. superadmin ve el pendiente (Argentina 2 – Colombia 1, revisión 1) en el borrador privado',
  (select count(*) from public.control_pending_results((select ev from ctx)) p join public.matches m on m.id = p.match_id
    where m.match_number = 2 and p.home_score = 2 and p.away_score = 1 and p.revision = 1) = 1);
select pg_temp.check('11. superadmin ve los tres estados',
  (select count(*) from public.matches where event_id = (select ev from ctx)) = 3
  and (select count(*) from public.matches where event_id = (select ev from ctx) and result_confirmed_at is not null) = 1
  and (select count(*) from public.control_pending_results((select ev from ctx))) = 1);

select pg_temp.as_user((select normal from ctx));
select pg_temp.check('10. usuario normal: no ve el torneo borrador ni sus partidos', (select count(*) from public.events where id = (select ev from ctx)) = 0
  and (select count(*) from public.matches where event_id = (select ev from ctx)) = 0);
do $$ begin
  begin perform * from private.match_result_drafts; insert into results values (default, '10. usuario normal no lee la tabla privada', false, 'sin error');
  exception when others then insert into results values (default, '10. usuario normal no lee la tabla privada', sqlerrm like 'permission denied%', sqlerrm); end;
  begin perform * from public.control_pending_results((select ev from ctx)); insert into results values (default, '10. usuario normal no consulta pendientes por RPC', false, 'sin error');
  exception when others then insert into results values (default, '10. usuario normal no consulta pendientes por RPC', sqlerrm = 'not_platform_admin', sqlerrm); end;
end $$;

reset role;
select pg_temp.check('12. el resultado confirmado tiene auditoría (registro + confirmación, actor = superadmin, valores anteriores y nuevos)',
  (select count(*) from public.control_audit_log a join public.matches m on m.id = a.entity_id where m.event_id = (select ev from ctx) and m.match_number = 3
     and a.actor_id = (select sa from ctx) and a.action in ('result_recorded', 'result_confirmed')) = 2
  and exists (select 1 from public.control_audit_log a join public.matches m on m.id = a.entity_id where m.match_number = 3 and m.event_id = (select ev from ctx)
     and a.action = 'result_confirmed' and a.old_values ->> 'pending' = 'true' and a.new_values ->> 'confirmed' = 'true' and (a.new_values ->> 'revision')::int = 1));
select pg_temp.check('   auditoría del pendiente y de la preparación (fase, partidos)',
  exists (select 1 from public.control_audit_log a join public.matches m on m.id = a.entity_id where m.match_number = 2 and m.event_id = (select ev from ctx) and a.action = 'result_recorded')
  and (select count(*) from public.control_audit_log where event_id = (select ev from ctx) and action = 'match_created') = 3
  and (select count(*) from public.control_audit_log where event_id = (select ev from ctx) and action = 'stage_created') = 1);
select pg_temp.check('13. Mundial 2026 intacto (104 partidos sin cambios, snapshot sellado válido)',
  (select md5(string_agg(m::text, '|' order by m.id)) from public.matches m where event_id = 'daaebb9b-8e92-5644-824f-bf826114446a') = (select matches from hist)
  and (select count(*) from public.matches where event_id = 'daaebb9b-8e92-5644-824f-bf826114446a') = 104
  and (select rows_checksum from public.standing_snapshots limit 1) = (select checksum from hist)
  and (select bool_and(private.verify_standing_snapshot(id)) from public.standing_snapshots)
  and (select status = 'finished' from public.events where slug = 'mundial-2026'));
select pg_temp.check('   sin pronósticos ni puntos, sin inscripciones en Copa de prueba',
  (select count(*) from public.predictions) = 0 and (select count(*) from public.parche_events where event_id = (select ev from ctx)) = 0);

select 'FALLO' as resultado, name, detail from results where not ok
union all
select 'TOTAL', count(*) filter (where ok) || ' OK', count(*) filter (where not ok) || ' fallos' from results;
rollback;
