-- Regla: un parche necesita al menos 2 participantes ACTIVOS (incluido el creador) para incorporarse a un torneo.
-- Las invitaciones pendientes no cuentan (viven en parche_invitations; solo se cuentan membresías activas) y los
-- deshabilitados tampoco. Salir de un parche borra la fila, así que los retirados no cuentan. Es la única operación
-- que inscribe (la interfaz y cualquier llamada directa al RPC pasan por aquí). Las inscripciones existentes no se
-- tocan: solo se valida la inscripción nueva. Cuerpo idéntico al anterior salvo la guarda `min_members`.
create or replace function public.add_event_to_parche(p_parche_id uuid, p_event_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := private.require_uid();
  v_status text;
  v_id uuid;
begin
  -- Serializa las operaciones administrativas del parche (también las altas/bajas de miembros).
  perform 1 from public.parches where id = p_parche_id for update;
  if not found or not private.is_parche_admin(p_parche_id) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  select e.status into v_status from public.events e where e.id = p_event_id;
  -- Un borrador no se revela como existente.
  if not found or v_status = 'draft' then
    raise exception 'event_not_found' using errcode = 'P0002';
  end if;
  if v_status not in ('scheduled', 'in_progress') then
    raise exception 'event_not_open';
  end if;
  if exists (select 1 from public.parche_events pe where pe.parche_id = p_parche_id and pe.event_id = p_event_id) then
    raise exception 'already_enrolled';
  end if;
  if (select count(*) from public.parche_members m where m.parche_id = p_parche_id and m.status = 'active') < 2 then
    raise exception 'min_members';
  end if;
  begin
    insert into public.parche_events (parche_id, event_id) values (p_parche_id, p_event_id) returning id into v_id;
  exception when unique_violation then
    raise exception 'already_enrolled';
  end;
  perform private.log_member_event(p_parche_id, uid, uid, 'event_enrolled',
    jsonb_build_object('event_id', p_event_id, 'parche_event_id', v_id));
  return v_id;
end;
$$;

-- CREATE OR REPLACE conserva los privilegios previos; se reafirman por si acaso.
revoke execute on function public.add_event_to_parche(uuid, uuid) from public, anon;
grant execute on function public.add_event_to_parche(uuid, uuid) to authenticated;
