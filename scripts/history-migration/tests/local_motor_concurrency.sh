#!/usr/bin/env bash
# Concurrencia real del motor de pronósticos y puntuación: sesiones paralelas contra una copia desechable de
# canchita_test. SOLO el clúster local (cluster_name=lacanchita-local-test). Crea y borra la base canchita_conc2.
#   scripts/history-migration/tests/local_motor_concurrency.sh
set -uo pipefail
P=(-h 127.0.0.1 -p 55432 -U postgres)
Q() { psql "${P[@]}" -v ON_ERROR_STOP=1 -v VERBOSITY=terse -q -tA "$@"; }
test "$(Q -d postgres -c "show cluster_name")" = "lacanchita-local-test" || { echo "solo_local"; exit 2; }
Q -d postgres -c "drop database if exists canchita_conc2" -c "create database canchita_conc2 template canchita_test"
U1=00000000-0000-4000-8000-0000000000b1; U2=00000000-0000-4000-8000-0000000000b2; SA=00000000-0000-4000-8000-0000000000a1
Q -d canchita_conc2 <<SQL
insert into auth.users (id, email) values ('$U1', 'u1@e.test'), ('$U2', 'u2@e.test'), ('$SA', 'sa@e.test');
insert into private.platform_admins (user_id) values ('$SA');
insert into public.events (id, slug, name, status) values ('e0000000-0000-4000-8000-0000000000c1', 'conc-motor', 'Conc', 'in_progress');
insert into public.event_stages (id, event_id, code, name, sort_order, exact_points, result_points) values ('51000000-0000-4000-8000-0000000000c1', 'e0000000-0000-4000-8000-0000000000c1', 'g', 'G', 1, 3, 1);
insert into public.teams (id, name, kind) values ('72000000-0000-4000-8000-0000000000c1', 'CA', 'club'), ('72000000-0000-4000-8000-0000000000c2', 'CB', 'club');
insert into public.event_teams (event_id, team_id) values ('e0000000-0000-4000-8000-0000000000c1', '72000000-0000-4000-8000-0000000000c1'), ('e0000000-0000-4000-8000-0000000000c1', '72000000-0000-4000-8000-0000000000c2');
insert into public.matches (id, event_id, stage_id, match_number, starts_at, home_team_id, away_team_id, teams_source) values
  ('a1000000-0000-4000-8000-0000000000c1', 'e0000000-0000-4000-8000-0000000000c1', '51000000-0000-4000-8000-0000000000c1', 1, now() + interval '1 day', '72000000-0000-4000-8000-0000000000c1', '72000000-0000-4000-8000-0000000000c2', 'assigned');
insert into public.parches (id, name, created_by) values ('c1000000-0000-4000-8000-0000000000c1', 'PC', '$U1');
insert into public.parche_members (parche_id, user_id, role) values ('c1000000-0000-4000-8000-0000000000c1', '$U1', 'owner'), ('c1000000-0000-4000-8000-0000000000c1', '$U2', 'member');
insert into public.parche_events (id, parche_id, event_id) values ('b1000000-0000-4000-8000-0000000000c1', 'c1000000-0000-4000-8000-0000000000c1', 'e0000000-0000-4000-8000-0000000000c1');
SQL
PE=b1000000-0000-4000-8000-0000000000c1; M=a1000000-0000-4000-8000-0000000000c1
as() { local who=$1; shift; Q -d canchita_conc2 -c "select set_config('request.jwt.claims', '{\"sub\":\"$who\",\"role\":\"authenticated\"}', false)" -c "set role authenticated" -c "$1" 2>&1 | tail -1; }
fail=0
ok() { if [ "$2" = "true" ]; then echo "OK    $1"; else echo "FALLO $1 ($3)"; fail=1; fi; }

# 1. Ocho guardados simultáneos del mismo pronóstico: una sola fila y el último valor válido.
for i in 1 2 3 4 5 6 7 8; do as "$U1" "select public.save_prediction('$PE', '$M', $((i % 5)), $((i % 3)))" > /dev/null & done; wait
n=$(Q -d canchita_conc2 -c "select count(*) from public.predictions where parche_event_id='$PE' and match_id='$M' and user_id='$U1'")
ok "8 guardados simultáneos del mismo pronóstico: una sola fila" "$([ "$n" = 1 ] && echo true || echo false)" "filas=$n"
as "$U1" "select public.save_prediction('$PE', '$M', 2, 1)" > /dev/null
as "$U2" "select public.save_prediction('$PE', '$M', 1, 0)" > /dev/null

# 2. Finalizar y seis recálculos explícitos simultáneos: resultado idéntico, sin duplicados ni acumulación.
Q -d canchita_conc2 -c "update public.matches set starts_at = now() - interval '2 hours', status = 'finished', home_score = 2, away_score = 1 where id = '$M'"
for i in 1 2 3 4 5 6; do as "$SA" "select public.control_rescore_match('$M')" > /dev/null & done; wait
r=$(Q -d canchita_conc2 -c "select string_agg(user_id::text || '=' || points || '/' || points_reason, ',' order by user_id) from public.predictions where match_id = '$M'")
exp="$U1=3/exact,$U2=1/result"
ok "6 recálculos simultáneos: puntos idénticos al cálculo único (sin acumular)" "$([ "$r" = "$exp" ] && echo true || echo false)" "$r"
n=$(Q -d canchita_conc2 -c "select count(*) from public.predictions where match_id='$M'")
ok "sin pronósticos duplicados" "$([ "$n" = 2 ] && echo true || echo false)" "filas=$n"

# 3. Cambiar el marcador final mientras se recalcula: el estado final coincide con el marcador final.
for i in 1 2 3; do as "$SA" "select public.control_rescore_match('$M')" > /dev/null & done
Q -d canchita_conc2 -c "update public.matches set home_score = 1, away_score = 0 where id = '$M'" &
wait
Q -d canchita_conc2 -c "select private.score_match('$M')" > /dev/null
h=$(Q -d canchita_conc2 -c "select home_score || '-' || away_score from public.matches where id='$M'")
r=$(Q -d canchita_conc2 -c "select string_agg(user_id::text || '=' || points, ',' order by user_id) from public.predictions where match_id = '$M'")
exp="$U1=1,$U2=3"
ok "marcador final 1-0 con recálculos concurrentes: puntos coherentes con el marcador vigente" "$([ "$h" = "1-0" ] && [ "$r" = "$exp" ] && echo true || echo false)" "$h $r"

# 4. Reabrir mientras otro recalcula: nunca quedan puntos con el partido fuera de «finalizado».
as "$SA" "select public.control_reopen_match('$M', 'Reapertura concurrente de prueba', 0)" > /dev/null &
for i in 1 2 3; do as "$SA" "select public.control_rescore_match('$M')" > /dev/null & done
wait
st=$(Q -d canchita_conc2 -c "select status from public.matches where id='$M'")
orph=$(Q -d canchita_conc2 -c "select count(*) from public.predictions p join public.matches m on m.id = p.match_id where m.status <> 'finished' and p.points is not null")
ok "reapertura concurrente: sin puntos huérfanos (estado $st)" "$([ "$orph" = 0 ] && echo true || echo false)" "huérfanos=$orph"

Q -d postgres -c "drop database if exists canchita_conc2"
exit $fail
