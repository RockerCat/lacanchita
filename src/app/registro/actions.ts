"use server";

import { redirect } from "next/navigation";
import { afterLoginPath, safeNextPath } from "@/lib/navigation";
import { requestOrigin } from "@/lib/origin";
import { signupErrorMessage, validateSignup } from "@/lib/registro";
import { createClient } from "@/lib/supabase/server";

export type SignupState = { error: string | null; sentTo: string | null; name: string; email: string };

// Registro con Supabase Auth respetando su configuración vigente (confirmación de correo activa).
// El enlace del correo vuelve a /auth/confirmar y de ahí al destino original (p. ej. la invitación).
export async function signupAction(_prev: SignupState, formData: FormData): Promise<SignupState> {
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const next = safeNextPath(formData.get("next"));
  const invalid = validateSignup({ name, email, password });
  if (invalid) return { error: invalid, sentTo: null, name, email };

  const supabase = await createClient();
  const origin = await requestOrigin();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { username: name },
      emailRedirectTo: `${origin}/auth/confirmar?next=${encodeURIComponent(next)}`,
    },
  });
  if (error) return { error: signupErrorMessage(error), sentTo: null, name, email };
  // Si el proyecto no exigiera confirmación, ya habría sesión.
  if (data.session) redirect(afterLoginPath(next));
  // Supabase no revela si el correo ya existía: el mensaje es el mismo en ambos casos.
  return { error: null, sentTo: email, name, email };
}
