export type SignupInput = { name: string; email: string; password: string };

export function validateSignup(input: SignupInput): string | null {
  const name = input.name.trim();
  if (name.length < 2 || name.length > 30) return "Tu nombre debe tener entre 2 y 30 caracteres.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email.trim())) return "Escribe un correo válido.";
  if (input.password.length < 8) return "La contraseña debe tener al menos 8 caracteres.";
  if (input.password.length > 72) return "La contraseña es demasiado larga (máximo 72 caracteres).";
  return null;
}

type AuthErrorLike = { code?: string | null; status?: number | null } | null | undefined;

export function signupErrorMessage(error: AuthErrorLike): string {
  switch (error?.code) {
    case "weak_password":
      return "La contraseña es demasiado débil. Usa al menos 8 caracteres combinando letras y números.";
    case "email_address_invalid":
      return "Ese correo no es válido.";
    case "over_email_send_rate_limit":
    case "over_request_rate_limit":
      return "Se enviaron demasiados correos. Espera unos minutos e inténtalo de nuevo.";
    case "signup_disabled":
      return "El registro está cerrado en este momento.";
    case "user_already_exists":
    case "email_exists":
      return "Ya existe una cuenta con ese correo. Inicia sesión.";
    default:
      return error?.status === 429
        ? "Demasiados intentos. Espera unos minutos."
        : "No pudimos crear tu cuenta. Inténtalo de nuevo.";
  }
}

export function validateEmail(email: string): string | null {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ? null : "Escribe un correo válido.";
}

export function validateNewPassword(password: string, confirm?: string): string | null {
  if (password.length < 8) return "La contraseña debe tener al menos 8 caracteres.";
  if (password.length > 72) return "La contraseña es demasiado larga (máximo 72 caracteres).";
  if (confirm !== undefined && confirm !== password) return "Las contraseñas no coinciden.";
  return null;
}

export function resetErrorMessage(error: AuthErrorLike): string {
  if (error?.code === "over_email_send_rate_limit" || error?.code === "over_request_rate_limit" || error?.status === 429) {
    return "Se enviaron demasiados correos. Espera unos minutos e inténtalo de nuevo.";
  }
  return "No pudimos enviar el correo ahora. Inténtalo de nuevo en unos minutos.";
}

export function updatePasswordErrorMessage(error: AuthErrorLike): string {
  switch (error?.code) {
    case "same_password":
      return "Elige una contraseña distinta a la anterior.";
    case "weak_password":
      return "La contraseña es demasiado débil. Usa al menos 8 caracteres combinando letras y números.";
    case "session_not_found":
    case "not_authenticated":
      return "El enlace venció. Pide uno nuevo desde «Olvidé mi contraseña».";
    default:
      return "No pudimos cambiar tu contraseña. Inténtalo de nuevo.";
  }
}
