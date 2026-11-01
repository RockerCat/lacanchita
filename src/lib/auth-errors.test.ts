import { describe, expect, it } from "vitest";
import { loginErrorMessage } from "./auth-errors";

describe("loginErrorMessage", () => {
  it("credenciales inválidas, sin revelar si el correo existe", () => {
    expect(loginErrorMessage({ code: "invalid_credentials", status: 400 })).toMatch(/Correo o contraseña incorrectos/);
  });
  it("límite de intentos", () => {
    expect(loginErrorMessage({ code: "over_request_rate_limit", status: 429 })).toMatch(/Demasiados intentos/);
    expect(loginErrorMessage({ status: 429 })).toMatch(/Demasiados intentos/);
  });
  it("correo sin confirmar y cuenta bloqueada", () => {
    expect(loginErrorMessage({ code: "email_not_confirmed" })).toMatch(/no está confirmado/);
    expect(loginErrorMessage({ code: "user_banned" })).toMatch(/no tiene acceso/);
  });
  it("caída del servicio y desconocidos", () => {
    expect(loginErrorMessage({ status: 503 })).toMatch(/no responde/);
    expect(loginErrorMessage(null)).toBe("No pudimos iniciar sesión. Inténtalo de nuevo.");
  });
});

import { isNextControlFlow, NETWORK_ERROR_MESSAGE } from "./auth-errors";

describe("fallos de red en acciones de formulario", () => {
  it("las excepciones de redirect/notFound de Next.js no se tratan como fallo de red", () => {
    expect(isNextControlFlow({ digest: "NEXT_REDIRECT;replace;/parches;307;" })).toBe(true);
    expect(isNextControlFlow({ digest: "NEXT_HTTP_ERROR_FALLBACK;404" })).toBe(true);
    expect(isNextControlFlow(new TypeError("Failed to fetch"))).toBe(false);
    expect(isNextControlFlow(null)).toBe(false);
    expect(NETWORK_ERROR_MESSAGE).toMatch(/conexión/);
  });
});
