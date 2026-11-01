-- public.rls_auto_enable() es la función del event trigger `ensure_rls` creada por Supabase
-- (SECURITY DEFINER, dueño postgres, search_path=pg_catalog). Activa RLS en tablas nuevas de public.
--
-- Diagnóstico (2026-10-29): su ACL era NULL, es decir EXECUTE implícito para PUBLIC. anon y
-- authenticated podían invocarla directamente (p. ej. /rest/v1/rpc/rls_auto_enable): el cuerpo se
-- ejecutaba con privilegios de postgres antes de fallar al serializar el tipo event_trigger.
-- Impacto demostrado: bajo (solo puede activar RLS sobre comandos DDL del contexto de un event
-- trigger), pero ningún rol de cliente necesita invocarla.
--
-- Corrección mínima: quitar EXECUTE a PUBLIC y a los roles de la API. No cambia el cuerpo ni el
-- event trigger: PostgreSQL no comprueba EXECUTE al disparar un event trigger (verificado en local
-- con un rol no dueño ni superusuario) y en este proyecto solo postgres y supabase_admin pueden
-- crear tablas en public. Idempotente y sin efecto si la función no existe.
do $$
begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    revoke execute on function public.rls_auto_enable() from public, anon, authenticated, service_role;
  end if;
end $$;
