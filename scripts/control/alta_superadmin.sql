-- Alta del superadministrador inicial de La Canchita (ejecutar UNA vez, con el rol dueño):
--   npx supabase db query --linked -f scripts/control/alta_superadmin.sql
-- Autorizado por Alex (2026-10-30) exclusivamente para el usuario 95d77e57-b6cb-4359-bc86-e70b3b9f44dd.
-- Guardas: el proyecto debe contener ese UUID con el correo alexsosa.me@gmail.com confirmado. Si no
-- coincide, la transacción falla y no se da de alta a nadie. Idempotente. No toca auth.*.
-- No existe ninguna función ni ruta de la aplicación que dé de alta o baja superadministradores.
begin;
do $$
declare
  c_id constant uuid := '95d77e57-b6cb-4359-bc86-e70b3b9f44dd';
begin
  if not exists (
    select 1 from auth.users u
    where u.id = c_id and lower(u.email) = 'alexsosa.me@gmail.com' and u.email_confirmed_at is not null
  ) then
    raise exception 'alta_superadmin: la identidad no coincide (uuid/correo/confirmación)';
  end if;
  insert into private.platform_admins (user_id, granted_by, note)
  values (c_id, null, 'Alta inicial 2026-10-30 (autorizada por el titular del proyecto)')
  on conflict (user_id) do nothing;
  if (select count(*) from private.platform_admins) <> 1 then
    raise exception 'alta_superadmin: se esperaba exactamente 1 superadministrador';
  end if;
end $$;
select p.user_id, u.email, p.granted_at, (select count(*) from private.platform_admins) as total
from private.platform_admins p join auth.users u on u.id = p.user_id;
commit;
