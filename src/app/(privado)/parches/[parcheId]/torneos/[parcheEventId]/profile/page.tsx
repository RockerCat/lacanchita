import { cn } from "@/lib/juego/utils";
import { redirect } from "next/navigation";
import { requireGame, getMatchesWithPredictions, getParcheLeaderboard } from "@/lib/juego/queries";
import { matchClosedReason } from "@/lib/juego/matches";
import { getCurrentUser } from "@/lib/auth";

export default async function ProfilePage({ params }: { params: Promise<{ parcheId: string; parcheEventId: string }> }) {
  const ctx = await requireGame(params);
  if (ctx.historical) redirect(`${ctx.base}/historial`);
  const user = ctx.user;
  const displayName = ctx.displayName;
  const initial = displayName.charAt(0).toUpperCase();
  const community = ctx.community;
  const { supabase } = await getCurrentUser();
  const [matches, leaderboard, memberResult] = await Promise.all([
    getMatchesWithPredictions(ctx),
    getParcheLeaderboard(ctx),
    supabase.from("parche_members").select("joined_at").eq("user_id", user.id).eq("parche_id", ctx.parcheId).maybeSingle(),
  ]);
  const userEntry = leaderboard.find((e) => e.user_id === user.id) ?? null;
  const totalMembers = leaderboard.length;
  const memberSince = memberResult.data?.joined_at
    ? new Date(memberResult.data.joined_at).toLocaleDateString("es", { year: "numeric", month: "long", day: "numeric" })
    : null;
  const pendingCount = matches.filter((m) => m.status === "scheduled" && matchClosedReason(m) === null && !m.prediction).length;

  return (
    <div className="max-w-lg mx-auto px-4 py-6 space-y-5">

      {/* Header */}
      <div className="bg-[#11111c] border border-[#1e1e35] rounded-2xl p-6">
        <div className="flex items-center gap-4 mb-5">
          <div className="w-14 h-14 rounded-full bg-[#00c85a]/15 border border-[#00c85a]/20 flex items-center justify-center shrink-0">
            <span className="text-xl font-black text-[#00c85a]">{initial}</span>
          </div>
          <div className="min-w-0">
            <p className="text-lg font-black text-[#f1f5f9] truncate">{displayName}</p>
            <p className="text-sm text-[#64748b] truncate">{user.email}</p>
          </div>
        </div>

        {/* Identity details */}
        <div className="grid grid-cols-1 gap-2">
          {community && (
            <InfoRow label="Comunidad" value={community.name} />
          )}
          {memberSince && (
            <InfoRow label="Miembro desde" value={memberSince} />
          )}
        </div>
      </div>

      {/* Ranking + Points */}
      {userEntry ? (
        <>
          <div className="grid grid-cols-2 gap-3">
            <StatCard
              label="Posición"
              value={`#${userEntry.rank}`}
              sub={totalMembers > 1 ? `de ${totalMembers}` : undefined}
              accent={userEntry.rank <= 3 ? "yellow" : "default"}
              large
            />
            <StatCard
              label="Puntos"
              value={String(userEntry.total_points)}
              sub="total"
              large
            />
          </div>

          <div className="bg-[#11111c] border border-[#1e1e35] rounded-2xl p-5">
            <p className="text-[10px] font-bold text-[#64748b] uppercase tracking-widest mb-4">
              Estadísticas
            </p>
            <div className="grid grid-cols-2 gap-3">
              <StatCard
                label="Marcadores exactos"
                value={String(userEntry.exact_count)}
                accent="yellow"
              />
              <StatCard
                label="Ganadores correctos"
                value={String(userEntry.result_count)}
                accent="green"
              />
              <StatCard
                label="Predicciones hechas"
                value={String(userEntry.pred_count)}
              />
              <StatCard
                label="Predicciones pendientes"
                value={String(pendingCount)}
                accent={pendingCount > 0 ? "yellow" : "default"}
              />
            </div>
          </div>
        </>
      ) : (
        <div className="bg-[#18182a] border border-dashed border-[#2a2a45] rounded-2xl p-8 text-center">
          <p className="text-sm text-[#64748b]">
            Haz tu primera predicción para ver tus estadísticas.
          </p>
        </div>
      )}

      {/* Security */}
      <div className="bg-[#11111c] border border-[#1e1e35] rounded-2xl p-5">
        <p className="text-[10px] font-bold text-[#64748b] uppercase tracking-widest mb-4">
          Seguridad
        </p>
        
      </div>

    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2 border-t border-[#1e1e35] first:border-t-0 first:pt-0">
      <span className="text-xs text-[#64748b]">{label}</span>
      <span className="text-xs font-semibold text-[#94a3b8] text-right truncate max-w-[60%]">
        {value}
      </span>
    </div>
  );
}

type Accent = "yellow" | "green" | "default";

const ACCENT_MAP: Record<Accent, { value: string; bg: string; border: string }> = {
  yellow:  { value: "text-[#f59e0b]", bg: "bg-[#f59e0b]/[0.04]", border: "border-[#f59e0b]/20" },
  green:   { value: "text-[#00c85a]", bg: "bg-[#00c85a]/[0.04]", border: "border-[#00c85a]/20" },
  default: { value: "text-[#f1f5f9]", bg: "bg-[#18182a]",        border: "border-[#2a2a45]" },
};

function StatCard({
  label,
  value,
  sub,
  accent = "default",
  large = false,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: Accent;
  large?: boolean;
}) {
  const { value: valueColor, bg, border } = ACCENT_MAP[accent];
  return (
    <div className={cn("rounded-xl border p-4 text-center", bg, border)}>
      <p className={cn("font-black tabular-nums leading-none mb-1", valueColor, large ? "text-4xl" : "text-2xl")}>
        {value}
      </p>
      {sub && <p className="text-[10px] text-[#64748b] mb-1">{sub}</p>}
      <p className="text-[10px] text-[#64748b] uppercase tracking-wide">{label}</p>
    </div>
  );
}
