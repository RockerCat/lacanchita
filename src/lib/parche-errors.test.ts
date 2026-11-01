import { describe, expect, it } from "vitest";
import { parcheErrorMessage } from "./parche-errors";

describe("parcheErrorMessage", () => {
  it.each([
    ["not_authorized", /No tienes permiso/],
    ["owner_cannot_leave", /creador del parche/],
    ["last_admin", /única persona que administra/],
    ["owner_protected", /creador del parche no se puede/],
    ["invalid_name", /entre 2 y 50/],
  ])("%s", (code, re) => expect(parcheErrorMessage({ message: code })).toMatch(re));
  it("desconocido → genérico, sin filtrar detalles técnicos", () => {
    expect(parcheErrorMessage({ message: "duplicate key value violates unique constraint" })).toBe(
      "No pudimos completar la operación. Inténtalo de nuevo."
    );
    expect(parcheErrorMessage(null)).toMatch(/No pudimos/);
  });
});
