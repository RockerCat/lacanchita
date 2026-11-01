import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { isUuid } from "@/lib/data";
import { requireGame } from "@/lib/juego/queries";
import { getNewsItem } from "@/lib/news/data";
import { parseBlocks } from "@/lib/news/blocks";
import { formatNewsDate } from "@/lib/news/format";
import ShareNewsButton from "@/components/news/ShareNewsButton";

export const metadata: Metadata = { title: "Noticia" };

// Detalle de una noticia (recuperado de La Penúltima): portada, fecha y título, bloques con etiqueta, compartir y
// enlace discreto al partido. Solo se abre con la inscripción a la que pertenece (o si es la compartida del torneo).
export default async function NoticiaDetailPage({ params }: { params: Promise<{ parcheId: string; parcheEventId: string; newsId: string }> }) {
  const ctx = await requireGame(params);
  if (ctx.historical) redirect(`${ctx.base}/historial`);
  const { newsId } = await params;
  if (!isUuid(newsId)) notFound();
  const { supabase } = await getCurrentUser();
  const item = await getNewsItem(supabase, ctx.parcheEventId, newsId);
  if (!item) notFound();
  const blocks = parseBlocks(item.content);

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
      <Link href={`${ctx.base}/noticias`} className="text-xs text-[#64748b] hover:text-[#94a3b8] transition-colors inline-flex items-center gap-1">
        ← Noticias
      </Link>

      <div className="relative rounded-2xl overflow-hidden h-[220px] sm:h-[280px] bg-black">
        <Image src="/img/corresponsal_lapenultima.png" alt="La Penúltima News" fill priority sizes="(max-width: 672px) 100vw, 672px" className="object-cover" />
      </div>

      <div>
        <p className="text-[10px] text-[#475569] font-mono uppercase tracking-widest mb-2">
          {formatNewsDate(item.created_at, ctx.tz, { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })}
        </p>
        <h1 className="text-2xl font-black text-[#f1f5f9] leading-tight">{item.title}</h1>
      </div>

      {blocks.length > 0 ? (
        <div className="space-y-3">
          {blocks.map((block, i) => (
            <div key={i} className="bg-[#11111c] border border-[#1e1e35] rounded-2xl px-4 py-3.5">
              {block.label && <p className="text-[10px] text-[#475569] font-mono uppercase tracking-widest mb-1.5">{block.label}</p>}
              <p className="text-sm text-[#cbd5e1] leading-relaxed whitespace-pre-line">{block.text}</p>
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-[#11111c] border border-[#1e1e35] rounded-2xl px-4 py-3.5">
          <p className="text-sm text-[#cbd5e1] leading-relaxed whitespace-pre-line">{item.content}</p>
        </div>
      )}

      <ShareNewsButton content={item.content} listPath={`${ctx.base}/noticias`} />

      <Link href={`${ctx.base}/matches/${item.match_id}`} className="inline-flex items-center gap-1 text-xs text-[#475569] hover:text-[#64748b] transition-colors">
        Ver pronósticos y tabla →
      </Link>
    </div>
  );
}
