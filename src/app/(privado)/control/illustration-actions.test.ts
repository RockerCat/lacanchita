import sharp from "sharp";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ admin: true, rpc: vi.fn(), upload: vi.fn(), remove: vi.fn(), old: "old/prev.png" as string | null, exists: true }));
vi.mock("@/lib/news/data", () => ({ publishMatchNewsSafely: vi.fn(async () => true) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: (t: string) => { throw new Error(`REDIRECT:${t}`); }, notFound: () => { throw new Error("NOT_FOUND"); } }));
vi.mock("@/lib/auth", () => ({
  requirePlatformAdmin: async () => {
    if (!h.admin) throw new Error("NOT_FOUND");
    return {
      user: { id: "sa" },
      supabase: {
        rpc: h.rpc,
        storage: { from: () => ({ upload: h.upload, remove: h.remove }) },
        from: () => {
          const chain: { eq: () => typeof chain; maybeSingle: () => Promise<{ data: unknown }> } = { eq: () => chain, maybeSingle: async () => ({ data: h.exists ? { illustration_path: h.old } : null }) };
          return { select: () => chain };
        },
      },
    };
  },
}));

import { removeIllustrationAction, uploadIllustrationAction } from "./actions";

const E = "11111111-1111-4111-8111-111111111111";
const png = new Uint8Array(await sharp({ create: { width: 16, height: 9, channels: 3, background: "#123" } }).png().toBuffer());
const form = (bytes?: Uint8Array, name = "a.png", type = "image/png") => {
  const f = new FormData();
  f.set("event_id", E);
  if (bytes) f.set("illustration", new File([bytes as BlobPart], name, { type }));
  return f;
};

beforeEach(() => {
  h.admin = true; h.old = "old/prev.png"; h.exists = true;
  h.rpc.mockReset(); h.rpc.mockResolvedValue({ data: null, error: null });
  h.upload.mockReset(); h.upload.mockResolvedValue({ error: null });
  h.remove.mockReset(); h.remove.mockResolvedValue({ error: null });
});

describe("ilustración del torneo (acciones de Control)", () => {
  it("sube, asocia y solo después retira la anterior; la ruta es <torneo>/<uuid>.<ext>", async () => {
    const order: string[] = [];
    h.upload.mockImplementation(async () => { order.push("upload"); return { error: null }; });
    h.rpc.mockImplementation(async () => { order.push("rpc"); return { data: null, error: null }; });
    h.remove.mockImplementation(async () => { order.push("remove"); return { error: null }; });
    const r = await uploadIllustrationAction({ error: null }, form(png));
    expect(r.ok).toBe(true);
    expect(order).toEqual(["upload", "rpc", "remove"]);
    const [path, , opts] = h.upload.mock.calls[0];
    expect(path).toMatch(new RegExp(`^${E}/[0-9a-f-]{36}\\.png$`));
    expect(opts).toMatchObject({ contentType: "image/png", upsert: false });
    expect(h.rpc).toHaveBeenCalledWith("control_set_event_illustration", { p_event_id: E, p_path: path });
    expect(h.remove).toHaveBeenCalledWith(["old/prev.png"]);
  });
  it("si la base rechaza la referencia: limpia el objeto nuevo y NO toca el anterior", async () => {
    h.rpc.mockResolvedValue({ data: null, error: { message: "event_locked_history" } });
    const r = await uploadIllustrationAction({ error: null }, form(png));
    expect(r.ok).not.toBe(true);
    expect(h.remove).toHaveBeenCalledTimes(1);
    expect(h.remove).toHaveBeenCalledWith([h.upload.mock.calls[0][0]]);
    expect(h.remove).not.toHaveBeenCalledWith(["old/prev.png"]);
  });
  it("fallo de Storage: mensaje claro, sin asociar ni borrar nada", async () => {
    h.upload.mockResolvedValue({ error: { message: "boom" } });
    const r = await uploadIllustrationAction({ error: null }, form(png));
    expect(r.fieldErrors?.illustration).toMatch(/No pudimos guardar/);
    expect(h.rpc).not.toHaveBeenCalled();
    expect(h.remove).not.toHaveBeenCalled();
  });
  it("rechaza SVG, grandes, corruptos, vacíos y ausentes sin subir nada", async () => {
    const svg = new TextEncoder().encode("<svg><script>1</script></svg>");
    expect((await uploadIllustrationAction({ error: null }, form(svg))).fieldErrors?.illustration).toMatch(/PNG, JPG o WebP/);
    const big = new Uint8Array(5 * 1024 * 1024 + 1); big.set(png);
    expect((await uploadIllustrationAction({ error: null }, form(big))).fieldErrors?.illustration).toMatch(/5 MB/);
    expect((await uploadIllustrationAction({ error: null }, form(png.slice(0, png.length - 15)))).fieldErrors?.illustration).toMatch(/dañado/);
    expect((await uploadIllustrationAction({ error: null }, form(new Uint8Array(0)))).fieldErrors?.illustration).toMatch(/archivo/);
    expect((await uploadIllustrationAction({ error: null }, form())).error ?? "").toMatch(/archivo/);
    expect(h.upload).not.toHaveBeenCalled();
    expect(h.rpc).not.toHaveBeenCalled();
  });
  it("un usuario sin privilegio global no llega a Storage ni a la base", async () => {
    h.admin = false;
    await expect(uploadIllustrationAction({ error: null }, form(png))).rejects.toThrow("NOT_FOUND");
    await expect(removeIllustrationAction({ error: null }, form())).rejects.toThrow("NOT_FOUND");
    expect(h.upload).not.toHaveBeenCalled();
    expect(h.rpc).not.toHaveBeenCalled();
    expect(h.remove).not.toHaveBeenCalled();
  });
  it("quitar: borra la referencia y luego el objeto; si la base falla conserva el archivo", async () => {
    await removeIllustrationAction({ error: null }, form());
    expect(h.rpc).toHaveBeenCalledWith("control_set_event_illustration", { p_event_id: E, p_path: null });
    expect(h.remove).toHaveBeenCalledWith(["old/prev.png"]);
    h.remove.mockClear();
    h.rpc.mockResolvedValue({ data: null, error: { message: "event_locked_history" } });
    await removeIllustrationAction({ error: null }, form());
    expect(h.remove).not.toHaveBeenCalled();
  });
  it("torneo inexistente → error sin subir", async () => {
    h.exists = false;
    const r = await uploadIllustrationAction({ error: null }, form(png));
    expect(r.ok).not.toBe(true);
    expect(h.upload).not.toHaveBeenCalled();
  });
});
