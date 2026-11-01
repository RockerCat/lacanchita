#!/usr/bin/env python3
"""
Prepara la importación mínima de Supabase Auth (auth.users + auth.identities)
desde el dump de La Penúltima hacia el proyecto lacanchita.

- Lee el dump con `pg_restore -a` (solo datos de dos tablas, nunca restaura).
- Valida estructura y relaciones; imprime únicamente agregados y huellas SHA-256.
- Escribe el SQL de importación en un directorio privado FUERA del repositorio
  (contiene emails y hashes: nunca versionarlo).

Uso:
  python3 -I scripts/auth-migration/prepare_auth_import.py \
      --dump ~/Backups/la-penultima/el-var-2026-10-29.dump \
      --out-dir <directorio privado, p. ej. un scratchpad con permisos 700>

Genera en --out-dir:
  auth_import_dryrun.sql  mismo contenido terminado en ROLLBACK (ensayo sin efectos)
  auth_import.sql   transacción única con guardas (aborta si el destino no está vacío
                    o si los conteos/huellas posteriores no coinciden)
  manifest.json     conteos y huellas sin datos sensibles
"""
import argparse, hashlib, json, os, subprocess, sys

# Columnas generadas en el destino (no se insertan): users.confirmed_at, identities.email
TOKEN_COLUMNS = ["confirmation_token", "recovery_token", "email_change_token_new",
                 "email_change_token_current", "reauthentication_token"]
EXPECTED_USERS = 18
EXPECTED_IDENTITIES = 18


def unescape_copy(value):
    """Decodifica un campo COPY en formato texto. Devuelve None para \\N."""
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
            if nxt == "x":
                j = i + 2
                while j < len(value) and j < i + 4 and value[j] in "0123456789abcdefABCDEF":
                    j += 1
                out.append(chr(int(value[i + 2:j], 16))); i = j; continue
            out.append(nxt); i += 2; continue
        out.append(ch); i += 1
    return "".join(out)


def read_table(dump, name):
    out = subprocess.run(["pg_restore", "-a", "-n", "auth", "-t", name, "-f", "-", dump],
                         capture_output=True, text=True, check=True).stdout
    cols, rows, inside = None, [], False
    for line in out.splitlines():
        if line.startswith("COPY auth."):
            cols = [c.strip() for c in line[line.index("(") + 1:line.index(")")].split(",")]
            inside = True
            continue
        if inside:
            if line == "\\.":
                break
            rows.append(dict(zip(cols, (unescape_copy(v) for v in line.split("\t")))))
    if cols is None:
        sys.exit(f"ERROR: auth.{name} no está en el dump")
    return cols, rows


def lit(v):
    return "NULL" if v is None else "'" + v.replace("'", "''") + "'"


