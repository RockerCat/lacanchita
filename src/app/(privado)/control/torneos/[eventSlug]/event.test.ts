import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  events: [] as { id: string; slug: string }[],
  admin: true,
}));

vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`REDIRECT:${to}`);
  },
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
}));
vi.mock("react", async (orig) => ({ ...(await orig<typeof import("react")>()), cache: <T,>(fn: T) => fn }));
vi.mock("@/lib/auth", () => ({
  requirePlatformAdmin: async () => {
    if (!h.admin) throw new Error("NOT_FOUND");
    // Cliente simulado: eq("slug"|"id", valor).maybeSingle()
    const query = () => {
      let col = "";
      let val = "";
      const q = {
        select: () => q,
        eq: (c: string, v: string) => {
          col = c;
          val = v;
          return q;
        },
        maybeSingle: async () => ({
          data: h.events.map((e) => ({ ...e, name: "N", status: "draft", timezone: "UTC", official_end_at: null })).find((e) => (e as Record<string, unknown>)[col] === val) ?? null,
          error: null,
        }),
      };
      return q;
    };
    return { user: { id: "sa" }, supabase: { from: query, rpc: async () => ({ data: [], error: null }) } };
  },
}));

import { loadEvent } from "./event";

const UUID = "e67ed98a-1929-49e0-bcc8-6ff9eb74169c";

beforeEach(() => {
  h.admin = true;
  h.events = [
    { id: UUID, slug: "copa-de-prueba" },
    { id: "daaebb9b-8e92-5644-824f-bf826114446a", slug: "mundial-2026" },
  ];
});

describe("loadEvent (rutas con slug)", () => {
  it("el slug es la ruta canónica: se resuelve sin redirigir", async () => {
    const r = await loadEvent("copa-de-prueba", "/fases");
    expect(r.event.id).toBe(UUID);
  });
  it("un enlace antiguo con UUID redirige a la ruta canónica conservando la subruta", async () => {
    await expect(loadEvent(UUID, "")).rejects.toThrow("REDIRECT:/control/torneos/copa-de-prueba");
    await expect(loadEvent(UUID, "/partidos/abc")).rejects.toThrow("REDIRECT:/control/torneos/copa-de-prueba/partidos/abc");
  });
  it("el Mundial histórico también se resuelve por slug y por UUID", async () => {
    expect((await loadEvent("mundial-2026", "")).event.slug).toBe("mundial-2026");
    await expect(loadEvent("daaebb9b-8e92-5644-824f-bf826114446a", "/resultados")).rejects.toThrow("REDIRECT:/control/torneos/mundial-2026/resultados");
  });
  it("slug o UUID inexistente → 404", async () => {
    await expect(loadEvent("no-existe", "")).rejects.toThrow("NOT_FOUND");
    await expect(loadEvent("00000000-0000-4000-8000-000000000000", "")).rejects.toThrow("NOT_FOUND");
  });
  it("sin privilegio de superadministrador → 404 antes de consultar torneos", async () => {
    h.admin = false;
    await expect(loadEvent("copa-de-prueba", "")).rejects.toThrow("NOT_FOUND");
  });
});
