"use client";

import { useEffect } from "react";
import type { Options } from "canvas-confetti";

// Recuperado de La Penúltima (components/podium/ConfettiCelebration.tsx): misma secuencia (arriba al centro, luego
// izquierda y derecha), mismos colores y parámetros de `canvas-confetti`.
// Adaptación mínima: el original la repetía cada 5 s mientras la página estuviera abierta; aquí se dispara UNA vez por
// visita (y una vez por sesión del navegador y torneo) para no animar sin fin ni reiniciar con cada recarga.
// `replayKey` permite repetirla a petición (botón). No corre con prefers-reduced-motion ni en el servidor.
const CONFETTI_COLORS = ["#f59e0b", "#fcd34d", "#ffffff", "#00c85a"];

type ConfettiFn = ((o: Options) => unknown) & { reset: () => void };
type Env = Pick<Window, "matchMedia" | "sessionStorage">;

/** Lógica de la celebración (separada del componente para poder probarla). Devuelve la limpieza. */
export function startCelebration(
  env: Env,
  sessionKey: string,
  replay: boolean,
  load: () => Promise<ConfettiFn> = () => import("canvas-confetti").then((m) => m.default as unknown as ConfettiFn)
): () => void {
  if (env.matchMedia("(prefers-reduced-motion: reduce)").matches) return () => {};
  const storageKey = `lacanchita-podio:${sessionKey}`;
  if (!replay) {
    try {
      if (env.sessionStorage.getItem(storageKey)) return () => {};
    } catch {
      // sin sessionStorage: se celebra igualmente, una sola vez por montaje
    }
  }

  let cancelled = false;
  const timers: ReturnType<typeof setTimeout>[] = [];
  let confetti: ConfettiFn | null = null;

  load().then((fn) => {
    if (cancelled) return;
    confetti = fn;
    const burst = (x: number, y: number) =>
      fn({ particleCount: 90, spread: 100, startVelocity: 42, gravity: 0.9, ticks: 220, origin: { x, y }, colors: CONFETTI_COLORS, zIndex: 9999 });
    burst(0.5, 0.1); // arriba al centro
    timers.push(setTimeout(() => burst(0.05, 0.3), 700)); // izquierda
    timers.push(setTimeout(() => burst(0.95, 0.3), 1400)); // derecha
    timers.push(
      setTimeout(() => {
        try {
          env.sessionStorage.setItem(storageKey, "1");
        } catch {
          // ignorar
        }
      }, 1500)
    );
  });

  return () => {
    cancelled = true;
    timers.forEach(clearTimeout);
    confetti?.reset();
  };
}

export default function ConfettiCelebration({
  active,
  sessionKey,
  replayKey = 0,
}: {
  active: boolean;
  sessionKey: string;
  replayKey?: number;
}) {
  useEffect(() => {
    if (!active) return;
    return startCelebration(window, sessionKey, replayKey > 0);
  }, [active, sessionKey, replayKey]);

  return null;
}
