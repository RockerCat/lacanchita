"use client";

import { createContext, useCallback, useContext, useRef, useState } from "react";

// Recuperado de La Penúltima (contexts/prediction-editing.tsx): cada fila de partido registra si tiene un
// formulario de pronóstico abierto; los pollers pausan el sondeo mientras haya alguno.
type CtxValue = {
  registerEditing: (matchId: string, editing: boolean) => void;
  isAnyEditing: boolean;
};

const PredictionEditingContext = createContext<CtxValue>({ registerEditing: () => {}, isAnyEditing: false });

export function PredictionEditingProvider({ children }: { children: React.ReactNode }) {
  const editingSet = useRef(new Set<string>());
  const [isAnyEditing, setIsAnyEditing] = useState(false);

  const registerEditing = useCallback((matchId: string, editing: boolean) => {
    if (editing) editingSet.current.add(matchId);
    else editingSet.current.delete(matchId);
    setIsAnyEditing(editingSet.current.size > 0);
  }, []);

  return <PredictionEditingContext.Provider value={{ registerEditing, isAnyEditing }}>{children}</PredictionEditingContext.Provider>;
}

export function usePredictionEditing(): CtxValue {
  return useContext(PredictionEditingContext);
}
