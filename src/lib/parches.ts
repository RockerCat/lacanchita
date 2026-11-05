import { formatCivilDay } from "./landing-tournaments";
export type MembershipRole = "owner" | "admin" | "member";
export type MembershipStatus = "active" | "disabled";

export type Membership = {
  parcheId: string;
  parcheName: string;
  role: MembershipRole;
  status: MembershipStatus;
};

export type ParcheLanding =
  | { kind: "none" }
  | { kind: "direct"; parcheId: string }
  | { kind: "choose"; memberships: Membership[] };

// Activos primero y por nombre.
export function sortMemberships(memberships: Membership[]): Membership[] {
  return [...memberships].sort(
    (a, b) =>
      Number(a.status === "disabled") - Number(b.status === "disabled") ||
      a.parcheName.localeCompare(b.parcheName, "es")
  );
}

// Destino tras iniciar sesión: con un único parche se entra directo; con varios o ninguno, a la lista.
// Nunca se asume un solo parche (la Penúltima usaba groups[0]).
export function resolveParcheLanding(memberships: Membership[]): ParcheLanding {
  if (memberships.length === 0) return { kind: "none" };
  if (memberships.length === 1) return { kind: "direct", parcheId: memberships[0].parcheId };
  return { kind: "choose", memberships: sortMemberships(memberships) };
}

export const ROLE_LABELS: Record<MembershipRole, string> = {
  owner: "Creador",
  admin: "Administrador",
  member: "Miembro",
};

export function membershipNotice(status: MembershipStatus): string | null {
  return status === "disabled"
    ? "Tu membresía en este parche está deshabilitada: puedes consultar el historial, pero no participar."
    : null;
}

export const EVENT_STATUS_LABELS: Record<string, string> = {
  draft: "En preparación",
  scheduled: "Programado",
  in_progress: "En curso",
  finished: "Finalizado",
  closed: "Cerrado oficialmente",
  cancelled: "Cancelado",
};

export function eventStatusLabel(status: string): string {
  return EVENT_STATUS_LABELS[status] ?? status;
}

// Etiqueta y contexto de un torneo en el que el parche ya participa, según el estado PERSISTIDO del torneo (la fecha
// anunciada nunca lo vuelve «en juego»). La fecha de inicio sale del primer partido real o, sin calendario, del anuncio.
export type ParticipationInfo = { label: string; badge: "green" | "gray" | "gold"; message: string; confirmed: boolean; start: string | null; startNote: string | null };

export function participationInfo(
  e: { eventStatus: string; announcedStart?: string | null; firstMatchAt?: string | null; timezone?: string | null },
): ParticipationInfo {
  if (e.eventStatus === "in_progress") {
    return { label: "En juego", badge: "green", message: "Haz tus pronósticos y consulta la clasificación de tu parche.", confirmed: false, start: null, startNote: null };
  }
  if (e.eventStatus === "finished" || e.eventStatus === "closed") {
    return { label: "Torneo finalizado", badge: "gray", message: "Consulta los resultados y la clasificación final.", confirmed: false, start: null, startNote: null };
  }
  if (e.eventStatus === "cancelled") {
    return { label: eventStatusLabel(e.eventStatus), badge: "gray", message: "Este torneo fue cancelado.", confirmed: false, start: null, startNote: null };
  }
  let start: string | null = null;
  let startNote: string | null = null;
  if (e.firstMatchAt) {
    const tz = e.timezone || "America/Bogota";
    try {
      start = new Date(e.firstMatchAt).toLocaleDateString("es-CO", { day: "numeric", month: "long", timeZone: tz });
    } catch {
      start = new Date(e.firstMatchAt).toLocaleDateString("es-CO", { day: "numeric", month: "long", timeZone: "America/Bogota" });
    }
  } else if (e.announcedStart) {
    start = formatCivilDay(e.announcedStart);
    if (start) startNote = "Fecha tentativa, sujeta a programación oficial";
  }
  return { label: "Esperando inicio", badge: "gold", message: "¡Tu parche ya está inscrito! Estamos esperando que comience el torneo.", confirmed: true, start, startNote };
}
