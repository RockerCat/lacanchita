-- Inscripciones anticipadas: un torneo puede PUBLICARSE (draft → scheduled) y recibir parches antes de que existan
-- equipos o partidos (p. ej. una liga cuyo calendario oficial aún no se conoce). Sigue exigiendo zona horaria válida
-- y al menos una fase; los equipos y partidos se añaden después con las funciones control_* existentes. Si hay
-- partidos, cada lado sigue necesitando equipo o descripción. Aditiva: misma firma, sin cambios de datos; los
-- torneos ya publicados no se ven afectados.
create or replace function private.event_publish_issues(p_event_id uuid)
returns text[]
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_issues text[] := '{}';
  v_tz text;
begin
  select e.timezone into v_tz from public.events e where e.id = p_event_id;
  if not exists (select 1 from pg_catalog.pg_timezone_names z where z.name = v_tz) then
    v_issues := array_append(v_issues, 'invalid_timezone'::text);
  end if;
  if not exists (select 1 from public.event_stages s where s.event_id = p_event_id) then
    v_issues := array_append(v_issues, 'no_stages'::text);
  end if;
  if exists (
    select 1 from public.matches m
    where m.event_id = p_event_id
      and ((m.home_team_id is null and nullif(btrim(m.home_placeholder), '') is null)
        or (m.away_team_id is null and nullif(btrim(m.away_placeholder), '') is null))
  ) then
    v_issues := array_append(v_issues, 'match_without_sides'::text);
  end if;
  return v_issues;
end;
$$;

revoke all on function private.event_publish_issues(uuid) from public, anon, authenticated, service_role;
