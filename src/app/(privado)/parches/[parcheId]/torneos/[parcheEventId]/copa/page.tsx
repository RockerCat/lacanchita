import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { loadCopaModel } from "@/lib/copa/data";
import { requireGame } from "@/lib/juego/queries";
import { syncDueMatches } from "@/lib/juego/data";
import CaminoTabs from "@/components/copa/CaminoTabs";

export const metadata: Metadata = { title: "Camino a la Copa" };

// Camino a la Copa (/copa de La Penúltima) dentro del contexto parche × torneo. El contexto determina el torneo, la
// zona horaria y el acceso; los resultados salen de los partidos oficiales del torneo (compartidos por todos los
// parches). Un torneo sin eliminatorias no tiene Copa: la ruta responde 404 y la pestaña no se ofrece.
export default async function CopaPage({ params }: { params: Promise<{ parcheId: string; parcheEventId: string }> }) {
  const ctx = await requireGame(params);
  if (ctx.historical) redirect(`${ctx.base}/historial`);
  const { supabase } = await getCurrentUser();
  await syncDueMatches(supabase);
  const model = await loadCopaModel(supabase, ctx.eventId);
  if (model.kind === "none") notFound();

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
      <div>
        <h1 className="text-2xl font-black text-[#f1f5f9]">Camino a la Copa</h1>
        <p className="text-sm text-[#94a3b8] mt-0.5">{ctx.eventName}</p>
      </div>
      <CaminoTabs model={model} tz={ctx.tz} />
    </div>
  );
}
