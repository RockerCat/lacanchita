import { beforeEach, describe, expect, it, vi } from "vitest";

const state = { superadmin: false, rpc: vi.fn(async () => ({ data: "11111111-1111-4111-8111-111111111111", error: null })) };
class Redirect extends Error { constructor(public to: string) { super(to); } }

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: (to: string) => { throw new Redirect(to); } }));
vi.mock("@/lib/origin", () => ({ requestOrigin: async () => "http://localhost" }));
vi.mock("@/lib/auth", () => ({
  getCurrentUser: async () => ({ user: { id: "u" }, supabase: { rpc: state.rpc } }),
  isPlatformAdmin: async () => state.superadmin,
}));

import { createParcheAction, enrollEventAction } from "./actions";

const REQ = "22222222-2222-4222-8222-222222222222";
const fd = (o: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.set(k, v); return f; };
const run = async (f: FormData) => { try { return await createParcheAction({ error: null, name: "" }, f); } catch (e) { if (e instanceof Redirect) return e.to; throw e; } };

beforeEach(() => { state.superadmin = false; state.rpc.mockClear(); });

describe("crear parche conserva el torneo elegido", () => {
  it("sin torneo previo: va al parche (comportamiento normal)", async () => {
    expect(await run(fd({ name: "Los del barrio", request_id: REQ }))).toBe("/parches/11111111-1111-4111-8111-111111111111");
  });
  it("venía de «Jugar este torneo»: regresa a /jugar/<slug> para inscribir el parche", async () => {
    expect(await run(fd({ name: "Los del barrio", request_id: REQ, next: "/jugar/liga-x" }))).toBe("/jugar/liga-x");
  });
  it.each(["https://evil.example", "//evil.example", "/control", "/jugar/x/../../control", "javascript:alert(1)"])("destino malicioso %s → ignorado", async (next) => {
    expect(await run(fd({ name: "Los del barrio", request_id: REQ, next }))).toBe("/parches/11111111-1111-4111-8111-111111111111");
  });
  it("el superadministrador no crea parches (refuerzo del servidor, sin llamar a la base)", async () => {
    state.superadmin = true;
    const r = await run(fd({ name: "Los del barrio", request_id: REQ, next: "/jugar/liga-x" }));
    expect(r).toMatchObject({ error: expect.stringContaining("Control") });
    expect(state.rpc).not.toHaveBeenCalled();
  });
});

describe("inscribir un parche en un torneo", () => {
  const ids = { parche_id: "33333333-3333-4333-8333-333333333333", event_id: "44444444-4444-4444-8444-444444444444" };
  it("jugador/administrador de parche: se llama a la operación de la base (que valida el rol)", async () => {
    const r = await enrollEventAction({ error: null }, fd(ids));
    expect(r).toMatchObject({ ok: true });
    expect(state.rpc).toHaveBeenCalledWith("add_event_to_parche", { p_parche_id: ids.parche_id, p_event_id: ids.event_id });
  });
  it("la base rechaza con menos de 2 participantes activos: error claro y sin inscripción", async () => {
    state.rpc.mockResolvedValueOnce({ data: null, error: { message: "min_members" } } as never);
    const r = await enrollEventAction({ error: null }, fd(ids));
    expect(r.ok).toBeUndefined();
    expect(r.error).toContain("al menos 2 participantes activos");
  });
  it("el superadministrador no inscribe parches como jugador", async () => {
    state.superadmin = true;
    const r = await enrollEventAction({ error: null }, fd(ids));
    expect(r.error).toContain("Control");
    expect(state.rpc).not.toHaveBeenCalled();
  });
});
