import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { JuegoProvider, useJuego } from "@/lib/juego/context";
import { isGoal } from "@/lib/juego/goal";
import { detectCurrentStage, formatKickoff, isTournamentFinished, matchClosedReason } from "@/lib/juego/matches";

const pathname = vi.hoisted(() => ({ value: "" }));
vi.mock("next/navigation", () => ({
  usePathname: () => pathname.value,
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));
vi.mock("@/lib/juego/prediction-action", () => ({ savePredictionAction: vi.fn() }));

import JuegoNav from "./layout/JuegoNav";
import PredictionForm from "./dashboard/PredictionForm";

const A = "11111111-1111-4111-8111-111111111111";
const PE = "22222222-2222-4222-8222-222222222222";
const BASE = `/parches/${A}/torneos/${PE}`;
const ctx = { parcheId: A, parcheEventId: PE, eventId: "e", tz: "America/Bogota", base: BASE, userId: "u", canPlay: true };
const withCtx = (node: React.ReactNode) => renderToStaticMarkup(<JuegoProvider value={ctx}>{node}</JuegoProvider>);

describe("navegación del jugador (JuegoNav)", () => {
  beforeEach(() => { pathname.value = BASE; });

  it("todas las rutas cuelgan del parche y la inscripción actuales, sin Copa ni rutas globales", () => {
    const html = withCtx(<JuegoNav hasLiveMatch={false} />);
    for (const p of ["", "/leaderboard", "/en-vivo", "/community", "/profile", "/rules", "/noticias"]) expect(html).toContain(`href="${BASE}${p}"`);
    expect(html).not.toContain("/copa");
    expect(html).not.toMatch(/href="\/(dashboard|leaderboard|en-vivo|community|profile|matches)/);
  });
  it("Noticias es un acceso secundario: la barra inferior móvil conserva sus 5 pestañas", () => {
    const html = withCtx(<JuegoNav hasLiveMatch={false} />);
    const bottom = html.slice(html.indexOf("fixed bottom-0"));
    expect(bottom.match(/<a /g)).toHaveLength(5);
    expect(bottom).not.toContain("/noticias");
    expect(html.slice(0, html.indexOf("fixed bottom-0"))).toContain("/noticias");
  });
  it("marca la pestaña activa y el detalle de un partido cuenta como Inicio", () => {
    pathname.value = `${BASE}/leaderboard`;
    expect(withCtx(<JuegoNav hasLiveMatch={false} />)).toMatch(/aria-current="page"[^>]*href="[^"]*\/leaderboard"/);
    pathname.value = `${BASE}/matches/abc`;
    expect(withCtx(<JuegoNav hasLiveMatch={false} />)).toMatch(new RegExp(`aria-current="page"[^>]*href="${BASE}"`));
  });
  it("indica En Vivo solo cuando hay un partido en vivo", () => {
    expect(withCtx(<JuegoNav hasLiveMatch={false} />)).not.toContain("animate-ping");
    expect(withCtx(<JuegoNav hasLiveMatch />)).toContain("animate-ping");
  });
  it("el contexto es obligatorio: no se asume ningún parche", () => {
    const Bad = () => { useJuego(); return null; };
    expect(() => renderToStaticMarkup(<Bad />)).toThrow();
  });
});

describe("formulario de pronóstico", () => {
  it("envía la inscripción (parche × torneo) del contexto, nunca una global", () => {
    const html = withCtx(<PredictionForm matchId="m1" isOpen currentPrediction={null} />);
    expect(html).toContain('name="match_id"');
    expect(html).toContain(`name="parche_event_id" value="${PE}"`);
  });
  it("cerrado: sin formulario y con el motivo", () => {
    const html = withCtx(<PredictionForm matchId="m1" isOpen={false} closedReason="match_started" currentPrediction={null} />);
    expect(html).not.toContain("<form");
    expect(html).toContain("El partido ya comenzó");
  });
});

describe("reglas de juego del jugador", () => {
  const future = new Date(Date.now() + 3600_000).toISOString();
  const past = new Date(Date.now() - 3600_000).toISOString();
  it("superadministrador o miembro deshabilitado (player_can_play=false) no pueden pronosticar", () => {
    expect(matchClosedReason({ starts_at: future, status: "scheduled", player_can_play: false })).toBe("match_not_scheduled");
    expect(matchClosedReason({ starts_at: future, status: "scheduled", player_can_play: true })).toBeNull();
  });
  it("cierra al inicio, en vivo, finalizado y cancelado; el aplazado sigue editable", () => {
    expect(matchClosedReason({ starts_at: past, status: "scheduled", player_can_play: true })).toBe("match_started");
    for (const status of ["live", "finished", "cancelled"] as const) expect(matchClosedReason({ starts_at: future, status, player_can_play: true })).toBe("match_not_scheduled");
    expect(matchClosedReason({ starts_at: future, status: "postponed", player_can_play: true })).toBeNull();
  });
  it("no hay celebración de gol al cargar, al cambiar de contexto ni en correcciones a la baja", () => {
    expect(isGoal(null, { home: 1, away: 0 }, true)).toBe(false); // carga inicial
    expect(isGoal({ home: null, away: null }, { home: 0, away: 0 }, true)).toBe(false); // inicio del partido
    expect(isGoal({ home: 2, away: 1 }, { home: 1, away: 1 }, true)).toBe(false); // corrección a la baja
    expect(isGoal({ home: 1, away: 1 }, { home: 2, away: 1 }, false)).toBe(false); // no está en vivo
    expect(isGoal({ home: 1, away: 1 }, { home: 2, away: 1 }, true)).toBe(true);
  });
  it("la hora se muestra en la zona del torneo, no en la del navegador", () => {
    const t = "2026-06-11T19:00:00Z";
    expect(formatKickoff(t, "America/Bogota")).toContain("14:00");
    expect(formatKickoff(t, "Europe/Madrid")).toContain("21:00");
  });
  it("fase actual y fin del torneo", () => {
    expect(detectCurrentStage([{ stage: "g", status: "finished" }, { stage: "r16", status: "scheduled" }])).toBe("r16");
    expect(detectCurrentStage([{ stage: "g", status: "finished" }, { stage: "r16", status: "live" }])).toBe("r16");
    expect(isTournamentFinished([{ status: "finished" }, { status: "cancelled" }])).toBe(true);
    expect(isTournamentFinished([])).toBe(false);
  });
});
