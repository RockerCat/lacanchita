import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Landing from "@/components/landing/Landing";
import { getCurrentUser } from "@/lib/auth";
import { getLandingTournaments } from "@/lib/landing-data";
import { afterLoginPath, safeNextPath } from "@/lib/navigation";

export const metadata: Metadata = { title: "Crear cuenta", referrer: "no-referrer", robots: { index: false, follow: false } };

export default async function SignupPage({ searchParams }: { searchParams: Promise<{ next?: string | string[] }> }) {
  const params = await searchParams;
  const next = safeNextPath(Array.isArray(params.next) ? params.next[0] : params.next);
  const { user } = await getCurrentUser();
  if (user) redirect(afterLoginPath(next));
  return <Landing initialMode="signup" next={next} tournaments={await getLandingTournaments()} now={new Date().toISOString()} />;
}
