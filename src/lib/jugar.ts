import type { Membership } from "@/lib/parches";
import { canManageParche } from "@/lib/permissions";

// «Jugar este torneo»: qué puede hacer la persona con cada uno de sus parches. Nunca se inscribe nada automáticamente;
// la inscripción reutiliza la acción existente (solo owner/admin activos) con una confirmación explícita.
export type PlayOption =
  | { kind: "enter"; parcheId: string; parcheName: string; parcheEventId: string } // el parche ya participa
  | { kind: "enroll"; parcheId: string; parcheName: string } // administra el parche y aún no participa
  | { kind: "ask_admin"; parcheId: string; parcheName: string } // miembro: debe pedirlo a quien administra
  | { kind: "disabled"; parcheId: string; parcheName: string }; // membresía deshabilitada: solo consulta

export function playOptions(memberships: Membership[], enrolled: Map<string, string>, userId: string): PlayOption[] {
  return [...memberships]
    .sort((a, b) => a.parcheName.localeCompare(b.parcheName, "es"))
    .map((m): PlayOption => {
      const base = { parcheId: m.parcheId, parcheName: m.parcheName };
      const parcheEventId = enrolled.get(m.parcheId);
      if (m.status !== "active") return { kind: "disabled", ...base };
      if (parcheEventId) return { kind: "enter", ...base, parcheEventId };
      return canManageParche({ userId, role: m.role, status: m.status }) ? { kind: "enroll", ...base } : { kind: "ask_admin", ...base };
    });
}

/** Un torneo admite nuevas inscripciones solo publicado y sin terminar. */
export const eventAcceptsEnrollment = (status: string): boolean => status === "scheduled" || status === "in_progress";

// Retorno tras crear un parche desde «Jugar este torneo»: solo una ruta interna /jugar/<slug> (nunca otra cosa, nunca
// un dominio): evita redirecciones abiertas. Cualquier otro valor se ignora (comportamiento normal).
export function safeReturnToPlay(value: unknown): string | null {
  return typeof value === "string" && /^\/jugar\/[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value) ? value : null;
}

/** Destino de entrada según el rol real del servidor: el superadministrador administra desde Control; no juega. */
export const CONTROL_PATH = "/control";
export const roleHome = (superadmin: boolean, playerHome: string): string => (superadmin ? CONTROL_PATH : playerHome);
