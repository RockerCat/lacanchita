import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/(privado)/control/actions", () => ({ updateLiveResultAction: async () => ({ error: null }), reopenMatchAction: async () => ({ error: null }) }));

import MatchRow, { type RowData } from "./MatchRow";
import MatchBoard from "./MatchBoard";

const row = (o: Partial<RowData> = {}): RowData => ({
  id: "m1", eventId: "e1", startsAt: "2027-06-10T19:00:00Z", status: "scheduled", state: "none", homeScore: null, awayScore: null, winnerSide: null,
  revision: 0, stageName: "Grupos", isKnockout: false, matchNumber: 3, groupCode: "A", roundLabel: null,
  home: { name: "Águilas", team: null }, away: { name: "Bravos", team: null }, playable: true, pending: null, ...o,
});
const text = (h: string) => h.replace(/<script[\s\S]*?<\/script>/g, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
const render = (r: RowData, editable = true) => renderToStaticMarkup(<MatchRow row={r} base="/control/torneos/qa" timezone="America/Bogota" editable={editable} />);

describe("MatchRow (fila operable del original)", () => {
  it("en vivo: se destaca (borde rojo, chip En vivo) y trae el editor de marcador con la revisión vigente", () => {
    const h = render(row({ status: "live", state: "live", homeScore: 1, awayScore: 0, revision: 4 }));
    expect(h).toContain('data-live="true"');
    expect(h).toContain("border-danger/30");
    expect(text(h)).toContain("En vivo");
    expect(text(h)).toContain("1–0");
    expect(h).toContain('name="home_score"');
    expect(h).toContain('name="expected_revision" value="4"');
    expect(h).toContain("🔴 En vivo");
    expect(text(h)).toContain("Guardar");
  });

  it("programado jugable: fila compacta con 'Prog.', selector de estado y Guardar sin cambios deshabilitado", () => {
    const h = render(row());
    expect(text(h)).toContain("Prog.");
    expect(text(h)).toContain("G.A");
    expect(h).toContain("🗓 Programado");
    expect(h).not.toContain('data-live="true"');
    expect(h).toMatch(/<button type="submit" disabled=""[^>]*>Guardar<\/button>/);
    expect(h).toContain('name="expected_revision" value="0"');
  });

  it("las cajas de goles son las del original (h-8 w-10), sin botones +/- y sin botón de ancho completo", () => {
    const h = render(row({ status: "live", state: "live", homeScore: 0, awayScore: 0 }));
    expect(h).toContain("w-10 text-center");
    expect(h).not.toContain("w-full bg-cancha");
    expect(h).not.toMatch(/aria-label="(Sumar|Restar)/);
  });

  it("finalizado: marcador definitivo y sin guardado silencioso (Guardar deshabilitado hasta cambiar algo; la corrección pedirá motivo)", () => {
    const h = render(row({ status: "finished", state: "official", homeScore: 2, awayScore: 1, revision: 2 }));
    expect(text(h)).toContain("Fin.");
    expect(text(h)).toContain("2–1");
    expect(h).toContain("✓ Finalizado");
    expect(h).not.toContain("🗓 Programado");
    expect(h).toMatch(/<button type="button" disabled=""[^>]*>Corregir<\/button>/);
    expect(h).not.toContain('name="reason"');
  });

  it("eliminatoria finalizada empatada: ofrece el ganador de la llave con el valor guardado", () => {
    const h = render(row({ status: "finished", state: "official", homeScore: 1, awayScore: 1, winnerSide: "away", isKnockout: true }));
    expect(h).toContain('name="winner_side"');
    expect(h).toMatch(/<option value="away" selected="">/);
  });

  it("aplazado y cancelado: estado claro, sin editor de marcador; el cancelado no ofrece reactivarlo", () => {
    const p = render(row({ status: "postponed", playable: false }));
    expect(text(p)).toContain("Aplazado");
    expect(p).not.toContain('name="home_score"');
    const c = render(row({ status: "cancelled", playable: false }));
    expect(text(c)).toContain("Cancelado (definitivo)");
    expect(text(c)).not.toContain("Editar partido");
  });

  it("importado o torneo de solo lectura: sin controles", () => {
    expect(render(row({ status: "finished", state: "imported", homeScore: 2, awayScore: 0 }))).not.toContain('name="home_score"');
    expect(render(row({ status: "live", state: "live" }), false)).not.toContain('name="home_score"');
  });

  it("marcador pendiente heredado: se muestra aparte y se resuelve en Resultados", () => {
    const h = render(row({ state: "pending", pending: { home: 2, away: 1 } }));
    expect(text(h)).toContain("2–1");
    expect(h).toContain("/control/torneos/qa/resultados?ver=pendientes");
  });
});

describe("MatchBoard", () => {
  it("con un partido en vivo arranca filtrado en En vivo y avisa arriba; los demás quedan fuera hasta cambiar el filtro", () => {
    const h = renderToStaticMarkup(<MatchBoard rows={[row({ id: "a", status: "live", state: "live" }), row({ id: "b", startsAt: "2027-06-11T19:00:00Z" })]} timezone="America/Bogota" todayKey="2027-06-10" base="/control/torneos/qa" editable />);
    expect(text(h)).toContain("1 partido en vivo");
    expect(h.match(/<article/g)).toHaveLength(1);
    expect(h).toContain('aria-pressed="true"');
  });

  it("sin partidos en vivo muestra todos", () => {
    const h = renderToStaticMarkup(<MatchBoard rows={[row({ id: "a" }), row({ id: "b", startsAt: "2027-06-11T19:00:00Z" })]} timezone="America/Bogota" todayKey="2027-06-10" base="/control/torneos/qa" editable />);
    expect(h.match(/<article/g)).toHaveLength(2);
    expect(text(h)).not.toContain("en vivo ·");
  });
});
