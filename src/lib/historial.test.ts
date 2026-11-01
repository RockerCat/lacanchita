import { describe, expect, it } from "vitest";
import {
  podiumTone,
  rankingCriteriaText,
  snapshotNotice,
  splitStandings,
  statValue,
  toPodiumEntries,
  unrankedReasonLabel,
  type SnapshotRow,
} from "./historial";
import { historyFixture } from "./fixtures";

describe("splitStandings", () => {
  it("13 clasificados en orden y 5 sin posición", () => {
    const { ranked, unranked } = splitStandings(historyFixture.rows);
    expect(ranked).toHaveLength(13);
    expect(ranked.map((x) => x.position)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]);
    expect(unranked).toHaveLength(5);
    expect(unranked.every((x) => x.position === null)).toBe(true);
  });
});

describe("valores y textos", () => {
  const unranked = historyFixture.rows.find((r) => r.participation === "unranked") as SnapshotRow;
  it("cero real vs desconocido", () => {
    expect(statValue(unranked, 0)).toBe("0");
    expect(statValue({ ...unranked, stats_status: "unknown" }, null)).toBe("—");
  });
  it("motivos sin clasificación", () => {
    expect(unrankedReasonLabel("disabled")).toMatch(/deshabilitada/);
    expect(unrankedReasonLabel("platform_admin")).toMatch(/no competía/);
    expect(unrankedReasonLabel(null)).toBe("Sin clasificación");
  });
  it("acentos de podio solo para 1.º–3.º", () => {
    expect([1, 2, 3, 4, null].map((p) => podiumTone(p))).toEqual(["gold", "silver", "bronze", null, null]);
  });
  it("corte histórico no se presenta como cierre oficial", () => {
    const n = snapshotNotice({ kind: "historical_cut", source: "legacy_import" });
    expect(n.title).toBe("Corte histórico");
    expect(n.body).toMatch(/No es un cierre oficial/);
    expect(snapshotNotice({ kind: "final_close", source: "close_run" }).title).toBe("Clasificación final oficial");
  });
  it("criterios de desempate", () => {
    expect(rankingCriteriaText(["points desc", "exact_hits desc", "result_hits desc"])).toBe(
      "Orden: puntos, luego marcadores exactos, luego resultados acertados."
    );
    expect(rankingCriteriaText(undefined)).toBeNull();
  });
});

describe("toPodiumEntries (adaptador del podio)", () => {
  const row = (n: number, pos: number | null, over: Partial<SnapshotRow> = {}): SnapshotRow => ({
    row_number: n, user_id: `u${n}`, display_name: `J${n}`, participation: "ranked", unranked_reason: null, position: pos,
    position_shared: false, stats_status: "verified", points: 10 - n, exact_hits: 1, result_hits: 2, misses: 0, predictions_count: 3, ...over,
  });
  it("conserva posición y puntos de la fotografía, sin recalcular", () => {
    const e = toPodiumEntries([row(3, 3), row(1, 1), row(2, 2)])!;
    expect(e.map((x) => [x.user_id, x.rank, x.total_points])).toEqual([["u1", 1, 9], ["u2", 2, 8], ["u3", 3, 7]]);
  });
  it("los empates conservan la posición compartida (no inventa desempates)", () => {
    const e = toPodiumEntries([row(1, 1), row(2, 2, { points: 5 }), row(3, 2, { points: 5 })])!;
    expect(e.map((x) => x.rank)).toEqual([1, 2, 2]);
  });
  it("estadísticas desconocidas → null (nunca se presentan como cero)", () => {
    expect(toPodiumEntries([row(1, 1, { stats_status: "unknown", points: null })])).toBeNull();
  });
});
