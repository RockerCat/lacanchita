import { createClient } from "@/lib/supabase/server";
import type { Client } from "./data";
import { pickFeatured, toLandingTournaments, type LandingTournament } from "./landing-tournaments";
import { playOptions, type PlayOption } from "./jugar";
import type { Membership } from "./parches";

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

export type FeaturedForUser = { featured: LandingTournament; options: PlayOption[]; now: string };

// Torneo destacado para /parches: la MISMA selección que la portada (pickFeatured) y qué puede hacer cada parche de la
// persona con él. Si algo falla devuelve null: la página sigue funcionando sin la promoción.
export async function getFeaturedForUser(supabase: Client, userId: string, memberships: Membership[]): Promise<FeaturedForUser | null> {
  try {
    const now = new Date();
    const { data, error } = await supabase.rpc("get_landing_tournaments");
    if (error) return null;
    const { featured } = pickFeatured(toLandingTournaments(data), now);
    if (!featured) return null;
    let enrolled = new Map<string, string>();
    if (memberships.length > 0) {
      const { data: ev } = await supabase.from("events").select("id").eq("slug", featured.slug).maybeSingle();
      if (!ev) return null;
      const { data: links } = await supabase.from("parche_events").select("id, parche_id").eq("event_id", ev.id).in("parche_id", memberships.map((m) => m.parcheId));
      enrolled = new Map((links ?? []).map((l) => [l.parche_id, l.id]));
    }
    return { featured, options: playOptions(memberships, enrolled, userId), now: now.toISOString() };
  } catch {
    return null;
  }
}
