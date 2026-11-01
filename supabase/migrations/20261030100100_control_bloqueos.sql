-- La Canchita Control — lectura de torneos bloqueados.
-- Un superadministrador no es miembro de ningún parche, así que RLS no le deja ver los historiales
-- sellados. Esta función (solo lectura, solo superadministradores) informa qué torneos no admiten
-- cambios desde Control y por qué, para que la interfaz los muestre de solo lectura.
create or replace function public.control_event_lock_reasons()
returns table (event_id uuid, reason text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_platform_admin();
  return query
    select e.id,
           case when e.status = 'closed' then 'event_closed'
                when e.status = 'cancelled' then 'event_cancelled'
                else 'event_locked_history' end
    from public.events e
    where e.status in ('closed', 'cancelled') or private.event_has_sealed_history(e.id);
end;
$$;

revoke all on function public.control_event_lock_reasons() from public, anon, service_role;
grant execute on function public.control_event_lock_reasons() to authenticated;
