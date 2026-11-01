"use client";

import { createContext, useContext } from "react";

// Contexto de juego: la inscripción de un parche en un torneo. Todo componente del jugador lo usa para armar
// rutas, formularios y zonas horarias; nunca se asume «el primer parche».
export type JuegoContextValue = {
  parcheId: string;
  parcheEventId: string;
  eventId: string;
  tz: string;
  base: string; // /parches/<id>/torneos/<peId>
  userId: string;
  canPlay: boolean;
};

const Ctx = createContext<JuegoContextValue | null>(null);

export function JuegoProvider({ value, children }: { value: JuegoContextValue; children: React.ReactNode }) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useJuego(): JuegoContextValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useJuego fuera de JuegoProvider");
  return v;
}
