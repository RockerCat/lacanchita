// Traduce los códigos que lanzan las funciones de la base (RAISE EXCEPTION '<código>').
const MESSAGES: Record<string, string> = {
  not_authenticated: "Tu sesión terminó. Vuelve a iniciar sesión.",
  not_authorized: "No tienes permiso para hacer esto en este parche.",
  invalid_name: "El nombre debe tener entre 2 y 50 caracteres.",
  invalid_request: "No pudimos procesar el formulario. Recarga la página e inténtalo de nuevo.",
  invalid_status: "Estado no válido.",
  invalid_role: "Rol no válido.",
  cannot_change_self: "No puedes cambiar tu propia membresía.",
  member_not_found: "Esa persona ya no pertenece al parche.",
  owner_protected: "El creador del parche no se puede deshabilitar ni cambiar de rol.",
  owner_cannot_leave: "Eres el creador del parche: no puedes salir de él.",
  last_admin: "Eres la única persona que administra este parche: no puedes salir todavía.",
  event_not_found: "Ese torneo no está disponible.",
  event_not_open: "Este torneo ya no está abierto para incorporar parches.",
  already_enrolled: "Tu parche ya participa en este torneo.",
  min_members: "Tu parche necesita al menos 2 participantes activos para jugar un torneo. Invita a un amigo y vuelve a intentarlo.",
  member_disabled: "Reactiva a esta persona antes de hacerla administradora.",
};

export function parcheErrorMessage(error: { message?: string | null } | null | undefined): string {
  const code = error?.message?.trim() ?? "";
  return MESSAGES[code] ?? "No pudimos completar la operación. Inténtalo de nuevo.";
}
