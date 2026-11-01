import { beforeEach, describe, expect, it, vi } from "vitest";

const state = { superadmin: false, memberships: [] as { parcheId: string; parcheName: string; role: string; status: string }[] };
class Redirect extends Error { constructor(public to: string) { super(to); } }
vi.mock("next/navigation", () => ({ redirect: (to: string) => { throw new Redirect(to); }, notFound: () => { throw new Error("404"); } }));
vi.mock("@/lib/auth", () => ({
  requireUser: async () => ({ supabase: {}, user: { id: "u" } }),
  isPlatformAdmin: async () => state.superadmin,
}));
vi.mock("@/lib/data", () => ({ getMemberships: async () => state.memberships, getAvailableEvents: async () => [], getParcheEvents: async () => [] }));

import Inicio from "./page";
import Parches from "../parches/page";

const go = async (fn: () => Promise<unknown>) => { try { await fn(); return "render"; } catch (e) { return e instanceof Redirect ? e.to : `error:${(e as Error).message}`; } };
beforeEach(() => { state.superadmin = false; state.memberships = []; });

describe("entrada según el rol (servidor)", () => {
  it("superadministrador: /inicio y /parches lo llevan a Control, aunque tenga membresías", async () => {
    state.superadmin = true;
    state.memberships = [{ parcheId: "p1", parcheName: "La Penúltima", role: "owner", status: "active" }];
    expect(await go(() => Inicio())).toBe("/control");
    expect(await go(() => Parches({ searchParams: Promise.resolve({}) }))).toBe("/control");
  });
  it("jugador con un solo parche: entra directo; sin parches o con varios: Mis parches", async () => {
    state.memberships = [{ parcheId: "p1", parcheName: "A", role: "member", status: "active" }];
    expect(await go(() => Inicio())).toBe("/parches/p1");
    state.memberships = [];
    expect(await go(() => Inicio())).toBe("/parches");
    state.memberships = [{ parcheId: "p1", parcheName: "A", role: "member", status: "active" }, { parcheId: "p2", parcheName: "B", role: "owner", status: "active" }];
    expect(await go(() => Inicio())).toBe("/parches");
  });
  it("administrador de parche conserva Mis parches", async () => {
    state.memberships = [{ parcheId: "p1", parcheName: "A", role: "owner", status: "active" }, { parcheId: "p2", parcheName: "B", role: "admin", status: "active" }];
    expect(await go(() => Parches({ searchParams: Promise.resolve({}) }))).toBe("render");
  });
});
