#!/usr/bin/env python3
"""
Verifica la importación histórica del Mundial 2026 en lacanchita contra el respaldo original.

Solo lectura en el destino (`npx supabase db query --linked`, ref verificado) y en el dump.
Imprime únicamente resultados de comprobación; nunca emails, nombres, hashes ni UUID en claro.
La clasificación se recalcula de forma independiente desde los marcadores del respaldo
(no desde los puntos almacenados) y se compara fila a fila con la fotografía importada.

Uso:
  python3 -I scripts/history-migration/verify_wc2026_import.py \
      --dump ~/Backups/la-penultima/el-var-2026-10-29.dump \
      --manifest <out-dir>/manifest.json --knockout <out-dir>/knockout_resolved.json
"""
import argparse, collections, hashlib, json, os, subprocess, sys

PROJECT_REF = "cfzxentitxytnvvumfpv"
REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from prepare_wc2026_import import DUMP_SHA256, AUTH_FP_PASSWORDS, STAGES, read_table, sha256_file  # noqa: E402

# Fotografía vigente tras el saneamiento monetario (sin campos monetarios; la huella canónica
# coincide con la huella deportiva de la v1 importada).
SNAPSHOT_V2 = "5aeb192e-01fd-55cb-b436-602f2fcce5ff"
SNAPSHOT_V2_CHECKSUM = "5185504be12cde7f8be41d5704a9b0de7e34937ba6c182c6f3b0b1355336567a"

AUTH_FP = {  # huellas de Auth verificadas tras la migración (CLAUDE.md §4.3)
    "ids": "a19e40b8", "passwords": AUTH_FP_PASSWORDS[:8], "emails_confirmed": "0c10dcea", "identities": "92444f29"}


def db(sql):
    linked = open(os.path.join(REPO, "supabase", ".temp", "project-ref")).read().strip()
    if linked != PROJECT_REF:
        sys.exit(f"ABORTADO: el proyecto vinculado no es {PROJECT_REF}")
    out = subprocess.run(["npx", "supabase", "db", "query", "--linked", sql], cwd=REPO,
                         capture_output=True, text=True, check=True).stdout
    return json.loads(out[out.index("{"):])["rows"]


