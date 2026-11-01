import { cn } from "@/lib/juego/utils";
import type { LeaderboardEntry } from "@/lib/juego/groups";

// Recuperado de La Penúltima (components/podium/PodiumPlace.tsx). Sin premios: La Canchita no maneja dinero.
interface PodiumPlaceProps {
  entry: LeaderboardEntry;
  /** Pedestal en el que está parado el participante; no es un desempate recalculado. */
  slotLabel: string;
  medal: string;
  isChampion: boolean;
  animationDelayMs: number;
}

export default function PodiumPlace({ entry, slotLabel, medal, isChampion, animationDelayMs }: PodiumPlaceProps) {
  const initial = entry.display_name.charAt(0).toUpperCase();

  return (
    <div
      className="animate-podium-rise flex flex-col items-center flex-1 min-w-0 max-w-[9.5rem]"
      style={{ animationDelay: `${animationDelayMs}ms` }}
      data-testid="podium-place"
    >
      <div
        className="animate-podium-fade-scale flex flex-col items-center gap-1.5 mb-2 w-full"
        style={{ animationDelay: `${animationDelayMs + 100}ms` }}
      >
        <div
          className={cn(
            "rounded-full flex items-center justify-center shrink-0 font-black border",
            isChampion
              ? "w-16 h-16 sm:w-20 sm:h-20 text-xl sm:text-2xl bg-[#f59e0b]/15 text-[#f59e0b] border-[#f59e0b]/40 animate-podium-champion-glow"
              : "w-11 h-11 sm:w-12 sm:h-12 text-base bg-[#1e1e35] text-[#94a3b8] border-transparent"
          )}
        >
          {initial}
        </div>

        <p
          className={cn(
            "text-center truncate w-full px-1",
            isChampion ? "text-sm sm:text-base font-black text-[#f1f5f9]" : "text-xs sm:text-sm font-bold text-[#e2e8f0]"
          )}
          title={entry.display_name}
        >
          {entry.display_name}
        </p>

        <p
          className={cn(
            "text-[9px] sm:text-[10px] font-mono uppercase tracking-widest whitespace-nowrap",
            isChampion ? "text-[#f59e0b]" : "text-[#64748b]"
          )}
        >
          {medal} {slotLabel}
        </p>

        <p className={cn("font-black tabular-nums leading-none text-[#f1f5f9]", isChampion ? "text-lg sm:text-xl" : "text-sm sm:text-base")}>
          {entry.total_points}
          <span className="text-[10px] font-normal text-[#64748b] ml-0.5">pts</span>
        </p>
      </div>

      <div
        className={cn(
          "w-full rounded-t-xl border border-b-0 flex items-start justify-center pt-1.5",
          isChampion ? "h-24 sm:h-28" : "h-14 sm:h-16",
          isChampion ? "bg-gradient-to-b from-[#f59e0b]/25 to-[#f59e0b]/5 border-[#f59e0b]/40" : "bg-[#18182a] border-[#2a2a45]"
        )}
      >
        <span className={cn("text-xs font-black tabular-nums", isChampion ? "text-[#f59e0b]" : "text-[#64748b]")}>#{entry.rank}</span>
      </div>
    </div>
  );
}
