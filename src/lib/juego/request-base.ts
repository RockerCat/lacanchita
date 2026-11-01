import { cache } from "react";

// Ruta base y zona horaria de la inscripción en curso, por petición (React cache). Las páginas del jugador la fijan
// al empezar; los subcomponentes de servidor (que son funciones del mismo archivo) arman sus enlaces con getBase().
const store = cache(() => ({ base: "", tz: "UTC" }));
export const setRequest = (base: string, tz: string) => {
  const s = store();
  s.base = base;
  s.tz = tz;
};
export const getBase = () => store().base;
export const getTz = () => store().tz;
