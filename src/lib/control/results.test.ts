import { describe, expect, it } from "vitest";
import { resultState, summarizeResults, type PendingDraft } from "./results";

const base = { status: "scheduled", home_score: null, away_score: null, result_confirmed_at: null };
const draft: PendingDraft = { match_id: "a", home_score: 2, away_score: 1, winner_side: null, revision: 1 };

describe("resultState (Fase 3.2)", () => {
  it("sin marcador ni borrador: sin resultado", () => {
    expect(resultState(base)).toBe("none");
    expect(resultState({ ...base, status: "postponed" })).toBe("none");
  });
  it("un partido en vivo es público y se distingue de uno finalizado", () => {
    expect(resultState({ ...base, status: "live", home_score: 1, away_score: 0 })).toBe("live");
  });
  it("finalizado con cierre = oficial", () => {
    expect(resultState({ status: "finished", home_score: 2, away_score: 1, result_confirmed_at: "2027-06-10T21:00:00Z" })).toBe("official");
  });
  it("un borrador heredado es «pendiente» y nunca oficial ni en vivo", () => {
    expect(resultState(base, draft)).toBe("pending");
    expect(resultState({ status: "finished", home_score: 2, away_score: 1, result_confirmed_at: "x" }, draft)).toBe("official");
  });
  it("histórico importado (finalizado sin cierre)", () => {
    expect(resultState({ ...base, status: "finished", home_score: 0, away_score: 0 })).toBe("imported");
  });
});

describe("summarizeResults", () => {
  it("cuenta cada estado por separado", () => {
    const s = summarizeResults(
      [
        { ...base, id: "a" },
        { ...base, id: "b", status: "live", home_score: 0, away_score: 0 },
        { id: "c", status: "finished", home_score: 1, away_score: 1, result_confirmed_at: "x" },
        { id: "d", status: "finished", home_score: 1, away_score: 0, result_confirmed_at: null },
      ],
      [draft]
    );
    expect(s).toEqual({ total: 4, none: 0, live: 1, official: 1, imported: 1, pending: 1 });
  });
});
