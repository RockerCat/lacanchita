import { describe, expect, it } from "vitest";
import { signupErrorMessage, validateSignup } from "./registro";

describe("registro", () => {
  it("valida nombre, correo y contraseña", () => {
    expect(validateSignup({ name: "Ana", email: "ana@ejemplo.com", password: "12345678" })).toBeNull();
    expect(validateSignup({ name: "A", email: "ana@ejemplo.com", password: "12345678" })).toMatch(/nombre/);
    expect(validateSignup({ name: "Ana", email: "ana", password: "12345678" })).toMatch(/correo/);
    expect(validateSignup({ name: "Ana", email: "ana@ejemplo.com", password: "123" })).toMatch(/8 caracteres/);
  });
  it("errores de Supabase en español", () => {
    expect(signupErrorMessage({ code: "weak_password" })).toMatch(/débil/);
    expect(signupErrorMessage({ code: "over_email_send_rate_limit" })).toMatch(/demasiados correos/i);
    expect(signupErrorMessage({ code: "signup_disabled" })).toMatch(/cerrado/);
    expect(signupErrorMessage(null)).toMatch(/No pudimos crear/);
  });
});

import { resetErrorMessage, updatePasswordErrorMessage, validateEmail, validateNewPassword } from "./registro";

describe("recuperación de contraseña", () => {
  it("valida correo y contraseña nueva", () => {
    expect(validateEmail("a@b.co")).toBeNull();
    expect(validateEmail("sin-arroba")).not.toBeNull();
    expect(validateNewPassword("12345678", "12345678")).toBeNull();
    expect(validateNewPassword("1234567")).toMatch(/8 caracteres/);
    expect(validateNewPassword("12345678", "otra-cosa")).toMatch(/no coinciden/);
    expect(validateNewPassword("x".repeat(73))).toMatch(/demasiado larga/);
  });
  it("mensajes humanos, sin errores crudos", () => {
    expect(resetErrorMessage({ code: "over_email_send_rate_limit" })).toMatch(/demasiados correos/);
    expect(resetErrorMessage({ status: 500 })).toMatch(/Inténtalo de nuevo/);
    expect(updatePasswordErrorMessage({ code: "same_password" })).toMatch(/distinta/);
    expect(updatePasswordErrorMessage({ code: "session_not_found" })).toMatch(/enlace venció/);
    expect(updatePasswordErrorMessage({ code: "otro" })).not.toMatch(/supabase|otro/i);
  });
});
