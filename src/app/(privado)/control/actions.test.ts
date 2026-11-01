import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  admin: true,
  rpc: vi.fn(),
  timezone: "America/New_York" as string | null,
  slug: "copa-prueba",
  stage: { code: "group", sort_order: 1 } as { code: string; sort_order: number } | null,
  upload: vi.fn(),
  remove: vi.fn(),
}));

const news = vi.hoisted(() => ({ publish: vi.fn(async () => true) }));
vi.mock("@/lib/news/data", () => ({ publishMatchNewsSafely: news.publish }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`REDIRECT:${to}`);
  },
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
}));
vi.mock("@/lib/auth", () => ({
  requirePlatformAdmin: async () => {
    if (!h.admin) throw new Error("NOT_FOUND");
    return {
      user: { id: "sa" },
      supabase: {
        rpc: h.rpc,
        storage: { from: () => ({ upload: h.upload, remove: h.remove }) },
        from: (table: string) => {
          const chain: { eq: () => typeof chain; maybeSingle: () => Promise<{ data: unknown }> } = {
            eq: () => chain,
            maybeSingle: async () => ({
              data: table === "event_stages" ? h.stage : table === "teams" ? { crest_path: "old/prev.png" } : h.timezone ? { timezone: h.timezone, slug: h.slug } : null,
            }),
          };
          return { select: () => chain };
        },
      },
    };
  },
}));

import * as actions from "./actions";
import {
  publishEventAction,
  reopenMatchAction,
  removeCrestAction,
  resolvePendingAction,
  updateLiveResultAction,
  saveMatchAction,
  saveStageAction,
  saveTeamAction,
  uploadCrestAction,
} from "./actions";

const E = "11111111-1111-4111-8111-111111111111";
const M = "22222222-2222-4222-8222-222222222222";
const S = "33333333-3333-4333-8333-333333333333";
const fd = (o: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.set(k, v);
  return f;
};

beforeEach(() => {
  h.admin = true;
  h.timezone = "America/New_York";
  h.stage = { code: "group", sort_order: 1 };
  h.rpc.mockReset();
  h.upload.mockReset();
  h.upload.mockResolvedValue({ error: null });
  h.remove.mockReset();
  h.remove.mockResolvedValue({ error: null });
  h.rpc.mockResolvedValue({ data: 1, error: null });
});

describe("acciones de Control: autorización", () => {
  it("un usuario sin privilegio global no llega a la base (404) en ninguna acción", async () => {
    h.admin = false;
    const calls = [
      publishEventAction({ error: null }, fd({ event_id: E })),
      updateLiveResultAction({ error: null }, fd({ match_id: M, status: "live", home_score: "1", away_score: "0", expected_revision: "0" })),
      reopenMatchAction({ error: null }, fd({ match_id: M, expected_revision: "1", reason: "motivo válido" })),
      resolvePendingAction({ error: null }, fd({ match_id: M, expected_revision: "1", action: "discard" })),
      saveMatchAction({ error: null }, fd({ event_id: E, stage_id: S, starts_at: "2027-06-10T15:00" })),
    ];
    for (const c of calls) await expect(c).rejects.toThrow("NOT_FOUND");
    expect(h.rpc).not.toHaveBeenCalled();
  });
});

