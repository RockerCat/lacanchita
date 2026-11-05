import { describe, expect, it } from "vitest";
import { CONTROL_PATH, eventAcceptsEnrollment, playOptions, roleHome, safeReturnToPlay } from "./jugar";
import type { Membership } from "./parches";

const m = (id: string, role: Membership["role"], status: Membership["status"] = "active"): Membership => ({ parcheId: id, parcheName: `Parche ${id}`, role, status });

describe("jugar un torneo con mis parches", () => {
  it("sin parches → sin opciones (la página ofrece crear uno)", () => {
    expect(playOptions([], new Map(), "u")).toEqual([]);
  });
  it("administrador sin inscripción → puede inscribir (con confirmación); nunca automático", () => {
    expect(playOptions([m("a", "owner")], new Map(), "u")[0].kind).toBe("enroll");
    expect(playOptions([m("a", "admin")], new Map(), "u")[0].kind).toBe("enroll");
  });
  it("miembro normal sin inscripción → debe pedirlo a quien administra", () => {
    expect(playOptions([m("a", "member")], new Map(), "u")[0].kind).toBe("ask_admin");
  });
  it("parche ya inscrito → entrar al torneo, sin duplicar la inscripción", () => {
    const o = playOptions([m("a", "owner")], new Map([["a", "pe1"]]), "u")[0];
    expect(o).toMatchObject({ kind: "enter", parcheEventId: "pe1" });
  });
  it("membresía deshabilitada → solo consulta, aunque el parche esté inscrito", () => {
    expect(playOptions([m("a", "owner", "disabled")], new Map([["a", "pe1"]]), "u")[0].kind).toBe("disabled");
  });
  it("varios parches: se listan todos (ordenados por nombre) y nunca se elige uno por la persona", () => {
    const o = playOptions([m("z", "member"), m("b", "owner"), m("m", "admin")], new Map([["m", "pe9"]]), "u");
    expect(o.map((x) => x.kind)).toEqual(["enroll", "enter", "ask_admin"]);
    expect(o.map((x) => x.parcheId)).toEqual(["b", "m", "z"]);
  });
  it("solo se inscribe en torneos publicados y sin terminar", () => {
    expect(["scheduled", "in_progress"].every(eventAcceptsEnrollment)).toBe(true);
    expect(["draft", "finished", "closed", "cancelled"].some(eventAcceptsEnrollment)).toBe(false);
  });
});

describe("retorno seguro tras crear un parche", () => {
  it("acepta solo /jugar/<slug>", () => {
    expect(safeReturnToPlay("/jugar/liga-x")).toBe("/jugar/liga-x");
    expect(safeReturnToPlay("/jugar/mundial2026")).toBe("/jugar/mundial2026");
  });
  it.each([null, undefined, "", "https://evil.example/jugar/x", "//evil.example", "/\\evil.example", "/parches", "/control", "/jugar/", "/jugar/a/b", "/jugar/A", "/jugar/x?next=//evil", "/jugar/x#y", "jugar/x", "/jugar/x\n", "/jugar/%2e%2e"])("rechaza %s", (v) => {
    expect(safeReturnToPlay(v)).toBeNull();
  });
});

describe("destino según el rol", () => {
  it("el superadministrador va a Control; los demás a su inicio de jugador", () => {
    expect(roleHome(true, "/parches")).toBe(CONTROL_PATH);
    expect(roleHome(false, "/parches")).toBe("/parches");
  });
});

describe("promoAction (promoción compacta de /parches)", () => {
  const enroll = { kind: "enroll", parcheId: "p1", parcheName: "A" } as const;
  const enter = (id: string) => ({ kind: "enter", parcheId: id, parcheName: id, parcheEventId: `pe-${id}` }) as const;
  it("con un parche administrado sin inscribir ofrece inscribirlo (vía /jugar/slug)", async () => {
    const { promoAction } = await import("./jugar");
    expect(promoAction([enroll], "liga-x")).toEqual({ label: "Inscribir mi parche", href: "/jugar/liga-x" });
    expect(promoAction([enroll, { ...enroll, parcheId: "p2" }], "liga-x").label).toBe("Inscribir un parche");
  });
  it("parche ya inscrito: nunca ofrece inscribir de nuevo; entra al torneo", async () => {
    const { promoAction } = await import("./jugar");
    expect(promoAction([enter("p1")], "liga-x")).toEqual({ label: "Ir al torneo", href: "/parches/p1/torneos/pe-p1" });
    expect(promoAction([enter("p1"), enter("p2")], "liga-x")).toEqual({ label: "Ver mis parches inscritos", href: "/jugar/liga-x" });
  });
  it("miembro sin permisos o deshabilitado: solo ver detalles; sin parches: el estado vacío usa Crear parche", async () => {
    const { promoAction } = await import("./jugar");
    expect(promoAction([{ kind: "ask_admin", parcheId: "p", parcheName: "P" }], "x").label).toBe("Ver detalles");
    expect(promoAction([{ kind: "disabled", parcheId: "p", parcheName: "P" }], "x").label).toBe("Ver detalles");
    expect(promoAction([], "x")).toEqual({ label: "Crear mi parche y participar", href: "/parches/nuevo?next=%2Fjugar%2Fx" });
    expect(promoAction([enter("p1"), enroll], "x").secondary).toEqual({ label: "Inscribir otro parche", href: "/jugar/x" });
  });
  it("destino de creación seguro desde la promoción", async () => {
    const { safeReturnToPlay } = await import("./jugar");
    expect(safeReturnToPlay("/jugar/liga-primera-division-colombiana-2026-ii")).toBe("/jugar/liga-primera-division-colombiana-2026-ii");
  });
});
