#!/usr/bin/env bash
# Reconstruye la base local desechable "canchita_test" en el MISMO orden que el destino real:
# migraciones hasta 20261029210000 → importación histórica → resto de migraciones.
# Requiere el clúster local de pruebas (cluster_name=lacanchita-local-test) en 127.0.0.1:55432,
# el dump original y ../el-var (solo lectura). El SQL privado (nombres, UUID) se genera en un
# directorio temporal fuera del repo y se borra al terminar.
#   scripts/history-migration/local_rebuild.sh <dump> <node22> <dir-privado>
set -euo pipefail
DUMP="$1"; NODE="$2"; PRIV="$3"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
Q() { psql -h 127.0.0.1 -p 55432 -U postgres -v ON_ERROR_STOP=1 -q "$@"; }
test "$(Q -d postgres -tAc "show cluster_name")" = "lacanchita-local-test"
Q -d postgres -c "drop database if exists canchita_test" -c "create database canchita_test"
Q -d canchita_test -f "$ROOT/scripts/history-migration/local_supabase_stub.sql"
for f in "$ROOT"/supabase/migrations/*.sql; do
  v="$(basename "$f" | cut -d_ -f1)"
  if [[ "$v" > "20261029210000" ]]; then break; fi
  Q -d canchita_test -1 -f "$f"
done
mkdir -p "$PRIV" && chmod 700 "$PRIV"
python3 -I "$ROOT/scripts/history-migration/prepare_wc2026_import.py" --dump "$DUMP" --legacy-lib "$ROOT/../el-var/src/lib" \
  --node "$NODE" --out-dir "$PRIV" > /dev/null
python3 -I - "$DUMP" <<'PY' | Q -d canchita_test
import subprocess, sys
out = subprocess.run(["pg_restore", "-a", "-n", "auth", "-t", "users", "-f", "-", sys.argv[1]], capture_output=True, text=True, check=True).stdout
cols, ids, inside = None, [], False
for line in out.splitlines():
    if line.startswith("COPY auth.users"):
        cols = [c.strip() for c in line[line.index("(") + 1:line.index(")")].split(",")]; inside = True; continue
    if inside:
        if line == "\\.": break
        ids.append(line.split("\t")[cols.index("id")])
print("INSERT INTO auth.users (id) VALUES " + ",".join(f"('{i}')" for i in ids) + ";")
PY
Q -d canchita_test -f "$PRIV/wc2026_import.sql"
rm -f "$PRIV/wc2026_import.sql" "$PRIV/wc2026_import_dryrun.sql"
for f in "$ROOT"/supabase/migrations/*.sql; do
  v="$(basename "$f" | cut -d_ -f1)"
  if [[ "$v" > "20261029210000" ]]; then Q -d canchita_test -1 -f "$f"; fi
done
echo "canchita_test reconstruida: $(Q -d canchita_test -tAc "select count(*) from public.standing_snapshot_rows") filas históricas"
