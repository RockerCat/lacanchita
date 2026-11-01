import { describe, expect, it } from "vitest";
import { routeDecision, safeNextPath } from "./navigation";

describe("safeNextPath", () => {
  it("acepta rutas internas", () => {
    expect(safeNextPath("/parches/abc")).toBe("/parches/abc");
    expect(safeNextPath("/invitacion/AbC_def-1234567890123456789012345678901234")).toBe(
      "/invitacion/AbC_def-1234567890123456789012345678901234"
    );
  });
  it.each([undefined, null, "", "https://evil.example", "//evil.example", "/\\evil.example", "parches", "/login", "/login?next=/x", "/registro", "/auth/confirmar", "/\u0000x"])(
    "rechaza %s y vuelve al inicio",
    (value) => expect(safeNextPath(value)).toBe("/")
  );
});

describe("routeDecision", () => {
  it("sin sesión, una ruta privada redirige a login recordando el destino", () => {
    expect(routeDecision("/parches/abc", "?t=1", false)).toEqual({ redirectTo: "/login?next=%2Fparches%2Fabc%3Ft%3D1" });
    expect(routeDecision("/parches", "", false)).toEqual({ redirectTo: "/login?next=%2Fparches" });
    expect(routeDecision("/control", "", false)).toEqual({ redirectTo: "/login?next=%2Fcontrol" });
  });
  it("sin sesión, una invitación conserva su destino", () => {
    expect(routeDecision("/invitacion/tok", "", false)).toEqual({ redirectTo: "/login?next=%2Finvitacion%2Ftok" });
  });
  it("sin sesión, login y registro son accesibles", () => {
    expect(routeDecision("/login", "", false)).toEqual({ redirectTo: null });
    expect(routeDecision("/registro", "?next=%2Finvitacion%2Ftok", false)).toEqual({ redirectTo: null });
  });
  it("la portada pública es accesible sin sesión y con sesión la decide la página (sin bucles)", () => {
    expect(routeDecision("/", "", false)).toEqual({ redirectTo: null });
    expect(routeDecision("/", "", true)).toEqual({ redirectTo: null });
  });
  it("la confirmación de correo es accesible con y sin sesión", () => {
    expect(routeDecision("/auth/confirmar", "?code=x", false)).toEqual({ redirectTo: null });
    expect(routeDecision("/auth/confirmar", "?code=x", true)).toEqual({ redirectTo: null });
  });
  it("con sesión, login/registro llevan al destino seguro", () => {
    expect(routeDecision("/login", "?next=%2Fparches%2Fx", true)).toEqual({ redirectTo: "/parches/x" });
    expect(routeDecision("/registro", "?next=https%3A%2F%2Fevil.example", true)).toEqual({ redirectTo: "/inicio" });
  });
  it("con sesión, las rutas privadas pasan", () => {
    expect(routeDecision("/parches", "", true)).toEqual({ redirectTo: null });
  });
});
