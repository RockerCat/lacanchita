import { redirect } from "next/navigation";
import { isPlatformAdmin, requireUser } from "@/lib/auth";
import { CONTROL_PATH } from "@/lib/jugar";
import { getMemberships } from "@/lib/data";
import { HOME_PATH } from "@/lib/navigation";
import { resolveParcheLanding } from "@/lib/parches";

// Destino tras iniciar sesión sin un destino concreto: con un único parche entra directo; si no, a Mis parches.
// /parches nunca redirige solo, para que siempre se pueda volver a la lista y crear otro parche.
export default async function Inicio() {
  const { supabase, user } = await requireUser();
  // El superadministrador administra desde Control: nunca entra al flujo de jugador.
  if (await isPlatformAdmin()) redirect(CONTROL_PATH);
  const landing = resolveParcheLanding(await getMemberships(supabase, user.id));
  redirect(landing.kind === "direct" ? `/parches/${landing.parcheId}` : HOME_PATH);
}
