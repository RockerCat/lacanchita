// Torneos que muestra la portada pública. La lista llega de get_landing_tournaments() (ya filtrada en la base:
// autorizados por el superadministrador, publicados, con partidos, sin historial sellado y con algo por jugar). Aquí
// solo se decide cuál es el protagonista y cómo se describe, sin inventar nada.

export type LandingTournament = {
  slug: string;
  name: string;
  status: "scheduled" | "in_progress";
  timezone: string;
  firstMatchAt: string | null;
  nextMatchAt: string | null;
  lastMatchAt: string | null;
  hasLive: boolean;
  isManual: boolean;
  announcedStart?: string | null; // fecha civil (YYYY-MM-DD) anunciada de forma tentativa; NO es la del primer partido
  blurb?: string | null;
  illustrationPath?: string | null; // ruta en el bucket event-illustrations (opcional)
};

type Row = { slug: string; name: string; status: string; timezone?: string | null; first_match_at: string | null; next_match_at: string | null; last_match_at: string | null; has_live: boolean | null; is_manual: boolean | null; announced_start_date?: string | null; blurb?: string | null; illustration_path?: string | null };

export function toLandingTournaments(rows: Row[] | null | undefined): LandingTournament[] {
  return (rows ?? [])
    .filter((r) => r.status === "scheduled" || r.status === "in_progress")
    .map((r) => ({
      slug: r.slug, name: r.name, status: r.status as LandingTournament["status"], timezone: r.timezone || DEFAULT_TZ, firstMatchAt: r.first_match_at, nextMatchAt: r.next_match_at,
      lastMatchAt: r.last_match_at, hasLive: Boolean(r.has_live), isManual: Boolean(r.is_manual),
      announcedStart: r.announced_start_date ?? null, blurb: r.blurb ?? null, illustrationPath: r.illustration_path ?? null,
    }));
}

export const DEFAULT_TZ = "America/Bogota";
const t = (iso: string | null) => (iso ? new Date(iso).getTime() : Number.POSITIVE_INFINITY);

/** Un torneo admite inscripciones solo publicado y sin terminar (misma regla que add_event_to_parche). */
const enrollmentOpen = (x: LandingTournament): boolean => x.status === "scheduled" || x.status === "in_progress";

