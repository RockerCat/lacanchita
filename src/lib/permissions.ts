// Qué controles mostrar en la interfaz. Es solo presentación: la base de datos vuelve a validar
// cada operación (funciones set_parche_member_*, create_parche_invitation, leave_parche).
export type Role = "owner" | "admin" | "member";
export type Status = "active" | "disabled";
export type Viewer = { userId: string; role: Role; status: Status };
export type Member = { userId: string; role: Role; status: Status };

export function canManageParche(viewer: Viewer): boolean {
  return viewer.status === "active" && (viewer.role === "owner" || viewer.role === "admin");
}

export type MemberActions = { toggleStatus: boolean; toggleRole: boolean };

export function memberActions(viewer: Viewer, target: Member): MemberActions {
  const none = { toggleStatus: false, toggleRole: false };
  if (!canManageParche(viewer) || viewer.userId === target.userId || target.role === "owner") return none;
  const isOwner = viewer.role === "owner";
  return {
    // Los admins gestionan miembros; solo el creador gestiona a otros admins.
    toggleStatus: target.role === "member" || isOwner,
    // Solo el creador cambia roles, y solo promueve a miembros activos.
    toggleRole: isOwner && (target.role === "admin" || target.status === "active"),
  };
}

// El creador no puede salir; el resto sí (la base impide dejar el parche sin administración).
export function canLeave(viewer: Viewer): boolean {
  return viewer.role !== "owner";
}
