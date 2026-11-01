// Horarios de La Canchita Control: en la base todo es un instante UTC; en la interfaz se captura y
// se muestra en la zona horaria configurada del torneo (events.timezone). La conversión es explícita
// y estricta: una hora local que no existe (salto de horario de verano) o que ocurre dos veces se
// rechaza en lugar de adivinar.

export function isValidTimeZone(tz: string): boolean {
  if (!tz || typeof tz !== "string") return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

const LOCAL_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

type Wall = { y: number; mo: number; d: number; h: number; mi: number; s: number };

function wallClock(ms: number, tz: string): Wall {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(ms));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  return { y: get("year"), mo: get("month"), d: get("day"), h: get("hour"), mi: get("minute"), s: get("second") };
}

const wallAsUtc = (w: Wall) => Date.UTC(w.y, w.mo - 1, w.d, w.h, w.mi, w.s);
// Desfase (ms) de la zona respecto a UTC en el instante dado.
const offsetAt = (ms: number, tz: string) => wallAsUtc(wallClock(ms, tz)) - Math.floor(ms / 1000) * 1000;

export type LocalToUtc =
  | { ok: true; iso: string }
  | { ok: false; reason: "format" | "timezone" | "nonexistent" | "ambiguous" };

// "AAAA-MM-DDTHH:mm" (valor de <input type="datetime-local">) en la zona `tz` → instante UTC ISO.
export function localToUtc(local: string, tz: string): LocalToUtc {
  if (!isValidTimeZone(tz)) return { ok: false, reason: "timezone" };
  const m = LOCAL_RE.exec(local.trim());
  if (!m) return { ok: false, reason: "format" };
  const [y, mo, d, h, mi] = m.slice(1).map(Number);
  const target = Date.UTC(y, mo - 1, d, h, mi, 0);
  const check = new Date(target);
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== mo - 1 || check.getUTCDate() !== d || h > 23 || mi > 59) {
    return { ok: false, reason: "format" };
  }
  // Candidatos: instantes cuyo reloj de pared en `tz` coincide exactamente con el objetivo.
  const offsets = new Set([offsetAt(target - 36 * 3600_000, tz), offsetAt(target + 36 * 3600_000, tz)]);
  const hits = [...offsets]
    .map((o) => target - o)
    .filter((candidate) => wallAsUtc(wallClock(candidate, tz)) === target);
  const unique = [...new Set(hits)];
  if (unique.length === 0) return { ok: false, reason: "nonexistent" };
  if (unique.length > 1) return { ok: false, reason: "ambiguous" };
  return { ok: true, iso: new Date(unique[0]).toISOString() };
}

// Instante UTC → valor para <input type="datetime-local"> en la zona `tz`.
export function utcToLocalInput(iso: string | null | undefined, tz: string): string {
  if (!iso || !isValidTimeZone(tz)) return "";
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return "";
  const w = wallClock(ms, tz);
  const p = (n: number, l = 2) => String(n).padStart(l, "0");
  return `${p(w.y, 4)}-${p(w.mo)}-${p(w.d)}T${p(w.h)}:${p(w.mi)}`;
}

// Texto legible en la zona del torneo, con la zona a la vista.
export function formatInZone(iso: string | null | undefined, tz: string): string {
  if (!iso) return "—";
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return "—";
  const zone = isValidTimeZone(tz) ? tz : "UTC";
  return new Intl.DateTimeFormat("es", {
    timeZone: zone,
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(new Date(ms));
}

export const TIME_ERROR_MESSAGES: Record<string, string> = {
  format: "La fecha y hora no tienen un formato válido.",
  timezone: "La zona horaria del torneo no es válida.",
  nonexistent: "Esa hora no existe en la zona del torneo (salto de horario). Elige otra.",
  ambiguous: "Esa hora ocurre dos veces en la zona del torneo (cambio de horario). Elige otra.",
};

// Zonas habituales para el selector (las demás se pueden escribir: se valida igual).
export function commonTimeZones(): string[] {
  const fixed = [
    "America/Bogota",
    "America/Mexico_City",
    "America/Lima",
    "America/Santiago",
    "America/Argentina/Buenos_Aires",
    "America/Sao_Paulo",
    "America/New_York",
    "America/Chicago",
    "America/Los_Angeles",
    "Europe/Madrid",
    "Europe/London",
    "UTC",
  ];
  return fixed.filter(isValidTimeZone);
}
