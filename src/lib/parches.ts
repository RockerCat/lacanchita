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
