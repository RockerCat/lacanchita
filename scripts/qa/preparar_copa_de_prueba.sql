-- Datos FICTICIOS de QA para "Copa de prueba" (slug copa-de-prueba). Idempotente: reutiliza lo que existe,
-- completa solo lo que falta y no sobrescribe modificaciones manuales. NO es un importador genérico.
--   npx supabase db query --linked -f scripts/qa/preparar_copa_de_prueba.sql
-- Usa las funciones reales de Control como el superadministrador autorizado (claims JWT simulados en la
-- transacción), así la auditoría, las revisiones y las validaciones son las del flujo normal. Registrar
-- resultados exige un torneo publicado: si hace falta, el torneo se publica y se vuelve a borrador
-- (transiciones válidas) DENTRO DE ESTA MISMA TRANSACCIÓN, por lo que nadie lo ve publicado.
-- Datos: Fase única (liga, 3/1) y 3 partidos Colombia–Argentina; no toca otros torneos.
do $$
declare
  c_ev constant uuid := 'e67ed98a-1929-49e0-bcc8-6ff9eb74169c';
  c_sa constant uuid := '95d77e57-b6cb-4359-bc86-e70b3b9f44dd';
  v_ev public.events;
  v_col uuid; v_arg uuid; v_stage uuid;
  v_m1 uuid; v_m2 uuid; v_m3 uuid;
  v_m public.matches;
  v_published boolean := false;
  v_end constant timestamptz := '2026-11-03 23:59:00-05';
  v_rev integer;
begin
  -- Guardas: proyecto, torneo (UUID + slug), superadministrador y equipos esperados.
  select * into v_ev from public.events where id = c_ev and slug = 'copa-de-prueba';
  if not found then raise exception 'qa: el torneo copa-de-prueba (UUID esperado) no existe en este proyecto'; end if;
  if v_ev.status not in ('draft', 'scheduled', 'in_progress') then raise exception 'qa: estado inesperado %', v_ev.status; end if;
  if not exists (select 1 from private.platform_admins where user_id = c_sa) then raise exception 'qa: falta el superadministrador'; end if;
  select et.team_id into v_col from public.event_teams et join public.teams t on t.id = et.team_id where et.event_id = c_ev and t.name = 'Colombia';
  select et.team_id into v_arg from public.event_teams et join public.teams t on t.id = et.team_id where et.event_id = c_ev and t.name = 'Argentina';
  if v_col is null or v_arg is null or (select count(*) from public.event_teams where event_id = c_ev) <> 2 then
    raise exception 'qa: el torneo debe tener exactamente Colombia y Argentina';
  end if;
  perform set_config('request.jwt.claims', json_build_object('sub', c_sa, 'role', 'authenticated')::text, true);

  -- Fin oficial: solo se amplía si es anterior al 3 de noviembre de 2026.
  if v_ev.official_end_at is not null and v_ev.official_end_at < v_end then
    perform public.control_update_event(c_ev, v_ev.name, v_ev.slug, v_ev.timezone, v_end);
  end if;

  -- Fase única
  select id into v_stage from public.event_stages where event_id = c_ev and code = 'fase_unica';
  if v_stage is null then
    v_stage := public.control_save_stage(c_ev, null, 'fase_unica', 'Fase única', 1, false, 3, 1);
  end if;

  -- Partidos (criterio estable: número de partido 1, 2 y 3 dentro del torneo)
  select id into v_m1 from public.matches where event_id = c_ev and match_number = 1;
  if v_m1 is null then
    v_m1 := public.control_save_match(null, c_ev, v_stage, 1, null, '2026-11-02 15:00:00-05', null, v_col, v_arg, null, null, 'scheduled');
  end if;
  select id into v_m2 from public.matches where event_id = c_ev and match_number = 2;
  if v_m2 is null then
    v_m2 := public.control_save_match(null, c_ev, v_stage, 2, null, '2026-10-29 18:00:00-05', null, v_arg, v_col, null, null, 'scheduled');
  end if;
  select id into v_m3 from public.matches where event_id = c_ev and match_number = 3;
  if v_m3 is null then
    v_m3 := public.control_save_match(null, c_ev, v_stage, 3, null, '2026-10-28 18:00:00-05', null, v_col, v_arg, null, null, 'scheduled');
  end if;

  -- Partido 3: marcador oficial (flujo vigente de la Fase 3.2: iniciar → finalizar). Se omite si ya está finalizado.
  -- El partido 2 de una carga ANTIGUA puede tener un marcador pendiente heredado (private.match_result_drafts); el
  -- flujo actual ya no crea pendientes y esa fila no se toca aquí (se resuelve desde Control → Resultados).
  select * into v_m from public.matches where id = v_m3;
  if v_m.result_confirmed_at is null and v_m.status = 'scheduled' and not exists (select 1 from private.match_result_drafts where match_id = v_m3) then
    if (select status from public.events where id = c_ev) = 'draft' then
      perform public.control_publish_event(c_ev); v_published := true;
    end if;
    v_rev := public.control_update_match_live(v_m3, 'live', 0, 0, null, v_m.result_revision, null);   -- inicio
    perform public.control_update_match_live(v_m3, 'finished', 3, 0, null, v_rev, null);            -- Colombia 3 – Argentina 0 (cierre)
  end if;

  -- Si se publicó solo para registrar resultados, vuelve a borrador (nadie lo vio publicado).
  if v_published then
    perform public.control_set_event_status(c_ev, 'draft');
  end if;
  if (select status from public.events where id = c_ev) <> v_ev.status then
    raise exception 'qa: el torneo debía quedar en estado %', v_ev.status;
  end if;
end $$;

select 'ok' as resultado;
