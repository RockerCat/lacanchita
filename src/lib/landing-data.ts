import { createClient } from "@/lib/supabase/server";
import { toLandingTournaments, type LandingTournament } from "./landing-tournaments";

// Lectura pública de la portada: una sola llamada a la función de proyección mínima (permitida a visitantes).
// Si falla, la portada sigue mostrando el estado informativo (nunca un torneo inventado).
export async function getLandingTournaments(): Promise<LandingTournament[]> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("get_landing_tournaments");
    if (error) return [];
    return toLandingTournaments(data);
  } catch {
    return [];
  }
}
