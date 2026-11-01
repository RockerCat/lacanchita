import { describe, expect, it } from "vitest";
import { DEFAULT_THEME, otherTheme, parseTheme, THEME_INIT_SCRIPT, THEME_STORAGE_KEY } from "./theme";

describe("tema", () => {
  it("oscuro por defecto y solo valores válidos", () => {
    expect(DEFAULT_THEME).toBe("dark");
    expect(parseTheme(null)).toBe("dark");
    expect(parseTheme("sepia")).toBe("dark");
    expect(parseTheme("light")).toBe("light");
    expect(otherTheme("dark")).toBe("light");
  });

  function runInit(stored: string | null, opts: { throws?: boolean; systemLight?: boolean } = {}) {
    const root = { dataset: {} as Record<string, string>, style: {} as Record<string, string> };
    const localStorage = {
      getItem: (k: string) => {
        if (opts.throws) throw new Error("bloqueado");
        return k === THEME_STORAGE_KEY ? stored : null;
      },
    };
    // El script no consulta prefers-color-scheme: la elección explícita (o el oscuro) manda.
    const matchMedia = () => ({ matches: Boolean(opts.systemLight) });
    new Function("document", "localStorage", "matchMedia", THEME_INIT_SCRIPT)({ documentElement: root }, localStorage, matchMedia);
    return root;
  }

  it("el script inicial aplica la preferencia guardada antes de pintar", () => {
    expect(runInit("light").dataset.theme).toBe("light");
    expect(runInit("light").style.colorScheme).toBe("light");
    expect(runInit("dark", { systemLight: true }).dataset.theme).toBe("dark");
  });
  it("sin preferencia (o valor inválido) usa oscuro aunque el sistema prefiera claro", () => {
    expect(runInit(null, { systemLight: true }).dataset.theme).toBe("dark");
    expect(runInit("x").dataset.theme).toBe("dark");
  });
  it("si localStorage falla no rompe la página (queda el oscuro del HTML)", () => {
    expect(() => runInit(null, { throws: true })).not.toThrow();
  });
});
