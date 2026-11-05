import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import ParcheArt from "@/components/parches/ParcheArt";
import ParcheNav from "@/components/parches/ParcheNav";
import Badge from "@/components/ui/Badge";
import { buttonClasses } from "@/components/ui/button";
import Card from "@/components/ui/Card";
import { requireUser } from "@/lib/auth";
import EnrollEvents from "@/components/parches/EnrollEvents";
import { InviteLinkControls, InviteProvider } from "@/components/parches/InviteLink";
import { getAvailableEvents, getMembership, getOpenInvitation, getParcheEvents, getParcheMembers } from "@/lib/data";
import { eventStatusLabel, membershipNotice, ROLE_LABELS } from "@/lib/parches";
import { canManageParche } from "@/lib/permissions";
import { displayNameOf } from "@/lib/users";

export const metadata: Metadata = { title: "Parche" };

export default async function ParchePage({ params }: { params: Promise<{ parcheId: string }> }) {
  const { parcheId } = await params;
  const { supabase, user } = await requireUser();
  // Sin membresía visible por RLS no se revela si el parche existe.
  const membership = await getMembership(supabase, user.id, parcheId);
  if (!membership) notFound();
  const manager = canManageParche({ userId: user.id, role: membership.role, status: membership.status });
  const [events, available, members, invitation] = await Promise.all([
    getParcheEvents(supabase, parcheId),
    manager ? getAvailableEvents(supabase, parcheId) : Promise.resolve([]),
    manager ? getParcheMembers(supabase, parcheId) : Promise.resolve([]),
    manager ? getOpenInvitation(supabase, parcheId) : Promise.resolve(null),
  ]);
  // Integrantes reales (membresías activas), no invitaciones pendientes.
  const solo = members.filter((m) => m.status === "active").length <= 1;
  const notice = membershipNotice(membership.status);

  return (
    <InviteProvider parcheId={parcheId} invitation={manager ? invitation : null}>
    <div className="flex flex-col gap-6 animate-fade-in-up">
      <section className="flex items-start gap-4">
        <span
          aria-hidden="true"
          className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-cancha/15 text-2xl font-black text-cancha-text"
        >
          {membership.parcheName.charAt(0).toUpperCase()}
        </span>
        <div className="min-w-0">
          <p className="font-mono text-[11px] uppercase tracking-widest text-fg-3">Parche</p>
          <h1 className="text-2xl font-black text-fg sm:text-3xl">{membership.parcheName}</h1>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-fg-2">
            Estás como <span className="font-semibold text-fg">{displayNameOf(user)}</span>
            <Badge variant="green">{ROLE_LABELS[membership.role]}</Badge>
          </p>
        </div>
      </section>

      <ParcheNav parcheId={parcheId} active="resumen" />

      {notice && (
        <p role="note" className="rounded-xl border border-gold/25 bg-gold/[0.08] px-4 py-3 text-sm text-fg-2">
          {notice}
        </p>
      )}

      {manager && events.length === 0 && (
        <Card variant="glow-green" className="flex flex-col overflow-hidden sm:flex-row sm:items-center">
          <div className="p-5 sm:flex-1 sm:p-6">
            <h2 className="text-base font-bold text-fg">Tu parche está listo. ¿Qué sigue?</h2>
            <ol className="mt-3 flex flex-col gap-3 text-sm text-fg-2">
              <li className="flex flex-col gap-2">
                <span><strong className="text-fg">1. Invita a tus amigos:</strong> crea un enlace y compártelo para que se unan a tu parche.</span>
                <InviteLinkControls idPrefix="resumen" />
              </li>
              <li>
                <strong className="text-fg">2. Elige un torneo:</strong>{" "}
                {solo
                  ? "cuando tengas al menos 2 participantes activos, podrás jugar con tu parche."
                  : available.length > 0
                    ? "incorpóralo más abajo, en «Incorporar un torneo»."
                    : "cuando haya un torneo disponible podrás incorporarlo aquí."}
              </li>
            </ol>
          </div>
          <ParcheArt />
        </Card>
      )}

      {!manager && membership.status === "active" && events.length === 0 && (
        <Card variant="glow-green" className="flex flex-col overflow-hidden sm:flex-row sm:items-center">
          <div className="p-5 sm:flex-1 sm:p-6">
            <h2 className="text-base font-bold text-fg">¡Ya eres parte del parche!</h2>
            <p className="mt-2 text-sm text-fg-2">
              Prepárate para competir con tus amigos. Cuando tu parche participe en un torneo, podrás hacer tus pronósticos y seguir la clasificación.
            </p>
          </div>
          <ParcheArt />
        </Card>
      )}

      <section aria-labelledby="torneos">
        <h2 id="torneos" className="mb-3 text-lg font-bold text-fg">
          Torneos
        </h2>
        {events.length === 0 ? (
          <Card variant="dashed" className="p-5 text-center">
            <p className="text-sm text-fg-3">Este parche aún no participa en ningún torneo.</p>
          </Card>
        ) : (
          <ul className="flex flex-col gap-3">
            {events.map((e) => (
              <li key={e.id}>
                <Card className="p-4 sm:p-5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-base font-bold text-fg">{e.eventName}</p>
                    <Badge variant={e.eventStatus === "in_progress" ? "green" : "gray"}>{eventStatusLabel(e.eventStatus)}</Badge>
                  </div>
                  {e.snapshot ? (
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                      <p className="text-sm text-fg-2">
                        {e.snapshot.kind === "final_close"
                          ? "Clasificación final oficial disponible."
                          : "Historial disponible: corte histórico, no cierre oficial."}
                      </p>
                      <Link href={`/parches/${parcheId}/torneos/${e.id}`} className={buttonClasses({ size: "sm" })}>
                        Ver clasificación
                      </Link>
                    </div>
                  ) : (
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                      <p className="text-sm text-fg-2">Pronostica los partidos y sigue la clasificación de tu parche.</p>
                      <Link href={`/parches/${parcheId}/torneos/${e.id}`} className={buttonClasses({ size: "sm" })}>
                        Entrar al torneo
                      </Link>
                    </div>
                  )}
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>

      {manager && <EnrollEvents parcheId={parcheId} events={available} solo={solo} />}
    </div>
    </InviteProvider>
  );
}
