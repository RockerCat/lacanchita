import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Landing from "@/components/landing/Landing";
import { getCurrentUser } from "@/lib/auth";
import { getLandingTournaments } from "@/lib/landing-data";
import { afterLoginPath, safeNextPath } from "@/lib/navigation";

// "next" puede contener el token de una invitación: no enviarlo como Referer. La entrada a /login muestra la portada
// con el modal de inicio de sesión abierto (la ruta se conserva para enlaces guardados y redirecciones).
export const metadata: Metadata = { title: "Iniciar sesión", referrer: "no-referrer", robots: { index: false, follow: false } };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string | string[]; aviso?: string | string[] }> }) {
  const params = await searchParams;
  const next = safeNextPath(Array.isArray(params.next) ? params.next[0] : params.next);
  const confirmFailed = (Array.isArray(params.aviso) ? params.aviso[0] : params.aviso) === "confirmacion";
  const { user } = await getCurrentUser();
  if (user) redirect(afterLoginPath(next));
  return (
    <Landing
      tournaments={await getLandingTournaments()} now={new Date().toISOString()}
      initialMode="login"
      next={next}
      notice={confirmFailed ? "No pudimos completar la verificación desde este enlace (puede haber vencido o abrirse en otro dispositivo). Si ya confirmaste tu correo, inicia sesión; si estabas recuperando tu contraseña, pide un enlace nuevo." : null}
    />
  );
}