describe("updateLiveResultAction (guardado directo, original de La Penúltima)", () => {
  const live = { match_id: M, event_id: E, status: "live", home_score: "1", away_score: "0", expected_revision: "3" };
  it("envía estado, marcador, ganador y la revisión vista en UNA llamada", async () => {
    const r = await updateLiveResultAction({ error: null }, fd(live));
    expect(h.rpc).toHaveBeenCalledWith("control_update_match_live", { p_match_id: M, p_status: "live", p_home: 1, p_away: 0, p_winner_side: null, p_expected_revision: 3, p_reason: null });
    expect(r).toMatchObject({ ok: true });
    expect(r.message).toMatch(/jugadores/);
  });
  it("cerrar con penales envía el ganador junto al marcador (atómico); en vivo se ignora", async () => {
    await updateLiveResultAction({ error: null }, fd({ ...live, status: "finished", home_score: "1", away_score: "1", winner_side: "away" }));
    expect(h.rpc).toHaveBeenLastCalledWith("control_update_match_live", expect.objectContaining({ p_status: "finished", p_winner_side: "away" }));
    await updateLiveResultAction({ error: null }, fd({ ...live, winner_side: "home" }));
    expect(h.rpc).toHaveBeenLastCalledWith("control_update_match_live", expect.objectContaining({ p_status: "live", p_winner_side: null }));
  });
  it("la corrección de un finalizado lleva el motivo", async () => {
    await updateLiveResultAction({ error: null }, fd({ ...live, status: "finished", reason: "Error de captura del acta" }));
    expect(h.rpc).toHaveBeenLastCalledWith("control_update_match_live", expect.objectContaining({ p_reason: "Error de captura del acta" }));
  });
  it("al finalizar (y al corregir) publica las noticias del partido; en vivo no; un fallo no deshace el cierre", async () => {
    news.publish.mockClear();
    await updateLiveResultAction({ error: null }, fd(live));
    expect(news.publish).not.toHaveBeenCalled();
    const ok = await updateLiveResultAction({ error: null }, fd({ ...live, status: "finished" }));
    expect(news.publish).toHaveBeenCalledTimes(1);
    expect(ok.message).toMatch(/Noticias publicadas/);
    news.publish.mockResolvedValueOnce(false);
    const warn = await updateLiveResultAction({ error: null }, fd({ ...live, status: "finished" }));
    expect(warn.ok).toBe(true);
    expect(warn.message).toMatch(/no se pudieron publicar/);
  });
  it("valida entrada en el servidor sin llamar a la base", async () => {
    for (const bad of ["", "-1", "31", "1.5", "abc"]) {
      const r = await updateLiveResultAction({ error: null }, fd({ ...live, home_score: bad }));
      expect(r.fieldErrors?.home_score).toMatch(/entre 0 y 30/);
    }
    expect((await updateLiveResultAction({ error: null }, fd({ ...live, status: "scheduled" }))).fieldErrors?.status).toMatch(/no es válido|Estado/i);
    expect((await updateLiveResultAction({ error: null }, fd({ ...live, expected_revision: "" }))).error).toMatch(/recarga/);
    expect((await updateLiveResultAction({ error: null }, fd({ ...live, status: "finished", winner_side: "draw" }))).fieldErrors?.winner_side).toMatch(/penales/);
    expect(h.rpc).not.toHaveBeenCalled();
  });
  it("conflicto de concurrencia y errores del servidor, en español y sin detalles internos", async () => {
    h.rpc.mockResolvedValue({ data: null, error: { message: "stale_revision" } });
    const r = await updateLiveResultAction({ error: null }, fd(live));
    expect(r.ok).toBeUndefined();
    expect(r.error).toMatch(/No se guardó nada/);
    h.rpc.mockResolvedValue({ data: null, error: { message: 'duplicate key value violates unique constraint "x" (SQLSTATE 23505)' } });
    const g = await updateLiveResultAction({ error: null }, fd(live));
    expect(g.error).toBe("No pudimos completar la operación. Inténtalo de nuevo.");
    h.rpc.mockResolvedValue({ data: null, error: { message: "winner_required" } });
    expect((await updateLiveResultAction({ error: null }, fd({ ...live, status: "finished", winner_side: "" }))).fieldErrors?.winner_side).toMatch(/penales/);
  });
  it("sin permisos de superadministrador no llega a la base", async () => {
    h.admin = false;
    await expect(updateLiveResultAction({ error: null }, fd(live))).rejects.toThrow("NOT_FOUND");
    expect(h.rpc).not.toHaveBeenCalled();
  });
});

