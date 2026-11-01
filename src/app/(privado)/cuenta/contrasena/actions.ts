"use server";

import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { updatePasswordErrorMessage, validateNewPassword } from "@/lib/registro";

export type PasswordState = { error: string | null };

// Cambia la contraseña de la sesión actual (la que dejó el enlace de recuperación). No toca nada más de la cuenta.
export async function updatePasswordAction(_prev: PasswordState, formData: FormData): Promise<PasswordState> {
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  const invalid = validateNewPassword(password, confirm);
  if (invalid) return { error: invalid };
  const { supabase } = await requireUser();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: updatePasswordErrorMessage(error) };
  redirect("/parches?contrasena=ok");
}
