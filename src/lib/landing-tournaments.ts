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
};

type Row = { slug: string; name: string; status: string; timezone?: string | null; first_match_at: string | null; next_match_at: string | null; last_match_at: string | null; has_live: boolean | null; is_manual: boolean | null };

export function toLandingTournaments(rows: Row[] | null | undefined): LandingTournament[] {
  return (rows ?? [])
    .filter((r) => r.status === "scheduled" || r.status === "in_progress")
    .map((r) => ({
      slug: r.slug, name: r.name, status: r.status as LandingTournament["status"], timezone: r.timezone || DEFAULT_TZ, firstMatchAt: r.first_match_at, nextMatchAt: r.next_match_at,
      lastMatchAt: r.last_match_at, hasLive: Boolean(r.has_live), isManual: Boolean(r.is_manual),
    }));
}

export const DEFAULT_TZ = "America/Bogota";
const t = (iso: string | null) => (iso ? new Date(iso).getTime() : Number.POSITIVE_INFINITY);

// Orden automático determinista: en juego (por el próximo partido más cercano) antes que los próximos (por su primer
// partido); empates por nombre y slug.
export function autoOrder(list: LandingTournament[]): LandingTournament[] {
  return [...list].sort((a, b) => {
    if (a.status !== b.status) return a.status === "in_progress" ? -1 : 1;
    const da = a.status === "in_progress" ? t(a.nextMatchAt) : t(a.firstMatchAt);
    const db = b.status === "in_progress" ? t(b.nextMatchAt) : t(b.firstMatchAt);
    return da - db || a.name.localeCompare(b.name, "es") || a.slug.localeCompare(b.slug);
  });
}

/** Protagonista (el destacado manual si sigue siendo elegible; si no, el primero del orden automático) y los demás. */
export function pickFeatured(list: LandingTournament[]): { featured: LandingTournament | null; others: LandingTournament[] } {
  const ordered = autoOrder(list);
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
};

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
  const enrollment = "Inscripciones abiertas";
  if (x.status === "in_progress") return { headline: x.hasLive ? "En juego ahora" : "En juego", enrollment, detail: nextDetail };
  if (future(x.firstMatchAt)) return { headline: "Próximamente", enrollment, detail: `Empieza el ${formatDay(x.firstMatchAt, x.timezone)}` };
  return { headline: null, enrollment, detail: nextDetail };
}

/** Texto de una línea para listas: «titular · inscripciones · detalle», omitiendo lo que no aplique. */
export function describeTournamentLine(x: LandingTournament, now: Date = new Date()): string {
  const d = describeTournament(x, now);
  return [d.headline, d.enrollment, d.detail].filter(Boolean).join(" · ");
}

export const playPath = (slug: string): string => `/jugar/${encodeURIComponent(slug)}`;
