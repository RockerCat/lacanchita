-- Huellas de solo lectura para verificar que el saneamiento monetario no altera nada fuera de su alcance.
-- La huella deportiva usa todos los campos no monetarios de la fotografía vigente (la de mayor versión).
select json_build_object(
  'sports', (select encode(sha256(convert_to(string_agg(concat_ws('|',
      r.row_number, coalesce(r.user_id::text, '∅'), r.display_name, r.membership_role, r.membership_status,
      r.participation, coalesce(r.unranked_reason, '∅'), coalesce(r.position::text, '∅'),
      coalesce(r.position_shared::text, '∅'), r.stats_status, coalesce(r.points::text, '∅'),
      coalesce(r.exact_hits::text, '∅'), coalesce(r.result_hits::text, '∅'), coalesce(r.misses::text, '∅'),
      coalesce(r.predictions_count::text, '∅'), coalesce(r.tiebreak_values::text, '∅')), E'\n' order by r.row_number), 'UTF8')), 'hex')
    from public.standing_snapshot_rows r
    where r.snapshot_id = (select id from public.standing_snapshots order by version desc limit 1)),
  'rows', (select count(*) from public.standing_snapshot_rows),
  'ranked', (select count(*) from public.standing_snapshot_rows where participation = 'ranked' and position is not null),
  'unranked', (select count(*) from public.standing_snapshot_rows where position is null),
  'auth_users', (select encode(sha256(convert_to(string_agg(id::text||':'||encrypted_password||':'||email||':'||coalesce(email_confirmed_at::text,''), ',' order by id::text), 'UTF8')), 'hex') from auth.users),
  'auth_identities', (select encode(sha256(convert_to(string_agg(id::text||':'||user_id::text||':'||provider||':'||provider_id, ',' order by id::text), 'UTF8')), 'hex') from auth.identities),
  'members', (select encode(sha256(convert_to(string_agg(concat_ws('|', id, parche_id, user_id, role, status, joined_at, disabled_at), ',' order by id::text), 'UTF8')), 'hex') from public.parche_members),
  'matches', (select encode(sha256(convert_to(string_agg(concat_ws('|', id, event_id, stage_id, match_number, group_code, starts_at, venue, home_team_id, away_team_id, home_placeholder, away_placeholder, teams_source, status, home_score, away_score, winner_side, result_confirmed_at), ',' order by id::text), 'UTF8')), 'hex') from public.matches),
  'teams', (select encode(sha256(convert_to(string_agg(concat_ws('|', t.id, t.name, t.code, t.flag_emoji, et.group_code), ',' order by t.id::text), 'UTF8')), 'hex') from public.teams t join public.event_teams et on et.team_id = t.id),
  'stages', (select encode(sha256(convert_to(string_agg(concat_ws('|', id, code, exact_points, result_points), ',' order by id::text), 'UTF8')), 'hex') from public.event_stages),
  'event_results', (select encode(sha256(convert_to(string_agg(concat_ws('|', event_id, result_key, team_id, source_match_id), ',' order by result_key), 'UTF8')), 'hex') from public.event_results),
  'events', (select encode(sha256(convert_to(string_agg(concat_ws('|', id, slug, name, status, official_end_at, closed_at), ',' order by id::text), 'UTF8')), 'hex') from public.events),
  'parches', (select encode(sha256(convert_to(string_agg(concat_ws('|', id, name, created_by), ',' order by id::text), 'UTF8')), 'hex') from public.parches),
  'parche_events_non_monetary', (select encode(sha256(convert_to(string_agg(concat_ws('|', id, parche_id, event_id, status, predictions_visibility), ',' order by id::text), 'UTF8')), 'hex') from public.parche_events),
  'predictions', (select count(*) from public.predictions)
) as fp;
