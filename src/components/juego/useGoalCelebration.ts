"use client";

import { useEffect, useRef, useState } from "react";
import { isGoal, type Score } from "@/lib/juego/goal";

// Recuperado de La Penúltima (hooks/useGoalCelebration.ts): devuelve true ~2 s cuando un marcador EN VIVO sube entre
// dos renders (p. ej. tras un router.refresh() del poller). La lógica de detección vive en lib/juego/goal.ts.
export function useGoalCelebration(score: Score, isLive: boolean): boolean {
  const prevRef = useRef<Score | null>(null);
  const [goalAnim, setGoalAnim] = useState(false);

  useEffect(() => {
    if (!isLive) {
      prevRef.current = null;
      return;
    }
    const prev = prevRef.current;
    prevRef.current = score; // se actualiza antes de salir para que el siguiente render tenga la base correcta
    if (!isGoal(prev, score, isLive)) return;
    setGoalAnim(true);
    if (typeof document !== "undefined" && document.visibilityState === "visible" && typeof navigator !== "undefined" && "vibrate" in navigator) {
      navigator.vibrate(120);
    }
  }, [score.home, score.away, isLive]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!goalAnim) return;
    const t = setTimeout(() => setGoalAnim(false), 2000);
    return () => clearTimeout(t);
  }, [goalAnim]);

  return goalAnim;
}
