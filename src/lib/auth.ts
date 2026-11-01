import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import { LOGIN_PATH } from "./navigation";
import { createClient } from "./supabase/server";

// getUser() valida el token con Supabase Auth (no confía solo en la cookie).
export const getCurrentUser = cache(async () => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  return { supabase, user: data.user };
});

export async function requireUser() {
  const { supabase, user } = await getCurrentUser();
  if (!user) redirect(LOGIN_PATH);
  return { supabase, user };
}

// ¿Es superadministrador global? La respuesta viene de la base (private.platform_admins) y solo
// informa sobre quien llama; no depende de metadata del usuario ni de roles de parche.
export const isPlatformAdmin = cache(async (): Promise<boolean> => {
  const { supabase, user } = await getCurrentUser();
  if (!user) return false;
  const { data, error } = await supabase.rpc("is_platform_admin");
  return !error && data === true;
});

// Guardia de servidor de La Canchita Control: sin sesión → login; sin privilegio → 404 (no se revela
// que /control existe). Cada página y cada Server Action la llama: no basta con el layout.
export async function requirePlatformAdmin() {
  const { supabase, user } = await requireUser();
  if (!(await isPlatformAdmin())) notFound();
  return { supabase, user };
}
