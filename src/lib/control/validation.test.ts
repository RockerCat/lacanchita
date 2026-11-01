import { describe, expect, it } from "vitest";
import { validityMessage } from "./validation";

describe("validityMessage", () => {
  it("campo vacío: mensaje en español (no el del navegador)", () => {
    const m = validityMessage({ valueMissing: true });
    expect(m).toBe("Este campo es obligatorio.");
    expect(m).not.toMatch(/please|fill out/i);
  });
  it("longitudes, rangos y números", () => {
    expect(validityMessage({ tooShort: true }, { minLength: 2 })).toBe("Escribe al menos 2 caracteres.");
    expect(validityMessage({ tooLong: true }, { maxLength: 80 })).toBe("No puede tener más de 80 caracteres.");
    expect(validityMessage({ rangeUnderflow: true }, { min: "0" })).toBe("Debe ser 0 o más.");
    expect(validityMessage({ rangeOverflow: true }, { max: "30" })).toBe("No puede ser mayor que 30.");
    expect(validityMessage({ badInput: true })).toBe("Escribe un número entero válido.");
  });
  it("patrón: usa el mensaje propio del campo si lo tiene", () => {
    expect(validityMessage({ patternMismatch: true }, { dataset: { patternMessage: "Usa solo minúsculas y guiones." } })).toBe("Usa solo minúsculas y guiones.");
    expect(validityMessage({ patternMismatch: true })).toBe("El formato no es válido.");
  });
  it("válido → null; el primer problema gana", () => {
    expect(validityMessage({})).toBeNull();
    expect(validityMessage({ valueMissing: true, patternMismatch: true })).toBe("Este campo es obligatorio.");
  });
});
