#!/usr/bin/env python3
"""
Prepara la importación histórica del Mundial 2026 de La Penúltima hacia La Canchita.

Fuente única: el respaldo inmutable (pg_dump custom) leído con `pg_restore -a` hacia un
stream local; nunca se restaura ni se consulta el proyecto original.

Qué importa (ver CLAUDE.md §2.3 y §4.6):
  - parche "La Penúltima" (id original) y sus 18 membresías (id original, rol, estado);
  - evento Mundial 2026 con fases y la puntuación EFECTIVAMENTE aplicada en producción;
  - 48 selecciones (id original) y 104 partidos (id original) con resultados;
    los equipos de eliminatoria se derivan con la lógica original (resolve_knockout.mjs);
  - campeón, subcampeón, tercero y cuarto;
  - una fotografía histórica sellada ('historical_cut') con la clasificación completa.
Qué NO importa: los 1.286 pronósticos (solo se analizan en memoria), noticias, sesiones.

Uso:
  python3 -I scripts/history-migration/prepare_wc2026_import.py \
      --dump ~/Backups/la-penultima/el-var-2026-10-29.dump \
      --legacy-lib ../el-var/src/lib \
      --node ~/.nvm/versions/node/v22.23.2/bin/node \
      --out-dir <directorio privado fuera del repo>

Genera en --out-dir (permisos 600; contienen nombres de usuario y UUID: nunca versionar):
  wc2026_import.sql         transacción única con guardas y verificación final
  wc2026_import_dryrun.sql  idéntico pero termina en ROLLBACK
  manifest.json             conteos, huellas y clasificación anonimizada (UUID → SHA-256)
"""
import argparse, collections, hashlib, json, os, subprocess, sys, uuid

DUMP_SHA256 = "cef1ce449d98faed8dcf0ee109b7f877d11ccd42b6e984b9fee6940000366703"
DEST_PROJECT_REF = "cfzxentitxytnvvumfpv"
SOURCE_KEY = "la-penultima:mundial-2026:v1"
# Huella de auth.users verificada tras la migración de Auth (CLAUDE.md §4.3): la importación
# comprueba dentro de la transacción que Auth no cambió.
AUTH_FP_PASSWORDS = "eaa65325a233294ddd56fb5c4288f61cc3130480e7b5c65545b9cfdb1efcf456"
NS = uuid.UUID("6f1d3c52-7a3e-4c55-9a0e-6c61c2a7e2b1")  # espacio de nombres fijo → UUID reproducibles

# Puntuación efectiva de producción (calculate_match_points vivo; la migración 049 no se aplicó,
# por eso el tercer puesto es 7/5 y no 8/6). Se verifica contra los 1.286 puntos almacenados.
STAGES = [  # code, nombre, orden, eliminatoria, exacto, resultado
    ("group",         "Fase de grupos",         1, False, 3, 1),
    ("round_of_32",   "Dieciseisavos de final", 2, True,  4, 2),
    ("round_of_16",   "Octavos de final",       3, True,  5, 3),
    ("quarter_final", "Cuartos de final",       4, True,  6, 4),
    ("semi_final",    "Semifinal",              5, True,  7, 5),
    ("third_place",   "Tercer puesto",          6, True,  7, 5),
    ("final",         "Final",                  7, True,  8, 6),
]
REASON = {"Marcador exacto": "exact", "Resultado acertado": "result", "Sin puntos": "miss"}
EXPECTED = {"users": 18, "members": 18, "groups": 1, "teams": 48, "matches": 104, "predictions": 1286}


def unescape_copy(value):
    if value == "\\N":
        return None
    out, i = [], 0
    simple = {"b": "\b", "f": "\f", "n": "\n", "r": "\r", "t": "\t", "v": "\v", "\\": "\\"}
    while i < len(value):
        ch = value[i]
        if ch == "\\" and i + 1 < len(value):
            nxt = value[i + 1]
            if nxt in simple:
                out.append(simple[nxt]); i += 2; continue
            if nxt in "01234567":
                j = i + 1
                while j < len(value) and j < i + 4 and value[j] in "01234567":
                    j += 1
                out.append(chr(int(value[i + 1:j], 8))); i = j; continue
            out.append(nxt); i += 2; continue
        out.append(ch); i += 1
    return "".join(out)


