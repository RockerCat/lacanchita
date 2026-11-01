"use client";

import { useEffect, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import { listInterval, shouldSkipTick } from "@/lib/juego/polling";
import { usePredictionEditing } from "./PredictionEditingContext";

// Recuperado de La Penúltima (components/dashboard/LiveMatchPoller.tsx). Componente invisible para listas
// (inicio, en vivo): sondea con router.refresh() — sin Realtime ni suscripciones. Cadencias en lib/juego/polling.ts.
// Pausa mientras haya un formulario de pronóstico abierto y refresca de inmediato al cerrarse; nunca encadena
// refrescos (guarda de «en curso»); con la pestaña oculta baja a 60 s y al volver recalcula la cadencia.
export default function LiveMatchPoller({ hasLiveMatch, activeInterval, idleInterval }: { hasLiveMatch: boolean; activeInterval?: number; idleInterval?: number }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const { isAnyEditing } = usePredictionEditing();
  const pendingRef = useRef(false);
  const editingRef = useRef(false);
  const prevEditingRef = useRef(false);

  useEffect(() => { pendingRef.current = isPending; }, [isPending]);
  useEffect(() => { editingRef.current = isAnyEditing; }, [isAnyEditing]);

  // Al cerrarse el último formulario: refresco inmediato (puede haber cambiado el estado mientras estaba en pausa).
  useEffect(() => {
    if (prevEditingRef.current && !isAnyEditing && !pendingRef.current) startTransition(() => router.refresh());
    prevEditingRef.current = isAnyEditing;
  }, [isAnyEditing, router]);

  useEffect(() => {
    const hidden = () => typeof document !== "undefined" && document.visibilityState === "hidden";
    function tick() {
      if (shouldSkipTick({ refreshInFlight: pendingRef.current, isEditing: editingRef.current })) return;
      startTransition(() => router.refresh());
    }
    let id = setInterval(tick, listInterval(hasLiveMatch, hidden(), activeInterval, idleInterval));
    function onVisibility() {
      clearInterval(id);
      id = setInterval(tick, listInterval(hasLiveMatch, hidden(), activeInterval, idleInterval));
    }
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [hasLiveMatch, activeInterval, idleInterval, router]);

  if (!hasLiveMatch) return null;
  return <p className="mb-1 select-none text-right font-mono text-[10px] text-fg-3">Actualización en vivo activa</p>;
}
