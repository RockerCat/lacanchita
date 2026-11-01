import { beforeEach, describe, expect, it, vi } from "vitest";

// requirePlatformAdmin: sin sesión → login; sin privilegio → 404; la respuesta sale de la base.
const state = vi.hoisted(() => ({ user: null as { id: string } | null, rpcResult: { data: false as unknown, error: null as unknown } }));

vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`REDIRECT:${to}`);
  },
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
}));
vi.mock("react", async (orig) => ({ ...(await orig<typeof import("react")>()), cache: <T,>(fn: T) => fn }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: state.user } }) },
    rpc: async () => state.rpcResult,
  }),
}));
vi.mock("../supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: state.user } }) },
    rpc: async () => state.rpcResult,
  }),
}));

import { isPlatformAdmin, requirePlatformAdmin } from "../auth";

beforeEach(() => {
  state.user = { id: "u1" };
  state.rpcResult = { data: false, error: null };
});

describe("requirePlatformAdmin", () => {
  it("sin sesión redirige al login", async () => {
    state.user = null;
    await expect(requirePlatformAdmin()).rejects.toThrow(/REDIRECT:\/login/);
  });
  it("usuario normal: 404, no se revela /control", async () => {
    await expect(requirePlatformAdmin()).rejects.toThrow("NOT_FOUND");
    expect(await isPlatformAdmin()).toBe(false);
  });
  it("un error de la base se trata como NO superadministrador", async () => {
    state.rpcResult = { data: true, error: { message: "boom" } };
    await expect(requirePlatformAdmin()).rejects.toThrow("NOT_FOUND");
  });
  it("solo un true explícito de la base concede acceso", async () => {
    state.rpcResult = { data: "true", error: null };
    await expect(requirePlatformAdmin()).rejects.toThrow("NOT_FOUND");
    state.rpcResult = { data: true, error: null };
    await expect(requirePlatformAdmin()).resolves.toMatchObject({ user: { id: "u1" } });
    expect(await isPlatformAdmin()).toBe(true);
  });
});