def read_table(dump, schema, name):
    out = subprocess.run(["pg_restore", "-a", "-n", schema, "-t", name, "-f", "-", dump],
                         capture_output=True, text=True, check=True).stdout
    cols, rows, inside = None, [], False
    for line in out.splitlines():
        if line.startswith(f"COPY {schema}."):
            cols = [c.strip() for c in line[line.index("(") + 1:line.index(")")].split(",")]
            inside = True
            continue
        if inside:
            if line == "\\.":
                break
            rows.append(dict(zip(cols, (unescape_copy(v) for v in line.split("\t")))))
    if cols is None:
        sys.exit(f"ERROR: {schema}.{name} no está en el dump")
    return rows


def sha256_file(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def lit(v):
    if v is None:
        return "NULL"
    if isinstance(v, bool):
        return "true" if v else "false"
    if isinstance(v, int):
        return str(v)
    return "'" + str(v).replace("'", "''") + "'"


def jsonb(v):
    return lit(json.dumps(v, ensure_ascii=False)) + "::jsonb"


def jsonb_text(obj):
    """Representación textual de Postgres para un objeto jsonb plano de enteros."""
    keys = sorted(obj, key=lambda k: (len(k.encode()), k.encode()))
    return "{" + ", ".join(f'"{k}": {obj[k]}' for k in keys) + "}"


def uid(name):
    return str(uuid.uuid5(NS, name))


def fail(errors):
    if errors:
        print(json.dumps({"errors": errors}, indent=2, ensure_ascii=False))
        sys.exit("ABORTADO: la validación del origen falló; no se generó SQL")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dump", required=True)
    ap.add_argument("--legacy-lib", required=True)
    ap.add_argument("--node", required=True)
    ap.add_argument("--out-dir", required=True)
    a = ap.parse_args()
    dump = os.path.abspath(os.path.expanduser(a.dump))
    out_dir = os.path.abspath(os.path.expanduser(a.out_dir))
    here = os.path.dirname(os.path.abspath(__file__))
    repo = os.path.abspath(os.path.join(here, "..", ".."))
    if out_dir == repo or out_dir.startswith(repo + os.sep):
        sys.exit("ERROR: --out-dir debe estar fuera del repositorio")
    if sha256_file(dump) != DUMP_SHA256:
        sys.exit("ERROR: el SHA-256 del respaldo no coincide con el verificado")
    os.makedirs(out_dir, mode=0o700, exist_ok=True)
    os.chmod(out_dir, 0o700)

    teams = read_table(dump, "public", "teams")
    matches = read_table(dump, "public", "matches")
    groups = read_table(dump, "public", "groups")
    members = read_table(dump, "public", "group_members")
    profiles = {p["user_id"]: p for p in read_table(dump, "public", "user_profiles")}
    admins = {r["user_id"] for r in read_table(dump, "public", "admin_users")}
    preds = read_table(dump, "public", "predictions")
    users = {u["id"]: u for u in read_table(dump, "auth", "users")}

    errors = []
    counts = {"users": len(users), "members": len(members), "groups": len(groups),
              "teams": len(teams), "matches": len(matches), "predictions": len(preds)}
    errors += [f"{k}={v} (esperado {EXPECTED[k]})" for k, v in counts.items() if v != EXPECTED[k]]
    fail(errors)
    group = groups[0]
    member_ids = [m["user_id"] for m in members]
    if len(set(member_ids)) != len(member_ids): errors.append("membresías duplicadas")
    if set(member_ids) - set(users): errors.append("miembro sin cuenta Auth")
    if group["owner_id"] not in member_ids: errors.append("el dueño no es miembro")
    if any(p["is_disabled"] == "t" and not p["disabled_at"] for p in profiles.values()):
        errors.append("deshabilitado sin disabled_at")
    for m in matches:
        if m["status"] != "finished" or m["home_score"] is None or m["away_score"] is None:
            errors.append(f"partido no finalizado {m['id']}")
    stage_rules = {s[0]: (s[4], s[5]) for s in STAGES}
    if {m["stage"] for m in matches} - set(stage_rules): errors.append("fase desconocida")
    fail(errors)

    # ── Equipos de eliminatoria con la lógica original ───────────────────────
    payload = {"teams": [{k: t[k] for k in ("id", "name", "code", "flag_emoji")} for t in teams],
               "matches": [{"id": m["id"], "stage": m["stage"], "group_code": m["group_code"], "status": m["status"],
                            "starts_at": m["starts_at"], "home_team_id": m["home_team_id"], "away_team_id": m["away_team_id"],
                            "home_placeholder": m["home_placeholder"], "away_placeholder": m["away_placeholder"],
                            "winner_side": m["winner_side"],
                            "match_number": int(m["match_number"]) if m["match_number"] else None,
                            "home_score": int(m["home_score"]), "away_score": int(m["away_score"])} for m in matches]}
    in_path, res_path = os.path.join(out_dir, "matches_input.json"), os.path.join(out_dir, "knockout_resolved.json")
    with open(os.open(in_path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600), "w") as f:
        json.dump(payload, f)
    subprocess.run([os.path.expanduser(a.node), "--experimental-strip-types", "--disable-warning=ExperimentalWarning",
                    os.path.join(here, "resolve_knockout.mjs"), "--legacy-lib", os.path.abspath(os.path.expanduser(a.legacy_lib)),
                    "--input", in_path, "--output", res_path], check=True)
    resolved = json.load(open(res_path))
    os.remove(in_path)
    ko = {k["id"]: k for k in resolved["knockout"]}
    if resolved["warnings"]: errors += [f"desempate alfabético: {w}" for w in resolved["warnings"]]
    if len(ko) != 32: errors.append(f"eliminatorias resueltas={len(ko)}")
    if any(not k["home_team_id"] or not k["away_team_id"] or not k["winner_team_id"] for k in ko.values()):
        errors.append("eliminatoria sin equipos o sin ganador")
    if any(k["stored_home"] or k["stored_away"] for k in ko.values()): errors.append("eliminatoria con equipos almacenados")
    fail(errors)
    # Coherencia del cuadro: cada referencia "Winner/Loser Mxx" apunta al equipo correcto,
    # cada ronda tiene equipos distintos y los 32 de dieciseisavos = 24 primeros/segundos + 8 terceros.
    by_num = {k["match_number"]: k for k in ko.values()}
    mrow = {m["id"]: m for m in matches}
    gpos = {g["group_code"]: g["team_ids"] for g in resolved["group_positions"]}
    for k in ko.values():
        m = mrow[k["id"]]
        for side in ("home", "away"):
            ph, team = m[f"{side}_placeholder"], k[f"{side}_team_id"]
            kind, _, ref = ph.partition(" M")
            if ph.startswith("Winner Group "): ok = gpos[ph[-1]][0] == team
            elif ph.startswith("Runner-up Group "): ok = gpos[ph[-1]][1] == team
            elif ph.startswith("Best 3rd ("):
                allowed = ph[ph.index("(") + 1:ph.index(")")].split("/")
                ok = team in resolved["best_thirds_qualified"] and any(gpos[g][2] == team for g in allowed)
            elif kind == "Winner": ok = by_num[int(ref)]["winner_team_id"] == team
            elif kind == "Loser": ok = by_num[int(ref)]["loser_team_id"] == team
            else: ok = False
            if not ok: errors.append(f"M{k['match_number']} {side}: '{ph}' no corresponde")
    for stage in {k["stage"] for k in ko.values()}:
        ts = [t for k in ko.values() if k["stage"] == stage for t in (k["home_team_id"], k["away_team_id"])]
        if len(ts) != len(set(ts)): errors.append(f"equipo repetido en {stage}")
    r32 = {t for k in ko.values() if k["stage"] == "round_of_32" for t in (k["home_team_id"], k["away_team_id"])}
    expected_r32 = {ids[i] for ids in gpos.values() for i in (0, 1)} | set(resolved["best_thirds_qualified"])
    if r32 != expected_r32: errors.append("dieciseisavos no coincide con clasificados de grupos")
    fail(errors)
    final = next(k for k in ko.values() if k["stage"] == "final")
    third = next(k for k in ko.values() if k["stage"] == "third_place")
    event_results = [("champion", final["winner_team_id"], final["id"]), ("runner_up", final["loser_team_id"], final["id"]),
                     ("third_place", third["winner_team_id"], third["id"]), ("fourth_place", third["loser_team_id"], third["id"])]

    # ── Puntos y clasificación desde los pronósticos (solo en memoria) ───────
    effective_mismatch = 0
    stats = collections.defaultdict(lambda: {"points": 0, "exact": 0, "result": 0, "miss": 0, "preds": 0})
    for p in preds:
        m = mrow[p["match_id"]]
        ex, res = stage_rules[m["stage"]]
        ph, pa, mh, ma = int(p["home_score"]), int(p["away_score"]), int(m["home_score"]), int(m["away_score"])
        exp_reason = "exact" if (ph, pa) == (mh, ma) else "result" if (ph > pa) - (ph < pa) == (mh > ma) - (mh < ma) else "miss"
        exp_points = {"exact": ex, "result": res, "miss": 0}[exp_reason]
        reason = REASON.get(p["points_reason"])
        if reason != exp_reason or int(p["points"]) != exp_points or not p["scored_at"]:
            effective_mismatch += 1
        s = stats[p["user_id"]]
        s["points"] += int(p["points"]); s[reason] += 1; s["preds"] += 1
    if effective_mismatch: errors.append(f"{effective_mismatch} pronósticos no coinciden con la puntuación efectiva")
    if set(stats) - set(member_ids): errors.append("pronósticos de no miembros")
    fail(errors)

    def display_name(user_id):  # misma expresión que get_group_leaderboard
        meta = json.loads(users[user_id]["raw_user_meta_data"] or "{}")
        return meta.get("username") or users[user_id]["email"].split("@")[0]

    disabled = {u for u, p in profiles.items() if p["is_disabled"] == "t"}
    eligible = [u for u in member_ids if u not in admins and u not in disabled]
    zero = {"points": 0, "exact": 0, "result": 0, "miss": 0, "preds": 0}
    board = sorted(eligible, key=lambda u: (-stats.get(u, zero)["points"], -stats.get(u, zero)["exact"],
                                            -stats.get(u, zero)["result"], display_name(u)))
    ranks, prev, rank = {}, None, 0
    for i, u in enumerate(board, 1):  # RANK(): empates comparten posición y la siguiente salta
        s = stats.get(u, zero)
        key = (s["points"], s["exact"], s["result"])
        if key != prev:
            rank, prev = i, key
        ranks[u] = rank
    shared = collections.Counter(ranks.values())

    # Premio informativo con las reglas del parche (computePrizePool / computeProjectedPrizes).
    entry_fee = int(group["entry_fee"]); p1, p2 = int(group["first_place_pct"]), int(group["second_place_pct"])
    paying = len(eligible)
    pool = entry_fee * paying
    first, second = round(pool * p1 / 100), round(pool * p2 / 100)
    rank1 = [u for u in board if ranks[u] == 1]; rank2 = [u for u in board if ranks[u] == 2]
    if len(rank1) != 1 or len(rank2) != 1:
        errors.append("empate en 1.º o 2.º: el reparto requiere revisión manual")
    fail(errors)
    prizes = {rank1[0]: first, rank2[0]: second}

    rows = []
    for u in board:
        s = stats.get(u, zero)
        rows.append({"user_id": u, "participation": "ranked", "unranked_reason": None, "position": ranks[u],
                     "position_shared": shared[ranks[u]] > 1, "stats": s,
                     "tiebreak": {"points": s["points"], "exact_hits": s["exact"], "result_hits": s["result"]},
                     "prize_status": "calculated" if u in prizes else "none", "prize_amount": prizes.get(u, 0)})
    # No clasificados: deshabilitados y administrador. Sus cifras son ceros reales verificados
    # (0 pronósticos), pero no reciben posición ni premio.
    unranked = sorted((u for u in member_ids if u not in eligible),
                      key=lambda u: (u in admins, display_name(u)))
    for u in unranked:
        s = stats.get(u, zero)
        if s["preds"]:
            errors.append("miembro no clasificado con pronósticos")
        rows.append({"user_id": u, "participation": "unranked",
                     "unranked_reason": "platform_admin" if u in admins else "disabled",
                     "position": None, "position_shared": None, "stats": s, "tiebreak": None,
                     "prize_status": "not_applicable", "prize_amount": None})
    fail(errors)

    member_by_user = {m["user_id"]: m for m in members}
    role = lambda u: "owner" if u == group["owner_id"] else "member"
    mstatus = lambda u: "disabled" if u in disabled else "active"
    for i, r in enumerate(rows, 1):
        r["row_number"] = i
        r["display_name"] = display_name(r["user_id"])
        r["role"], r["status"] = role(r["user_id"]), mstatus(r["user_id"])

    def canon(r):
        s = r["stats"]
        amt = "∅" if r["prize_amount"] is None else f"{r['prize_amount']}.00"
        none = lambda v: "∅" if v is None else str(v).lower() if isinstance(v, bool) else str(v)
        return "|".join([str(r["row_number"]), r["user_id"], r["display_name"], r["role"], r["status"],
                         r["participation"], none(r["unranked_reason"]), none(r["position"]), none(r["position_shared"]),
                         "verified", str(s["points"]), str(s["exact"]), str(s["result"]), str(s["miss"]), str(s["preds"]),
                         "∅" if r["tiebreak"] is None else jsonb_text(r["tiebreak"]), r["prize_status"], amt])
    checksum = hashlib.sha256("\n".join(canon(r) for r in rows).encode()).hexdigest()

    # ── Identificadores ──────────────────────────────────────────────────────
    event_id = uid("event:mundial-2026")
    stage_ids = {s[0]: uid(f"event:mundial-2026:stage:{s[0]}") for s in STAGES}
    parche_event_id = uid(f"parche-event:{group['id']}:mundial-2026")
    snapshot_id = uid(f"snapshot:{parche_event_id}:v1")
    import_id = uid(f"import:{SOURCE_KEY}")
    team_group = {}
    for m in matches:
        if m["stage"] == "group":
            for t in (m["home_team_id"], m["away_team_id"]):
                if team_group.setdefault(t, m["group_code"]) != m["group_code"]:
                    errors.append("selección en dos grupos")
    if len(team_group) != 48: errors.append(f"selecciones en grupos={len(team_group)}")
    fail(errors)
    data_cutoff = max(p["scored_at"] for p in preds)

    scoring_rules = {"source": "calculate_match_points en producción de La Penúltima (verificado contra 1.286 pronósticos)",
                     "exact_includes_result": False, "penalties_count": False,
                     "stages": [{"code": s[0], "exact": s[4], "result": s[5]} for s in STAGES]}
    ranking_rules = {"source": "get_group_leaderboard (La Penúltima)",
                     "order": ["points desc", "exact_hits desc", "result_hits desc"],
                     "ties": "posición compartida (RANK); la siguiente posición salta",
                     "display_tiebreak": "display_name asc (solo orden visual)",
                     "excluded": ["platform_admin", "disabled"]}
    prize_info = {"basis": "calculated_from_parche_rules", "currency": "COP", "entry_fee": entry_fee,
                  "paying_players": paying,
                  "paying_players_rule": "miembros que no son administradores ni están deshabilitados (get_active_player_count)",
                  "pool_total": pool,
                  "distribution": [{"position": 1, "pct": p1, "amount": first}, {"position": 2, "pct": p2, "amount": second}],
                  "payment_evidence": "none",
                  "note": "Montos informativos calculados por las reglas de la app original. No hay evidencia de cobros ni pagos efectivos."}
    notes = ("Corte histórico importado del respaldo de La Penúltima (Mundial 2026). No es un cierre oficial de La Canchita; "
             "puede formalizarse con un event_close_run sin alterar estas filas. Equipos de eliminatoria derivados con la lógica original.")

    # ── SQL ──────────────────────────────────────────────────────────────────
    q = []
    q.append("BEGIN;")
    q.append(f"""DO $$ BEGIN
  IF current_setting('cluster_name', true) IS DISTINCT FROM 'lacanchita-local-test'
     AND (SELECT count(*) FROM auth.users) <> {len(users)} THEN RAISE EXCEPTION 'destino_inesperado'; END IF;
  IF to_regclass('public.data_imports') IS NULL THEN RAISE EXCEPTION 'falta_esquema'; END IF;
  IF EXISTS (SELECT 1 FROM public.data_imports WHERE source_key = {lit(SOURCE_KEY)}) THEN RAISE EXCEPTION 'ya_importado'; END IF;
  IF EXISTS (SELECT 1 FROM public.events WHERE id = {lit(event_id)} OR slug = 'mundial-2026')
     OR EXISTS (SELECT 1 FROM public.parches WHERE id = {lit(group['id'])})
     OR EXISTS (SELECT 1 FROM public.teams WHERE id IN ({', '.join(lit(t['id']) for t in teams)}))
     OR EXISTS (SELECT 1 FROM public.matches WHERE id IN ({', '.join(lit(m['id']) for m in matches)}))
  THEN RAISE EXCEPTION 'conflicto_datos_existentes'; END IF;
  IF (SELECT count(*) FROM auth.users WHERE id IN ({', '.join(lit(u) for u in member_ids)})) <> {len(member_ids)}
  THEN RAISE EXCEPTION 'faltan_usuarios_auth'; END IF;
END $$;""")
    q.append(f"INSERT INTO public.events (id, slug, name, timezone, status) VALUES "
             f"({lit(event_id)}, 'mundial-2026', 'Copa Mundial de la FIFA 2026', 'America/Bogota', 'finished');")
    for code, name, order, is_ko, ex, res in STAGES:
        q.append(f"INSERT INTO public.event_stages (id, event_id, code, name, sort_order, is_knockout, exact_points, result_points) "
                 f"VALUES ({lit(stage_ids[code])}, {lit(event_id)}, {lit(code)}, {lit(name)}, {order}, {lit(is_ko)}, {ex}, {res});")
    for t in teams:
        q.append(f"INSERT INTO public.teams (id, name, code, kind, flag_emoji, created_at) VALUES "
                 f"({lit(t['id'])}, {lit(t['name'])}, {lit(t['code'])}, 'national', {lit(t['flag_emoji'])}, {lit(t['created_at'])});")
        q.append(f"INSERT INTO public.event_teams (event_id, team_id, group_code) VALUES "
                 f"({lit(event_id)}, {lit(t['id'])}, {lit(team_group[t['id']])});")
    for m in sorted(matches, key=lambda m: (m["starts_at"], int(m["match_number"] or 0))):
        k = ko.get(m["id"])
        home = k["home_team_id"] if k else m["home_team_id"]
        away = k["away_team_id"] if k else m["away_team_id"]
        q.append("INSERT INTO public.matches (id, event_id, stage_id, match_number, group_code, starts_at, venue, home_team_id, "
                 "away_team_id, home_placeholder, away_placeholder, teams_source, status, home_score, away_score, winner_side, created_at) VALUES "
                 f"({lit(m['id'])}, {lit(event_id)}, {lit(stage_ids[m['stage']])}, {lit(int(m['match_number']) if m['match_number'] else None)}, "
                 f"{lit(m['group_code'])}, {lit(m['starts_at'])}, {lit(m['venue'])}, {lit(home)}, {lit(away)}, "
                 f"{lit(m['home_placeholder'])}, {lit(m['away_placeholder'])}, {lit('derived_legacy_logic' if k else 'assigned')}, "
                 f"'finished', {int(m['home_score'])}, {int(m['away_score'])}, {lit(m['winner_side'])}, {lit(m['created_at'])});")
    for key, team, match_id in event_results:
        q.append(f"INSERT INTO public.event_results (event_id, result_key, team_id, source_match_id) VALUES "
                 f"({lit(event_id)}, {lit(key)}, {lit(team)}, {lit(match_id)});")
    q.append(f"INSERT INTO public.parches (id, name, created_by, created_at) VALUES "
             f"({lit(group['id'])}, {lit(group['name'])}, {lit(group['owner_id'])}, {lit(group['created_at'])});")
    for m in members:
        u = m["user_id"]
        q.append(f"INSERT INTO public.parche_members (id, parche_id, user_id, role, status, joined_at, disabled_at) VALUES "
                 f"({lit(m['id'])}, {lit(group['id'])}, {lit(u)}, {lit(role(u))}, {lit(mstatus(u))}, {lit(m['joined_at'])}, "
                 f"{lit(profiles[u]['disabled_at'] if u in disabled else None)});")
    q.append(f"INSERT INTO public.parche_events (id, parche_id, event_id, status, predictions_visibility, entry_fee, currency, prize_distribution) VALUES "
             f"({lit(parche_event_id)}, {lit(group['id'])}, {lit(event_id)}, 'finished', 'after_kickoff', {entry_fee}, 'COP', "
             f"{jsonb([{'position': 1, 'pct': p1}, {'position': 2, 'pct': p2}])});")
    q.append("INSERT INTO public.standing_snapshots (id, parche_event_id, version, kind, source, source_ref, scoring_rules, ranking_rules, "
             "prize_info, member_count, ranked_count, computed_at, data_cutoff_at, notes) VALUES "
             f"({lit(snapshot_id)}, {lit(parche_event_id)}, 1, 'historical_cut', 'legacy_import', {lit('el-var-2026-10-29.dump sha256:' + DUMP_SHA256)}, "
             f"{jsonb(scoring_rules)}, {jsonb(ranking_rules)}, {jsonb(prize_info)}, {len(rows)}, {len(board)}, now(), {lit(data_cutoff)}, {lit(notes)});")
    for r in rows:
        s = r["stats"]
        q.append("INSERT INTO public.standing_snapshot_rows (snapshot_id, row_number, user_id, display_name, membership_role, membership_status, "
                 "participation, unranked_reason, position, position_shared, stats_status, points, exact_hits, result_hits, misses, "
                 "predictions_count, tiebreak_values, prize_status, prize_amount) VALUES "
                 f"({lit(snapshot_id)}, {r['row_number']}, {lit(r['user_id'])}, {lit(r['display_name'])}, {lit(r['role'])}, {lit(r['status'])}, "
                 f"{lit(r['participation'])}, {lit(r['unranked_reason'])}, {lit(r['position'])}, {lit(r['position_shared'])}, 'verified', "
                 f"{s['points']}, {s['exact']}, {s['result']}, {s['miss']}, {s['preds']}, "
                 f"{'NULL' if r['tiebreak'] is None else jsonb(r['tiebreak'])}, {lit(r['prize_status'])}, {lit(r['prize_amount'])});")
    q.append(f"UPDATE public.standing_snapshots SET rows_checksum = {lit(checksum)}, sealed_at = now() WHERE id = {lit(snapshot_id)};")
    summary = {"teams": len(teams), "matches": len(matches), "members": len(members), "snapshot_rows": len(rows),
               "ranked": len(board), "predictions_imported": 0, "predictions_analyzed": len(preds), "rows_checksum": checksum}
    q.append(f"INSERT INTO public.data_imports (id, source_key, source_sha256, script, summary) VALUES "
             f"({lit(import_id)}, {lit(SOURCE_KEY)}, {lit(DUMP_SHA256)}, 'scripts/history-migration/prepare_wc2026_import.py', {jsonb(summary)});")
    q.append(f"""DO $$ BEGIN
  IF (SELECT count(*) FROM public.events) <> 1 OR (SELECT count(*) FROM public.event_stages) <> {len(STAGES)}
     OR (SELECT count(*) FROM public.teams) <> {len(teams)} OR (SELECT count(*) FROM public.event_teams) <> {len(teams)}
     OR (SELECT count(*) FROM public.matches) <> {len(matches)} OR (SELECT count(*) FROM public.event_results) <> 4
     OR (SELECT count(*) FROM public.parches) <> 1 OR (SELECT count(*) FROM public.parche_members) <> {len(members)}
     OR (SELECT count(*) FROM public.parche_events) <> 1 OR (SELECT count(*) FROM public.standing_snapshots) <> 1
     OR (SELECT count(*) FROM public.standing_snapshot_rows) <> {len(rows)} OR (SELECT count(*) FROM public.predictions) <> 0
  THEN RAISE EXCEPTION 'conteos_finales'; END IF;
  IF NOT private.verify_standing_snapshot({lit(snapshot_id)}) THEN RAISE EXCEPTION 'huella_clasificacion'; END IF;
  IF (SELECT count(*) FROM public.matches WHERE home_team_id IS NULL OR away_team_id IS NULL) <> 0 THEN RAISE EXCEPTION 'partidos_sin_equipos'; END IF;
  IF current_setting('cluster_name', true) IS DISTINCT FROM 'lacanchita-local-test' AND
     (SELECT encode(sha256(convert_to(string_agg(id::text||':'||encrypted_password, ',' ORDER BY id::text), 'UTF8')), 'hex') FROM auth.users)
     <> {lit(AUTH_FP_PASSWORDS)} THEN RAISE EXCEPTION 'auth_modificado'; END IF;
END $$;""")
    q.append("COMMIT;")
    sql = "\n".join(q) + "\n"
    sql_path, dry_path = os.path.join(out_dir, "wc2026_import.sql"), os.path.join(out_dir, "wc2026_import_dryrun.sql")
    with open(os.open(sql_path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600), "w") as f:
        f.write(sql)
    with open(os.open(dry_path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600), "w") as f:
        f.write(sql[: sql.rindex("COMMIT;")] + "ROLLBACK;\n")

    team_name = {t["id"]: t["name"] for t in teams}
    h = lambda u: hashlib.sha256(u.encode()).hexdigest()
    manifest = {
        "dest_project_ref": DEST_PROJECT_REF, "source_key": SOURCE_KEY, "dump_sha256": DUMP_SHA256,
        "counts": counts, "ids": {"event": event_id, "parche": group["id"], "parche_event": parche_event_id, "snapshot": snapshot_id},
        "rows_checksum": checksum, "data_cutoff_at": data_cutoff,
        "event_results": {k: team_name[t] for k, t, _ in event_results},
        "prize_info": prize_info,
        "member_user_sha256": sorted(h(u) for u in member_ids),
        "standings": [{"row": r["row_number"], "user_sha256": h(r["user_id"]), "participation": r["participation"],
                       "unranked_reason": r["unranked_reason"], "position": r["position"], "shared": r["position_shared"],
                       "points": r["stats"]["points"], "exact": r["stats"]["exact"], "result": r["stats"]["result"],
                       "miss": r["stats"]["miss"], "preds": r["stats"]["preds"], "role": r["role"], "status": r["status"],
                       "prize_status": r["prize_status"], "prize_amount": r["prize_amount"]} for r in rows],
    }
    with open(os.open(os.path.join(out_dir, "manifest.json"), os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600), "w") as f:
        json.dump(manifest, f, indent=2, ensure_ascii=False)
    print(json.dumps({k: manifest[k] for k in ("counts", "ids", "rows_checksum", "data_cutoff_at", "event_results")}, indent=2, ensure_ascii=False))
    print(f"SQL privado generado en {sql_path} (600)")


if __name__ == "__main__":
    main()
