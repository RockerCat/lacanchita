-- La Canchita Control — escudos de clubes, jornada/ronda del partido y confirmación verificada en servidor.
--
-- 1) teams.crest_path + bucket público de lectura `team-crests` (escritura solo de superadministradores).
--    El escudo pertenece al equipo GLOBAL (no se duplica por torneo). Formatos png/jpeg/webp, ≤ 512 KB;
--    sin SVG (puede contener scripts). `kind` (national/club/other) ya existía: no cambia.
-- 2) matches.round_label: «Jornada 3», «Cuartos de final»… separado de group_code (grupo «A», «B»).
--    Los valores de group_code existentes no se tocan. control_save_match conserva las descripciones de
--    «por definir» aunque se asigne un equipo (no se pierden al cambiar de equipo).
-- 3) control_confirm_match_result exige, además de la revisión, el marcador exacto que el administrador
--    vio y aprobó: si el borrador cambió (o no coincide) se rechaza con stale_revision. Se elimina la
--    versión de dos argumentos para que no exista una vía de confirmación sin verificar valores.

-- ─── 1. Escudos ─────────────────────────────────────────────────────────────

alter table public.teams add column crest_path text
  check (crest_path is null or crest_path ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpg|webp)$');
comment on column public.teams.crest_path is 'Ruta del escudo en el bucket team-crests (<team_id>/<uuid>.<ext>). Opcional; el fallback visual son las iniciales.';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('team-crests', 'team-crests', true, 524288, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update
  set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- Lectura pública por URL (bucket público). Escritura/borrado/consulta de objetos: solo superadministradores.
create policy team_crests_admin_select on storage.objects for select to authenticated
  using (bucket_id = 'team-crests' and (select private.is_platform_admin()));
create policy team_crests_admin_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'team-crests' and (select private.is_platform_admin()));
create policy team_crests_admin_update on storage.objects for update to authenticated
  using (bucket_id = 'team-crests' and (select private.is_platform_admin()))
  with check (bucket_id = 'team-crests' and (select private.is_platform_admin()));
create policy team_crests_admin_delete on storage.objects for delete to authenticated
  using (bucket_id = 'team-crests' and (select private.is_platform_admin()));

