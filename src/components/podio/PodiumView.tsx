"use client";

import { useState } from "react";
import { cn } from "@/lib/juego/utils";
import type { LeaderboardEntry } from "@/lib/juego/groups";
import Leaderboard from "@/components/juego/groups/Leaderboard";
import ConfettiCelebration from "./ConfettiCelebration";
import PodiumPlace from "./PodiumPlace";

// Recuperado de La Penúltima (components/podium/PodiumView.tsx): podio de tres pedestales (2.º · campeón · 3.º),
// tarjetas de resumen y clasificación completa. Es independiente del torneo: recibe la clasificación ya ordenada
// (posición oficial incluida) y no recalcula nada. Sin premios.
export default function PodiumView({
  leaderboard,
  currentUserId,
  parcheName,
  celebrationKey,
  celebrate = true,
  /** Clasificación completa alternativa (p. ej. cuando faltan estadísticas verificadas). */
  classification,
}: {
  leaderboard: LeaderboardEntry[];
  currentUserId: string;
  parcheName: string;
  celebrationKey: string;
  celebrate?: boolean;
  classification?: React.ReactNode;
}) {
  const [replay, setReplay] = useState(0);
  // El arreglo ya llega en el orden oficial (posición y desempate de la fotografía); no se reinterpreta.
  const [first, second, third] = leaderboard;
  const diff = first && second ? first.total_points - second.total_points : null;
  // Empates según la clasificación oficial: la etiqueta sale de la posición real, no del orden del arreglo.
  const tieFirst = !!first && !!second && second.rank === first.rank;
  const secondLabel = tieFirst ? "Empate · 1.er lugar" : "Segundo lugar";
  const thirdLabel = !third || !first ? "Tercer lugar" : third.rank === first.rank ? "Empate · 1.er lugar" : second && third.rank === second.rank ? "Empate · 2.º lugar" : "Tercer lugar";

  return (
    <div className="space-y-8 pb-2" data-testid="podium-view">
      <ConfettiCelebration active={celebrate && leaderboard.length > 0} sessionKey={celebrationKey} replayKey={replay} />

      <div className="animate-podium-fade-in text-center space-y-2">
        <h2 className="text-2xl sm:text-3xl font-black text-[#f1f5f9]">Podio final</h2>
        <p className="text-sm text-[#94a3b8] max-w-md mx-auto">
          El torneo llegó a su final. Gracias por participar, competir y vivir juntos cada partido.
        </p>
        {first && (
          <p className="text-base sm:text-lg font-black text-[#f59e0b] pt-1">
            {tieFirst ? `🏆 Empate en el primer lugar de ${parcheName}: ${first.display_name} y ${second!.display_name}` : `🏆 ${first.display_name}, campeón de ${parcheName}`}
          </p>
        )}
        {celebrate && leaderboard.length > 0 && (
          <button
            type="button"
            onClick={() => setReplay((n) => n + 1)}
            className="text-[11px] font-semibold text-[#94a3b8] hover:text-[#f1f5f9] transition-colors"
          >
            🎉 Celebrar de nuevo
          </button>
        )}
      </div>

      {leaderboard.length > 0 && (
        <div className="animate-podium-fade-in flex items-end justify-center gap-3 sm:gap-5 px-2">
          {second && <PodiumPlace entry={second} slotLabel={secondLabel} medal={tieFirst ? "🥇" : "🥈"} isChampion={false} animationDelayMs={0} />}
          {first && <PodiumPlace entry={first} slotLabel="Campeón" medal="🥇" isChampion animationDelayMs={220} />}
          {third && <PodiumPlace entry={third} slotLabel={thirdLabel} medal={thirdLabel === "Tercer lugar" ? "🥉" : thirdLabel.includes("1.er") ? "🥇" : "🥈"} isChampion={false} animationDelayMs={60} />}
        </div>
      )}

      {leaderboard.length > 0 && (
        <div className={cn("animate-podium-fade-scale grid gap-2 sm:gap-3", diff !== null ? "grid-cols-3" : "grid-cols-2")}>
          <SummaryCard label="Participantes" value={String(leaderboard.length)} />
          <SummaryCard label="Puntaje campeón" value={first ? String(first.total_points) : "—"} />
          {diff !== null && <SummaryCard label="Ventaja final" value={String(diff)} />}
        </div>
      )}

      <div className="space-y-3">
        <h3 className="text-sm font-bold text-[#94a3b8] uppercase tracking-widest text-center">Clasificación final</h3>
        {classification ?? <Leaderboard entries={leaderboard} currentUserId={currentUserId} />}
      </div>
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-[#11111c] border border-[#1e1e35] rounded-2xl p-3 sm:p-4 text-center">
      <p className="text-[9px] sm:text-[10px] text-[#64748b] uppercase tracking-wide mb-1">{label}</p>
      <p className="text-lg sm:text-xl font-black text-[#f1f5f9] tabular-nums">{value}</p>
    </div>
  );
}
