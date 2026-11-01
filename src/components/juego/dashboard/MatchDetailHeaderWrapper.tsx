"use client";

import { cn } from "@/lib/juego/utils";
import { useGoalCelebration } from "@/components/juego/useGoalCelebration";
import GoalCelebrationOverlay from "./GoalCelebrationOverlay";

interface Props {
  homeScore: number | null;
  awayScore: number | null;
  isLive:    boolean;
  children:  React.ReactNode;
}

/**
 * Thin client wrapper for the match detail page header.
 * Detects live score changes (via useGoalCelebration) and:
 *   - applies animate-goal-card shake/glow to the wrapper
 *   - renders GoalCelebrationOverlay (badge + confetti) over the header card
 *
 * The wrapper is transparent (no bg/border) — the visual card styling lives
 * on the MatchHeader child. overflow-hidden clips confetti to the card area.
 */
export default function MatchDetailHeaderWrapper({
  homeScore,
  awayScore,
  isLive,
  children,
}: Props) {
  const goalAnim = useGoalCelebration(
    { home: homeScore, away: awayScore },
    isLive
  );

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl",
        goalAnim && "animate-goal-card"
      )}
    >
      {children}
      <GoalCelebrationOverlay active={goalAnim} />
    </div>
  );
}
