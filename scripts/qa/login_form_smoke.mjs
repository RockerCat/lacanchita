// Uso: node scripts/qa/login_form_smoke.mjs [http://127.0.0.1:3000]  (con la app en marcha)
// Envía el formulario de login como lo haría un navegador sin JavaScript, con una cuenta INEXISTENTE.
const base = process.argv[2] ?? "http://127.0.0.1:3000";
const html = await (await fetch(`${base}/login?next=%2Fparches`)).text();
const form = html.match(/<form[^>]*>([\s\S]*?)<\/form>/)[0];
const fd = new FormData();
for (const m of form.matchAll(/<input([^>]*)>/g)) {
  const name = m[1].match(/name="([^"]*)"/)?.[1];
  if (!name) continue;
  const value = m[1].match(/value="([^"]*)"/)?.[1] ?? "";
  fd.append(name.replaceAll("&quot;", '"'), value.replaceAll("&quot;", '"'));
}
fd.set("email", "qa-no-existe@example.invalid");
fd.set("password", "contrasena-ficticia-de-prueba");
const action = form.match(/action="([^"]*)"/)?.[1] ?? "/login";
const res = await fetch(new URL(action.replaceAll("&amp;", "&"), `${base}/login?next=%2Fparches`), { method: "POST", body: fd, redirect: "manual" });
const body = await res.text();
console.log("status", res.status, "location", res.headers.get("location"));
console.log("set-cookie sesión:", (res.headers.get("set-cookie") ?? "").includes("auth-token"));
console.log("mensaje:", body.match(/role="alert"[^>]*>([^<]*)</)?.[1] ?? "(sin mensaje)");
console.log("email conservado:", body.includes('value="qa-no-existe@example.invalid"'));
const empty = new FormData(); for (const [k, v] of fd) if (k !== "email" && k !== "password") empty.append(k, v);
const res2 = await fetch(new URL(action.replaceAll("&amp;", "&"), `${base}/login`), { method: "POST", body: empty, redirect: "manual" });
console.log("vacío:", (await res2.text()).match(/role="alert"[^>]*>([^<]*)</)?.[1]);
