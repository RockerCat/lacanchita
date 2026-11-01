-- Verificación de La Canchita Control contra el proyecto REAL (lacanchita), TODO dentro de una transacción
-- que termina en ROLLBACK: no deja datos. Identidades simuladas con claims JWT (no toca auth.*):
-- superadmin = el UUID autorizado; usuario normal = un miembro real de La Penúltima sin rol de administración.
--   npx supabase db query --linked -f scripts/history-migration/tests/remote_control_test.sql
begin;
do $$ begin
  if not exists (select 1 from public.events where slug = 'mundial-2026') then raise exception 'proyecto_inesperado'; end if;
end $$;
create temp table results (n serial, name text, ok boolean, detail text);
create temp table vars (k text primary key, v text);
grant insert, select on results to authenticated;
grant select, insert, update on vars to authenticated;
grant usage on sequence results_n_seq to authenticated;
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
grant execute on all functions in schema pg_temp to authenticated;

insert into vars select 'sa', '95d77e57-b6cb-4359-bc86-e70b3b9f44dd';
insert into vars select 'lp', '91ad5d8d-414c-4e74-bf57-2ca476652de0';
insert into vars select 'mundial', 'daaebb9b-8e92-5644-824f-bf826114446a';
insert into vars select 'n', (select user_id::text from public.parche_members where parche_id = '91ad5d8d-414c-4e74-bf57-2ca476652de0'
  and role = 'member' and status = 'active' order by joined_at limit 1);
insert into vars select 'pp', (select id::text from public.parches where name = 'ParchePrueba1' limit 1);
create temp table before as select
  (select md5(string_agg(m::text, '|' order by m.id)) from public.matches m where event_id = pg_temp.v('mundial')::uuid) matches,
  (select md5(string_agg(t::text, '|' order by t.id)) from public.teams t) teams,
  (select count(*) from public.events) events, (select count(*) from public.control_audit_log) audit,
  (select count(*) from public.parche_events) pe, (select count(*) from private.platform_admins) admins,
  (select rows_checksum from public.standing_snapshots limit 1) checksum;

-- Autorización real
select pg_temp.check('hay exactamente 1 superadministrador y es el autorizado',
  (select count(*) from private.platform_admins) = 1 and exists (select 1 from private.platform_admins where user_id = pg_temp.v('sa')::uuid));
select pg_temp.as_user(pg_temp.v('sa')::uuid);
select pg_temp.check('el superadministrador autorizado es reconocido', public.is_platform_admin());
select pg_temp.as_user(pg_temp.v('n')::uuid);
select pg_temp.check('un miembro normal real NO es superadministrador', not public.is_platform_admin());
select pg_temp.try('miembro normal no crea torneos', $q$select public.control_create_event('x-remoto', 'X Remoto', 'UTC')$q$, true, 'not_platform_admin');
select pg_temp.try('miembro normal no lee platform_admins', $q$select * from private.platform_admins$q$, true, 'permission denied%');
select pg_temp.try('miembro normal no escribe platform_admins', format($q$insert into private.platform_admins (user_id) values (%L)$q$, pg_temp.v('n')), true, 'permission denied%');
select pg_temp.try('miembro normal no ejecuta control_event_lock_reasons', $q$select * from public.control_event_lock_reasons()$q$, true, 'not_platform_admin');
select pg_temp.try('miembro normal no inscribe en La Penúltima', format($q$select public.add_event_to_parche(%L, %L)$q$, pg_temp.v('lp'), pg_temp.v('mundial')), true, 'not_authorized');
select pg_temp.check('el torneo histórico sigue visible para el miembro',
  (select count(*) from public.events where id = pg_temp.v('mundial')::uuid) = 1
  and (select count(*) from public.matches where event_id = pg_temp.v('mundial')::uuid) = 104
  and (select count(*) from public.teams) = 48);

