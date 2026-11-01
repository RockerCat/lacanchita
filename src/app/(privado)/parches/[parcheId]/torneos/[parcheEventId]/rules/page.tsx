import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { requireGame, getMatchesWithPredictions } from "@/lib/juego/queries";
import { detectCurrentStage } from "@/lib/juego/matches";
import { cn } from "@/lib/juego/utils";

// Reglas de La Canchita. Los puntos por fase salen de los datos del torneo (event_stages), no de una tabla fija.
// Sin inscripción, bolsas, premios ni pagos: es una experiencia recreativa basada en puntos y posiciones.
export default async function RulesPage({ params }: { params: Promise<{ parcheId: string; parcheEventId: string }> }) {
  const ctx = await requireGame(params);
  if (ctx.historical) redirect(`${ctx.base}/historial`);
  const { supabase } = await getCurrentUser();
  const [matches, stagesRes] = await Promise.all([
    getMatchesWithPredictions(ctx),
    supabase.from("event_stages").select("code, name, is_knockout, exact_points, result_points, sort_order").eq("event_id", ctx.eventId).order("sort_order"),
  ]);
  const stages = stagesRes.data ?? [];
  const currentCode = detectCurrentStage(matches);
  const current = stages.find((s) => s.code === currentCode)?.name ?? null;

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-8">
      <div>
        <h1 className="text-2xl font-black text-[#f1f5f9]">Reglas de La Canchita</h1>
        <p className="text-sm text-[#64748b] mt-1">
          {ctx.eventName} · {ctx.membership.parcheName}
          {current && (
            <>
              {" "}· Fase actual: <span className="font-semibold text-[#94a3b8]">{current}</span>
            </>
          )}
        </p>
      </div>

      <section>
        <SectionHeader title="Cómo se juega" />
        <Card>
          <RuleItem icon="⚽" text="Pronostica el marcador de cada partido de este torneo, a tiempo completo (más el tiempo extra si lo hay; los penales no cuentan)." />
          <RuleItem icon="👥" text="Tus pronósticos pertenecen a este parche. Si juegas el mismo partido en otro parche, allí puedes pronosticar algo distinto." />
          <RuleItem icon="🔒" text="Puedes crear o cambiar tu pronóstico hasta la hora de inicio del partido. Después queda cerrado." accent="yellow" />
          <RuleItem icon="👀" text="Los pronósticos de los demás se muestran cuando el partido empieza (o cuando termina, según la configuración del parche). Antes de eso solo tú ves el tuyo." />
          <RuleItem icon="🎯" text="No hay apuestas, cuotas ni dinero: se compite por puntos y posiciones entre amigos." accent="green" />
        </Card>
      </section>

      <section>
        <SectionHeader title="Sistema de puntos" />
        <div className="bg-[#11111c] border border-[#1e1e35] rounded-2xl overflow-hidden">
          <div className="grid grid-cols-[1fr_auto_auto] gap-4 px-4 py-2.5 border-b border-[#1e1e35]">
            <span className="text-[10px] font-bold text-[#64748b] uppercase tracking-widest">Fase</span>
            <span className="text-[10px] font-bold text-[#f59e0b]/70 uppercase tracking-widest text-right w-24">Exacto</span>
            <span className="text-[10px] font-bold text-[#00c85a]/70 uppercase tracking-widest text-right w-24">Ganador</span>
          </div>
          {stages.length === 0 && <p className="px-4 py-4 text-xs text-[#64748b]">Este torneo todavía no tiene fases configuradas.</p>}
          {stages.map((s) => {
            const isCurrent = s.code === currentCode;
            return (
              <div
                key={s.code}
                className={cn(
                  "grid grid-cols-[1fr_auto_auto] gap-4 px-4 py-3 border-b border-[#1e1e35] last:border-b-0",
                  isCurrent ? "bg-[#00c85a]/[0.04] border-l-2 border-l-[#00c85a]/40" : "hover:bg-[#18182a]/50"
                )}
              >
                <div className="flex items-center gap-2">
                  <span className={cn("text-sm font-bold", isCurrent ? "text-[#f1f5f9]" : "text-[#94a3b8]")}>{s.name}</span>
                  {isCurrent && <span className="text-[9px] font-mono text-[#00c85a] bg-[#00c85a]/10 px-1.5 py-0.5 rounded-full">actual</span>}
                </div>
                <span className={cn("text-sm font-black tabular-nums text-right w-24", isCurrent ? "text-[#f59e0b]" : "text-[#94a3b8]")}>
                  {s.exact_points} pt{s.exact_points !== 1 ? "s" : ""}
                </span>
                <span className={cn("text-sm font-black tabular-nums text-right w-24", isCurrent ? "text-[#00c85a]" : "text-[#94a3b8]")}>
                  {s.result_points} pt{s.result_points !== 1 ? "s" : ""}
                </span>
              </div>
            );
          })}
        </div>
      </section>

      <section>
        <SectionHeader title="Cómo se calculan los puntos" />
        <Card>
          <RuleItem icon="⚡" text="Si aciertas el marcador exacto recibes los puntos de «Exacto». El exacto NO suma además los puntos de ganador." accent="yellow" />
          <RuleItem icon="✓" text="Si no aciertas el marcador pero sí el ganador (o el empate), recibes los puntos de «Ganador»." accent="green" />
          <RuleItem icon="✗" text="Si fallas ambos, sumas 0 puntos. Si no pronosticas un partido, también suma 0." />
          <RuleItem icon="🥅" text="En las eliminatorias solo cuenta el marcador del juego; la definición por penales no suma puntos." />
        </Card>
      </section>

      <section>
        <SectionHeader title="Clasificación y desempates" />
        <Card>
          <RuleItem icon="🏆" text="La tabla suma tus puntos de este torneo dentro del parche. Ordena por puntos, luego por marcadores exactos y luego por ganadores acertados." />
          <RuleItem icon="🤝" text="Si persiste el empate, comparten posición." />
          <RuleItem icon="⏳" text="Los puntos aparecen cuando un partido finaliza. Mientras está en vivo, la tabla puede mostrar una proyección con el marcador actual." />
        </Card>
      </section>

      <section>
        <SectionHeader title="Cambios en los partidos" />
        <Card>
          <RuleItem icon="🔄" text="Si un partido se aplaza, tu pronóstico se conserva y puedes editarlo hasta la nueva hora de inicio." />
          <RuleItem icon="🚫" text="Si un partido se cancela, no suma puntos ni cuenta en la clasificación." />
          <RuleItem icon="✏️" text="Si el resultado se corrige después de finalizar, los puntos se recalculan automáticamente." />
        </Card>
      </section>
    </div>
  );
}

function SectionHeader({ title }: { title: string }) {
  return <h2 className="text-sm font-bold text-[#94a3b8] uppercase tracking-wide mb-3">{title}</h2>;
}

function Card({ children }: { children: React.ReactNode }) {
  return <div className="bg-[#11111c] border border-[#1e1e35] rounded-2xl p-5 space-y-3">{children}</div>;
}

function RuleItem({ icon, text, accent }: { icon: string; text: string; accent?: "yellow" | "green" }) {
  return (
    <div className="flex items-start gap-3">
      <span className="text-base leading-6 shrink-0">{icon}</span>
      <p className={cn("text-sm leading-relaxed", accent === "yellow" ? "text-[#f59e0b]" : accent === "green" ? "text-[#00c85a]" : "text-[#94a3b8]")}>{text}</p>
    </div>
  );
}
