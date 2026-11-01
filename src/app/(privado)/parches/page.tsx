import type { Metadata } from "next";
import Link from "next/link";
import Badge from "@/components/ui/Badge";
import { buttonClasses } from "@/components/ui/button";
import Card from "@/components/ui/Card";
import { redirect } from "next/navigation";
import { isPlatformAdmin, requireUser } from "@/lib/auth";
import { CONTROL_PATH } from "@/lib/jugar";
import { getMemberships } from "@/lib/data";
import { ROLE_LABELS, sortMemberships } from "@/lib/parches";

export const metadata: Metadata = { title: "Mis parches" };

export default async function ParchesPage({ searchParams }: { searchParams: Promise<{ contrasena?: string }> }) {
  const { contrasena } = await searchParams;
  const { supabase, user } = await requireUser();
  if (await isPlatformAdmin()) redirect(CONTROL_PATH); // el superadministrador no juega: administra desde Control
  const memberships = sortMemberships(await getMemberships(supabase, user.id));

  return (
    <section className="animate-fade-in-up">
      {contrasena === "ok" && (
        <p role="status" className="mb-4 rounded-xl border border-cancha/30 bg-cancha/[0.08] px-4 py-3 text-sm text-fg-2">Tu contraseña quedó actualizada.</p>
      )}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-fg">Mis parches</h1>
          <p className="mt-1 text-sm text-fg-2">
            {memberships.length > 0 ? "Elige un parche o crea uno nuevo." : "Crea tu primer parche e invita a tus amigos."}
          </p>
        </div>
        <Link href="/parches/nuevo" className={buttonClasses({ size: "sm" })}>
          + Crear parche
        </Link>
      </div>

      {memberships.length === 0 ? (
        <div className="mt-5 flex flex-col gap-4">
          <Card variant="glow-green" className="p-6">
            <p aria-hidden="true" className="text-3xl">⚽</p>
            <h2 className="mt-3 text-lg font-bold text-fg">¡Bienvenido a La Canchita!</h2>
            <p className="mt-2 text-sm text-fg-2">
              Un parche es tu grupo de amigos, familiares o compañeros con quienes compites haciendo pronósticos. Todavía no estás en ninguno.
            </p>
            <ol className="mt-4 flex flex-col gap-2 text-sm text-fg-2">
              <li><strong className="text-fg">1.</strong> Crea tu parche y ponle nombre.</li>
              <li><strong className="text-fg">2.</strong> Invita a los tuyos con un enlace.</li>
              <li><strong className="text-fg">3.</strong> Elige un torneo disponible y empieza a pronosticar.</li>
            </ol>
            <Link href="/parches/nuevo" className={`${buttonClasses({ fullWidth: true })} mt-5`}>Crear mi parche</Link>
          </Card>
          <Card variant="dashed" className="p-5 text-center">
            <h2 className="font-bold text-fg">¿Te invitaron a un parche?</h2>
            <p className="mt-1 text-sm text-fg-2">Abre el enlace de invitación que te compartieron (por ejemplo, desde WhatsApp) y te unirás con un clic.</p>
          </Card>
        </div>
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