-- Flujo completo (en la transacción)
select pg_temp.as_user(pg_temp.v('sa')::uuid);
insert into vars select 'e', public.control_create_event('prueba-remota', 'Prueba remota (se revierte)', 'America/Bogota')::text;
insert into vars select 'st', public.control_save_stage(pg_temp.v('e')::uuid, null, 'final', 'Final', 1, true, 8, 6)::text;
insert into vars select 'ta', public.control_save_team(null, 'Remoto Alfa', null, 'club', null)::text;
insert into vars select 'tb', public.control_save_team(null, 'Remoto Beta', null, 'club', null)::text;
select public.control_set_event_team(pg_temp.v('e')::uuid, pg_temp.v('ta')::uuid, null);
select public.control_set_event_team(pg_temp.v('e')::uuid, pg_temp.v('tb')::uuid, null);
insert into vars select 'm', public.control_save_match(null, pg_temp.v('e')::uuid, pg_temp.v('st')::uuid, 1, null, '2027-06-10T20:00:00Z', null,
  pg_temp.v('ta')::uuid, pg_temp.v('tb')::uuid, null, null, null)::text;
select pg_temp.check('el borrador lo ve el superadministrador', (select count(*) from public.events where id = pg_temp.v('e')::uuid) = 1
  and (select count(*) from public.matches where event_id = pg_temp.v('e')::uuid) = 1);
select pg_temp.as_user(pg_temp.v('n')::uuid);
select pg_temp.check('el borrador NO lo ve un miembro (torneo, fases, equipos, partidos)',
  (select count(*) from public.events where id = pg_temp.v('e')::uuid) = 0
  and (select count(*) from public.event_stages where event_id = pg_temp.v('e')::uuid) = 0
  and (select count(*) from public.event_teams where event_id = pg_temp.v('e')::uuid) = 0
  and (select count(*) from public.matches where event_id = pg_temp.v('e')::uuid) = 0
  and (select count(*) from public.teams where id in (pg_temp.v('ta')::uuid, pg_temp.v('tb')::uuid)) = 0);
select pg_temp.as_user(pg_temp.v('sa')::uuid);
select pg_temp.try('guardar marcador en un borrador: rechazado', format($q$select public.control_update_match_live(%L, 'live', 1, 0, null, 0, null)$q$, pg_temp.v('m')), true, 'event_not_published');
select public.control_publish_event(pg_temp.v('e')::uuid);
select pg_temp.as_user(pg_temp.v('n')::uuid);
select pg_temp.check('publicado: el miembro lo ve', (select count(*) from public.events where id = pg_temp.v('e')::uuid) = 1
  and (select count(*) from public.matches where event_id = pg_temp.v('e')::uuid) = 1);
select pg_temp.as_user(pg_temp.v('sa')::uuid);
insert into vars select 'pe', public.add_event_to_parche(pg_temp.v('pp')::uuid, pg_temp.v('e')::uuid)::text;
select pg_temp.try('inscripción duplicada', format($q$select public.add_event_to_parche(%L, %L)$q$, pg_temp.v('pp'), pg_temp.v('e')), true, 'already_enrolled');
-- Ciclo de vida (Fase 3.2): inicio perezoso → marcador en vivo público → cierre con penales → corrección con motivo
select pg_temp.as_admin();
update public.matches set starts_at = now() - interval '5 minutes' where id = pg_temp.v('m')::uuid;
select pg_temp.as_user(pg_temp.v('n')::uuid);
insert into vars select 'sync1', public.sync_due_matches()::text;
select pg_temp.check('un miembro real dispara la sincronización: el partido vencido pasa a En vivo 0-0', pg_temp.v('sync1')::int >= 1
  and (select status = 'live' and home_score = 0 and away_score = 0 from public.matches where id = pg_temp.v('m')::uuid));
