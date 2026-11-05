#!/usr/bin/env bash
# Concurrencia real de La Canchita Control (ciclo de partidos): sesiones paralelas contra una copia desechable de
# canchita_test. SOLO el clúster local (cluster_name=lacanchita-local-test). Crea y borra la base canchita_conc.
#   scripts/history-migration/tests/local_control_concurrency.sh
set -uo pipefail
P=(-h 127.0.0.1 -p 55432 -U postgres)
Q() { psql "${P[@]}" -v ON_ERROR_STOP=1 -v VERBOSITY=terse -q -tA "$@"; }
test "$(Q -d postgres -c "show cluster_name")" = "lacanchita-local-test" || { echo "solo_local"; exit 2; }

Q -d postgres -c "drop database if exists canchita_conc" -c "create database canchita_conc template canchita_test"
SA=00000000-0000-4000-8000-0000000000a1
OWN=00000000-0000-4000-8000-0000000000c3
Q -d canchita_conc <<SQL
insert into auth.users (id, email) values ('$SA', 'sa@ejemplo.test'), ('$OWN', 'owner@ejemplo.test'), ('00000000-0000-4000-8000-0000000000c4', 'amigo@ejemplo.test');
insert into private.platform_admins (user_id) values ('$SA');
insert into public.parches (id, name, created_by) values ('10000000-0000-4000-8000-0000000000a1', 'P1', '$OWN');
insert into public.parche_members (parche_id, user_id, role) values ('10000000-0000-4000-8000-0000000000a1', '$OWN', 'owner'), ('10000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000c4', 'member');
SQL
sa() { Q -d canchita_conc -c "select set_config('request.jwt.claims', '{\"sub\":\"$SA\",\"role\":\"authenticated\"}', false)" -c "set role authenticated" -c "$1" 2>&1 | tail -1; }
as() { local who=$1; shift; Q -d canchita_conc -c "select set_config('request.jwt.claims', '{\"sub\":\"$who\",\"role\":\"authenticated\"}', false)" -c "set role authenticated" -c "$1" 2>&1 | tail -1; }
EV=$(sa "select public.control_create_event('conc-cup', 'Conc Cup', 'America/Bogota')")
ST=$(sa "select public.control_save_stage('$EV', null, 'group', 'Grupos', 1, false, 3, 1)")
TA=$(sa "select public.control_save_team(null, 'Conc A', null, 'club', null)")
TB=$(sa "select public.control_save_team(null, 'Conc B', null, 'club', null)")
sa "select public.control_set_event_team('$EV', '$TA', null)" >/dev/null
sa "select public.control_set_event_team('$EV', '$TB', null)" >/dev/null
mk() { sa "select public.control_save_match(null, '$EV', '$ST', $1, null, now() + interval '1 day', null, '$TA', '$TB', null, null, null)"; }
M1=$(mk 1); M2=$(mk 2)
sa "select public.control_publish_event('$EV')" >/dev/null

fail=0
ok() { if [ "$2" = "true" ]; then echo "OK    $1"; else echo "FALLO $1 ($3)"; fail=1; fi; }
par() { local n=$1 sql=$2 i; local out=$(mktemp); for i in $(seq 1 "$n"); do sa "$sql" >> "$out" & done; wait; cat "$out"; rm -f "$out"; }

# 1. Ocho guardados en vivo simultáneos con la misma revisión (marcadores distintos): exactamente uno se aplica.
Q -d canchita_conc -c "update public.matches set starts_at = now() - interval '1 hour' where id = '$M1'"
sa "select public.control_update_match_live('$M1', 'live', 0, 0, null, 0, null)" >/dev/null
out=$(mktemp); for i in 1 2 3 4 5 6 7 8; do sa "select public.control_update_match_live('$M1', 'live', $i, 0, null, 1, null)" >> "$out" & done; wait
succ=$(grep -cE '^[0-9]+$' "$out"); stale=$(grep -c 'stale_revision' "$out"); rm -f "$out"
ok "8 guardados en vivo con la misma revisión: 1 éxito y 7 rechazos obsoletos" "$([ "$succ" = 1 ] && [ "$stale" = 7 ] && echo true || echo false)" "éxitos=$succ obsoletos=$stale"
n=$(Q -d canchita_conc -c "select count(*) from public.control_audit_log where action = 'score_updated' and entity_id = '$M1'")
rev=$(Q -d canchita_conc -c "select result_revision from public.matches where id = '$M1'")
ok "una sola auditoría de marcador y revisión 2" "$([ "$n" = 1 ] && [ "$rev" = 2 ] && echo true || echo false)" "auditorías=$n revisión=$rev"

# 2. Ocho cierres simultáneos con la misma revisión: exactamente uno.
res=$(par 8 "select public.control_update_match_live('$M1', 'finished', 2, 1, null, 2, null)")
succ=$(echo "$res" | grep -cE '^[0-9]+$')
ok "8 cierres simultáneos: 1 éxito" "$([ "$succ" = 1 ] && echo true || echo false)" "éxitos=$succ"
n=$(Q -d canchita_conc -c "select count(*) from public.control_audit_log where action = 'match_finished' and entity_id = '$M1'")
ok "una sola auditoría de cierre" "$([ "$n" = 1 ] && echo true || echo false)" "auditorías=$n"

# 3. Seis correcciones simultáneas: exactamente una.
res=$(par 6 "select public.control_update_match_live('$M1', 'finished', 0, 2, null, 3, 'Corrección simultánea de prueba')")
succ=$(echo "$res" | grep -cE '^[0-9]+$')
n=$(Q -d canchita_conc -c "select count(*) from public.control_audit_log where action = 'result_corrected' and entity_id = '$M1'")
ok "6 correcciones simultáneas: 1 éxito y 1 auditoría" "$([ "$succ" = 1 ] && [ "$n" = 1 ] && echo true || echo false)" "éxitos=$succ auditorías=$n"

# 4. Sincronización simultánea: cada partido vencido se inicia UNA vez (SKIP LOCKED + idempotencia).
Q -d canchita_conc -c "update public.matches set starts_at = now() - interval '5 minutes' where id = '$M2'"
out=$(mktemp); for i in 1 2 3 4 5 6 7 8; do as "$OWN" "select public.sync_due_matches()" >> "$out" & done; wait
total=$(awk '{s+=$1} END {print s+0}' "$out"); rm -f "$out"
n=$(Q -d canchita_conc -c "select count(*) from public.control_audit_log where action = 'match_auto_started' and entity_id = '$M2'")
st=$(Q -d canchita_conc -c "select status || ' ' || home_score || '-' || away_score from public.matches where id = '$M2'")
ok "8 sincronizaciones simultáneas: se inicia una sola vez, 0-0, una auditoría" "$([ "$total" = 1 ] && [ "$n" = 1 ] && [ "$st" = "live 0-0" ] && echo true || echo false)" "iniciados=$total auditorías=$n estado=$st"

# 5. Ocho inscripciones simultáneas del mismo parche en el mismo torneo: una sola.
for i in 1 2 3 4 5 6 7 8; do as "$OWN" "select public.add_event_to_parche('10000000-0000-4000-8000-0000000000a1', '$EV')" > /dev/null & done; wait
n=$(Q -d canchita_conc -c "select count(*) from public.parche_events where event_id = '$EV'")
ok "8 inscripciones simultáneas: una sola fila" "$([ "$n" = 1 ] && echo true || echo false)" "filas=$n"

Q -d postgres -c "drop database if exists canchita_conc"
exit $fail