describe("reopenMatchAction / resolvePendingAction", () => {
  it("reabrir envía motivo y revisión; el motivo corto lo rechaza la base y se muestra junto al campo", async () => {
    await reopenMatchAction({ error: null }, fd({ match_id: M, expected_revision: "5", reason: "El acta cambió el gol 88" }));
    expect(h.rpc).toHaveBeenCalledWith("control_reopen_match", { p_match_id: M, p_reason: "El acta cambió el gol 88", p_expected_revision: 5 });
    h.rpc.mockResolvedValue({ data: null, error: { message: "reason_required" } });
    const r = await reopenMatchAction({ error: null }, fd({ match_id: M, expected_revision: "5", reason: "ok" }));
    expect(r.fieldErrors?.reason).toMatch(/motivo/);
  });
  it("el pendiente heredado solo se aplica en vivo o se descarta, de forma explícita", async () => {
    await resolvePendingAction({ error: null }, fd({ match_id: M, expected_revision: "1", action: "apply_live" }));
    expect(h.rpc).toHaveBeenLastCalledWith("control_resolve_pending_result", { p_match_id: M, p_expected_revision: 1, p_action: "apply_live" });
    await resolvePendingAction({ error: null }, fd({ match_id: M, expected_revision: "1", action: "discard" }));
    expect(h.rpc).toHaveBeenLastCalledWith("control_resolve_pending_result", expect.objectContaining({ p_action: "discard" }));
    h.rpc.mockClear();
    expect((await resolvePendingAction({ error: null }, fd({ match_id: M, expected_revision: "1", action: "publish" }))).error).toBeTruthy();
    expect(h.rpc).not.toHaveBeenCalled();
  });
});

describe("escudos de clubes", () => {
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
  const T = "44444444-4444-4444-8444-444444444444";
  const withFile = (bytes: Uint8Array, name = "escudo.png", type = "image/png") => {
    const f = new FormData();
    f.set("team_id", T);
    f.set("crest", new File([bytes as BlobPart], name, { type }));
    return f;
  };
  it("sube un PNG válido, lo asocia al equipo global y retira el escudo anterior", async () => {
    const r = await uploadCrestAction({ error: null }, withFile(png));
    expect(h.upload).toHaveBeenCalledTimes(1);
    const [path, , opts] = h.upload.mock.calls[0];
    expect(path).toMatch(new RegExp(`^${T}/[0-9a-f-]{36}\\.png$`));
    expect(opts).toMatchObject({ contentType: "image/png", upsert: false });
    expect(h.rpc).toHaveBeenCalledWith("control_set_team_crest", { p_team_id: T, p_path: path });
    expect(h.remove).toHaveBeenCalledWith(["old/prev.png"]);
    expect(r.ok).toBe(true);
  });
  it("rechaza SVG (aunque se llame .png), HTML y ejecutables sin subir nada", async () => {
    const svg = new TextEncoder().encode("<svg xmlns='http://www.w3.org/2000/svg'><script>alert(1)</script></svg>");
    for (const bytes of [svg, new TextEncoder().encode("<html>"), new Uint8Array([0x4d, 0x5a, 0x90, 0])]) {
      const r = await uploadCrestAction({ error: null }, withFile(bytes, "escudo.png", "image/png"));
      expect(r.fieldErrors?.crest).toMatch(/PNG, JPG o WebP/);
    }
    expect(h.upload).not.toHaveBeenCalled();
  });
  it("rechaza archivos demasiado grandes, vacíos o ausentes", async () => {
    const big = new Uint8Array(512 * 1024 + 1);
    big.set(png);
    expect((await uploadCrestAction({ error: null }, withFile(big))).fieldErrors?.crest).toMatch(/512 KB/);
    expect((await uploadCrestAction({ error: null }, withFile(new Uint8Array(0)))).fieldErrors?.crest).toMatch(/archivo/);
    const none = new FormData();
    none.set("team_id", T);
    expect((await uploadCrestAction({ error: null }, none)).error).toMatch(/archivo/);
    expect(h.upload).not.toHaveBeenCalled();
  });
  it("si la base rechaza la asociación, el archivo recién subido se elimina", async () => {
    h.rpc.mockResolvedValue({ data: null, error: { message: "team_in_locked_event" } });
    const r = await uploadCrestAction({ error: null }, withFile(png));
    expect(h.remove).toHaveBeenCalledWith([h.upload.mock.calls[0][0]]);
    expect(r.fieldErrors?.crest ?? r.error).toBeTruthy();
  });
  it("fallo del almacenamiento: mensaje claro y sin asociar", async () => {
    h.upload.mockResolvedValue({ error: { message: "boom" } });
    const r = await uploadCrestAction({ error: null }, withFile(png));
    expect(r.fieldErrors?.crest).toMatch(/No pudimos guardar el escudo/);
    expect(h.rpc).not.toHaveBeenCalled();
  });
  it("sin superadministrador no sube ni asocia", async () => {
    h.admin = false;
    await expect(uploadCrestAction({ error: null }, withFile(png))).rejects.toThrow("NOT_FOUND");
    await expect(removeCrestAction({ error: null }, fd({ team_id: T }))).rejects.toThrow("NOT_FOUND");
    expect(h.upload).not.toHaveBeenCalled();
    expect(h.rpc).not.toHaveBeenCalled();
  });
  it("quitar el escudo borra la referencia y el archivo", async () => {
    await removeCrestAction({ error: null }, fd({ team_id: T }));
    expect(h.rpc).toHaveBeenCalledWith("control_set_team_crest", { p_team_id: T, p_path: null });
    expect(h.remove).toHaveBeenCalledWith(["old/prev.png"]);
  });
});

