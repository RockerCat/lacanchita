// Traduce los códigos que lanzan las funciones del motor (RAISE EXCEPTION '<código>'). Los mensajes conservan
// el sentido de los originales de La Penúltima (savePredictionAction) y añaden los del modelo multiparche.
const MESSAGES: Record<string, string> = {
  not_authenticated: "Tu sesión terminó. Vuelve a iniciar sesión.",
  superadmin_cannot_predict: "La administración global de La Canchita no participa como jugador.",
  not_enrolled: "Tu parche no participa en este torneo o no perteneces a él.",
  not_member: "No perteneces a este parche.",
  member_disabled: "Tu membresía en este parche está deshabilitada.",
  enrollment_inactive: "La participación de tu parche en este torneo ya no está activa.",
  event_not_open: "Este torneo no está abierto para pronosticar.",
  match_not_found: "El partido no existe.",
  match_not_in_event: "Ese partido no pertenece a este torneo.",
  match_not_open: "Pronósticos cerrados para este partido.",
  match_started: "El partido ya comenzó. No se pueden guardar pronósticos.",
  invalid_scores: "Marcador inválido. Cada valor debe estar entre 0 y 30.",
  predictions_hidden: "Los pronósticos de los demás se muestran cuando empieza el partido.",
};

export function predictionErrorMessage(error: { message?: string | null } | null | undefined): string {
  const code = error?.message?.trim() ?? "";
  return MESSAGES[code] ?? "No se pudo guardar tu pronóstico. Inténtalo de nuevo.";
}
