#!/usr/bin/env python3
"""
Prueba real de inicio de sesión contra Supabase Auth del proyecto lacanchita.

- Sirve un formulario SOLO en http://127.0.0.1:8765 (no se expone a la red).
- La contraseña se envía únicamente a https://cfzxentitxytnvvumfpv.supabase.co/auth/v1/token.
- No registra peticiones, no guarda la contraseña ni los tokens; la sesión de prueba
  se revoca inmediatamente con /auth/v1/logout.
- Obtiene la clave *publishable* del proyecto vía Supabase CLI sin mostrarla.
- Escribe en --out-dir/login_result.json solo el resultado (sin email, UUID, tokens).

Uso (lo ejecuta Alex, no Claude):
  python3 -I scripts/auth-migration/login_test_server.py --manifest <out-dir>/manifest.json
Luego abrir http://127.0.0.1:8765, introducir email y contraseña originales. Ctrl+C para salir.
"""
import argparse, base64, hashlib, html, json, os, subprocess, sys, urllib.error, urllib.parse, urllib.request
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, HTTPServer

PROJECT_REF = "cfzxentitxytnvvumfpv"
AUTH_URL = f"https://{PROJECT_REF}.supabase.co/auth/v1"
REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
MAX_ATTEMPTS = 5

FORM = """<!doctype html><meta charset="utf-8"><title>Prueba de login · lacanchita</title>
<style>body{font-family:system-ui;max-width:420px;margin:48px auto;padding:0 16px;background:#0a0a12;color:#f1f5f9}
input,button{width:100%;padding:10px;margin:6px 0;border-radius:8px;border:1px solid #2a2a45;background:#18182a;color:#f1f5f9}
button{background:#00c85a;color:#0a0a12;font-weight:600}.r{padding:12px;border-radius:8px;background:#18182a;margin-top:16px}</style>
<h2>Prueba de login · {ref}</h2>
<p>La contraseña se envía solo a Supabase Auth de <b>{ref}</b> y no se guarda.</p>
<form method="post" autocomplete="off"><input name="email" type="email" placeholder="Email" required>
<input name="password" type="password" placeholder="Contraseña original" required><button>Probar inicio de sesión</button></form>
{result}"""


def publishable_key():
    linked = open(os.path.join(REPO, "supabase", ".temp", "project-ref")).read().strip()
    if linked != PROJECT_REF:
        sys.exit(f"ABORTADO: el proyecto vinculado no es {PROJECT_REF}")
    out = subprocess.run(["npx", "supabase", "projects", "api-keys", "--project-ref", PROJECT_REF, "-o", "json"],
                         cwd=REPO, capture_output=True, text=True, check=True).stdout
    keys = [k["api_key"] for k in json.loads(out) if k.get("type") == "publishable"]
    if not keys:
        sys.exit("ABORTADO: no se encontró clave publishable")
    return keys[0]


def jwt_claims(token):
    payload = token.split(".")[1]
    return json.loads(base64.urlsafe_b64decode(payload + "=" * (-len(payload) % 4)))


def post(path, apikey, body=None, bearer=None):
    req = urllib.request.Request(f"{AUTH_URL}{path}", method="POST",
                                 data=json.dumps(body or {}).encode(),
                                 headers={"apikey": apikey, "Content-Type": "application/json",
                                          **({"Authorization": f"Bearer {bearer}"} if bearer else {})})
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            return r.status, json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read() or b"{}")
        except ValueError:
            return e.code, {}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--manifest", required=True)
    a = ap.parse_args()
    manifest_path = os.path.abspath(os.path.expanduser(a.manifest))
    original_ids = set(json.load(open(manifest_path))["user_id_sha256"])
    result_path = os.path.join(os.path.dirname(manifest_path), "login_result.json")
    apikey = publishable_key()
    state = {"attempts": 0}

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *args):  # no registrar peticiones
            pass

        def page(self, result=""):
            body = FORM.replace("{ref}", PROJECT_REF).replace("{result}", result).encode()
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(body)

        def do_GET(self):
            self.page()

        def do_POST(self):
            if state["attempts"] >= MAX_ATTEMPTS:
                return self.page('<div class="r">Límite de intentos alcanzado. Reinicia el servidor.</div>')
            state["attempts"] += 1
            form = urllib.parse.parse_qs(self.rfile.read(int(self.headers.get("Content-Length", 0))).decode())
            email = (form.get("email") or [""])[0]
            password = (form.get("password") or [""])[0]
            status, data = post("/token?grant_type=password", apikey, {"email": email, "password": password})
            del password, form
            outcome = {"timestamp": datetime.now(timezone.utc).isoformat(), "project_ref": PROJECT_REF,
                       "attempt": state["attempts"], "http_status": status}
            if status == 200 and data.get("access_token"):
                claims = jwt_claims(data["access_token"])
                uid = (data.get("user") or {}).get("id", "")
                outcome.update(login_ok=True,
                               uuid_original=hashlib.sha256(uid.encode()).hexdigest() in original_ids,
                               token_sub_matches_user=claims.get("sub") == uid,
                               issuer_is_lacanchita=claims.get("iss") == AUTH_URL,
                               provider=((data.get("user") or {}).get("app_metadata") or {}).get("provider"))
                lo_status, _ = post("/logout?scope=local", apikey, bearer=data["access_token"])
                outcome["test_session_revoked"] = lo_status == 204
            else:
                outcome.update(login_ok=False, error_code=data.get("error_code") or data.get("error"))
            data = None
            with open(os.open(result_path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600), "w") as f:
                json.dump(outcome, f, indent=2)
            rows = "".join(f"<div>{html.escape(k)}: <b>{html.escape(str(v))}</b></div>" for k, v in outcome.items())
            self.page(f'<div class="r">{rows}</div>')

    print(f"Abre http://127.0.0.1:8765 · resultado en {result_path} · Ctrl+C para salir")
    HTTPServer(("127.0.0.1", 8765), Handler).serve_forever()


if __name__ == "__main__":
    main()
