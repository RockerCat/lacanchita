#!/usr/bin/env bash
# Concurrencia real de la publicación de noticias: sesiones paralelas contra una copia desechable de canchita_test.
# SOLO el clúster local (cluster_name=lacanchita-local-test). Crea y borra la base canchita_conc3.
#   scripts/history-migration/tests/local_noticias_concurrency.sh
set -uo pipefail
P=(-h 127.0.0.1 -p 55432 -U postgres)
Q() { psql "${P[@]}" -v ON_ERROR_STOP=1 -v VERBOSITY=terse -q -tA "$@"; }
test "$(Q -d postgres -c "show cluster_name")" = "lacanchita-local-test" || { echo "solo_local"; exit 2; }
Q -d postgres -c "drop database if exists canchita_conc3" -c "create database canchita_conc3 template canchita_test"
U1=00000000-0000-4000-8000-0000000000d1; SA=00000000-0000-4000-8000-0000000000d9
EV=e0000000-0000-4000-8000-0000000000d1; M=a1000000-0000-4000-8000-0000000000d1; PE=b1000000-0000-4000-8000-0000000000d1
Q -d canchita_conc3 <<SQL
insert into auth.users (id, email) values ('$U1', 'u1@e.test'), ('$SA', 'sa@e.test');
insert into private.platform_admins (user_id) values ('$SA');
insert into public.events (id, slug, name, status) values ('$EV', 'conc-news', 'Conc', 'in_progress');
insert into public.event_stages (id, event_id, code, name, sort_order, exact_points, result_points) values ('51000000-0000-4000-8000-0000000000d1', '$EV', 'g', 'G', 1, 3, 1);
insert into public.teams (id, name, kind) values ('72000000-0000-4000-8000-0000000000d1', 'NA', 'club'), ('72000000-0000-4000-8000-0000000000d2', 'NB', 'club');
insert into public.event_teams (event_id, team_id) values ('$EV', '72000000-0000-4000-8000-0000000000d1'), ('$EV', '72000000-0000-4000-8000-0000000000d2');
insert into public.matches (id, event_id, stage_id, match_number, starts_at, home_team_id, away_team_id, teams_source) values
  ('$M', '$EV', '51000000-0000-4000-8000-0000000000d1', 1, now() - interval '1 hour', '72000000-0000-4000-8000-0000000000d1', '72000000-0000-4000-8000-0000000000d2', 'assigned');
insert into public.parches (id, name, created_by) values ('c1000000-0000-4000-8000-0000000000d1', 'PC', '$U1');
insert into public.parche_members (parche_id, user_id, role) values ('c1000000-0000-4000-8000-0000000000d1', '$U1', 'owner');
insert into public.parche_events (id, parche_id, event_id) values ('$PE', 'c1000000-0000-4000-8000-0000000000d1', '$EV');
SQL
as() { local who=$1; shift; Q -d canchita_conc3 -c "select set_config('request.jwt.claims', '{\"sub\":\"$who\",\"role\":\"authenticated\"}', false)" -c "set role authenticated" -c "$1" 2>&1 | tail -1; }
fail=0
ok() { if [ "$2" = "true" ]; then echo "OK    $1"; else echo "FALLO $1 ($3)"; fail=1; fi; }
as "$SA" "select public.control_update_match_live('$M', 'live', 0, 0, null, 0, null)" > /dev/null
as "$SA" "select public.control_update_match_live('$M', 'finished', 2, 1, null, 1, null)" > /dev/null
ITEMS="jsonb_build_array(jsonb_build_object('parche_event_id', null, 'title', 't', 'summary', 's', 'content', 'c'), jsonb_build_object('parche_event_id', '$PE', 'title', 't', 'summary', 's', 'content', 'c'))"
for i in 1 2 3 4 5 6 7 8; do as "$SA" "select public.control_publish_match_news('$M', 2, $ITEMS)" > /dev/null & done; wait
n=$(Q -d canchita_conc3 -c "select count(*) from public.news where match_id='$M' and superseded_at is null")
ok "8 publicaciones simultáneas de la misma revisión: 2 noticias (torneo + parche), sin duplicados" "$([ "$n" = 2 ] && echo true || echo false)" "filas=$n"
a=$(Q -d canchita_conc3 -c "select count(*) from public.control_audit_log where action='news_published'")
ok "una sola auditoría de publicación" "$([ "$a" = 1 ] && echo true || echo false)" "auditorías=$a"
# Corrección concurrente con publicación: la noticia de la revisión vieja queda retirada y la nueva es la única vigente.
as "$SA" "select public.control_update_match_live('$M', 'finished', 3, 1, null, 2, 'Se corrigió el marcador')" > /dev/null &
as "$SA" "select public.control_publish_match_news('$M', 2, $ITEMS)" > /dev/null &
wait
as "$SA" "select public.control_publish_match_news('$M', 3, $ITEMS)" > /dev/null
v=$(Q -d canchita_conc3 -c "select string_agg(distinct match_revision::text, ',') from public.news where match_id='$M' and superseded_at is null")
ok "tras corregir solo quedan vigentes noticias de la revisión 3" "$([ "$v" = 3 ] && echo true || echo false)" "revisiones=$v"
Q -d postgres -c "drop database if exists canchita_conc3"
exit $fail
