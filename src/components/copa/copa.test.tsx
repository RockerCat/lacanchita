import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ usePathname: () => "/parches/a/torneos/b", useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
vi.mock("canvas-confetti", () => ({ default: vi.fn() }));

import { JuegoProvider } from "@/lib/juego/context";
import JuegoNav from "@/components/juego/layout/JuegoNav";
import PodiumView from "@/components/podio/PodiumView";
import CaminoTabs, { BracketView } from "./CaminoTabs";
import { buildCopaModel, resolveCopa, type CopaMatch, type CopaStage } from "@/lib/copa/format";
import { isTournamentOver } from "@/lib/podio";

const BASE = "/parches/a/torneos/b";
const ctx = { parcheId: "a", parcheEventId: "b", eventId: "e", tz: "America/Bogota", base: BASE, userId: "u", canPlay: true };
const nav = (p: { podium?: boolean; copa?: boolean }) => renderToStaticMarkup(<JuegoProvider value={ctx}><JuegoNav hasLiveMatch={false} {...p} /></JuegoProvider>);
const text = (h: string) => h.replace(/<script[\s\S]*?<\/script>/g, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

describe("navegación según estado del torneo", () => {
  it("activo: cinco pestañas con En Vivo, sin Podio ni Copa", () => {
    const h = nav({});
    const bottom = h.slice(h.indexOf("fixed bottom-0"));
    expect(bottom.match(/<a /g)).toHaveLength(5);
    expect(h).toContain(`href="${BASE}/en-vivo"`);
    expect(h).not.toContain("/podio");
    expect(h).not.toContain("/copa");
  });
  it("oficialmente finalizado: Podio ocupa el lugar de En Vivo y las demás pestañas se conservan", () => {
    const h = nav({ podium: true });
    const bottom = h.slice(h.indexOf("fixed bottom-0"));
    expect(bottom.match(/<a /g)).toHaveLength(5);
    expect(h).toContain(`href="${BASE}/podio"`);
    expect(h).not.toContain(`href="${BASE}/en-vivo"`);
    for (const p of ["", "/leaderboard", "/community", "/profile"]) expect(h).toContain(`href="${BASE}${p}"`);
  });
  it("Copa es un acceso contextual (solo si el torneo tiene eliminatorias) y no altera la barra inferior", () => {
    const h = nav({ copa: true });
    expect(h.slice(0, h.indexOf("fixed bottom-0"))).toContain(`href="${BASE}/copa"`);
    expect(h.slice(h.indexOf("fixed bottom-0"))).not.toContain("/copa");
  });
  it("el torneo termina solo por su ciclo de vida", () => {
    expect(["draft", "scheduled", "in_progress", "cancelled"].some(isTournamentOver)).toBe(false);
    expect(isTournamentOver("finished") && isTournamentOver("closed")).toBe(true);
  });
});

const entry = (rank: number, name: string, pts: number) => ({ user_id: name, display_name: name, total_points: pts, exact_count: 0, result_count: 0, pred_count: 3, rank });
const pod = (l: ReturnType<typeof entry>[]) => renderToStaticMarkup(<PodiumView leaderboard={l} currentUserId="x" parcheName="Mi parche" celebrationKey="k" />);

describe("podio por parche", () => {
  it("tres o más: campeón, segundo y tercero con la ventaja final", () => {
    const h = text(pod([entry(1, "Ana", 10), entry(2, "Beto", 7), entry(3, "Caro", 3), entry(4, "Dani", 1)]));
    expect(h).toContain("Ana, campeón de Mi parche");
    expect(h).toContain("Segundo lugar");
    expect(h).toContain("Tercer lugar");
    expect(h).toContain("Ventaja final 3");
  });
  it("un solo participante: no se inventa segundo ni tercer puesto", () => {
    const h = text(pod([entry(1, "Ana", 4)]));
    expect(h).toContain("Ana, campeón");
    expect(h).not.toContain("Segundo lugar");
    expect(h).not.toContain("Tercer lugar");
    expect(h).not.toContain("Ventaja final");
  });
  it("dos participantes: sin tercer lugar", () => {
    const h = text(pod([entry(1, "Ana", 4), entry(2, "Beto", 2)]));
    expect(h).toContain("Segundo lugar");
    expect(h).not.toContain("Tercer lugar");
  });
  it("empate en el primer lugar según el ranking oficial: se declara empate, no un campeón arbitrario", () => {
    const h = text(pod([entry(1, "Ana", 9), entry(1, "Beto", 9), entry(3, "Caro", 2)]));
    expect(h).toContain("Empate en el primer lugar de Mi parche: Ana y Beto");
    expect(h).toContain("Empate · 1.er lugar");
    expect(h).not.toContain("campeón de Mi parche");
    expect(h).toContain("Tercer lugar");
  });
  it("sin participantes clasificados: no hay podio ni celebración", () => {
    const h = text(pod([]));
    expect(h).not.toContain("campeón de");
    expect(h).not.toContain("Celebrar de nuevo");
  });
});

const team = (id: string) => ({ id, name: `Equipo ${id}`, code: id.toUpperCase(), flag_emoji: "🏴" });
const stages: CopaStage[] = [{ id: "g", code: "g", name: "Grupos", sort_order: 1, is_knockout: false }, { id: "sf", code: "sf", name: "Semifinal", sort_order: 2, is_knockout: true }, { id: "f", code: "f", name: "Gran final", sort_order: 3, is_knockout: true }];
let k = 0;
const m = (o: Partial<CopaMatch> & { stage_id: string }): CopaMatch => ({ id: `x${++k}`, match_number: null, starts_at: "2027-06-10T18:00:00Z", venue: null, status: "scheduled", home_score: null, away_score: null, home_placeholder: null, away_placeholder: null, home_team: null, away_team: null, winner_side: null, group_code: null, official: false, ...o });
const matches = [
  m({ stage_id: "g", group_code: "A", home_team: team("a1"), away_team: team("a2"), home_score: 2, away_score: 0, status: "finished", official: true }),
  m({ stage_id: "g", group_code: "B", home_team: team("b1"), away_team: team("b2"), home_score: 1, away_score: 0, status: "finished", official: true }),
  m({ stage_id: "sf", match_number: 1, home_placeholder: "Winner Group A", away_placeholder: "Runner-up Group B" }),
  m({ stage_id: "sf", match_number: 2, home_placeholder: "Winner Group B", away_placeholder: "Runner-up Group A" }),
  m({ stage_id: "f", match_number: 3, home_placeholder: "Winner M1", away_placeholder: "Winner M2" }),
];

describe("Camino a la Copa (render con fixtures)", () => {
  it("vista por fase: pestañas por fase del torneo, cupos oficiales y placeholders sin inventar equipos", () => {
    const h = renderToStaticMarkup(<CaminoTabs model={buildCopaModel(stages, matches)} tz="America/Bogota" />);
    const t = text(h);
    expect(t).toContain("Fase de Grupos");
    expect(t).toContain("Semifinal");
    expect(t).toContain("Gran final");
    expect(t).toContain("Por fase");
    expect(t).toContain("Bracket");
    expect(h).toContain("overflow-x-auto no-scrollbar");
    expect(t).not.toContain("mejor tercero"); // sin matriz de terceros fuera del formato Mundial
  });
  it("sin árbol verificable no se ofrece el Bracket", () => {
    const t = text(renderToStaticMarkup(<CaminoTabs model={buildCopaModel(stages, [...matches.slice(0, 2), m({ stage_id: "f", home_placeholder: "Ganador", away_placeholder: "Otro" })])} tz="UTC" />));
    expect(t).not.toContain("Bracket");
    expect(t).toContain("Gran final");
  });
});

describe("Bracket (render con fixtures)", () => {
  it("columnas por ronda, conectores y cupos oficiales de grupos terminados; la final queda por definir", () => {
    const model = buildCopaModel(stages, matches);
    const h = renderToStaticMarkup(<BracketView model={model} resolved={resolveCopa(model)} />);
    const t = text(h);
    expect(model.treeOk).toBe(true);
    expect(t).toContain("Semifinal");
    expect(t).toContain("🏆 Gran final");
    expect(t).toContain("A1"); // primero del grupo A: cupo oficial
    expect(t).toContain("Winner M1"); // la final aún no tiene ganadores de semifinal: placeholder, sin inventar
    expect(h.match(/<svg/g)?.length).toBeGreaterThanOrEqual(1);
  });
});
