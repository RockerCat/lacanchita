import { describe, expect, it } from "vitest";
import { isGoal } from "./goal";
import { detailInterval, detailIsPassive, listInterval, shouldSkipTick } from "./polling";

describe("cadencias de sondeo (original de La Penúltima)", () => {
  it("listas: en vivo 10 s, sin partido en vivo 15 s, pestaña oculta 60 s", () => {
    expect(listInterval(true, false)).toBe(10_000);
    expect(listInterval(false, false)).toBe(15_000);
    expect(listInterval(true, true)).toBe(60_000);
  });
  const T0 = Date.parse("2027-06-10T20:00:00Z");
  it("detalle: finalizado/cancelado pasivo, en vivo 10 s, cerca del inicio 10 s, lejos 30 s, hora vencida 5 s, aplazado 30 s", () => {
    expect(detailInterval("live", "2027-06-10T19:00:00Z", false, T0)).toBe(10_000);
    expect(detailInterval("scheduled", "2027-06-10T20:03:00Z", false, T0)).toBe(10_000);
    expect(detailInterval("scheduled", "2027-06-10T20:30:00Z", false, T0)).toBe(30_000);
    expect(detailInterval("scheduled", "2027-06-10T19:59:00Z", false, T0)).toBe(5_000);
    expect(detailInterval("postponed", "2027-06-12T20:00:00Z", false, T0)).toBe(30_000);
    expect(detailInterval("finished", "2027-06-10T18:00:00Z", false, T0)).toBe(60_000);
    expect(detailInterval("live", "2027-06-10T19:00:00Z", true, T0)).toBe(60_000);
    expect(detailIsPassive("finished") && detailIsPassive("cancelled") && !detailIsPassive("live")).toBe(true);
  });
  it("tick: nunca encadena refrescos; con formulario abierto se pausa salvo hora de inicio vencida", () => {
    expect(shouldSkipTick({ refreshInFlight: true, isEditing: false })).toBe(true);
    expect(shouldSkipTick({ refreshInFlight: false, isEditing: true })).toBe(true);
    expect(shouldSkipTick({ refreshInFlight: false, isEditing: true, kickoffPassed: true })).toBe(false);
    expect(shouldSkipTick({ refreshInFlight: false, isEditing: false })).toBe(false);
  });
});

describe("detección de goles", () => {
  it("celebra cuando un marcador en vivo sube", () => {
    expect(isGoal({ home: 0, away: 0 }, { home: 1, away: 0 }, true)).toBe(true);
    expect(isGoal({ home: 1, away: 1 }, { home: 1, away: 2 }, true)).toBe(true);
  });
  it("no celebra: montaje inicial, null→0 al iniciar, correcciones a la baja, fuera de vivo o sin cambios", () => {
    expect(isGoal(null, { home: 1, away: 0 }, true)).toBe(false);
    expect(isGoal({ home: null, away: null }, { home: 0, away: 0 }, true)).toBe(false);
    expect(isGoal({ home: 1, away: 0 }, { home: 0, away: 0 }, true)).toBe(false);
    expect(isGoal({ home: 0, away: 0 }, { home: 1, away: 0 }, false)).toBe(false);
    expect(isGoal({ home: 1, away: 0 }, { home: 1, away: 0 }, true)).toBe(false);
  });
});
