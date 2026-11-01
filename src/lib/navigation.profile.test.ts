import { describe, expect, it } from "vitest";
import { playerProfileHref } from "./navigation";

const P = "a8a72afb-fac6-418d-9030-389d0b3b3b35";
const E = "2a4a1896-4450-44fb-8aa9-eb2dbe202163";

describe("playerProfileHref (Mi perfil del menú global)", () => {
  it("dentro de un torneo apunta al perfil de ESE parche y torneo", () => {
    for (const sub of ["", "/leaderboard", "/matches/abc", "/en-vivo", "/community", "/rules", "/profile", "/"]) {
      expect(playerProfileHref(`/parches/${P}/torneos/${E}${sub}`)).toBe(`/parches/${P}/torneos/${E}/profile`);
    }
  });
  it("fuera de un torneo no hay perfil (nunca se asume un parche o torneo)", () => {
    for (const p of ["/", "/parches", "/parches/nuevo", `/parches/${P}`, `/parches/${P}/participantes`, "/control/torneos", "/login", `/invitacion/${E}`]) {
      expect(playerProfileHref(p)).toBeNull();
    }
  });
  it("el historial sellado no tiene perfil de juego", () => {
    expect(playerProfileHref(`/parches/${P}/torneos/${E}/historial`)).toBeNull();
  });
  it("identificadores que no son UUID no cuentan", () => {
    expect(playerProfileHref("/parches/x/torneos/y/leaderboard")).toBeNull();
  });
});
