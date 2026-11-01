import type { Metadata } from "next";
import { notFound } from "next/navigation";
import InvitePanel from "@/components/parches/InvitePanel";
import LeaveParche from "@/components/parches/LeaveParche";
import MemberList from "@/components/parches/MemberList";
import ParcheNav from "@/components/parches/ParcheNav";
import { requireUser } from "@/lib/auth";
import { getMembership, getOpenInvitation, getParcheMembers } from "@/lib/data";
import { membershipNotice } from "@/lib/parches";
import { canLeave, canManageParche, type Viewer } from "@/lib/permissions";

export const metadata: Metadata = { title: "Participantes" };

export default async function ParticipantsPage({ params }: { params: Promise<{ parcheId: string }> }) {
  const { parcheId } = await params;
  const { supabase, user } = await requireUser();
  const membership = await getMembership(supabase, user.id, parcheId);
  if (!membership) notFound();

  const viewer: Viewer = { userId: user.id, role: membership.role, status: membership.status };
  const manager = canManageParche(viewer);
  const [members, open] = await Promise.all([
    getParcheMembers(supabase, parcheId),
    manager ? getOpenInvitation(supabase, parcheId) : Promise.resolve(null),
  ]);
  const active = members.filter((m) => m.status === "active").length;
  const notice = membershipNotice(membership.status);

  return (
    <div className="flex flex-col gap-5 animate-fade-in-up">
      <div>
        <p className="font-mono text-[11px] uppercase tracking-widest text-fg-3">Parche</p>
        <h1 className="text-2xl font-black text-fg">{membership.parcheName}</h1>
      </div>
      <ParcheNav parcheId={parcheId} active="participantes" />
      {notice && (
        <p role="note" className="rounded-xl border border-gold/25 bg-gold/[0.08] px-4 py-3 text-sm text-fg-2">
          {notice}
        </p>
      )}

      {manager && <InvitePanel parcheId={parcheId} parcheName={membership.parcheName} open={open} />}

      <section aria-labelledby="participantes">
        <div className="mb-3 flex items-end justify-between gap-2">
          <h2 id="participantes" className="text-lg font-bold text-fg">
            Participantes
          </h2>
          <p className="text-sm text-fg-2">
            {members.length} en total · {active} activos
          </p>
        </div>
        <MemberList parcheId={parcheId} members={members} viewer={viewer} />
        {manager && (
          <p className="mt-2 text-xs text-fg-3">
            {viewer.role === "owner"
              ? "Como creador puedes deshabilitar o reactivar a cualquiera y nombrar administradores."
              : "Como administrador puedes deshabilitar o reactivar a los miembros."}{" "}
            Deshabilitar no borra la cuenta ni el historial.
          </p>
        )}
      </section>

      {canLeave(viewer) && <LeaveParche parcheId={parcheId} parcheName={membership.parcheName} />}
    </div>
  );
}
