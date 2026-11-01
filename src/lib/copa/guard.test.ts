import { describe, expect, it } from "vitest";
import { advancingSide, downstreamMessage, outcomeChangesAdvance, startedDependents } from "./guard";

describe("protección de llaves", () => {
  it("quién avanza: marcador, o ganador de llave en empate; sin ganador no avanza nadie", () => {
    expect(advancingSide({ home: 2, away: 1, winnerSide: null })).toBe("home");
    expect(advancingSide({ home: 0, away: 1, winnerSide: "home" })).toBe("away");
    expect(advancingSide({ home: 1, away: 1, winnerSide: "away" })).toBe("away");
    expect(advancingSide({ home: 1, away: 1, winnerSide: null })).toBeNull();
    expect(advancingSide({ home: null, away: null, winnerSide: null })).toBeNull();
  });
  it("una corrección que no cambia el que avanza se permite; la que sí lo cambia se detecta", () => {
    expect(outcomeChangesAdvance({ home: 2, away: 0, winnerSide: null }, { home: 3, away: 1, winnerSide: null })).toBe(false);
    expect(outcomeChangesAdvance({ home: 2, away: 0, winnerSide: null }, { home: 0, away: 1, winnerSide: null })).toBe(true);
    expect(outcomeChangesAdvance({ home: 1, away: 1, winnerSide: "home" }, { home: 1, away: 1, winnerSide: "away" })).toBe(true);
  });
  it("solo los dependientes en vivo o finalizados bloquean; programados, aplazados o cancelados no", () => {
    const deps = [{ match_number: 104, status: "live" }, { match_number: 103, status: "scheduled" }, { match_number: 105, status: "cancelled" }];
    expect(startedDependents(deps).map((d) => d.match_number)).toEqual([104]);
    expect(downstreamMessage(101, startedDependents(deps), "reabrir")).toContain("No se puede reabrir M101");
    expect(downstreamMessage(101, startedDependents(deps), "reabrir")).toContain("M104");
  });
});
