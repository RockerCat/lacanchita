import { describe, expect, it } from "vitest";
import { applyQuickFilter, dayKey, defaultFilter, formatDayHeader, groupByDay, type BoardItem } from "./board";

const TZ = "America/Bogota";
const it_ = (id: string, startsAt: string, status: string, state: BoardItem["state"] = "none"): BoardItem => ({ id, startsAt, status, state });

describe("calendario operativo de Control", () => {
  it("el día se toma de la zona del torneo, no de UTC", () => {
    // 02:00 UTC del 11 = 21:00 del 10 en Bogotá
    expect(dayKey("2027-06-11T02:00:00Z", TZ)).toBe("2027-06-10");
    expect(dayKey("2027-06-11T02:00:00Z", "UTC")).toBe("2027-06-11");
    expect(dayKey("2027-06-11T02:00:00Z", "Zona/Invalida")).toBe("2027-06-11");
  });

  it("arranca en «En vivo» solo si hay un partido en juego", () => {
    expect(defaultFilter([it_("a", "2027-06-10T19:00:00Z", "scheduled")])).toBe("all");
    expect(defaultFilter([it_("a", "2027-06-10T19:00:00Z", "live", "live"), it_("b", "2027-06-11T19:00:00Z", "scheduled")])).toBe("live");
  });

  const list = [
    it_("live", "2027-06-10T19:00:00Z", "live", "live"),
    it_("next", "2027-06-11T19:00:00Z", "scheduled"),
    it_("done", "2027-06-09T19:00:00Z", "finished", "official"),
    it_("old", "2026-06-01T19:00:00Z", "finished", "imported"),
    it_("post", "2027-06-12T19:00:00Z", "postponed"),
    it_("canc", "2027-06-13T19:00:00Z", "cancelled"),
  ];

  it("los filtros rápidos separan en vivo, próximos, finalizados, hoy y aplazados/cancelados", () => {
    const ids = (f: Parameters<typeof applyQuickFilter>[1]) => applyQuickFilter(list, f, "2027-06-10", TZ).map((m) => m.id);
    expect(ids("all")).toHaveLength(6);
    expect(ids("live")).toEqual(["live"]);
    expect(ids("today")).toEqual(["live"]);
    expect(ids("upcoming")).toEqual(["next"]);
    expect(ids("finished")).toEqual(["done", "old"]);
    expect(ids("other")).toEqual(["post", "canc"]);
  });

  it("agrupa por día en orden y ordena por hora dentro del día", () => {
    const g = groupByDay([it_("b", "2027-06-10T22:00:00Z", "scheduled"), it_("a", "2027-06-10T15:00:00Z", "scheduled"), it_("c", "2027-06-09T15:00:00Z", "scheduled")], TZ);
    expect(g.map(([k]) => k)).toEqual(["2027-06-09", "2027-06-10"]);
    expect(g[1][1].map((m) => m.id)).toEqual(["a", "b"]);
  });

  it("encabezado de día legible en español", () => {
    expect(formatDayHeader("2027-06-10")).toMatch(/^Jueves,? 10 de junio$/i);
  });
});
