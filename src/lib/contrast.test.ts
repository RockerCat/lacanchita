import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Contraste WCAG de los tokens de color de ambos temas (src/app/globals.css).
const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");

function tokens(selector: string): Record<string, string> {
  const block = css.slice(css.indexOf(selector));
  const body = block.slice(block.indexOf("{") + 1, block.indexOf("}"));
  return Object.fromEntries([...body.matchAll(/--lc-([\w-]+):\s*(#[0-9a-f]{6})/gi)].map((m) => [m[1], m[2]]));
}

function luminance(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const ratio = (a: string, b: string) => {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
};

describe.each([
  ["oscuro", tokens('[data-theme="dark"]')],
  ["claro", tokens('[data-theme="light"]')],
])("tema %s", (_name, t) => {
  it.each(["fg", "fg-2", "fg-3", "cancha-text", "gold", "danger", "blue", "silver", "bronze"])(
    "texto %s legible (≥ 4.5:1) sobre fondo, superficie y superficie elevada",
    (fg) => {
      for (const bg of ["bg", "surface", "surface-raised"]) {
        expect(ratio(t[fg], t[bg]), `${fg} sobre ${bg}`).toBeGreaterThanOrEqual(4.5);
      }
    }
  );
  it("texto del botón principal sobre verde cancha", () => {
    expect(ratio("#0a0a12", t["cancha"])).toBeGreaterThanOrEqual(4.5);
  });
});
