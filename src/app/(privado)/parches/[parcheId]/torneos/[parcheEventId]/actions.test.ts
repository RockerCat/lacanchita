import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ user: { id: "u1" } as { id: string } | null, rpc: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: (to: string) => { throw new Error(`REDIRECT:${to}`); } }));
vi.mock("@/lib/auth", () => ({ getCurrentUser: async () => ({ user: h.user, supabase: { rpc: h.rpc } }) }));

import { savePredictionAction } from "./actions";

const PE = "11111111-1111-4111-8111-111111111111";
const M = "22222222-2222-4222-8222-222222222222";
const fd = (o: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.set(k, v); return f; };

beforeEach(() => {
  h.user = { id: "u1" };
  h.rpc.mockReset();
  h.rpc.mockResolvedValue({ data: { id: "p", home_score: 2, away_score: 1 }, error: null });
});

describe("savePredictionAction (contrato para la UI original)", () => {
  it("guarda con la inscripción y el partido; la identidad sale de la sesión (el formulario no la controla)", async () => {
    const r = await savePredictionAction(null, fd({ parche_event_id: PE, match_id: M, home_score: "2", away_score: "1", user_id: "otro-usuario" }));
    expect(h.rpc).toHaveBeenCalledWith("save_prediction", { p_parche_event_id: PE, p_match_id: M, p_home: 2, p_away: 1 });
    expect(JSON.stringify(h.rpc.mock.calls)).not.toContain("otro-usuario");
    expect(r).toMatchObject({ success: true });
  });
  it("valida entrada en el servidor sin llamar a la base", async () => {
    expect(await savePredictionAction(null, fd({ parche_event_id: PE, match_id: M, home_score: "", away_score: "1" }))).toEqual({ error: "Ingresa un marcador válido para ambos equipos." });
    expect(await savePredictionAction(null, fd({ parche_event_id: PE, match_id: M, home_score: "31", away_score: "1" }))).toMatchObject({ error: expect.stringMatching(/entre 0 y 30/) });
    expect(await savePredictionAction(null, fd({ parche_event_id: "x", match_id: M, home_score: "1", away_score: "1" }))).toMatchObject({ error: expect.stringMatching(/Recarga/) });
    expect(h.rpc).not.toHaveBeenCalled();
  });
  it("sin sesión → login; errores de la base en español", async () => {
    h.user = null;
    await expect(savePredictionAction(null, fd({ parche_event_id: PE, match_id: M, home_score: "1", away_score: "1" }))).rejects.toThrow(/REDIRECT:\/login/);
    h.user = { id: "u1" };
    h.rpc.mockResolvedValue({ data: null, error: { message: "superadmin_cannot_predict" } });
    expect(await savePredictionAction(null, fd({ parche_event_id: PE, match_id: M, home_score: "1", away_score: "1" }))).toEqual({ error: expect.stringMatching(/no participa como jugador/) });
  });
});
