"use client";

import { useEffect, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import { detailInterval, detailIsPassive, shouldSkipTick } from "@/lib/juego/polling";
import { usePredictionEditing } from "./PredictionEditingContext";

// Recuperado de La Penúltima (components/dashboard/MatchDetailPoller.tsx). Sondeo del detalle de UN partido con
// setTimeout encadenado (la cadencia se recalcula en cada tick, así se detecta el paso de «a ≤ 5 min» o la hora de
// inicio sin esperar un render del servidor). Un finalizado o cancelado no sondea. Con un formulario abierto se pausa,
// salvo que la hora de inicio ya haya pasado (la sincronización a «En vivo» debe ejecutarse igualmente).
export default function MatchDetailPoller({ startsAt, status }: { startsAt: string; status: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const { isAnyEditing } = usePredictionEditing();
  const pendingRef = useRef(false);
  const editingRef = useRef(false);
  const prevEditingRef = useRef(false);

  useEffect(() => { pendingRef.current = isPending; }, [isPending]);
  useEffect(() => { editingRef.current = isAnyEditing; }, [isAnyEditing]);

  useEffect(() => {
    if (prevEditingRef.current && !isAnyEditing && !pendingRef.current) startTransition(() => router.refresh());
    prevEditingRef.current = isAnyEditing;
  }, [isAnyEditing, router]);

  useEffect(() => {
    if (detailIsPassive(status)) return;
    let id: ReturnType<typeof setTimeout>;
    const hidden = () => typeof document !== "undefined" && document.visibilityState === "hidden";
    function scheduleNext() {
      id = setTimeout(tick, detailInterval(status, startsAt, hidden()));
    }
    function tick() {
      const kickoffPassed = new Date(startsAt).getTime() <= Date.now();
      if (!shouldSkipTick({ refreshInFlight: pendingRef.current, isEditing: editingRef.current, kickoffPassed })) {
        startTransition(() => router.refresh());
      }
      scheduleNext(); // siempre se encadena el siguiente tick, aunque este se haya omitido
    }
    scheduleNext();
    function onVisibility() {
      clearTimeout(id);
      scheduleNext();
    }
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      clearTimeout(id);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [status, startsAt, router]);

  return null;
}