describe("selecciones nuevas: bandera sugerida", () => {
  it("una selección sin bandera recibe la sugerida por su nombre; un club no", async () => {
    await saveTeamAction({ error: null }, fd({ name: "Brasil", kind: "national" }));
    expect(h.rpc).toHaveBeenLastCalledWith("control_save_team", expect.objectContaining({ p_flag_emoji: "🇧🇷", p_kind: "national" }));
    await saveTeamAction({ error: null }, fd({ name: "Atlético Nacional", kind: "club" }));
    expect(h.rpc).toHaveBeenLastCalledWith("control_save_team", expect.objectContaining({ p_flag_emoji: null, p_kind: "club" }));
    await saveTeamAction({ error: null }, fd({ name: "Colombia", kind: "national", flag_emoji: "🏳️" }));
    expect(h.rpc).toHaveBeenLastCalledWith("control_save_team", expect.objectContaining({ p_flag_emoji: "🏳️" }));
  });
});

describe("saveMatchAction: horarios", () => {
  const base = { event_id: E, stage_id: S, home_placeholder: "A", away_placeholder: "B" };
  it("convierte la hora local a UTC con la zona del torneo leída de la base (no del formulario)", async () => {
    h.timezone = "America/New_York";
    await saveMatchAction({ error: null }, fd({ ...base, starts_at: "2027-06-10T15:00", timezone: "America/Bogota" })).catch(() => {});
    expect(h.rpc).toHaveBeenCalledWith("control_save_match", expect.objectContaining({ p_starts_at: "2027-06-10T19:00:00.000Z", p_match_id: null }));
  });
  it("otra zona, otro instante: nada asume Colombia", async () => {
    h.timezone = "America/Bogota";
    await saveMatchAction({ error: null }, fd({ ...base, starts_at: "2027-06-10T15:00" })).catch(() => {});
    expect(h.rpc).toHaveBeenCalledWith("control_save_match", expect.objectContaining({ p_starts_at: "2027-06-10T20:00:00.000Z" }));
  });
  it("rechaza horas inexistentes o ambiguas sin llamar a la base", async () => {
    h.timezone = "America/New_York";
    const a = await saveMatchAction({ error: null }, fd({ ...base, match_id: M, starts_at: "2027-03-14T02:30" }));
    const b = await saveMatchAction({ error: null }, fd({ ...base, match_id: M, starts_at: "2027-11-07T01:30" }));
    expect(a.fieldErrors?.starts_at).toMatch(/no existe/);
    expect(b.fieldErrors?.starts_at).toMatch(/dos veces/);
    expect(a.values?.starts_at).toBe("2027-03-14T02:30");
    expect(h.rpc).not.toHaveBeenCalled();
  });
  it("torneo inexistente", async () => {
    h.timezone = null;
    const r = await saveMatchAction({ error: null }, fd({ ...base, match_id: M, starts_at: "2027-06-10T15:00" }));
    expect(r.error).toMatch(/no existe/);
  });
});

