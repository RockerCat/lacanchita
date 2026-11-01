import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, Crown, Users } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { getParcheMembers } from "@/lib/data";
import { requireGame, getMatchesWithPredictions, getParcheLeaderboard } from "@/lib/juego/queries";
import { formatMemberCount } from "@/lib/juego/groups";
import type { MemberDetail } from "@/lib/juego/groups";
import MemberList from "@/components/juego/groups/MemberList";
import GroupStats from "@/components/juego/groups/GroupStats";
import Leaderboard from "@/components/juego/groups/Leaderboard";
import { getNewsFeed } from "@/lib/news/data";
import { formatNewsDate } from "@/lib/news/format";

// Comunidad = el parche. No existe una segunda entidad «grupo»: miembros, roles y estadísticas salen del parche
// y de la clasificación del torneo en curso. Sin correos, sin invitaciones aquí (se gestionan en Participantes).
export default async function CommunityPage({ params }: { params: Promise<{ parcheId: string; parcheEventId: string }> }) {
  const ctx = await requireGame(params);
  if (ctx.historical) redirect(`${ctx.base}/historial`);
  const { supabase } = await getCurrentUser();
  const [leaderboard, matches, parcheMembers, recentNews] = await Promise.all([
    getParcheLeaderboard(ctx),
    getMatchesWithPredictions(ctx),
    getParcheMembers(supabase, ctx.parcheId),
    getNewsFeed(supabase, ctx.parcheEventId, 3),
  ]);

  const members: MemberDetail[] = parcheMembers
    .filter((m) => m.status === "active")
    .map((m) => ({ user_id: m.userId, display_name: m.displayName, role: m.role, status: m.status, joined_at: m.joinedAt, is_me: m.isMe }));

  const scoredMatches = matches.filter((m) => m.status === "finished").length;
  const pendingMatches = matches.filter((m) => m.status !== "finished" && m.status !== "cancelled").length;
  const totalPredictions = leaderboard.reduce((sum, e) => sum + e.pred_count, 0);
  const leader = leaderboard.find((e) => e.total_points > 0);
  const me = leaderboard.find((e) => e.user_id === ctx.user.id);
  const isLeading = !!me && me.rank === 1 && leaderboard.length > 1 && me.total_points > 0;
  const isAdmin = ["owner", "admin"].includes(ctx.membership.role);

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
      <div>
        <div className="flex items-center gap-2 flex-wrap mb-1">
          <h1 className="text-2xl font-black text-[#f1f5f9]">{ctx.membership.parcheName}</h1>
          {isAdmin && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#f59e0b]/10 border border-[#f59e0b]/20 text-[#f59e0b] text-xs font-semibold">
              <Crown size={10} />
              Admin
            </span>
          )}
          {isLeading && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#f59e0b]/10 border border-[#f59e0b]/20 text-[#f59e0b] text-xs font-semibold">
              🔥 Liderando
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5 text-xs text-[#94a3b8]">
          <Users size={13} strokeWidth={1.8} />
          <span>{formatMemberCount(members.length)}</span>
          <span className="text-[#2a2a45]">·</span>
          <span>{ctx.eventName}</span>
        </div>
        {isAdmin && (
          <Link href={`/parches/${ctx.parcheId}/participantes`} className="mt-3 inline-block text-xs text-[#00c85a] hover:underline">
            Invitar o administrar participantes →
          </Link>
        )}
      </div>

      <section>
        <SectionHeader title="Noticias recientes" />
        {recentNews.length === 0 ? (
          <div className="bg-[#11111c] border border-[#1e1e35] rounded-2xl p-5 text-center">
            <p className="text-xs text-[#64748b]">Aún no hay noticias. Aparecerán cuando se cierre un partido.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {recentNews.map((item) => (
              <Link key={item.id} href={`${ctx.base}/noticias/${item.id}`} className="block">
                <div className="bg-[#11111c] border border-[#1e1e35] rounded-2xl px-4 py-3 hover:border-[#2a2a45] transition-colors">
                  <p className="text-sm font-semibold text-[#f1f5f9] truncate">{item.title}</p>
                  <p className="text-xs text-[#64748b] mt-0.5 line-clamp-2 leading-snug">{item.summary}</p>
                  <p className="text-[10px] text-[#475569] font-mono mt-1.5">{formatNewsDate(item.created_at, ctx.tz, { day: "numeric", month: "long" })}</p>
                </div>
              </Link>
            ))}
            <Link href={`${ctx.base}/noticias`} className="flex items-center gap-1 text-xs text-[#64748b] hover:text-[#94a3b8] transition-colors pt-1 pl-1">
              Ver todas las noticias
              <ArrowRight size={11} />
            </Link>
          </div>
        )}
      </section>

      <section>
        <SectionHeader title="Resumen" />
        <GroupStats
          memberCount={members.length}
          totalPredictions={totalPredictions}
          scoredMatches={scoredMatches}
          pendingMatches={pendingMatches}
          leaderName={leader?.display_name ?? null}
        />
      </section>

      {leaderboard.length > 0 && (
        <section>
          <SectionHeader title="Clasificación" />
          <Leaderboard entries={leaderboard.slice(0, 5)} currentUserId={ctx.user.id} />
          <Link href={`${ctx.base}/leaderboard`} className="mt-2 inline-block text-xs text-[#00c85a] hover:underline">
            Ver tabla completa →
          </Link>
        </section>
      )}

      <section>
        <SectionHeader title="Miembros" count={members.length} />
        <MemberList members={members} currentUserId={ctx.user.id} />
      </section>
    </div>
  );
}

function SectionHeader({ title, count }: { title: string; count?: number }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <h2 className="text-sm font-bold text-[#94a3b8] uppercase tracking-wide">{title}</h2>
      {count !== undefined && (
        <span className="text-xs bg-[#18182a] border border-[#2a2a45] text-[#94a3b8] px-1.5 py-0.5 rounded-full">{count}</span>
      )}
    </div>
  );
}
