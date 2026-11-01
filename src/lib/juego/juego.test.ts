import { describe, expect, it, vi } from "vitest";
import { predictionErrorMessage } from "./errors";
import { getLeaderboard, getMatchPredictions, getStagePoints, savePrediction } from "./data";
import { isPredictionOpen, matchClosedReason, projectLeaderboard, simulatePoints } from "./scoring";

const G = { exact: 3, result: 1 };
const KO = { exact: 10, result: 7 };

describe("simulatePoints (original de La Penúltima, puntos por fase de event_stages)", () => {
  it("marcador exacto y resultado acertado son excluyentes", () => {
    expect(simulatePoints(2, 1, 2, 1, G)).toEqual({ points: 3, reason: "exact" });
    expect(simulatePoints(1, 0, 2, 1, G)).toEqual({ points: 1, reason: "result" });
  });
  it("empates: exacto o resultado; ganador equivocado = 0", () => {
    expect(simulatePoints(1, 1, 1, 1, G)).toEqual({ points: 3, reason: "exact" });
    expect(simulatePoints(0, 0, 2, 2, G)).toEqual({ points: 1, reason: "result" });
    expect(simulatePoints(0, 1, 2, 1, G)).toEqual({ points: 0, reason: "miss" });
    expect(simulatePoints(1, 1, 2, 1, G)).toEqual({ points: 0, reason: "miss" });
  });
  it("usa la configuración de la fase", () => {
    expect(simulatePoints(1, 1, 1, 1, KO).points).toBe(10);
    expect(simulatePoints(0, 0, 1, 1, KO).points).toBe(7);
  });
});

describe("matchClosedReason", () => {
  const T0 = Date.parse("2027-06-10T20:00:00Z");
  it("abierto: programado o aplazado antes de la hora", () => {
    expect(matchClosedReason({ status: "scheduled", starts_at: "2027-06-10T21:00:00Z" }, T0)).toBeNull();
    expect(matchClosedReason({ status: "postponed", starts_at: "2027-06-12T21:00:00Z" }, T0)).toBeNull();
    expect(isPredictionOpen({ status: "scheduled", starts_at: "2027-06-10T21:00:00Z" }, T0)).toBe(true);
  });
  it("cerrado por hora, por estado y al reabrir un finalizado (live)", () => {
    expect(matchClosedReason({ status: "scheduled", starts_at: "2027-06-10T20:00:00Z" }, T0)).toBe("match_started");
    expect(matchClosedReason({ status: "postponed", starts_at: "2027-06-09T21:00:00Z" }, T0)).toBe("match_started");
    for (const status of ["live", "finished", "cancelled"]) expect(matchClosedReason({ status, starts_at: "2027-06-12T21:00:00Z" }, T0)).toBe("match_not_open");
  });
});

describe("projectLeaderboard (tabla proyectada en vivo)", () => {
  const board = [
    { user_id: "a", display_name: "Ana", rank: 1, total_points: 5 },
    { user_id: "b", display_name: "Beto", rank: 2, total_points: 4 },
    { user_id: "c", display_name: "Caro", rank: 3, total_points: 4 },
    { user_id: "d", display_name: "Dani", rank: 4, total_points: 0 },
  ];
  it("suma lo que ganaría cada uno; sin pronóstico suma 0; posiciones por total", () => {
    const r = projectLeaderboard(
      board,
      [{ user_id: "b", pred_home: 2, pred_away: 1 }, { user_id: "c", pred_home: 0, pred_away: 1 }, { user_id: "d", pred_home: 1, pred_away: 0 }],
      { home: 2, away: 1 },
      G
    );
    expect(r.map((e) => `${e.display_name}:${e.projected_total}/${e.projected_rank}`)).toEqual(["Beto:7/1", "Ana:5/2", "Caro:4/3", "Dani:1/4"]);
    expect(r.find((e) => e.user_id === "a")).toMatchObject({ sim_points: 0, sim_reason: null, pred_home: null });
    expect(r.find((e) => e.user_id === "d")?.sim_reason).toBe("result");
  });
  it("empates en el total comparten posición", () => {
    const r = projectLeaderboard(board.slice(0, 2), [], { home: 0, away: 0 }, G);
    expect(r.map((e) => e.projected_rank)).toEqual([1, 2]);
    const tie = projectLeaderboard([{ ...board[0], total_points: 4 }, board[1]], [], { home: 0, away: 0 }, G);
    expect(tie.map((e) => e.projected_rank)).toEqual([1, 1]);
  });
});

describe("mensajes de error de pronósticos", () => {
  it("en español y sin detalles internos", () => {
    expect(predictionErrorMessage({ message: "match_started" })).toMatch(/ya comenzó/);
    expect(predictionErrorMessage({ message: "superadmin_cannot_predict" })).toMatch(/no participa como jugador/);
    expect(predictionErrorMessage({ message: 'duplicate key value violates unique constraint "x"' })).toBe("No se pudo guardar tu pronóstico. Inténtalo de nuevo.");
  });
});

describe("contratos de datos (cliente simulado)", () => {
  const client = (rpc: unknown, from?: unknown) => ({ rpc, from }) as never;
  it("savePrediction envía la inscripción, el partido y el marcador; mapea errores", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { id: "p1", home_score: 2, away_score: 1 }, error: null });
    const r = await savePrediction(client(rpc), { parcheEventId: "pe", matchId: "m", home: 2, away: 1 });
    expect(rpc).toHaveBeenCalledWith("save_prediction", { p_parche_event_id: "pe", p_match_id: "m", p_home: 2, p_away: 1 });
    expect(r.ok).toBe(true);
    rpc.mockResolvedValue({ data: null, error: { message: "match_started" } });
    expect(await savePrediction(client(rpc), { parcheEventId: "pe", matchId: "m", home: 2, away: 1 })).toMatchObject({ ok: false, code: "match_started" });
  });
  it("getLeaderboard normaliza números; getMatchPredictions traduce predictions_hidden", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [{ user_id: "u", display_name: "U", rank: "1", total_points: "7", exact_count: 1, result_count: 0, pred_count: 2 }], error: null });
    expect(await getLeaderboard(client(rpc), "pe")).toEqual([{ user_id: "u", display_name: "U", rank: 1, total_points: 7 }]);
    expect(rpc).toHaveBeenCalledWith("get_parche_event_leaderboard", { p_parche_event_id: "pe" });
    rpc.mockResolvedValue({ data: null, error: { message: "predictions_hidden" } });
    await expect(getMatchPredictions(client(rpc), "pe", "m")).rejects.toThrow(/cuando empieza el partido/);
  });
  it("getStagePoints expone los puntos de event_stages", async () => {
    const from = () => ({ select: () => ({ eq: async () => ({ data: [{ id: "s1", name: "Grupos", is_knockout: false, exact_points: 3, result_points: 1 }], error: null }) }) });
    expect((await getStagePoints(client(vi.fn(), from), "ev")).get("s1")).toEqual({ name: "Grupos", isKnockout: false, exact: 3, result: 1 });
  });
});
