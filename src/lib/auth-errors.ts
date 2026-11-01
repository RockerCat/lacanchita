type AuthErrorLike = { code?: string | null; status?: number | null; message?: string | null } | null | undefined;

// Traduce errores de Supabase Auth a mensajes claros, sin revelar si el correo existe.
export function loginErrorMessage(error: AuthErrorLike): string {
  const code = error?.code ?? "";
  if (code === "invalid_credentials" || code === "user_not_found") {
    return "Correo o contraseña incorrectos. Revisa los datos e inténtalo de nuevo.";
  }
  if (code === "email_not_confirmed") {
    return "Tu correo aún no está confirmado. Abre el enlace que te enviamos cuando creaste la cuenta y vuelve a iniciar sesión.";
  }
  if (code === "user_banned") {
    return "Esta cuenta no tiene acceso en este momento.";
  }
  if (code === "over_request_rate_limit" || code === "over_email_send_rate_limit" || error?.status === 429) {
    return "Demasiados intentos seguidos. Espera unos minutos antes de volver a intentarlo.";
  }
  if (error?.status && error.status >= 500) {
    return "El servicio de acceso no responde. Inténtalo de nuevo en unos minutos.";
  }
  return "No pudimos iniciar sesión. Inténtalo de nuevo.";
}

// Fallo de red o respuesta inesperada al llamar a una acción de servidor desde el navegador.
export const NETWORK_ERROR_MESSAGE = "No pudimos conectar con el servidor. Revisa tu conexión e inténtalo de nuevo.";

/** ¿Es la excepción interna con la que Next.js implementa redirect()/notFound()? Esas deben seguir su curso. */
export function isNextControlFlow(error: unknown): boolean {
  const digest = (error as { digest?: unknown } | null)?.digest;
  return typeof digest === "string" && (digest.startsWith("NEXT_REDIRECT") || digest.startsWith("NEXT_HTTP_ERROR_FALLBACK") || digest === "NEXT_NOT_FOUND");
}