-- Asocia (o quita, con NULL) el escudo de un equipo global. El archivo ya debe estar subido en
-- <team_id>/<uuid>.<ext>. Un equipo de un torneo bloqueado no se modifica.
create or replace function public.control_set_team_crest(p_team_id uuid, p_path text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := private.require_platform_admin();
  v_old public.teams;
begin
  select * into v_old from public.teams where id = p_team_id for update;
  if not found then
    raise exception 'team_not_found' using errcode = 'P0002';
  end if;
  if p_path is not null and (p_path not like p_team_id::text || '/%'
      or not exists (select 1 from storage.objects o where o.bucket_id = 'team-crests' and o.name = p_path)) then
    raise exception 'invalid_crest' using errcode = '22023';
  end if;
  if exists (
    select 1 from public.event_teams et join public.events e on e.id = et.event_id
    where et.team_id = p_team_id and (e.status = 'closed' or private.event_has_sealed_history(e.id))
  ) then
    raise exception 'team_in_locked_event';
  end if;
  if v_old.crest_path is not distinct from p_path then
    return;
  end if;
  update public.teams set crest_path = p_path where id = p_team_id;
  perform private.audit('team_crest_changed', 'team', p_team_id, null,
    jsonb_build_object('crest_path', v_old.crest_path), jsonb_build_object('crest_path', p_path), null);
end;
$$;

-- ─── 2. Jornada / ronda ─────────────────────────────────────────────────────

alter table public.matches add column round_label text check (round_label is null or char_length(btrim(round_label)) between 1 and 40);
comment on column public.matches.round_label is 'Jornada o ronda del partido («Jornada 3», «Cuartos de final»). El grupo («A») sigue en group_code.';

drop function public.control_save_match(uuid, uuid, uuid, integer, text, timestamptz, text, uuid, uuid, text, text, text);

create or replace function public.control_save_match(
  p_match_id uuid, p_event_id uuid, p_stage_id uuid, p_match_number integer, p_group_code text,
  p_starts_at timestamptz, p_venue text, p_home_team_id uuid, p_away_team_id uuid,
  p_home_placeholder text, p_away_placeholder text, p_status text, p_round_label text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := private.require_platform_admin();
  v_ev public.events;
  v_old public.matches;
  v_new public.matches;
  v_event_id uuid;
  v_group text := nullif(btrim(coalesce(p_group_code, '')), '');
  v_round text := nullif(btrim(coalesce(p_round_label, '')), '');
  v_venue text := nullif(btrim(coalesce(p_venue, '')), '');
  -- Las descripciones de «por definir» se conservan aunque haya equipo (no se pierden al cambiarlo).
  v_hph text := nullif(btrim(coalesce(p_home_placeholder, '')), '');
  v_aph text := nullif(btrim(coalesce(p_away_placeholder, '')), '');
  v_status text;
  v_source text;
  v_has_draft boolean;
begin
  if p_match_id is null then
    v_event_id := p_event_id;
  else
    select m.event_id into v_event_id from public.matches m where m.id = p_match_id;
    if not found then
      raise exception 'match_not_found' using errcode = 'P0002';
    end if;
  end if;
  v_ev := private.lock_event(v_event_id, false);

  if p_starts_at is null then
    raise exception 'invalid_start' using errcode = '22023';
  end if;
  if p_match_number is not null and p_match_number < 1 then
    raise exception 'invalid_match_number' using errcode = '22023';
  end if;
  if (v_group is not null and char_length(v_group) > 20) or (v_round is not null and char_length(v_round) > 40) then
    raise exception 'invalid_group' using errcode = '22023';
  end if;
  if (v_hph is not null and char_length(v_hph) > 60) or (v_aph is not null and char_length(v_aph) > 60)
     or (v_venue is not null and char_length(v_venue) > 120) then
    raise exception 'text_too_long' using errcode = '22023';
  end if;
  if not exists (select 1 from public.event_stages s where s.id = p_stage_id and s.event_id = v_event_id) then
    raise exception 'stage_not_in_event' using errcode = '22023';
  end if;
  if (p_home_team_id is not null and not exists (select 1 from public.event_teams et where et.event_id = v_event_id and et.team_id = p_home_team_id))
     or (p_away_team_id is not null and not exists (select 1 from public.event_teams et where et.event_id = v_event_id and et.team_id = p_away_team_id)) then
    raise exception 'team_not_in_event' using errcode = '22023';
  end if;
  if p_home_team_id is not null and p_home_team_id = p_away_team_id then
    raise exception 'same_team' using errcode = '22023';
  end if;
  if (p_home_team_id is null and v_hph is null) or (p_away_team_id is null and v_aph is null) then
    raise exception 'side_required' using errcode = '22023';
  end if;
  v_source := case when p_home_team_id is not null or p_away_team_id is not null then 'assigned' end;

  begin
    if p_match_id is null then
      v_status := coalesce(p_status, 'scheduled');
      if v_status not in ('scheduled', 'live', 'postponed', 'cancelled') then
        raise exception 'invalid_status' using errcode = '22023';
      end if;
      insert into public.matches (event_id, stage_id, match_number, group_code, round_label, starts_at, venue, home_team_id, away_team_id,
                                  home_placeholder, away_placeholder, teams_source, status)
      values (v_event_id, p_stage_id, p_match_number, v_group, v_round, p_starts_at, v_venue, p_home_team_id, p_away_team_id,
              v_hph, v_aph, v_source, v_status)
      returning * into v_new;
      perform private.audit('match_created', 'match', v_new.id, v_event_id, null, private.match_json(v_new), null);
      return v_new.id;
    end if;

    select * into v_old from public.matches where id = p_match_id for update;
    if v_old.result_confirmed_at is not null then
      raise exception 'match_confirmed';
    end if;
    v_has_draft := exists (select 1 from private.match_result_drafts d where d.match_id = p_match_id);
    if v_old.status = 'finished' then
      v_status := 'finished';
    else
      v_status := coalesce(p_status, v_old.status);
      if v_status not in ('scheduled', 'live', 'postponed', 'cancelled') then
        raise exception 'invalid_status' using errcode = '22023';
      end if;
    end if;
    if (v_old.stage_id, v_old.home_team_id, v_old.away_team_id) is distinct from (p_stage_id, p_home_team_id, p_away_team_id)
       and (v_has_draft or v_old.status = 'finished') then
      raise exception 'match_has_result';
    end if;
    if v_has_draft and v_status in ('postponed', 'cancelled') then
      raise exception 'match_has_result';
    end if;
    if (v_old.stage_id, v_old.home_team_id, v_old.away_team_id) is distinct from (p_stage_id, p_home_team_id, p_away_team_id)
       and exists (select 1 from public.predictions p where p.match_id = p_match_id) then
      raise exception 'match_has_predictions';
    end if;
    update public.matches
    set stage_id = p_stage_id, match_number = p_match_number, group_code = v_group, round_label = v_round, starts_at = p_starts_at,
        venue = v_venue, home_team_id = p_home_team_id, away_team_id = p_away_team_id,
        home_placeholder = v_hph, away_placeholder = v_aph, teams_source = v_source, status = v_status
    where id = p_match_id
    returning * into v_new;
    if private.match_json(v_old) is distinct from private.match_json(v_new) then
      perform private.audit('match_updated', 'match', p_match_id, v_event_id, private.match_json(v_old), private.match_json(v_new), null);
    end if;
    return p_match_id;
  exception when unique_violation then
    raise exception 'match_number_taken';
  end;
end;
$$;

-- ─── 3. Confirmación verificada ─────────────────────────────────────────────

drop function public.control_confirm_match_result(uuid, integer);

create or replace function public.control_confirm_match_result(
  p_match_id uuid, p_expected_revision integer, p_expected_home integer, p_expected_away integer, p_expected_winner text
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := private.require_platform_admin();
  v_ev public.events;
  v_m public.matches;
  v_d private.match_result_drafts;
  v_event_id uuid;
  v_old jsonb;
begin
  select m.event_id into v_event_id from public.matches m where m.id = p_match_id;
  if not found then
    raise exception 'match_not_found' using errcode = 'P0002';
  end if;
  v_ev := private.lock_event(v_event_id, false);
  select * into v_m from public.matches where id = p_match_id for update;
  if v_m.result_confirmed_at is not null then
    raise exception 'already_confirmed';
  end if;
  select * into v_d from private.match_result_drafts where match_id = p_match_id for update;
  if v_d.match_id is null then
    raise exception 'no_pending_result';
  end if;
  -- La revisión Y el marcador exacto que el administrador vio deben coincidir con el borrador vigente.
  if p_expected_revision is distinct from v_d.revision
     or (v_d.home_score, v_d.away_score, v_d.winner_side) is distinct from (p_expected_home, p_expected_away, p_expected_winner) then
    raise exception 'stale_revision';
  end if;
  v_old := private.draft_json(v_d);
  update public.matches
  set status = 'finished', home_score = v_d.home_score, away_score = v_d.away_score, winner_side = v_d.winner_side,
      result_confirmed_at = now(), result_confirmed_by = uid, result_revision = result_revision + 1
  where id = p_match_id
  returning * into v_m;
  delete from private.match_result_drafts where match_id = p_match_id;
  perform private.audit('result_confirmed', 'match', p_match_id, v_event_id, v_old, private.match_result_json(v_m), null);
  return v_m.result_revision;
end;
$$;

do $$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in ('control_set_team_crest', 'control_save_match', 'control_confirm_match_result')
  loop
    execute format('revoke all on function %s from public, anon, service_role', r.sig);
    execute format('grant execute on function %s to authenticated', r.sig);
  end loop;
end $$;
