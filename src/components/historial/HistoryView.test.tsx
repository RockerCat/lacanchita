import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { historyFixture } from "@/lib/fixtures";
import HistoryView from "./HistoryView";

const html = renderToStaticMarkup(
  <HistoryView history={historyFixture} parcheName="Parche ficticio" currentUserId={historyFixture.rows.find((r) => r.position === 1)!.user_id!} />
);
const text = html.replace(/<[^>]+>/g, " ");

describe("HistoryView (fixture)", () => {
  it("13 filas clasificadas y 5 miembros sin posición", () => {
    expect(html.match(/data-testid="standing-row"/g)).toHaveLength(13);
    expect(html.match(/data-testid="unranked-row"/g)).toHaveLength(5);
    expect(text).toMatch(/Sin posición · Membresía deshabilitada/);
    expect(text).toMatch(/Sin posición · Administraba el parche/);
  });
  it("muestra estadísticas deportivas", () => {
    for (const t of ["124", "pts", "⚡", "✓", "preds", "Campeón", "Subcampeón"]) {
      expect(text).toContain(t);
    }
  });
  it("recupera el podio original: 2.º · campeón · 3.º con las posiciones oficiales", () => {
    expect(html).toContain('data-testid="podium-view"');
    expect(html.match(/data-testid="podium-place"/g)).toHaveLength(3);
    expect(text).toMatch(/Podio final/);
    expect(text).toMatch(/🥇 Campeón/);
    expect(text).toMatch(/🥈 Segundo lugar/);
    expect(text).toMatch(/🥉 Tercer lugar/);
    expect(text).toMatch(/Jugador A, campeón de Parche ficticio/);
    expect(text).toMatch(/Ventaja final\s+1\b/); // 124 − 123
    expect(html).toContain("animate-podium-champion-glow");
  });
  it("corte histórico, no cierre oficial; resultados marcados como derivados", () => {
    expect(text).toContain("Corte histórico");
    expect(text).toContain("No es un cierre oficial");
    expect(text).toMatch(/No están verificados con una fuente\s+oficial externa/);
  });
  it("sin ninguna referencia monetaria", () => {
    expect(text).not.toMatch(/\b(COP|premios?|bolsa|pagos?|pagad[oa]s?|cuotas?|apuestas?|dinero|ganancias?)\b|\$/i);
  });
  it("marca la fila del usuario actual", () => {
    expect(text).toMatch(/Jugador A\s+tú/);
  });
});
