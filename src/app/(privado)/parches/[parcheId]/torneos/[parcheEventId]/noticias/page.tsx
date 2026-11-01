import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { requireGame } from "@/lib/juego/queries";
import { getNewsFeed, NEWS_PAGE_SIZE } from "@/lib/news/data";
import { formatNewsDate } from "@/lib/news/format";

export const metadata: Metadata = { title: "Noticias" };

// Noticias del torneo (recuperadas de La Penúltima): las deportivas del torneo y las de ESTE parche, de la más
// reciente a la más antigua; por partido se muestra una sola. Contexto siempre parche × torneo.
export default async function NoticiasPage({
  params,
  searchParams,
}: {
  params: Promise<{ parcheId: string; parcheEventId: string }>;
  searchParams: Promise<{ antes?: string }>;
}) {
  const ctx = await requireGame(params);
  if (ctx.historical) redirect(`${ctx.base}/historial`);
  const { antes } = await searchParams;
  const before = antes && !Number.isNaN(Date.parse(antes)) ? new Date(antes).toISOString() : null;
  const { supabase } = await getCurrentUser();
  const news = await getNewsFeed(supabase, ctx.parcheEventId, NEWS_PAGE_SIZE + 1, before);
  const hasMore = news.length > NEWS_PAGE_SIZE;
  const items = news.slice(0, NEWS_PAGE_SIZE);

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
      <div className="relative rounded-2xl overflow-hidden h-[220px] sm:h-[280px] bg-black">
        <Image src="/img/corresponsal_lapenultima.png" alt="La Penúltima News" fill priority sizes="(max-width: 672px) 100vw, 672px" className="object-cover" />
      </div>

      <div>
        <h1 className="text-xl font-black text-[#f1f5f9]">Noticias</h1>
        <p className="text-sm text-[#64748b] mt-1 leading-relaxed">
          Las últimas novedades de {ctx.eventName}: resultados, movimientos en la tabla de {ctx.membership.parcheName}, líderes y marcadores exactos.
        </p>
      </div>

      {items.length === 0 ? (
        <div className="bg-[#11111c] border border-[#1e1e35] rounded-2xl p-10 text-center">
          <p className="text-2xl mb-2">📰</p>
          <p className="text-sm text-[#64748b]">Aún no hay noticias.</p>
          <p className="text-xs text-[#475569] mt-1">Aparecerán aquí cuando finalice el primer partido.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <Link key={item.id} href={`${ctx.base}/noticias/${item.id}`} className="block">
              <div className="bg-[#11111c] border border-[#1e1e35] rounded-2xl p-4 hover:border-[#2a2a45] transition-colors flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-[#f1f5f9] mb-1">{item.title}</p>
                  <p className="text-xs text-[#94a3b8] mb-2.5 leading-relaxed">{item.summary}</p>
                  <p className="text-[10px] text-[#475569] font-mono">{formatNewsDate(item.created_at, ctx.tz, { day: "numeric", month: "long", year: "numeric" })}</p>
                </div>
                <ChevronRight size={16} className="text-[#2a2a45] shrink-0 mt-0.5" />
              </div>
            </Link>
          ))}
          {hasMore && (
            <Link
              href={`${ctx.base}/noticias?antes=${encodeURIComponent(items[items.length - 1].created_at)}`}
              className="block text-center text-xs font-semibold text-[#94a3b8] hover:text-[#f1f5f9] py-2"
            >
              Ver noticias anteriores
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
