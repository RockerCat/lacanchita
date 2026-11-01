import { describe, expect, it, vi } from "vitest";
import { buildEventNews, buildMatchNews, buildParcheNews, type NewsContext } from "./build";
import { parseBlocks } from "./blocks";
import { formatNewsDate } from "./format";
import { publishMatchNews, publishMatchNewsSafely, reconcileEventNews } from "./data";

const home = { id: "h", name: "Colombia", flag: "🇨🇴" };
const away = { id: "a", name: "Argentina", flag: "🇦🇷" };
const lb = (id: string, name: string, pts: number, ex: number, rs: number, rank: number) => ({ user_id: id, display_name: name, total_points: pts, exact_count: ex, result_count: rs, rank });
const ctx = (over: Partial<NewsContext["match"]> = {}): NewsContext => ({
  match: { id: "m1", event_id: "e1", revision: 2, home_score: 2, away_score: 1, winner_side: null, home, away, ...over },
  items: [
    // Parche A: Ana exacta (3), Beto resultado (1) → Ana lidera; antes ambos en 0.
    { parche_event_id: "peA", leaderboard: [lb("ana", "Ana", 3, 1, 0, 1), lb("beto", "Beto", 1, 0, 1, 2)],
      predictions: [{ user_id: "ana", points: 3, points_reason: "exact", home: 2, away: 1 }, { user_id: "beto", points: 1, points_reason: "result", home: 1, away: 0 }] },
    // Parche B: otros participantes.
    { parche_event_id: "peB", leaderboard: [lb("caro", "Caro", 0, 0, 0, 1)], predictions: [{ user_id: "caro", points: 0, points_reason: "miss", home: 0, away: 2 }] },
  ],
});

describe("generador de noticias (determinista, sin IA)", () => {
  it("una noticia compartida del torneo y una por parche, con el título del resultado oficial", () => {
    const d = buildMatchNews(ctx());
    expect(d.map((x) => x.parche_event_id)).toEqual([null, "peA", "peB"]);
    expect(d.every((x) => x.title === "Colombia 2 - 1 Argentina")).toBe(true);
  });
  it("la noticia del torneo solo contiene el resultado: ni nombres de jugadores ni puntos", () => {
    const e = buildEventNews(ctx());
    expect(e.content.startsWith("⚽")).toBe(true);
    expect(e.content).not.toMatch(/Ana|Beto|Caro|pts|🏆|🎯|⚡/);
    expect(e.content).not.toContain("\n\n");
  });
  it("aislamiento: la noticia de un parche nunca nombra a participantes de otro", () => {
    const [, a, b] = buildMatchNews(ctx());
    expect(a.content + a.summary).toMatch(/Ana/);
    expect(a.content + a.summary).not.toMatch(/Caro/);
    expect(b.content + b.summary).toMatch(/Caro|Nadie/);
    expect(b.content + b.summary).not.toMatch(/Ana|Beto/);
  });
  it("narrativa original del parche: resultado, líder nuevo, marcador exacto único y participación", () => {
    const a = buildParcheNews(ctx(), ctx().items[0]);
    const blocks = a.content.split("\n\n");
    expect(blocks[0]).toMatch(/^⚽/);
    expect(blocks.some((b) => b.startsWith("🏆") && b.includes("Ana"))).toBe(true);
    expect(blocks.some((b) => b.startsWith("🎯") && b.includes("Ana"))).toBe(true);
    expect(blocks.some((b) => b.startsWith("⚡"))).toBe(true);
    expect(a.summary).toBe("Ana es el nuevo líder con 3 pts.");
  });
  it("es determinista: el mismo acontecimiento produce exactamente el mismo texto", () => {
    expect(buildMatchNews(ctx())).toEqual(buildMatchNews(ctx()));
  });
  it("una corrección del resultado cambia el relato (el nuevo marcador aparece, el viejo no)", () => {
    const corrected = buildEventNews(ctx({ home_score: 0, away_score: 3, revision: 3 }));
    expect(corrected.title).toBe("Colombia 0 - 3 Argentina");
    expect(corrected.content).toContain("3-0");
    expect(corrected.content).not.toContain("2-1");
  });
  it("empates y sorpresas", () => {
    const draw = buildEventNews(ctx({ home_score: 1, away_score: 1 }));
    expect(draw.content).toContain("1-1");
    const c = ctx({ home_score: 0, away_score: 1 }); // gana Argentina; la mayoría del parche A pronosticaba a Colombia
    c.items[0].predictions = [{ user_id: "ana", points: 0, points_reason: "miss", home: 2, away: 0 }, { user_id: "beto", points: 0, points_reason: "miss", home: 1, away: 0 }];
    expect(buildParcheNews(c, c.items[0]).content.split("\n\n")[0]).toMatch(/Sorpresa|pronóstico|Nadie lo vio venir/);
  });
  it("sin pronósticos ni participantes no inventa nada y no falla", () => {
    const c = ctx();
    c.items[0] = { parche_event_id: "peA", leaderboard: [], predictions: [] };
    const n = buildParcheNews(c, c.items[0]);
    expect(n.summary).toBe("Resultado oficial del partido.");
    expect(n.content).not.toMatch(/Ana|Beto|undefined|NaN/);
  });
  it("jamás menciona dinero ni premios, ni narrativa de una selección concreta", () => {
    for (const x of buildMatchNews(ctx())) expect(`${x.title} ${x.summary} ${x.content}`).not.toMatch(/💰|premi|bolsa|COP|\$|tricolor|campeón vigente/i);
  });
});