def fingerprint(parts):
    return hashlib.sha256(",".join(parts).encode()).hexdigest()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dump", required=True)
    ap.add_argument("--out-dir", required=True)
    a = ap.parse_args()
    out_dir = os.path.abspath(os.path.expanduser(a.out_dir))
    repo = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
    if out_dir == repo or out_dir.startswith(repo + os.sep):
        sys.exit("ERROR: --out-dir debe estar fuera del repositorio")

    ucols, users = read_table(os.path.expanduser(a.dump), "users")
    icols, idents = read_table(os.path.expanduser(a.dump), "identities")

    errors = []
    ids = [u["id"] for u in users]
    if len(users) != EXPECTED_USERS: errors.append(f"usuarios={len(users)}")
    if len(idents) != EXPECTED_IDENTITIES: errors.append(f"identidades={len(idents)}")
    if len(set(ids)) != len(ids): errors.append("UUID de usuario duplicados")
    emails = [(u["email"] or "").lower() for u in users]
    if len(set(emails)) != len(emails) or "" in emails: errors.append("emails vacíos o duplicados")
    if any(not (u["encrypted_password"] or "").startswith(("$2a$", "$2b$", "$2y$")) for u in users):
        errors.append("hash no bcrypt")
    if any(not u["email_confirmed_at"] for u in users): errors.append("usuario sin email_confirmed_at")
    if any(u["deleted_at"] or u.get("is_sso_user") == "t" or u.get("is_anonymous") == "t" for u in users):
        errors.append("usuarios borrados/SSO/anónimos")
    if any(u["phone"] for u in users): errors.append("usuarios con teléfono (revisar unicidad)")
    user_ids = set(ids)
    if any(i["provider"] != "email" for i in idents): errors.append("proveedor distinto de email")
    if {i["user_id"] for i in idents} != user_ids: errors.append("usuarios e identidades no corresponden 1:1")
    if len({i["id"] for i in idents}) != len(idents): errors.append("id de identidad duplicado")
    if len({(i["provider_id"], i["provider"]) for i in idents}) != len(idents): errors.append("provider_id duplicado")
    by_user = {u["id"]: u for u in users}
    keyset = set()
    for i in idents:
        data = json.loads(i["identity_data"])
        keyset |= set(data)
        if data.get("sub") != i["user_id"] or i["provider_id"] != i["user_id"]:
            errors.append("identity_data.sub/provider_id no coincide con user_id")
        if (data.get("email") or "").lower() != (by_user[i["user_id"]]["email"] or "").lower():
            errors.append("email de identidad no coincide")
    live_tokens = sum(1 for u in users for c in TOKEN_COLUMNS if (u.get(c) or "").strip())
    # Los tokens de un solo uso pendientes (p. ej. recuperaciones antiguas) no se migran:
    # se importan vacíos para no trasladar secretos de recuperación vigentes.
    for u in users:
        for c in TOKEN_COLUMNS:
            if c in u and u[c] is not None:
                u[c] = ""

    manifest = {
        "users": len(users), "identities": len(idents),
        "instance_ids": sorted({u["instance_id"] or "NULL" for u in users}),
        "aud_role": sorted({f'{u["aud"]}/{u["role"]}' for u in users}),
        "identity_data_keys": sorted(keyset),
        "non_empty_tokens": live_tokens,
        "fp_user_ids": fingerprint(sorted(ids)),
        # SHA-256 individual de cada UUID: permite confirmar en la prueba de login
        # que el usuario autenticado es uno de los originales sin guardar UUID en claro.
        "user_id_sha256": sorted(hashlib.sha256(i.encode()).hexdigest() for i in ids),
        "fp_passwords": fingerprint(f'{u["id"]}:{u["encrypted_password"]}' for u in sorted(users, key=lambda u: u["id"])),
        "fp_emails_confirmed": fingerprint(f'{u["id"]}:{u["email"]}:{u["email_confirmed_at"]}' for u in sorted(users, key=lambda u: u["id"])),
        "fp_identities": fingerprint(f'{i["id"]}:{i["user_id"]}:{i["provider"]}:{i["provider_id"]}' for i in sorted(idents, key=lambda i: i["id"])),
        "errors": errors,
    }
    print(json.dumps(manifest, indent=2))
    if errors:
        sys.exit("ABORTADO: la validación del origen falló; no se generó SQL")

    os.makedirs(out_dir, mode=0o700, exist_ok=True)
    sql_path = os.path.join(out_dir, "auth_import.sql")
    dry_path = os.path.join(out_dir, "auth_import_dryrun.sql")
    fp_pw_sql = ("encode(sha256(convert_to(string_agg(id::text||':'||encrypted_password, ',' ORDER BY id::text), 'UTF8')), 'hex')")
    with open(os.open(sql_path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600), "w") as f:
        f.write("BEGIN;\n")
        f.write("DO $$ BEGIN\n"
                "  IF (SELECT count(*) FROM auth.users) <> 0 OR (SELECT count(*) FROM auth.identities) <> 0 THEN\n"
                "    RAISE EXCEPTION 'destino_no_vacio';\n  END IF;\nEND $$;\n")
        for u in users:
            f.write(f"INSERT INTO auth.users ({', '.join(ucols)}) VALUES ({', '.join(lit(u[c]) for c in ucols)});\n")
        for i in idents:
            f.write(f"INSERT INTO auth.identities ({', '.join(icols)}) VALUES ({', '.join(lit(i[c]) for c in icols)});\n")
        f.write("DO $$ BEGIN\n"
                f"  IF (SELECT count(*) FROM auth.users) <> {len(users)} THEN RAISE EXCEPTION 'conteo_usuarios'; END IF;\n"
                f"  IF (SELECT count(*) FROM auth.identities WHERE provider = 'email') <> {len(idents)} THEN RAISE EXCEPTION 'conteo_identidades'; END IF;\n"
                f"  IF (SELECT {fp_pw_sql} FROM auth.users) <> '{manifest['fp_passwords']}' THEN RAISE EXCEPTION 'huella_hashes'; END IF;\n"
                "END $$;\n")
        f.write("COMMIT;\n")
    with open(sql_path) as src, open(os.open(dry_path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600), "w") as dst:
        body = src.read()
        dst.write(body[: body.rindex("COMMIT;")] + "ROLLBACK;\n")
    with open(os.path.join(out_dir, "manifest.json"), "w") as f:
        json.dump(manifest, f, indent=2)
    print(f"SQL privado generado en {sql_path} (600)")


if __name__ == "__main__":
    main()
