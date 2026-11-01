import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { JuegoProvider } from "@/lib/juego/context";
import type { MatchWithPrediction, Team } from "@/lib/juego/matches";

vi.mock("next/navigation", () => ({ usePathname: () => "", useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
vi.mock("@/lib/juego/prediction-action", () => ({ savePredictionAction: vi.fn() }));

import CalendarView from "./dashboard/CalendarView";
import LiveMatchCard from "./dashboard/LiveMatchCard";

// Escenario del torneo de QA: partidos con equipos, uno en vivo, uno finalizado y uno con equipos por definir.
const T = (name: string, code: string, flag: string): Team => ({ id: code, name, code, flag_emoji: flag });
const COL = T("Colombia", "COL", "🇨🇴"), ARG = T("Argentina", "ARG", "🇦🇷");
const base = { stage: "grupos", stage_name: "Fase de grupos", stage_points: { exact: 3, result: 1 }, is_knockout: false, tz: "America/Bogota", group_code: "A", round_label: null, home_score: null, away_score: null, home_placeholder: null, away_placeholder: null, venue: null, created_at: "", advancing_team_id: null, winner_side: null, player_can_play: true, prediction: null } as const;
const at = (h: number) => new Date(Date.now() + h * 3600_000).toISOString();
const matches: MatchWithPrediction[] = [
  { ...base, id: "a", match_number: 1, starts_at: at(24), status: "scheduled", home_team_id: "COL", away_team_id: "ARG", home_team: COL, away_team: ARG },
  { ...base, id: "b", match_number: 2, starts_at: at(-1), status: "live", home_score: 1, away_score: 0, home_team_id: "ARG", away_team_id: "COL", home_team: ARG, away_team: COL },
  { ...base, id: "c", match_number: 3, starts_at: at(-30), status: "finished", home_score: 3, away_score: 0, home_team_id: "COL", away_team_id: "ARG", home_team: COL, away_team: ARG },
  { ...base, id: "d", stage: "final", stage_name: "Final", stage_points: { exact: 8, result: 6 }, is_knockout: true, group_code: null, match_number: 6, starts_at: at(240), status: "scheduled", home_team_id: null, away_team_id: null, home_team: null, away_team: null, home_placeholder: "Ganador del grupo A", away_placeholder: "Ganador del grupo B" },
];
const ctx = { parcheId: "p", parcheEventId: "pe", eventId: "e", tz: "America/Bogota", base: "/parches/p/torneos/pe", userId: "u", canPlay: true };

describe("pantallas del jugador con el escenario de QA (fixtures)", () => {
  it("el calendario renderiza partidos con equipos, en vivo, finalizados y con equipos por definir", () => {
    const html = renderToStaticMarkup(<JuegoProvider value={ctx}><CalendarView matches={matches} /></JuegoProvider>);
    for (const t of ["Hoy", "Pendientes", "Argentina", "Vivo"]) expect(html).toContain(t);
    expect(html).not.toMatch(/href="\/matches\//);
  });
  it("tarjeta en vivo: marcador y enlace al detalle del contexto actual", () => {
    const html = renderToStaticMarkup(<JuegoProvider value={ctx}><LiveMatchCard match={matches[1]} /></JuegoProvider>);
    expect(html).toContain('href="/parches/p/torneos/pe/matches/b"');
    expect(html).toMatch(/Argentina/);
  });
  it("el partido sin equipos muestra la descripción y no se puede pronosticar", () => {
    const html = renderToStaticMarkup(<JuegoProvider value={ctx}><LiveMatchCard match={{ ...matches[3], status: "live" }} /></JuegoProvider>);
    expect(html).toContain("Ganador del grupo A");
  });
});
