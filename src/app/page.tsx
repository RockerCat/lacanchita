import type { Metadata } from "next";
import Landing from "@/components/landing/Landing";
import { getCurrentUser, isPlatformAdmin } from "@/lib/auth";
import { LANDING_DESCRIPTION, LANDING_TITLE } from "@/lib/landing";
import { getLandingTournaments } from "@/lib/landing-data";
import { displayNameOf } from "@/lib/users";

// Portada pública (indexable). También se ve con sesión (el logo enlaza aquí): el encabezado muestra la cuenta y el CTA
// lleva a /inicio (parche único o Mis parches). Nunca se crea un parche automáticamente.
export const metadata: Metadata = {
  title: { absolute: LANDING_TITLE },
  description: LANDING_DESCRIPTION,
  robots: { index: true, follow: true },
  openGraph: { title: LANDING_TITLE, description: LANDING_DESCRIPTION, type: "website", locale: "es_CO", siteName: "La Canchita" },
  twitter: { card: "summary", title: LANDING_TITLE, description: LANDING_DESCRIPTION },
};

export default async function Home() {
  const [{ user }, tournaments, superadmin] = await Promise.all([getCurrentUser(), getLandingTournaments(), isPlatformAdmin()]);
  return <Landing user={user ? { name: displayNameOf(user), superadmin } : null} tournaments={tournaments} now={new Date().toISOString()} />;
}
