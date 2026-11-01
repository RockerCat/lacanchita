import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import HistoryView from "@/components/historial/HistoryView";
import { requireUser } from "@/lib/auth";
import { getHistory, getMembership } from "@/lib/data";

export const metadata: Metadata = { title: "Clasificación" };

// Historial sellado de un torneo (corte histórico o cierre oficial). Solo lectura.
export default async function HistoryPage({ params }: { params: Promise<{ parcheId: string; parcheEventId: string }> }) {
  const { parcheId, parcheEventId } = await params;
  const { supabase, user } = await requireUser();
  // Sin membresía visible por RLS no se revela si el parche o el torneo existen.
  const membership = await getMembership(supabase, user.id, parcheId);
  if (!membership) notFound();
  const history = await getHistory(supabase, parcheId, parcheEventId);
  if (!history) notFound();

  return (
    <div className="flex flex-col gap-5 animate-fade-in-up">
      <Link href={`/parches/${parcheId}`} className="text-sm font-semibold text-fg-2 hover:text-cancha-text">
        ← {membership.parcheName}
      </Link>
      <HistoryView history={history} parcheName={membership.parcheName} currentUserId={user.id} celebrationKey={`${parcheId}:${parcheEventId}`} />
    </div>
  );
}
