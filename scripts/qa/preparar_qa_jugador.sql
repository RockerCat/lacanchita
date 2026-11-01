-- Torneo de QA AISLADO para recorrer la experiencia del jugador (Fase 3.3): "QA Jugador" (slug qa-jugador).
-- Solo CREA filas nuevas con las funciones reales de Control como el superadministrador autorizado (claims JWT
-- simulados en la transacción) y lo inscribe ÚNICAMENTE en el parche de prueba "ParchePrueba1". No toca Copa de
-- prueba, el Mundial 2026 ni La Penúltima; reutiliza equipos del catálogo sin modificarlos. Un solo uso: si el
-- torneo ya existe, aborta sin cambios.
--   npx supabase db query --linked -f scripts/qa/preparar_qa_jugador.sql
do $$
declare
  c_sa constant uuid := '95d77e57-b6cb-4359-bc86-e70b3b9f44dd';
  v_ev uuid; v_g uuid; v_f uuid; v_parche uuid; v_n integer;
  v_t record;
  v_teams jsonb := '{}';
  v_base timestamptz := date_trunc('minute', now());
begin
  if not exists (select 1 from public.events where slug = 'mundial-2026') then raise exception 'qa: proyecto inesperado'; end if;
  if exists (select 1 from public.events where slug = 'qa-jugador') then raise exception 'qa: qa-jugador ya existe (no se repite)'; end if;
  if not exists (select 1 from private.platform_admins where user_id = c_sa) then raise exception 'qa: falta el superadministrador'; end if;
  select count(*), min(id::text)::uuid into v_n, v_parche from public.parches where name = 'ParchePrueba1' and created_by = c_sa;
  if v_n <> 1 then raise exception 'qa: se esperaba exactamente un ParchePrueba1 creado por el superadministrador'; end if;
  for v_t in select id, name from public.teams where kind = 'national' and name in ('Colombia','Argentina','Brasil','Uruguay','España','Francia') loop
    v_teams := v_teams || jsonb_build_object(v_t.name, v_t.id);
  end loop;
  if (select count(*) from jsonb_object_keys(v_teams)) <> 6 then raise exception 'qa: faltan equipos en el catálogo'; end if;

  perform set_config('request.jwt.claims', json_build_object('sub', c_sa, 'role', 'authenticated')::text, true);
  v_ev := public.control_create_event('qa-jugador', 'QA Jugador (prueba)', 'America/Bogota');
  v_g := public.control_save_stage(v_ev, null, 'grupos', 'Fase de grupos', 1, false, 3, 1);
  v_f := public.control_save_stage(v_ev, null, 'final', 'Final', 2, true, 8, 6);
  for v_t in select key from jsonb_each_text(v_teams) loop
    perform public.control_set_event_team(v_ev, (v_teams ->> v_t.key)::uuid, null);
  end loop;
  -- Calendario: uno que empieza en ~40 min (para ver el cierre y el paso a En Vivo) y el resto en el futuro.
  perform public.control_save_match(null, v_ev, v_g, 1, 'A', v_base + interval '40 minutes', null, (v_teams->>'Colombia')::uuid, (v_teams->>'Argentina')::uuid, null, null, 'scheduled');
  perform public.control_save_match(null, v_ev, v_g, 2, 'A', v_base + interval '1 day', null, (v_teams->>'Brasil')::uuid, (v_teams->>'Uruguay')::uuid, null, null, 'scheduled');
  perform public.control_save_match(null, v_ev, v_g, 3, 'B', v_base + interval '2 days', null, (v_teams->>'España')::uuid, (v_teams->>'Francia')::uuid, null, null, 'scheduled');
  perform public.control_save_match(null, v_ev, v_g, 4, 'B', v_base + interval '3 days', null, (v_teams->>'Argentina')::uuid, (v_teams->>'Brasil')::uuid, null, null, 'scheduled');
  perform public.control_save_match(null, v_ev, v_g, 5, 'A', v_base + interval '5 days', null, (v_teams->>'Colombia')::uuid, (v_teams->>'Uruguay')::uuid, null, null, 'scheduled');
  perform public.control_save_match(null, v_ev, v_f, 6, null, v_base + interval '10 days', null, null, null, 'Ganador del grupo A', 'Ganador del grupo B', 'scheduled');
  perform public.control_publish_event(v_ev);
  perform public.add_event_to_parche(v_parche, v_ev);
end $$;

select 'ok' as resultado;
