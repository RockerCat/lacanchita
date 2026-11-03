-- Sustituye la denominación con marca de patrocinador del primer torneo real por la genérica acordada:
--   «Cuadrangulares y Final — Liga Primera División Colombiana 2026-II» (slug liga-primera-division-colombiana-2026-ii).
-- Usa las funciones reales de Control (auditadas): despublica, renombra y vuelve a publicar. Solo procede si el torneo
-- no tiene parches, partidos ni pronósticos (nada que romper). Idempotente. No toca otros eventos.
--   npx supabase db query --linked --yes -f scripts/torneos/renombrar_liga_primera_division_2026_ii.sql
do $$
declare
  c_sa constant uuid := '95d77e57-b6cb-4359-bc86-e70b3b9f44dd';
  c_old constant text := 'liga-' || 'betplay-2026-ii';
  c_new constant text := 'liga-primera-division-colombiana-2026-ii';
  c_name constant text := 'Cuadrangulares y Final — Liga Primera División Colombiana 2026-II';
  v_ev public.events;
begin
  if not exists (select 1 from public.events where slug = 'mundial-2026') then raise exception 'proyecto inesperado'; end if;
  select * into v_ev from public.events where slug = c_new;
  if found then raise notice 'ya renombrado: sin cambios'; return; end if;
  select * into v_ev from public.events where slug = c_old;
  if not found then raise exception 'torneo origen no existe'; end if;
  if exists (select 1 from public.parche_events where event_id = v_ev.id)
     or exists (select 1 from public.matches where event_id = v_ev.id)
     or exists (select 1 from public.predictions where event_id = v_ev.id) then
    raise exception 'el torneo ya tiene parches, partidos o pronósticos: no se renombra';
  end if;
  perform set_config('request.jwt.claims', json_build_object('sub', c_sa, 'role', 'authenticated')::text, true);
  if v_ev.status = 'scheduled' then perform public.control_set_event_status(v_ev.id, 'draft'); end if;
  perform public.control_update_event(v_ev.id, c_name, c_new, v_ev.timezone, v_ev.official_end_at);
  perform public.control_publish_event(v_ev.id);
end $$;
select id, slug, name, status, timezone, official_end_at, landing_visible from public.events where slug like 'liga-%';
