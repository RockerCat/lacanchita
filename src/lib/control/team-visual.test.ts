import { describe, expect, it } from "vitest";
import { checkCrest, detectCrestType, MAX_CREST_BYTES } from "./crest";
import { crestUrl, suggestFlag, teamInitials, teamVisual } from "./team-visual";

describe("suggestFlag", () => {
  it("sugiere la bandera emoji de selecciones por su nombre en español", () => {
    expect(suggestFlag("Colombia")).toBe("🇨🇴");
    expect(suggestFlag("Argentina")).toBe("🇦🇷");
    expect(suggestFlag("Brasil")).toBe("🇧🇷");
    expect(suggestFlag("Alemania")).toBe("🇩🇪");
    expect(suggestFlag("  méxico ")).toBe("🇲🇽");
    expect(suggestFlag("Estados Unidos")).toBe("🇺🇸");
  });
  it("Inglaterra/Escocia/Gales usan su bandera propia", () => {
    expect(suggestFlag("Inglaterra")).toContain("\u{1F3F4}");
  });
  it("sin correspondencia válida → null (no se inventa)", () => {
    expect(suggestFlag("Atlético Nacional")).toBeNull();
    expect(suggestFlag("Marte")).toBeNull();
    expect(suggestFlag("")).toBeNull();
  });
});

describe("teamVisual", () => {
  it("selección: bandera; sin bandera pero con escudo, escudo; si no, iniciales", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://x.supabase.co";
    expect(teamVisual({ name: "Colombia", kind: "national", flag_emoji: "🇨🇴" })).toEqual({ type: "flag", emoji: "🇨🇴" });
    expect(teamVisual({ name: "Equipo X", kind: "national", crest_path: "a/b.png" })).toEqual({ type: "crest", url: "https://x.supabase.co/storage/v1/object/public/team-crests/a/b.png" });
    expect(teamVisual({ name: "Equipo Raro", kind: "national" })).toEqual({ type: "initials", text: "ER" });
  });
  it("club: escudo primero; fallback a iniciales legibles", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://x.supabase.co";
    expect(teamVisual({ name: "Club", kind: "club", flag_emoji: "⚽", crest_path: "a/b.webp" }).type).toBe("crest");
    expect(teamVisual({ name: "Atlético Nacional", kind: "club" })).toEqual({ type: "initials", text: "AN" });
  });
  it("utilidades", () => {
    expect(teamInitials("  ")).toBe("?");
    expect(crestUrl(null)).toBeNull();
  });
});

describe("validación de escudos", () => {
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
  const jpg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0]);
  const webp = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]);
  it("acepta png, jpeg y webp por su firma", () => {
    expect(detectCrestType(png)?.ext).toBe("png");
    expect(detectCrestType(jpg)?.ext).toBe("jpg");
    expect(detectCrestType(webp)?.ext).toBe("webp");
  });
  it("rechaza SVG, HTML, ejecutables y archivos vacíos o enormes", () => {
    const enc = (s: string) => new TextEncoder().encode(s);
    expect(checkCrest(enc("<svg xmlns='http://www.w3.org/2000/svg'><script>alert(1)</script></svg>"))).toEqual({ ok: false, code: "crest_invalid_type" });
    expect(checkCrest(enc("<html></html>"))).toEqual({ ok: false, code: "crest_invalid_type" });
    expect(checkCrest(new Uint8Array([0x4d, 0x5a, 0x90, 0]))).toEqual({ ok: false, code: "crest_invalid_type" });
    expect(checkCrest(new Uint8Array(0))).toEqual({ ok: false, code: "crest_required" });
    const big = new Uint8Array(MAX_CREST_BYTES + 1);
    big.set(png);
    expect(checkCrest(big)).toEqual({ ok: false, code: "crest_too_large" });
    expect(checkCrest(png).ok).toBe(true);
  });
});
