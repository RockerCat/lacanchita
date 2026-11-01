import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/(privado)/control/actions", () => ({
  updateLiveResultAction: async () => ({ error: null }),
  reopenMatchAction: async () => ({ error: null }),
  resolvePendingAction: async () => ({ error: null }),
  saveMatchAction: async () => ({ error: null }),
  uploadCrestAction: async () => ({ error: null }),
  removeCrestAction: async () => ({ error: null }),
}));
vi.mock("@/app/(privado)/parches/actions", () => ({ enrollEventAction: async () => ({ error: null }) }));

import ResultCard from "./ResultCard";
import EnrollEventsServer from "../parches/EnrollEvents";
import type { Side } from "./MatchCard";
import type { Match, Stage } from "@/lib/control/data";
import type { PendingDraft } from "@/lib/control/results";

const stage = (is_knockout: boolean): Stage => ({ id: "s1", event_id: "e1", code: "x", name: "Fase X", sort_order: 1, is_knockout, exact_points: 3, result_points: 1 });
const match = (o: Partial<Match> = {}): Match => ({
  id: "m1", event_id: "e1", stage_id: "s1", match_number: 7, group_code: null, starts_at: "2027-06-10T19:00:00Z", venue: null,
  home_team_id: "t1", away_team_id: "t2", home_placeholder: null, away_placeholder: null, teams_source: "assigned",
  status: "scheduled", home_score: null, away_score: null, winner_side: null, result_confirmed_at: null, result_confirmed_by: null,
  result_revision: 0, round_label: null, created_at: "2027-01-01T00:00:00Z", updated_at: "2027-01-01T00:00:00Z", ...o,
});
const side = (name: string): Side => ({ name, team: null });
const render = (m: Match, opts: { knockout?: boolean; editable?: boolean; draft?: PendingDraft } = {}) =>
  renderToStaticMarkup(<ResultCard match={m} stage={stage(opts.knockout ?? false)} draft={opts.draft} home={side("Águilas")} away={side("Bravos")} eventName="Copa Ficticia" eventSlug="copa-ficticia" timezone="America/Bogota" editable={opts.editable ?? true} />);
const textOf = (html: string) => html.replace(/<script[\s\S]*?<\/script>/g, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

describe("ResultCard (ciclo original: iniciar → marcador en vivo → finalizar)", () => {
  it("programado: se puede iniciar el partido (editor de estado y marcador), sin reabrir ni corregir", () => {
    const html = render(match());
    const t = textOf(html);
    expect(t).toContain("Iniciar partido");
    expect(html).toContain('name="status"');
    expect(html).toContain('name="home_score"');
    expect(html).toContain('name="expected_revision" value="0"');
    expect(t).not.toContain("Reabrir partido");
    expect(t).not.toContain("Corregir resultado");
    expect(t).toContain("Editar programación · aplazar · cancelar");
  });
  it("en vivo: marcador visible al instante, guardado directo con la revisión vista; sin confirmación por guardado", () => {
    const html = render(match({ status: "live", home_score: 1, away_score: 0, result_revision: 4 }));
    const t = textOf(html);
    expect(t).toContain("En vivo");
    expect(t).toContain("1 – 0");
    expect(t).toContain("Marcador en vivo");
    expect(t).toContain("Guardar marcador");
    expect(html).toContain('name="expected_revision" value="4"');
    expect(t).toContain("no calcula puntos");
    expect(t).not.toMatch(/pendiente|confirmar/i);
  });
  it("finalizado: oficial, se corrige con motivo o se reabre con motivo", () => {
    const html = render(match({ status: "finished", home_score: 2, away_score: 1, result_confirmed_at: "2027-06-10T22:00:00Z", result_revision: 5 }));
    const t = textOf(html);
    expect(t).toContain("Finalizado");
    expect(t).toContain("2 – 1");
    expect(t).toContain("Corregir resultado");
    expect(t).toContain("Reabrir partido");
    expect(html.match(/<textarea[^>]*name="reason"[^>]*required/g)).toHaveLength(2);
    expect(t).toContain("Revisión 5");
  });
  it("eliminatoria cerrada con empate: muestra quién avanzó; el editor pide el ganador de la llave solo al finalizar", () => {
    const html = render(match({ status: "finished", home_score: 1, away_score: 1, winner_side: "away", result_confirmed_at: "x", result_revision: 2 }), { knockout: true });
    expect(textOf(html)).toContain("Avanza Bravos (penales)");
    expect(html).toContain('name="winner_side"');
    expect(render(match({ status: "live", home_score: 1, away_score: 1 }), { knockout: true })).not.toContain('name="winner_side"');
  });
  it("aplazado o cancelado: sin editor de marcador; cancelado es definitivo", () => {
    const p = render(match({ status: "postponed" }));
    expect(p).not.toContain('name="home_score"');
    expect(textOf(p)).toContain("aplazado");
    const c = render(match({ status: "cancelled" }));
    expect(c).not.toContain("<form");
    expect(textOf(c)).toContain("definitivo");
  });
  it("sin equipos asignados no se puede iniciar", () => {
    const html = render(match({ home_team_id: null }));
    expect(textOf(html)).toContain("Asigna los dos equipos");
    expect(html).not.toContain('name="home_score"');
  });
  it("marcador pendiente del flujo anterior: nada se publica solo, solo aplicar en vivo o descartar", () => {
    const html = render(match(), { draft: { match_id: "m1", home_score: 2, away_score: 1, winner_side: null, revision: 1 } });
    const t = textOf(html);
    expect(t).toContain("Marcador pendiente (flujo anterior)");
    expect(t).toContain("Nada se publica solo");
    expect(t).toContain("Aplicar como marcador en vivo");
    expect(t).toContain("Descartar");
    expect(html).toContain('name="action" value="apply_live"');
    expect(html).toContain('name="action" value="discard"');
    expect(html).toContain('name="expected_revision" value="1"');
  });
  it("torneo histórico: sin formularios", () => {
    const html = render(match({ status: "finished", home_score: 1, away_score: 0 }), { editable: false });
    expect(html).not.toContain("<form");
    expect(textOf(html)).toContain("Importado (histórico)");
    expect(textOf(html)).toMatch(/sin un cierre explícito/);
  });
  it("sin referencias monetarias ni de puntos calculados en vivo", () => {
    const t = textOf(render(match({ status: "live", home_score: 2, away_score: 1 })));
    expect(t).not.toMatch(/\b(COP|premios?|bolsa|pagos?|cuotas?|apuestas?|dinero|ganancias?)\b|\$/i);
  });
});

describe("EnrollEvents", () => {
  it("lista los torneos disponibles con confirmación y aclara que no hay pronósticos retroactivos", () => {
    const html = renderToStaticMarkup(<EnrollEventsServer parcheId="p1" events={[{ id: "e1", name: "Copa Ficticia", status: "scheduled" }]} />);
    expect(textOf(html)).toContain("Copa Ficticia");
    expect(html).toContain("Incorporar al parche");
    expect(textOf(html)).toContain("no son retroactivos");
  });
  it("sin torneos disponibles", () => {
    expect(textOf(renderToStaticMarkup(<EnrollEventsServer parcheId="p1" events={[]} />))).toMatch(/No hay torneos nuevos/);
  });
});
