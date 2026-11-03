-- Primer torneo real: «Cuadrangulares y Final — Liga Primera División Colombiana 2026-II» (slug liga-primera-division-colombiana-2026-ii).
-- Crea el torneo con las funciones reales de Control como el superadministrador autorizado (claims JWT simulados en la
-- transacción), con dos fases y SIN equipos ni partidos (se cargarán cuando haya información oficial), y lo publica
-- para inscripciones anticipadas. Requiere la migración 20261103100000. Idempotente: si ya existe, no cambia nada.
-- No toca eventos existentes, no lo muestra en la portada (landing_visible queda en false) y no inscribe parches.
--   npx supabase db query --linked --yes -f scripts/torneos/crear_liga_primera_division_2026_ii.sql
do $$
declare
  c_sa constant uuid := '95d77e57-b6cb-4359-bc86-e70b3b9f44dd';
  v_ev uuid;
begin
  if not exists (select 1 from public.events where slug = 'mundial-2026') then raise exception 'proyecto inesperado'; end if;
  if not exists (select 1 from private.platform_admins where user_id = c_sa) then raise exception 'falta el superadministrador'; end if;
  if exists (select 1 from public.events where slug = 'liga-primera-division-colombiana-2026-ii') then
    raise notice 'liga-primera-division-colombiana-2026-ii ya existe: sin cambios';
    return;
  end if;
  perform set_config('request.jwt.claims', json_build_object('sub', c_sa, 'role', 'authenticated')::text, true);
  v_ev := public.control_create_event('liga-primera-division-colombiana-2026-ii', 'Cuadrangulares y Final — Liga Primera División Colombiana 2026-II', 'America/Bogota');
  -- Puntos vigentes de La Canchita (los de fase de grupos y final del Mundial 2026). La final es ida y vuelta, por eso
  -- no es «eliminatoria» (un partido de ida puede terminar empatado sin exigir ganador).
  perform public.control_save_stage(v_ev, null, 'cuadrangulares', 'Cuadrangulares semifinales', 1, false, 3, 1);
  perform public.control_save_stage(v_ev, null, 'final', 'Final', 2, false, 8, 6);
  perform public.control_publish_event(v_ev);
end $$;

select id, slug, name, status, timezone, official_end_at from public.events where slug = 'liga-primera-division-colombiana-2026-ii';