select pg_temp.check('segunda sincronización: idempotente (0 partidos)', public.sync_due_matches() = 0);
select pg_temp.try('NORMAL REAL: no guarda marcadores', format($q$select public.control_update_match_live(%L, 'live', 5, 5, null, 1, null)$q$, pg_temp.v('m')), true, 'not_platform_admin');
select pg_temp.try('NORMAL REAL: no modifica matches', format($q$update public.matches set home_score = 9 where id = %L$q$, pg_temp.v('m')), true, 'permission denied%');
select pg_temp.try('NORMAL REAL: no lee la tabla privada de borradores heredados', $q$select * from private.match_result_drafts$q$, true, 'permission denied%');
select pg_temp.try('NORMAL REAL: no consulta pendientes heredados por RPC', format($q$select * from public.control_pending_results(%L)$q$, pg_temp.v('e')), true, 'not_platform_admin');
select pg_temp.as_user(pg_temp.v('sa')::uuid);
select public.control_update_match_live(pg_temp.v('m')::uuid, 'live', 1, 1, null, 0, null);
select pg_temp.as_user(pg_temp.v('n')::uuid);
select pg_temp.check('NORMAL REAL: ve el marcador en vivo de inmediato (1-1, sin oficial)', (select status = 'live' and home_score = 1 and away_score = 1 and result_confirmed_at is null from public.matches where id = pg_temp.v('m')::uuid));
select pg_temp.as_user(pg_temp.v('sa')::uuid);
select pg_temp.try('guardado obsoleto rechazado', format($q$select public.control_update_match_live(%L, 'live', 3, 0, null, 0, null)$q$, pg_temp.v('m')), true, 'stale_revision');
select pg_temp.try('eliminatoria empatada sin ganador no cierra (nada a medias)', format($q$select public.control_update_match_live(%L, 'finished', 1, 1, null, 1, null)$q$, pg_temp.v('m')), true, 'winner_required');
select public.control_update_match_live(pg_temp.v('m')::uuid, 'finished', 1, 1, 'home', 1, null);
select pg_temp.check('cerrar con penales: marcador, ganador y oficial en una operación',
  (select status = 'finished' and winner_side = 'home' and result_confirmed_by = pg_temp.v('sa')::uuid and result_revision = 2 from public.matches where id = pg_temp.v('m')::uuid));
select pg_temp.as_user(pg_temp.v('n')::uuid);
select pg_temp.check('NORMAL REAL: ve el resultado final', (select status = 'finished' and home_score = 1 and winner_side = 'home' from public.matches where id = pg_temp.v('m')::uuid));
select pg_temp.as_user(pg_temp.v('sa')::uuid);
select pg_temp.try('corrección sin motivo', format($q$select public.control_update_match_live(%L, 'finished', 2, 1, null, 2, '')$q$, pg_temp.v('m')), true, 'reason_required');
select public.control_update_match_live(pg_temp.v('m')::uuid, 'finished', 2, 1, null, 2, 'Corrección de prueba remota');
select pg_temp.check('auditoría del ciclo con actor = superadmin (inicio automático con actor nulo)',
  (select count(*) from public.control_audit_log where event_id = pg_temp.v('e')::uuid and actor_id = pg_temp.v('sa')::uuid and action in ('match_finished', 'score_updated', 'result_corrected')) = 3
  and exists (select 1 from public.control_audit_log where action = 'match_auto_started' and entity_id = pg_temp.v('m')::uuid and actor_id is null)
  and exists (select 1 from public.control_audit_log where action = 'result_corrected' and reason = 'Corrección de prueba remota'));
select pg_temp.check('sin pronósticos creados por esta prueba', (select count(*) from public.predictions where event_id = pg_temp.v('e')::uuid) = 0);
select pg_temp.check('el marcador pendiente heredado de Copa de prueba sigue consultable solo por el superadmin',
  (select count(*) from public.control_pending_results('e67ed98a-1929-49e0-bcc8-6ff9eb74169c')) = 1);

