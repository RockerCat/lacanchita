"use server";

import { redirect } from "next/navigation";
import { loginErrorMessage } from "@/lib/auth-errors";
import { requestOrigin } from "@/lib/origin";
import { resetErrorMessage, validateEmail } from "@/lib/registro";
import { afterLoginPath, LOGIN_PATH, safeNextPath } from "@/lib/navigation";
import { createClient } from "@/lib/supabase/server";

export type LoginState = { error: string | null; email: string };

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const next = safeNextPath(formData.get("next"));

  if (!email || !password) {
    return { error: "Escribe tu correo y tu contraseña.", email };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: loginErrorMessage(error), email };

  redirect(afterLoginPath(next));
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut({ scope: "local" });
  redirect(LOGIN_PATH);
}

export type ForgotState = { error: string | null; sentTo: string | null; email: string };

// Recuperación de contraseña con Supabase Auth. La respuesta es la misma exista o no la cuenta (no revela correos).
// El enlace del correo vuelve a /auth/confirmar y de ahí a la pantalla para elegir la nueva contraseña.
export async function requestPasswordReset(_prev: ForgotState, formData: FormData): Promise<ForgotState> {
  const email = String(formData.get("email") ?? "").trim();
  const invalid = validateEmail(email);
  if (invalid) return { error: invalid, sentTo: null, email };
  const supabase = await createClient();
  const origin = await requestOrigin();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/auth/confirmar?next=${encodeURIComponent("/cuenta/contrasena")}`,
  });
  if (error && (error.status === 429 || error.code?.startsWith("over_") || (error.status ?? 0) >= 500)) {
    return { error: resetErrorMessage(error), sentTo: null, email };
  }
  return { error: null, sentTo: email, email };
}
