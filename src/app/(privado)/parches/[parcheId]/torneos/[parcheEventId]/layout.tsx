import Link from "next/link";
import { notFound } from "next/navigation";
import { BookOpen, Newspaper, Trophy } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { JuegoProvider } from "@/lib/juego/context";
import { getGameContext } from "@/lib/juego/queries";
import JuegoNav from "@/components/juego/layout/JuegoNav";
import { isTournamentOver } from "@/lib/podio";

// Cabecera de contexto del jugador: parche + torneo, regreso a «Mis parches» y navegación del torneo.
// Los torneos con historial sellado (corte histórico del Mundial 2026) conservan su vista propia y no se envuelven.
export default async function TorneoLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ parcheId: string; parcheEventId: string }>;
}) {
  const { parcheId, parcheEventId } = await params;
  const ctx = await getGameContext(parcheId, parcheEventId);
  if (!ctx) notFound();
  if (ctx.historical) return <>{children}</>;

  const { supabase } = await getCurrentUser();
  const [{ count }, { data: koStages }] = await Promise.all([
    supabase.from("matches").select("id", { count: "exact", head: true }).eq("event_id", ctx.eventId).eq("status", "live"),
    supabase.from("event_stages").select("id").eq("event_id", ctx.eventId).eq("is_knockout", true),
  ]);
  // «Copa» solo se ofrece si el torneo tiene partidos de eliminatoria (un torneo sin cuadro no muestra una Copa vacía).
  const koIds = (koStages ?? []).map((s) => s.id);
  const hasKnockout = koIds.length > 0 && ((await supabase.from("matches").select("id", { count: "exact", head: true }).eq("event_id", ctx.eventId).in("stage_id", koIds)).count ?? 0) > 0;
  const over = isTournamentOver(ctx.eventStatus);

  return (
    <JuegoProvider
      value={{ parcheId: ctx.parcheId, parcheEventId: ctx.parcheEventId, eventId: ctx.eventId, tz: ctx.tz, base: ctx.base, userId: ctx.user.id, canPlay: ctx.canPlay }}
    >
      <div data-theme="dark" className="-mx-4 -my-6 min-h-[70vh] bg-[#0a0a12] pb-24 text-[#f1f5f9] sm:mx-0 sm:my-0 sm:rounded-2xl md:pb-6">
        <div className="mx-auto flex max-w-2xl items-center gap-2 px-4 pt-4 pb-2 text-xs">
          <Link href="/parches" className="shrink-0 text-[#64748b] hover:text-[#94a3b8]">← Mis parches</Link>
          <span className="text-[#2a2a45]">/</span>
          <Link href={`/parches/${ctx.parcheId}`} className="truncate font-semibold text-[#94a3b8] hover:text-[#f1f5f9]">{ctx.membership.parcheName}</Link>
          <span className="text-[#2a2a45]">·</span>
          <span className="truncate text-[#64748b]">{ctx.eventName}</span>
          <span className="ml-auto flex shrink-0 items-center gap-3 md:hidden">
            {hasKnockout && (
              <Link href={`${ctx.base}/copa`} className="inline-flex items-center gap-1 text-[#64748b] hover:text-[#94a3b8]">
                <Trophy size={12} /> Copa
              </Link>
            )}
            <Link href={`${ctx.base}/noticias`} className="inline-flex items-center gap-1 text-[#64748b] hover:text-[#94a3b8]">
              <Newspaper size={12} /> Noticias
            </Link>
            <Link href={`${ctx.base}/rules`} className="inline-flex items-center gap-1 text-[#64748b] hover:text-[#94a3b8]">
              <BookOpen size={12} /> Reglas
            </Link>
          </span>
        </div>
        {!ctx.canPlay && (
          <p className="mx-auto mb-2 max-w-2xl px-4 text-[11px] text-[#f59e0b]">
            {ctx.isSuperadmin
              ? "Eres superadministrador: puedes ver el torneo, pero no pronosticar ni aparecer en la tabla."
              : ctx.membership.status !== "active"
                ? "Tu participación está deshabilitada: solo puedes consultar."
                : "Este torneo ya no admite pronósticos."}
          </p>
        )}
        <JuegoNav hasLiveMatch={(count ?? 0) > 0} podium={over} copa={hasKnockout} />
        {children}
      </div>
    </JuegoProvider>
  );
}
