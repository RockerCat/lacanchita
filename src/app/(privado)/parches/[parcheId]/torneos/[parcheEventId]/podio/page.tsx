import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getParcheLeaderboard, requireGame } from "@/lib/juego/queries";
import PodiumView from "@/components/podio/PodiumView";
import { isTournamentOver } from "@/lib/podio";

export const metadata: Metadata = { title: "Podio" };

// Podio del parche en un torneo oficialmente finalizado (PodiumView de La Penúltima). La clasificación es la oficial
// de ESTE parche y torneo (sin superadministradores ni deshabilitados). Antes del cierre real redirige a En Vivo,
// como el original; los torneos con historial sellado conservan su vista histórica.
export default async function PodioPage({ params }: { params: Promise<{ parcheId: string; parcheEventId: string }> }) {
  const ctx = await requireGame(params);
  if (ctx.historical) redirect(`${ctx.base}/historial`);
  if (!isTournamentOver(ctx.eventStatus)) redirect(`${ctx.base}/en-vivo`);
  const leaderboard = await getParcheLeaderboard(ctx);

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <PodiumView leaderboard={leaderboard} currentUserId={ctx.user.id} parcheName={ctx.community.name} celebrationKey={`${ctx.parcheId}:${ctx.parcheEventId}`} />
    </div>
  );
}
