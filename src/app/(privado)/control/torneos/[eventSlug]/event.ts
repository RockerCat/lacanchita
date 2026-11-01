import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import { requirePlatformAdmin } from "@/lib/auth";
import { getControlEvent } from "@/lib/control/data";
import { syncDueMatches } from "@/lib/juego/data";

// Torneo de la petición (con guardia de superadministrador). La ruta canónica usa el slug; un enlace
// antiguo con UUID se redirige a ella conservando la subruta. 404 si no existe.
export const loadEvent = cache(async (ref: string, sub = "") => {
  const { supabase, user } = await requirePlatformAdmin();
  const event = await getControlEvent(supabase, ref);
  if (!event) notFound();
  if (ref !== event.slug) redirect(`/control/torneos/${event.slug}${sub}`);
  // Sincronización perezosa (mark_due_matches_live del original): abrir Control también inicia los partidos vencidos.
  await syncDueMatches(supabase);
  return { supabase, user, event };
});
