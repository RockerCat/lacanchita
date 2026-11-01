import { describe, expect, it } from "vitest";
import { controlErrorMessage, PUBLISH_ISSUE_LABELS } from "./errors";

describe("controlErrorMessage", () => {
  it("traduce códigos conocidos", () => {
    expect(controlErrorMessage({ message: "stale_revision" })).toMatch(/recarga la página/);
    expect(controlErrorMessage({ message: "winner_required" })).toMatch(/penales/);
    expect(controlErrorMessage({ message: "event_locked_history" })).toMatch(/solo lectura/);
  });
  it("no filtra mensajes internos desconocidos", () => {
    expect(controlErrorMessage({ message: 'duplicate key value violates unique constraint "x"' })).toBe(
      "No pudimos completar la operación. Inténtalo de nuevo."
    );
    expect(controlErrorMessage(null)).toMatch(/No pudimos/);
  });
  it("los requisitos de publicación tienen texto", () => {
    for (const k of ["no_stages", "few_teams", "no_matches", "match_without_sides", "invalid_timezone"]) {
      expect(PUBLISH_ISSUE_LABELS[k]).toBeTruthy();
    }
  });
});