h = lambda v: hashlib.sha256(v.encode()).hexdigest()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dump", required=True)
    ap.add_argument("--manifest", required=True)
    ap.add_argument("--knockout", required=True)
    a = ap.parse_args()
    dump = os.path.expanduser(a.dump)
    manifest = json.load(open(os.path.expanduser(a.manifest)))
    resolved = json.load(open(os.path.expanduser(a.knockout)))
    results = []
    check = lambda name, ok, detail="": results.append((name, bool(ok), detail))

    check("respaldo intacto (SHA-256)", sha256_file(dump) == DUMP_SHA256)
    teams = {t["id"]: t for t in read_table(dump, "public", "teams")}
    matches = {m["id"]: m for m in read_table(dump, "public", "matches")}
    group = read_table(dump, "public", "groups")[0]
    members = read_table(dump, "public", "group_members")
    profiles = {p["user_id"]: p for p in read_table(dump, "public", "user_profiles")}
    admins = {r["user_id"] for r in read_table(dump, "public", "admin_users")}
    preds = read_table(dump, "public", "predictions")
    disabled = {u for u, p in profiles.items() if p["is_disabled"] == "t"}

    # ── Auth intacto ─────────────────────────────────────────────────────────
    # Las huellas se calculan sobre las 18 cuentas ORIGINALES (UUID del respaldo): las cuentas creadas
    # después por registro normal no forman parte de la migración y se informan aparte.
    orig_ids = ",".join(f"'{u['id']}'" for u in read_table(dump, "auth", "users"))
    fp = db(f"""select
      (select count(*) from auth.users where id::text in ({orig_ids})) users,
      (select count(*) from auth.identities where provider = 'email' and user_id::text in ({orig_ids})) idents,
      (select count(*) from auth.users) users_total,
      (select encode(sha256(convert_to(string_agg(id::text, ',' order by id::text), 'UTF8')), 'hex') from auth.users where id::text in ({orig_ids})) ids,
      (select encode(sha256(convert_to(string_agg(id::text||':'||encrypted_password, ',' order by id::text), 'UTF8')), 'hex') from auth.users where id::text in ({orig_ids})) passwords,
      (select encode(sha256(convert_to(string_agg(id::text||':'||email||':'||email_confirmed_at::text, ',' order by id::text), 'UTF8')), 'hex') from auth.users where id::text in ({orig_ids})) emails_confirmed,
      (select encode(sha256(convert_to(string_agg(id::text||':'||user_id::text||':'||provider||':'||provider_id, ',' order by id::text), 'UTF8')), 'hex') from auth.identities where user_id::text in ({orig_ids})) identities,
      (select count(*) from auth.sessions) sessions""")[0]
    check("Auth: 18 usuarios y 18 identidades email originales", fp["users"] == 18 and fp["idents"] == 18)
    print(f"      (cuentas totales en Auth: {fp['users_total']}; las {fp['users_total'] - 18} adicionales se registraron después de la migración)")
    for k, prefix in AUTH_FP.items():
        check(f"Auth: huella {k} sin cambios", fp[k].startswith(prefix), fp[k][:8])
    check("Auth: huella completa de hashes", fp["passwords"] == AUTH_FP_PASSWORDS)

    # ── Membresías ───────────────────────────────────────────────────────────
    pm = db(f"select id::text, user_id::text, role, status, joined_at::text, disabled_at is not null as dis from public.parche_members where parche_id = '{group['id']}'")
    exp = {(m["id"], m["user_id"], "owner" if m["user_id"] == group["owner_id"] else "member",
            "disabled" if m["user_id"] in disabled else "active") for m in members}
    got = {(r["id"], r["user_id"], r["role"], r["status"]) for r in pm}
    check("18 membresías con id, usuario, rol y estado originales", got == exp and len(pm) == 18, f"{len(pm)} filas")
    check("4 membresías deshabilitadas con fecha", sum(1 for r in pm if r["status"] == "disabled" and r["dis"]) == 4)
    users = {r["id"] for r in db("select id::text from auth.users")}
    check("todas las membresías apuntan a cuentas Auth existentes", {r["user_id"] for r in pm} <= users)
    check("membresías ⊂ los 18 UUID originales", sorted(h(r["user_id"]) for r in pm) == manifest["member_user_sha256"])

    # ── Partidos, equipos, resultados ────────────────────────────────────────
    dt = db("select t.id::text, t.name, t.code, t.flag_emoji, et.group_code from public.teams t join public.event_teams et on et.team_id = t.id where et.event_id = 'daaebb9b-8e92-5644-824f-bf826114446a'")
    check("48 selecciones con id, nombre, código y bandera originales",
          len(dt) == 48 and all(teams[r["id"]]["name"] == r["name"] and teams[r["id"]]["code"] == r["code"]
                                and teams[r["id"]]["flag_emoji"] == r["flag_emoji"] for r in dt))
    dm = db("""select m.id::text, s.code stage, m.match_number, m.group_code, m.starts_at, m.venue, m.home_team_id::text h, m.away_team_id::text a,
              m.home_placeholder hp, m.away_placeholder ap, m.home_score hs, m.away_score aws, m.winner_side ws, m.status, m.teams_source
              from public.matches m join public.event_stages s on s.id = m.stage_id where m.event_id = 'daaebb9b-8e92-5644-824f-bf826114446a'""")
    ko = {k["id"]: k for k in resolved["knockout"]}
    bad = []
    for r in dm:
        o = matches.get(r["id"])
        if not o:
            bad.append("id desconocido"); continue
        same = (o["stage"] == r["stage"] and (int(o["match_number"]) if o["match_number"] else None) == r["match_number"]
                and o["group_code"] == r["group_code"] and o["venue"] == r["venue"]
                and o["home_placeholder"] == r["hp"] and o["away_placeholder"] == r["ap"]
                and int(o["home_score"]) == r["hs"] and int(o["away_score"]) == r["aws"] and o["winner_side"] == r["ws"]
                and r["status"] == "finished")
        if o["stage"] == "group":
            same = same and (o["home_team_id"], o["away_team_id"]) == (r["h"], r["a"]) and r["teams_source"] == "assigned"
        else:
            same = same and (ko[r["id"]]["home_team_id"], ko[r["id"]]["away_team_id"]) == (r["h"], r["a"]) \
                   and r["teams_source"] == "derived_legacy_logic"
        if not same:
            bad.append(r["id"][:8])
    st_bad = db("select count(*) n from (values " + ",".join(f"('{i}'::uuid, '{m['starts_at']}'::timestamptz)" for i, m in matches.items())
                + ") v(id, s) left join public.matches m on m.id = v.id where m.starts_at is distinct from v.s")[0]["n"]
    check("104 partidos: id, fase, número, grupo, sede, marcador, penales y equipos coinciden", len(dm) == 104 and not bad and st_bad == 0,
          f"discrepancias={len(bad) + st_bad}")
    check("72 de grupos con equipos almacenados + 32 eliminatorias derivadas",
          sum(1 for r in dm if r["teams_source"] == "assigned") == 72 and sum(1 for r in dm if r["teams_source"] == "derived_legacy_logic") == 32)
    rules = {r["code"]: (r["exact_points"], r["result_points"]) for r in db("select code, exact_points, result_points from public.event_stages where event_id = 'daaebb9b-8e92-5644-824f-bf826114446a'")}
    check("puntuación por fase = la efectiva en producción (tercer puesto 7/5)", rules == {s[0]: (s[4], s[5]) for s in STAGES})
    er = {r["result_key"]: r["name"] for r in db("select r.result_key, t.name from public.event_results r join public.teams t on t.id = r.team_id")}
    check("campeón/subcampeón/tercero/cuarto coinciden con el cuadro derivado", er == manifest["event_results"], json.dumps(er, ensure_ascii=False))

    # ── Clasificación: recálculo independiente desde marcadores ──────────────
    rule = {s[0]: (s[4], s[5]) for s in STAGES}
    st = collections.defaultdict(lambda: [0, 0, 0, 0, 0])
    for p in preds:
        m = matches[p["match_id"]]
        ph, pa, mh, ma = int(p["home_score"]), int(p["away_score"]), int(m["home_score"]), int(m["away_score"])
        ex, res = rule[m["stage"]]
        s = st[p["user_id"]]
        s[4] += 1
        if (ph, pa) == (mh, ma): s[0] += ex; s[1] += 1
        elif (ph > pa) - (ph < pa) == (mh > ma) - (mh < ma): s[0] += res; s[2] += 1
        else: s[3] += 1
    eligible = [m["user_id"] for m in members if m["user_id"] not in admins and m["user_id"] not in disabled]
    order = sorted(eligible, key=lambda u: (-st[u][0], -st[u][1], -st[u][2]))
    rank, prev, ranks = 0, None, {}
    for i, u in enumerate(order, 1):
        if tuple(st[u][:3]) != prev: rank, prev = i, tuple(st[u][:3])
        ranks[u] = rank
    rows = db("""select row_number, user_id::text, participation, unranked_reason, position, position_shared, stats_status,
                 points, exact_hits, result_hits, misses, predictions_count, membership_role, membership_status
                 from public.standing_snapshot_rows order by row_number""")
    ranked = [r for r in rows if r["participation"] == "ranked"]
    check("13 clasificados y 5 no clasificados", len(ranked) == 13 and len(rows) == 18)
    check("orden de la clasificación = recálculo independiente", [r["user_id"] for r in ranked] == order)
    check("posición, puntos, exactos, resultados, fallos y pronósticos idénticos al recálculo",
          all((r["position"], r["points"], r["exact_hits"], r["result_hits"], r["misses"], r["predictions_count"])
              == (ranks[r["user_id"]], *st[r["user_id"]]) for r in ranked))
    check("ninguna posición compartida (empates resueltos por exactos)", not any(r["position_shared"] for r in ranked)
          and len({r["position"] for r in ranked}) == 13)
    unr = [r for r in rows if r["participation"] == "unranked"]
    check("no clasificados: 4 deshabilitados + 1 administrador, sin posición",
          sorted(r["unranked_reason"] for r in unr) == ["disabled"] * 4 + ["platform_admin"]
          and all(r["position"] is None for r in unr)
          and {r["user_id"] for r in unr} == (disabled | admins))
    check("no clasificados con cero real verificado (0 pronósticos en el respaldo)",
          all(r["stats_status"] == "verified" and r["predictions_count"] == 0 and st[r["user_id"]][4] == 0 for r in unr))
    stored = collections.Counter()
    for p in preds: stored[p["user_id"]] += int(p["points"])
    check("puntos = suma de puntos almacenados originalmente", all(r["points"] == stored[r["user_id"]] for r in ranked))
    check("top: 124 y 123 puntos", [r["points"] for r in ranked[:2]] == [124, 123])
    check("suma de pronósticos analizados = 1.286", sum(r["predictions_count"] for r in rows) == 1286)

    # ── Sin datos monetarios (saneamiento 20261029230000) ───────────────────
    snap = db("""select id::text, version, kind, member_count, ranked_count, sealed_at is not null sealed, rows_checksum,
                 private.verify_standing_snapshot(id) ok from public.standing_snapshots""")
    check("una única fotografía: v2 'historical_cut' sellada con huella válida",
          len(snap) == 1 and snap[0]["version"] == 2 and snap[0]["kind"] == "historical_cut" and snap[0]["sealed"] and snap[0]["ok"]
          and snap[0]["id"] == SNAPSHOT_V2 and snap[0]["rows_checksum"] == SNAPSHOT_V2_CHECKSUM)
    san = db("select summary from public.data_imports where source_key = 'saneamiento-monetario:v1'")
    check("saneamiento registrado: v2 reemplaza a la v1 importada (misma huella deportiva)",
          len(san) == 1 and san[0]["summary"]["replaced_checksum"] == manifest["rows_checksum"]
          and san[0]["summary"]["sports_fingerprint"] == SNAPSHOT_V2_CHECKSUM)
    money = db("""select count(*) n from information_schema.columns where table_schema = 'public'
                  and column_name in ('entry_fee', 'currency', 'prize_distribution', 'prize_info', 'prize_status', 'prize_amount')""")[0]["n"]
    check("sin columnas monetarias en public", money == 0)

    # ── Integridad y seguridad del esquema ───────────────────────────────────
    integ = db("""select
      (select count(*) from pg_constraint c join pg_namespace n on n.oid = c.connamespace where n.nspname = 'public' and c.contype = 'f') fks,
      (select count(*) from pg_constraint c join pg_namespace n on n.oid = c.connamespace where n.nspname = 'public' and not c.convalidated) not_valid,
      (select count(*) from pg_tables where schemaname = 'public') tables,
      (select count(*) from pg_tables where schemaname = 'public' and not rowsecurity) no_rls,
      (select count(*) from information_schema.role_table_grants where table_schema = 'public' and grantee = 'anon') anon_grants,
      (select count(*) from information_schema.role_table_grants where table_schema = 'public' and grantee = 'authenticated'
         and privilege_type not in ('SELECT', 'INSERT', 'UPDATE', 'DELETE')) auth_other_grants,
      (select count(*) from information_schema.role_table_grants where table_schema = 'public' and grantee = 'authenticated'
         and privilege_type in ('INSERT', 'UPDATE', 'DELETE') and table_name <> 'predictions') auth_write_grants,
      (select count(*) from pg_policies where schemaname = 'public' and cmd <> 'SELECT' and tablename <> 'predictions') write_policies,
      (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'private' and p.prosecdef
         and not exists (select 1 from unnest(p.proconfig) c where c = 'search_path=""')) secdef_without_path,
      (select count(*) from public.predictions) predictions,
      (select count(*) from (select user_id from public.standing_snapshot_rows group by snapshot_id, user_id having count(*) > 1) d) dup_rows""")[0]
    check("claves foráneas validadas", integ["fks"] > 0 and integ["not_valid"] == 0, f"{integ['fks']} FK")
    check("RLS activado en todas las tablas de public", integ["tables"] >= 14 and integ["no_rls"] == 0)
    check("anon sin privilegios en public", integ["anon_grants"] == 0)
    check("authenticated sin TRUNCATE/REFERENCES/TRIGGER y sin escritura salvo predictions",
          integ["auth_other_grants"] == 0 and integ["auth_write_grants"] == 0 and integ["write_policies"] == 0)
    check("funciones SECURITY DEFINER con search_path vacío", integ["secdef_without_path"] == 0)
    check("0 pronósticos individuales persistidos", integ["predictions"] == 0)
    check("sin filas históricas duplicadas", integ["dup_rows"] == 0)
    imp = db("select source_key, source_sha256, summary from public.data_imports where source_key = 'la-penultima:mundial-2026:v1'")
    check("importación histórica registrada una sola vez con el SHA del respaldo",
          len(imp) == 1 and imp[0]["source_sha256"] == DUMP_SHA256 and imp[0]["summary"]["predictions_imported"] == 0)

    for name, ok, detail in results:
        print(f"{'OK   ' if ok else 'FALLO'} {name}{' — ' + detail if detail else ''}")
    failed = sum(1 for _, ok, _ in results if not ok)
    print(f"\n{len(results) - failed}/{len(results)} comprobaciones correctas")
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
