import { describe, expect, it } from "vitest";
import { cropStyle, DARK_LOGO_CONTENT, DARK_LOGO_CROP, FRAME, LIGHT_LOGO_CONTENT, LIGHT_LOGO_CROP, type Crop } from "./logo";

const ratio = (c: { width: number; height: number }) => c.width / c.height;

describe.each([
  ["oscuro", DARK_LOGO_CROP, DARK_LOGO_CONTENT],
  ["claro", LIGHT_LOGO_CROP, LIGHT_LOGO_CONTENT],
] as [string, Crop, typeof DARK_LOGO_CONTENT][])("logo %s", (_n, crop, content) => {
  it("ocupa exactamente el mismo marco (misma proporción, sin deformar)", () => {
    expect(Math.abs(ratio(crop) - ratio(FRAME))).toBeLessThan(0.01);
  });
  it("el recorte cabe dentro de la imagen original", () => {
    expect(crop.x).toBeGreaterThanOrEqual(0);
    expect(crop.y).toBeGreaterThanOrEqual(0);
    expect(crop.x + crop.width).toBeLessThanOrEqual(crop.imageWidth);
    expect(crop.y + crop.height).toBeLessThanOrEqual(crop.imageHeight);
  });
  it("no recorta el contenido del logo", () => {
    expect(crop.x).toBeLessThanOrEqual(content.x0);
    expect(crop.y).toBeLessThanOrEqual(content.y0);
    expect(crop.x + crop.width).toBeGreaterThanOrEqual(content.x1);
    expect(crop.y + crop.height).toBeGreaterThanOrEqual(content.y1);
  });
  it("el contenido llena el marco de forma parecida en ambos temas (≥ 88 % de alto)", () => {
    expect((content.y1 - content.y0) / crop.height).toBeGreaterThan(0.88);
  });
});

describe("cropStyle", () => {
  it("porcentajes coherentes con el recorte", () => {
    expect(cropStyle(DARK_LOGO_CROP)).toEqual({ width: "130.82%", left: "-17.14%", top: "-40.38%" });
    expect(cropStyle(LIGHT_LOGO_CROP)).toEqual({ width: "116.25%", left: "-8.35%", top: "-35.60%" });
  });
});