describe("saveMatchAction: cancelar es definitivo", () => {
  const base = { event_id: E, match_id: M, stage_id: S, home_placeholder: "A", away_placeholder: "B", starts_at: "2027-06-10T15:00", status: "cancelled" };
  it("sin reconocer la casilla no cancela; con ella envía el estado", async () => {
    h.timezone = "America/Bogota";
    const r = await saveMatchAction({ error: null }, fd(base));
    expect(r.error ?? r.fieldErrors).toBeTruthy();
    expect(h.rpc).not.toHaveBeenCalled();
    await saveMatchAction({ error: null }, fd({ ...base, confirm_cancel: "on" }));
    expect(h.rpc).toHaveBeenCalledWith("control_save_match", expect.objectContaining({ p_status: "cancelled" }));
  });
});

describe("creación manual retirada", () => {
  it("las acciones de la consola no exponen crear torneos ni fases", () => {
    expect(Object.keys(actions)).not.toContain("createEventAction");
    expect(Object.keys(actions).filter((k) => /create/i.test(k))).toEqual([]);
  });
});

describe("saveStageAction (solo edición)", () => {
  const stageFd = (o: Record<string, string> = {}) => fd({ event_id: E, stage_id: S, name: "Octavos de final", format: "knockout", exact_points: "5", result_points: "3", ...o });
  it("conserva el código y el orden internos: el usuario no los envía ni los conoce", async () => {
    h.stage = { code: "round_of_16", sort_order: 3 };
    const r = await saveStageAction({ error: null }, stageFd({ code: "hack", sort_order: "99" }));
    expect(h.rpc).toHaveBeenCalledWith("control_save_stage", {
      p_event_id: E, p_stage_id: S, p_code: "round_of_16", p_name: "Octavos de final", p_sort_order: 3,
      p_is_knockout: true, p_exact_points: 5, p_result_points: 3,
    });
    expect(r.ok).toBe(true);
  });
  it("sin fase existente no crea nada", async () => {
    h.stage = null;
    const r = await saveStageAction({ error: null }, stageFd());
    expect(r.error ?? r.fieldErrors).toBeTruthy();
    expect(h.rpc).not.toHaveBeenCalled();
    const noId = await saveStageAction({ error: null }, stageFd({ stage_id: "" }));
    expect(noId.error ?? noId.fieldErrors).toBeTruthy();
  });
  it("puntos inválidos: error junto al campo y valores conservados", async () => {
    h.stage = { code: "group", sort_order: 1 };
    const r = await saveStageAction({ error: null }, stageFd({ exact_points: "abc" }));
    expect(r.fieldErrors?.exact_points).toMatch(/0 y 100/);
    expect(r.values?.name).toBe("Octavos de final");
    expect(h.rpc).not.toHaveBeenCalled();
  });
  it("el formato legible se traduce a eliminación directa o liga", async () => {
    h.stage = { code: "group", sort_order: 1 };
    await saveStageAction({ error: null }, stageFd({ format: "league" }));
    expect(h.rpc).toHaveBeenCalledWith("control_save_stage", expect.objectContaining({ p_is_knockout: false }));
  });
});
