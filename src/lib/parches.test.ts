import { describe, expect, it } from "vitest";
import { eventStatusLabel, membershipNotice, resolveParcheLanding, sortMemberships, type Membership } from "./parches";

const m = (id: string, name: string, status: Membership["status"] = "active"): Membership => ({
  parcheId: id,
  parcheName: name,
  role: "member",
  status,
});

describe("resolveParcheLanding", () => {
  it("sin parches → estado vacío", () => {
    expect(resolveParcheLanding([])).toEqual({ kind: "none" });
  });
  it("un parche → entra directo", () => {
    expect(resolveParcheLanding([m("p1", "Uno")])).toEqual({ kind: "direct", parcheId: "p1" });
  });
  it("un parche deshabilitado → también entra directo (solo lectura)", () => {
    expect(resolveParcheLanding([m("p1", "Uno", "disabled")])).toEqual({ kind: "direct", parcheId: "p1" });
  });
  it("varios parches → elegir; activos primero y por nombre", () => {
    const landing = resolveParcheLanding([m("p3", "Zeta"), m("p2", "Beta", "disabled"), m("p1", "Alfa")]);
    expect(landing.kind).toBe("choose");
    if (landing.kind === "choose") expect(landing.memberships.map((x) => x.parcheId)).toEqual(["p1", "p3", "p2"]);
  });
});

describe("sortMemberships", () => {
  it("activos primero y por nombre (lista de Mis parches)", () => {
    expect(sortMemberships([m("p3", "Zeta"), m("p2", "Beta", "disabled"), m("p1", "Alfa")]).map((x) => x.parcheId)).toEqual(["p1", "p3", "p2"]);
  });
});

describe("etiquetas", () => {
  it("aviso solo para membresías deshabilitadas", () => {
    expect(membershipNotice("active")).toBeNull();
    expect(membershipNotice("disabled")).toMatch(/deshabilitada/);
  });
  it("estado de torneo", () => {
    expect(eventStatusLabel("finished")).toBe("Finalizado");
    expect(eventStatusLabel("closed")).toBe("Cerrado oficialmente");
  });
});
