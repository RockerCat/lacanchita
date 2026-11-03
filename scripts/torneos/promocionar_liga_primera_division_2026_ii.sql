-- Promoción del primer torneo real: fecha de inicio ANUNCIADA (14-nov-2026, tentativa, sin hora) y texto breve de
-- portada, y lo autoriza para la portada. Usa las funciones reales de Control (auditadas) como el superadministrador.
-- Idempotente; solo toca este torneo. Requiere la migración 20261103110000.
--   npx supabase db query --linked --yes -f scripts/torneos/promocionar_liga_primera_division_2026_ii.sql
do $$
declare
  c_sa constant uuid := '95d77e57-b6cb-4359-bc86-e70b3b9f44dd';
  v_ev uuid;
begin
  select id into v_ev from public.events where slug = 'liga-primera-division-colombiana-2026-ii';
  if v_ev is null then raise exception 'torneo no encontrado'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', c_sa, 'role', 'authenticated')::text, true);
  perform public.control_set_event_promo(v_ev, date '2026-11-14',
    '¡Se vienen los cuadrangulares! Arma tu parche, invita a tus amigos y prepárense para pronosticar cada partido.');
  perform public.control_set_landing_visible(v_ev, true);
end $$;
select slug, status, announced_start_date, landing_blurb, landing_visible from public.events where slug = 'liga-primera-division-colombiana-2026-ii';
