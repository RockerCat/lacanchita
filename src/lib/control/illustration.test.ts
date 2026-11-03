import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { checkIllustration, MAX_ILLUSTRATION_BYTES } from "./illustration";

// Fixtures mínimas generadas en la prueba (no son recursos del producto).
const raw = { create: { width: 32, height: 18, channels: 3 as const, background: "#0a7" } };
const png = new Uint8Array(await sharp(raw).png().toBuffer());
const jpg = new Uint8Array(await sharp(raw).jpeg().toBuffer());
const webp = new Uint8Array(await sharp(raw).webp().toBuffer());
const webpLossless = new Uint8Array(await sharp(raw).webp({ lossless: true }).toBuffer());

describe("checkIllustration", () => {
  it("acepta PNG, JPEG y WebP reales y lee sus dimensiones", () => {
    for (const [bytes, ext] of [[png, "png"], [jpg, "jpg"], [webp, "webp"], [webpLossless, "webp"]] as const) {
      const r = checkIllustration(bytes);
      expect(r.ok && r.type.ext).toBe(ext);
      expect(r.ok && r.info).toEqual({ width: 32, height: 18 });
    }
  });
  it("rechaza SVG, HTML, ejecutables y texto aunque se disfracen", () => {
    const enc = (s: string) => new TextEncoder().encode(s);
    for (const b of [enc("<svg xmlns='http://www.w3.org/2000/svg'><script/></svg>"), enc("<html><script>1</script></html>"), new Uint8Array([0x4d, 0x5a, 0x90, 0, 3]), enc("hola")]) {
      expect(checkIllustration(b)).toEqual({ ok: false, code: "illustration_invalid_type" });
    }
  });
  it("rechaza vacío y archivos mayores de 5 MB", () => {
    expect(checkIllustration(new Uint8Array(0))).toEqual({ ok: false, code: "illustration_required" });
    const big = new Uint8Array(MAX_ILLUSTRATION_BYTES + 1);
    big.set(png);
    expect(checkIllustration(big)).toEqual({ ok: false, code: "illustration_too_large" });
    const exact = new Uint8Array(MAX_ILLUSTRATION_BYTES);
    exact.set(png);
    expect(checkIllustration(exact).ok === false && (checkIllustration(exact) as { code: string }).code).not.toBe("illustration_too_large");
  });
  it("rechaza archivos con firma válida pero dañados o truncados", () => {
    expect(checkIllustration(png.slice(0, png.length - 20))).toEqual({ ok: false, code: "illustration_corrupt" });
    expect(checkIllustration(png.slice(0, 12))).toEqual({ ok: false, code: "illustration_corrupt" });
    expect(checkIllustration(jpg.slice(0, jpg.length - 10))).toEqual({ ok: false, code: "illustration_corrupt" });
    expect(checkIllustration(jpg.slice(0, 4))).toEqual({ ok: false, code: "illustration_corrupt" });
    expect(checkIllustration(webp.slice(0, webp.length - 8))).toEqual({ ok: false, code: "illustration_corrupt" });
    expect(checkIllustration(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0, 0xff, 0xd9]))).toEqual({ ok: false, code: "illustration_corrupt" });
    const noDims = png.slice();
    noDims.set([0, 0, 0, 0], 16);
    expect(checkIllustration(noDims)).toEqual({ ok: false, code: "illustration_corrupt" });
  });
});