// Fecha civil de hoy en la zona del torneo (YYYY-MM-DD).
function todayIn(timeZone: string, now: Date): string {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  } catch {
    return new Intl.DateTimeFormat("en-CA", { timeZone: DEFAULT_TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  }
}

/**
 * «Próximo» = programado que aún no empezó: su primer partido es futuro o, sin calendario, su fecha anunciada no pasó
 * (o no hay ninguna fecha). «En curso» = en juego oficialmente o programado cuyo primer partido ya pasó.
 */
export function isUpcoming(x: LandingTournament, now: Date = new Date()): boolean {
  if (x.status !== "scheduled") return false;
  if (x.firstMatchAt) return new Date(x.firstMatchAt).getTime() > now.getTime();
  if (x.announcedStart) return x.announcedStart >= todayIn(x.timezone, now);
  return true;
}

/** 1 = próximo con inscripciones abiertas · 2 = en curso · 3 = próximo que todavía no admite inscripciones. */
export function promoPriority(x: LandingTournament, now: Date = new Date()): 1 | 2 | 3 {
  if (isUpcoming(x, now)) return enrollmentOpen(x) ? 1 : 3;
  return 2;
}

// Referencia de orden dentro de una prioridad: fecha prevista (primer partido o fecha anunciada) o próximo partido.
function sortKey(x: LandingTournament, now: Date): number {
  if (isUpcoming(x, now)) return x.firstMatchAt ? t(x.firstMatchAt) : x.announcedStart ? Date.parse(`${x.announcedStart}T00:00:00Z`) : Number.POSITIVE_INFINITY;
  return t(x.nextMatchAt);
}

// Orden automático determinista: prioridad, luego fecha prevista, luego nombre y slug.
export function autoOrder(list: LandingTournament[], now: Date = new Date()): LandingTournament[] {
  return [...list].sort((a, b) => promoPriority(a, now) - promoPriority(b, now) || sortKey(a, now) - sortKey(b, now) || a.name.localeCompare(b.name, "es") || a.slug.localeCompare(b.slug));
}

/** Protagonista (el destacado manual si sigue siendo elegible; si no, el primero del orden automático) y los demás. */
export function pickFeatured(list: LandingTournament[], now: Date = new Date()): { featured: LandingTournament | null; others: LandingTournament[] } {
  const ordered = autoOrder(list, now);
  const manual = ordered.find((x) => x.isManual) ?? null;
  const featured = manual ?? ordered[0] ?? null;
  return { featured, others: ordered.filter((x) => x !== featured) };
}

// Fecha en la zona horaria del TORNEO (un partido a las 23:30 de Bogotá no es del día siguiente por ser UTC).
function formatDay(iso: string, timeZone: string): string {
  const opts = { day: "numeric", month: "long" } as const;
  try {
    return new Date(iso).toLocaleDateString("es-CO", { ...opts, timeZone });
  } catch {
    return new Date(iso).toLocaleDateString("es-CO", { ...opts, timeZone: DEFAULT_TZ });
  }
}

export type TournamentDescription = {
  // Situación deportiva verificable: «Próximamente» solo con inicio futuro; «En juego» solo si el torneo está oficialmente en curso.
  headline: string | null;
  // Disponibilidad: la base solo devuelve torneos publicados, sin terminar y con partidos por jugar.
  enrollment: string;
  // «Empieza el …» (inicio futuro) o «Próximo partido: …» (partido futuro). Nunca una fecha pasada como si fuera futura.
  detail: string | null;
  // Etiqueta de la promoción y aviso discreto (solo con fecha anunciada y sin calendario oficial).
  label: string;
  note: string | null;
};

// Fecha civil anunciada (YYYY-MM-DD) → «14 de noviembre»; sin zona horaria para que no se corra de día.
export function formatCivilDay(ymd: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return null;
  const d = new Date(`${ymd}T12:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString("es-CO", { day: "numeric", month: "long", timeZone: "UTC" });
}

/**
 * Describe un torneo según su estado administrativo y las fechas reales, comparadas con `now`.
 *  - programado con inicio futuro → «Próximamente» · «Empieza el …»;
 *  - en curso (oficialmente) → «En juego» · «Próximo partido: …» si lo hay;
 *  - programado cuyo inicio ya pasó (aún no declarado en curso) → sin titular de estado ni «Empieza…»; solo el próximo
 *    partido si existe.
 */
export function describeTournament(x: LandingTournament, now: Date = new Date()): TournamentDescription {
  const nowMs = now.getTime();
  const future = (iso: string | null): iso is string => iso !== null && new Date(iso).getTime() > nowMs;
  const nextDetail = future(x.nextMatchAt) ? `Próximo partido: ${formatDay(x.nextMatchAt, x.timezone)}` : null;
  const enrollment = enrollmentOpen(x) ? "Inscripciones abiertas" : "Inscripciones próximamente";
  const upcoming = isUpcoming(x, now);
  const label = upcoming ? "Próximo torneo" : "Torneo en juego";
  if (x.status === "in_progress") return { headline: x.hasLive ? "En juego ahora" : "En juego", enrollment, detail: nextDetail, label, note: null };
  if (future(x.firstMatchAt)) return { headline: "Próximamente", enrollment, detail: `Empieza el ${formatDay(x.firstMatchAt, x.timezone)}`, label, note: null };
  // Sin calendario oficial: la fecha anunciada es tentativa y se rotula como tal.
  const announced = upcoming && !x.firstMatchAt && x.announcedStart ? formatCivilDay(x.announcedStart) : null;
  if (announced) return { headline: "Próximamente", enrollment, detail: `Inicio previsto: ${announced}`, label, note: "Sujeto a programación oficial" };
  if (upcoming && !x.firstMatchAt) return { headline: "Próximamente", enrollment, detail: null, label, note: null };
  return { headline: null, enrollment, detail: nextDetail, label, note: null };
}

/** Texto de una línea para listas: «titular · inscripciones · detalle», omitiendo lo que no aplique. */
export function describeTournamentLine(x: LandingTournament, now: Date = new Date()): string {
  const d = describeTournament(x, now);
  return [d.headline, d.enrollment, d.detail].filter(Boolean).join(" · ");
}

export const playPath = (slug: string): string => `/jugar/${encodeURIComponent(slug)}`;
