// Aplica las plantillas de supabase/templates/ (y sus asuntos) al proyecto Supabase de La Canchita.
// Solo envía los 12 campos mailer_subjects_* / mailer_templates_*_content (PATCH parcial): no toca SMTP ni otros ajustes.
//   node scripts/auth-templates/apply.mjs          # simulacro: muestra qué enviaría y el estado actual
//   node scripts/auth-templates/apply.mjs --apply  # aplica
// Token: SUPABASE_ACCESS_TOKEN, o el de la CLI de Supabase en el llavero de macOS (nunca se imprime).
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");
const REF = "cfzxentitxytnvvumfpv";
const apply = process.argv.includes("--apply");

const MAP = [
  ["confirmation", "confirm-signup", "Confirma tu correo y entra a La Canchita ⚽"],
  ["recovery", "reset-password", "Recupera tu contraseña | La Canchita"],
  ["invite", "invite-user", "Te invitaron a La Canchita ⚽"],
  ["email_change", "change-email", "Confirma tu nuevo correo | La Canchita"],
  ["magic_link", "magic-link", "Tu acceso a La Canchita"],
  ["reauthentication", "reauthentication", "Verifica tu identidad | La Canchita"],
];

function token() {
  if (process.env.SUPABASE_ACCESS_TOKEN) return process.env.SUPABASE_ACCESS_TOKEN;
  let raw = execFileSync("security", ["find-generic-password", "-s", "Supabase CLI", "-a", "supabase", "-w"], { encoding: "utf8" }).trim();
  if (raw.startsWith("go-keyring-base64:")) raw = Buffer.from(raw.slice(18), "base64").toString("utf8");
  return raw;
}

const payload = {};
for (const [key, file, subject] of MAP) {
  payload[`mailer_subjects_${key}`] = subject;
  payload[`mailer_templates_${key}_content`] = readFileSync(path.join(root, "supabase", "templates", `${file}.html`), "utf8");
}

const headers = { Authorization: `Bearer ${token()}`, "Content-Type": "application/json" };
const url = `https://api.supabase.com/v1/projects/${REF}/config/auth`;
const get = async () => {
  const r = await fetch(url, { headers });
  if (!r.ok) throw new Error(`GET config/auth → ${r.status}`);
  return r.json();
};

const before = await get();
console.log("SMTP actual:", before.smtp_host, before.smtp_port, before.smtp_user, "·", before.smtp_admin_email);
if (!apply) {
  for (const [key] of MAP) console.log(`- ${key}: asunto actual «${before[`mailer_subjects_${key}`]}»`);
  console.log("Simulacro: nada aplicado (usa --apply).");
  process.exit(0);
}
const r = await fetch(url, { method: "PATCH", headers, body: JSON.stringify(payload) });
if (!r.ok) throw new Error(`PATCH config/auth → ${r.status}`);
const after = await get();
let ok = true;
for (const [key] of MAP) {
  const s = after[`mailer_subjects_${key}`] === payload[`mailer_subjects_${key}`];
  const t = after[`mailer_templates_${key}_content`] === payload[`mailer_templates_${key}_content`];
  ok &&= s && t;
  console.log(`- ${key}: asunto ${s ? "ok" : "DIFERENTE"} · plantilla ${t ? "ok" : "DIFERENTE"}`);
}
const smtpSame = ["smtp_host", "smtp_port", "smtp_user", "smtp_admin_email", "smtp_sender_name"].every((k) => before[k] === after[k]);
console.log("SMTP sin cambios:", smtpSame);
if (!ok || !smtpSame) process.exit(1);
