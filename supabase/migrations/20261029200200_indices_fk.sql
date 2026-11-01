-- Índices de soporte para claves foráneas (linter de Supabase 0001_unindexed_foreign_keys).
-- Solo añade índices; no modifica datos ni restricciones.
create index event_teams_team_idx on public.event_teams (team_id);
create index matches_home_team_idx on public.matches (event_id, home_team_id);
create index matches_away_team_idx on public.matches (event_id, away_team_id);
create index matches_stage_event_idx on public.matches (stage_id, event_id);
create index event_results_team_idx on public.event_results (event_id, team_id);
create index event_results_source_match_idx on public.event_results (source_match_id, event_id);
create index parches_created_by_idx on public.parches (created_by);
create index predictions_match_event_idx on public.predictions (match_id, event_id);
create index predictions_parche_event_event_idx on public.predictions (parche_event_id, event_id);
create index standing_snapshot_rows_user_idx on public.standing_snapshot_rows (user_id);
create index standing_snapshots_close_run_idx on public.standing_snapshots (close_run_id);
create index event_close_runs_requested_by_idx on public.event_close_runs (requested_by);
