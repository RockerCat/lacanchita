import type { Metadata } from "next";
import Link from "next/link";
import Badge from "@/components/ui/Badge";
import { buttonClasses } from "@/components/ui/button";
import Card from "@/components/ui/Card";
import { Send, Trophy, Users } from "lucide-react";
import { redirect } from "next/navigation";
import { isPlatformAdmin, requireUser } from "@/lib/auth";
import { CONTROL_PATH, promoAction } from "@/lib/jugar";
import { getFeaturedForUser } from "@/lib/landing-data";
import TournamentPromo from "@/components/torneo/TournamentPromo";
import { getMemberships } from "@/lib/data";
import { ROLE_LABELS, sortMemberships } from "@/lib/parches";

export const metadata: Metadata = { title: "Mis parches" };

export default async function ParchesPage({ searchParams }: { searchParams: Promise<{ contrasena?: string }> }) {
  const { contrasena } = await searchParams;
  const { supabase, user } = await requireUser();
  if (await isPlatformAdmin()) redirect(CONTROL_PATH); // el superadministrador no juega: administra desde Control
  const memberships = sortMemberships(await getMemberships(supabase, user.id));
  // Mismo torneo destacado que la portada (selección compartida). Si no hay uno o falla la lectura, la página sigue igual.
  const promo = await getFeaturedForUser(supabase, user.id, memberships);
  const action = promo ? promoAction(promo.options, promo.featured.slug) : null;
  const enteredCount = promo ? promo.options.filter((o) => o.kind === "enter").length : 0;

  return (
    <section className="animate-fade-in-up">
      {contrasena === "ok" && (
        <p role="status" className="mb-4 rounded-xl border border-cancha/30 bg-cancha/[0.08] px-4 py-3 text-sm text-fg-2">Tu contraseña quedó actualizada.</p>
      )}
      {memberships.length > 0 && (
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-black text-fg">Mis parches</h1>
            <p className="mt-1 text-sm text-fg-2">Elige un parche o crea uno nuevo.</p>
          </div>
          <Link href="/parches/nuevo" className={buttonClasses({ size: "sm" })}>
            + Crear parche
          </Link>
        </div>
      )}

      {promo && memberships.length > 0 && action && (
        <div className="mt-5">
          <TournamentPromo
            t={promo.featured}
            now={new Date(promo.now)}
            variant="compact"
            extra={enteredCount > 0 ? <p className="mt-2 text-xs font-semibold text-cancha-text">{enteredCount === 1 ? "Uno de tus parches ya participa" : `${enteredCount} de tus parches ya participan`}</p> : null}
          >
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
              <Link href={action.href} className={`${buttonClasses({ size: "md" })} w-full sm:w-auto`}>{action.label}</Link>
              {action.secondary && <Link href={action.secondary.href} className="text-center text-sm font-semibold text-cancha-text hover:underline sm:px-2">{action.secondary.label}</Link>}
            </div>
          </TournamentPromo>
        </div>
      )}

      {memberships.length === 0 ? (
        <>
        <Card variant="glow-green" className="overflow-hidden p-6 sm:p-8">
          <div className="grid items-center gap-8 md:grid-cols-[1.1fr_0.9fr] md:gap-10">
            <div>
              <p aria-hidden="true" className="text-4xl">⚽</p>
              <h1 className="mt-3 text-3xl font-black leading-tight text-fg sm:text-4xl">¡Tu parche <span className="text-cancha-text">empieza aquí!</span></h1>
              <p className="mt-3 max-w-md text-base text-fg-2">Reúne a tus amigos, pronostiquen los partidos y descubran quién sabe más de fútbol.</p>
              <Link href="/parches/nuevo" className={`${buttonClasses({ size: "lg" })} mt-6 w-full sm:w-auto`}>Crear mi primer parche</Link>
              <p className="mt-4 text-sm text-fg-3">¿Ya te invitaron? Abre el enlace que te compartieron para unirte.</p>
            </div>
            <ol aria-label="Cómo empezar" className="flex flex-col gap-4">
              {[
                { icon: Users, title: "Arma tu parche", text: "Ponle nombre a tu grupo." },
                { icon: Send, title: "Invita a tus amigos", text: "Comparte el enlace por WhatsApp." },
                { icon: Trophy, title: "¡A pronosticar!", text: "Compitan por puntos y orgullo." },
              ].map(({ icon: Icon, title, text }, i) => (
                <li key={title} className="flex items-center gap-4">
                  <span aria-hidden="true" className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-cancha/15 text-cancha-text">
                    <Icon className="h-6 w-6" />
                  </span>
                  <div>
                    <p className="font-bold text-fg"><span className="mr-1.5 font-mono text-sm text-cancha-text">{i + 1}.</span>{title}</p>
                    <p className="text-sm text-fg-2">{text}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </Card>
        {promo && (
          <div className="mt-4">
            <TournamentPromo t={promo.featured} now={new Date(promo.now)} variant="compact" extra={<p className="mt-2 text-sm text-fg-2">Puedes inscribirte desde ahora, aunque todavía no haya partidos: al crear tu parche te llevamos directo a inscribirlo.</p>}>
              {action && <Link href={action.href} className={`${buttonClasses({ size: "md" })} w-full sm:w-auto`}>{action.label}</Link>}
            </TournamentPromo>
          </div>
        )}
        </>
      ) : (
        <ul className="mt-5 grid gap-3 sm:grid-cols-2">
          {memberships.map((m) => (
            <li key={m.parcheId}>
              <Link
                href={`/parches/${m.parcheId}`}
                className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-4 hover:border-cancha/40 hover:bg-surface-raised"
              >
                <span
                  aria-hidden="true"
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-cancha/15 text-sm font-black text-cancha-text"
                >
                  {m.parcheName.charAt(0).toUpperCase()}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-bold text-fg">{m.parcheName}</span>
                  <span className="mt-1 flex flex-wrap gap-1.5">
                    <Badge variant="green">{ROLE_LABELS[m.role]}</Badge>
                    {m.status === "disabled" && <Badge variant="gold">Membresía deshabilitada</Badge>}
                  </span>
                </span>
                <span aria-hidden="true" className="text-fg-3">
                  →
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
