export const INVITATION_PREFIX = "/invitacion/";
const TOKEN_RE = /^[A-Za-z0-9_-]{20,100}$/;

export function isValidTokenFormat(token: string): boolean {
  return TOKEN_RE.test(token);
}

export function invitationPath(token: string): string {
  return `${INVITATION_PREFIX}${token}`;
}

export function invitationUrl(origin: string, token: string): string {
  return `${origin.replace(/\/+$/, "")}${invitationPath(token)}`;
}

export function isInvitationPath(path: string | null | undefined): boolean {
  if (!path || !path.startsWith(INVITATION_PREFIX)) return false;
  return isValidTokenFormat(path.slice(INVITATION_PREFIX.length).split(/[?#]/)[0]);
}

export type InvitationStatus =
  | "valid"
  | "joined"
  | "already_member"
  | "disabled_member"
  | "revoked"
  | "expired"
  | "exhausted"
  | "not_found";

export function invitationMessage(status: InvitationStatus): { title: string; body: string } {
  switch (status) {
    case "valid":
      return { title: "Te invitaron a un parche", body: "Únete para ver el parche, sus participantes y sus torneos." };
    case "joined":
      return { title: "¡Ya estás en el parche!", body: "Te uniste correctamente." };
    case "already_member":
      return { title: "Ya eres parte de este parche", body: "No necesitas hacer nada más." };
    case "disabled_member":
      return {
        title: "Tu membresía está deshabilitada",
        body: "Ya perteneces a este parche, pero un administrador deshabilitó tu participación. Pídele que la reactive.",
      };
    case "revoked":
      return { title: "Este enlace ya no funciona", body: "Un administrador lo desactivó. Pídele un enlace nuevo." };
    case "expired":
      return { title: "Este enlace venció", body: "Los enlaces de invitación duran 7 días. Pide uno nuevo a quien te invitó." };
    case "exhausted":
      return { title: "Este enlace ya se usó", body: "Alcanzó su límite de usos. Pide uno nuevo a quien te invitó." };
    default:
      return { title: "Invitación no encontrada", body: "Revisa que copiaste el enlace completo o pide uno nuevo." };
  }
}

export function whatsappShareUrl(url: string, parcheName: string): string {
  return `https://wa.me/?text=${encodeURIComponent(`¡Únete a mi parche "${parcheName}" en La Canchita! ${url}`)}`;
}