describe("detalle: bloques y fechas", () => {
  it("etiqueta cada bloque por su emoji; sin «Premios proyectados»", () => {
    const b = parseBlocks("⚽ Resultado\n\n🏆 Líder\n\n🎯 Exacto\n\n⚡ Part\n\n💰 Algo\n\nSin emoji");
    expect(b.map((x) => x.label)).toEqual(["Resultado", "Liderato", "Marcador exacto", "Participación", null, null]);
    expect(parseBlocks("   ")).toEqual([]);
  });
  it("la fecha se muestra en la zona del torneo", () => {
    const iso = "2026-06-12T02:30:00Z";
    expect(formatNewsDate(iso, "America/Bogota", { day: "numeric", month: "long" })).toContain("11");
    expect(formatNewsDate(iso, "Europe/Madrid", { day: "numeric", month: "long" })).toContain("12");
  });
});

// Cliente simulado: registra las llamadas RPC y devuelve lo configurado.
function fakeClient(rpc: Record<string, (args: Record<string, unknown>) => { data?: unknown; error?: { message: string } | null }>, tables: Record<string, unknown[]> = {}) {
  const calls: { fn: string; args: Record<string, unknown> }[] = [];
  const builder = (rows: unknown[]) => {
    const q: Record<string, unknown> = {};
    for (const m of ["select", "eq", "not", "is"]) q[m] = () => q;
    q.then = (res: (v: unknown) => void) => res({ data: rows, error: null });
    return q;
  };
  return {
    calls,
    client: {
      rpc: async (fn: string, args: Record<string, unknown>) => { calls.push({ fn, args }); return { data: null, error: null, ...(rpc[fn]?.(args) ?? {}) }; },
      from: (t: string) => builder(tables[t] ?? []),
    } as never,
  };
}

describe("publicación (cliente simulado)", () => {
  it("lee el contexto oficial y publica ligado a SU revisión", async () => {
    const f = fakeClient({ control_news_context: () => ({ data: ctx() }), control_publish_match_news: () => ({ data: 3 }) });
    expect(await publishMatchNews(f.client, "m1")).toBe(3);
    const pub = f.calls.find((c) => c.fn === "control_publish_match_news")!;
    expect(pub.args.p_revision).toBe(2);
    expect(pub.args.p_match_id).toBe("m1");
    expect((pub.args.p_items as unknown[]).length).toBe(3);
  });
  it("un torneo sin parches inscritos no publica noticias (no hay audiencia)", async () => {
    const f = fakeClient({ control_news_context: () => ({ data: { ...ctx(), items: [] } }) });
    expect(await publishMatchNews(f.client, "m1")).toBe(0);
    expect(f.calls.some((c) => c.fn === "control_publish_match_news")).toBe(false);
  });
  it("si el partido no está finalizado, la base rechaza y no se publica nada", async () => {
    const f = fakeClient({ control_news_context: () => ({ error: { message: "match_not_finished" } }) });
    await expect(publishMatchNews(f.client, "m1")).rejects.toThrow("match_not_finished");
    expect(f.calls.some((c) => c.fn === "control_publish_match_news")).toBe(false);
  });
  it("publishMatchNewsSafely nunca lanza y reintenta una vez", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    let n = 0;
    const f = fakeClient({ control_news_context: () => (++n === 1 ? { error: { message: "boom" } } : { data: ctx() }), control_publish_match_news: () => ({ data: 3 }) });
    expect(await publishMatchNewsSafely(f.client, "m1")).toBe(true);
    const g = fakeClient({ control_news_context: () => ({ error: { message: "boom" } }) });
    expect(await publishMatchNewsSafely(g.client, "m1")).toBe(false);
  });
  it("reconcile publica solo los partidos finalizados que no tienen su noticia vigente", async () => {
    const f = fakeClient(
      { control_news_context: () => ({ data: ctx() }), control_publish_match_news: () => ({ data: 3 }) },
      { matches: [{ id: "m1", result_revision: 2 }, { id: "m2", result_revision: 1 }], news: [{ match_id: "m2", match_revision: 1 }] }
    );
    expect(await reconcileEventNews(f.client, "e1")).toBe(1);
    expect(f.calls.filter((c) => c.fn === "control_news_context").map((c) => c.args.p_match_id)).toEqual(["m1"]);
  });
});