-- Escudos (Storage real, dentro de la transacción): solo el superadministrador escribe
select pg_temp.as_admin();
select pg_temp.check('bucket team-crests: público, 512 KB, png/jpeg/webp, sin SVG', (select public and file_size_limit = 524288 and allowed_mime_types @> array['image/png','image/jpeg','image/webp'] and not allowed_mime_types @> array['image/svg+xml'] from storage.buckets where id = 'team-crests'));
select pg_temp.as_user(pg_temp.v('sa')::uuid);
insert into vars select 'tclub', public.control_save_team(null, 'Club Prueba Remoto', 'CPR', 'club', null)::text;
insert into vars select 'cpath', pg_temp.v('tclub') || '/' || gen_random_uuid() || '.png';
insert into storage.objects (bucket_id, name) values ('team-crests', pg_temp.v('cpath'));
select public.control_set_team_crest(pg_temp.v('tclub')::uuid, pg_temp.v('cpath'));
select pg_temp.check('superadmin sube y asocia un escudo (equipo global)', (select crest_path = pg_temp.v('cpath') and kind = 'club' from public.teams where id = pg_temp.v('tclub')::uuid));
select pg_temp.as_user(pg_temp.v('n')::uuid);
select pg_temp.try('NORMAL REAL no sube escudos', format($q$insert into storage.objects (bucket_id, name) values ('team-crests', %L)$q$, pg_temp.v('tclub') || '/' || gen_random_uuid() || '.png'), true, '%row-level security%');
select pg_temp.try('NORMAL REAL no asocia escudos', format($q$select public.control_set_team_crest(%L, null)$q$, pg_temp.v('tclub')), true, 'not_platform_admin');
select pg_temp.check('NORMAL REAL no lista objetos del bucket', (select count(*) from storage.objects where bucket_id = 'team-crests') = 0);
select pg_temp.as_user(pg_temp.v('sa')::uuid);
select pg_temp.try('escudo del Mundial bloqueado', format($q$select public.control_set_team_crest(%L, null)$q$, (select team_id from public.event_teams where event_id = pg_temp.v('mundial')::uuid limit 1)), true, 'team_in_locked_event');
-- Reordenar fases
select pg_temp.try('mover fase (única): sin efecto y sin error', format($q$select public.control_move_stage(%L, %L, 'up')$q$, pg_temp.v('e'), pg_temp.v('st')), false);
-- Torneo histórico bloqueado para Control
select pg_temp.try('histórico: no se registra resultado', format($q$select public.control_update_match_live(%L, 'finished', 1, 0, null, 0, 'motivo de prueba')$q$,
  (select id from public.matches where event_id = pg_temp.v('mundial')::uuid limit 1)), true, 'event_locked_history');
select pg_temp.try('histórico: no se edita el torneo', format($q$select public.control_update_event(%L, 'X', 'mundial-2026', 'UTC', null)$q$, pg_temp.v('mundial')), true, 'event_locked_history');
select pg_temp.check('control_event_lock_reasons marca el Mundial', exists (select 1 from public.control_event_lock_reasons() where event_id = pg_temp.v('mundial')::uuid and reason = 'event_locked_history'));
select pg_temp.as_admin();
select pg_temp.check('histórico intacto dentro de la transacción',
  (select md5(string_agg(m::text, '|' order by m.id)) from public.matches m where event_id = pg_temp.v('mundial')::uuid) = (select matches from before)
  and (select rows_checksum from public.standing_snapshots limit 1) = (select checksum from before)
  and (select bool_and(private.verify_standing_snapshot(id)) from public.standing_snapshots));

-- Resultado: una fila por prueba fallida (name/detail) y la fila final con los totales.
select 'FALLO' as resultado, name, detail from results where not ok
union all
select 'TOTAL', count(*) filter (where ok) || ' OK', count(*) filter (where not ok) || ' fallos' from results;
rollback;
