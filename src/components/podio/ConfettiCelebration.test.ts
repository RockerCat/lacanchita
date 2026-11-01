import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { startCelebration } from "./ConfettiCelebration";

const store = new Map<string, string>();
const env = (reduce = false) =>
  ({
    matchMedia: (q: string) => ({ matches: reduce && q.includes("reduce") }),
    sessionStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) },
  }) as unknown as Parameters<typeof startCelebration>[0];

const fn = Object.assign(vi.fn(), { reset: vi.fn() });
const load = () => Promise.resolve(fn);
const flush = async () => { await Promise.resolve(); await Promise.resolve(); };

describe("celebración de confeti (recuperada de La Penúltima)", () => {
  beforeEach(() => { vi.useFakeTimers(); store.clear(); fn.mockClear(); fn.reset.mockClear(); });
  afterEach(() => vi.useRealTimers());

  it("secuencia original centro → izquierda → derecha, una sola vez (sin repetir cada 5 s)", async () => {
    startCelebration(env(), "k", false, load);
    await flush();
    expect(fn).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1500);
    expect(fn.mock.calls.map((c) => c[0].origin)).toEqual([{ x: 0.5, y: 0.1 }, { x: 0.05, y: 0.3 }, { x: 0.95, y: 0.3 }]);
    expect(fn.mock.calls[0][0].colors).toEqual(["#f59e0b", "#fcd34d", "#ffffff", "#00c85a"]);
    vi.advanceTimersByTime(60_000);
    expect(fn).toHaveBeenCalledTimes(3);
  });
  it("no se repite al recargar en la misma sesión; otro torneo sí; replay sí", async () => {
    startCelebration(env(), "k", false, load);
    await flush();
    vi.advanceTimersByTime(1500);
    fn.mockClear();
    startCelebration(env(), "k", false, load);
    await flush();
    expect(fn).not.toHaveBeenCalled();
    startCelebration(env(), "otro", false, load);
    await flush();
    expect(fn).toHaveBeenCalledTimes(1);
    fn.mockClear();
    startCelebration(env(), "k", true, load);
    await flush();
    expect(fn).toHaveBeenCalledTimes(1);
  });
  it("respeta prefers-reduced-motion", async () => {
    startCelebration(env(true), "k", true, load);
    await flush();
    expect(fn).not.toHaveBeenCalled();
  });
  it("la limpieza cancela ráfagas pendientes y el lienzo; un desmontaje inmediato no dispara nada", async () => {
    const stop = startCelebration(env(), "k", false, load);
    await flush();
    stop();
    expect(fn.reset).toHaveBeenCalled();
    vi.advanceTimersByTime(5000);
    expect(fn).toHaveBeenCalledTimes(1);
    fn.mockClear();
    startCelebration(env(), "z", false, load)();
    await flush();
    expect(fn).not.toHaveBeenCalled();
  });
  it("tolera sessionStorage bloqueado", async () => {
    const bad = { matchMedia: () => ({ matches: false }), sessionStorage: { getItem() { throw new Error("x"); }, setItem() { throw new Error("x"); } } } as unknown as Parameters<typeof startCelebration>[0];
    startCelebration(bad, "k", false, load);
    await flush();
    vi.advanceTimersByTime(1500);
    expect(fn).toHaveBeenCalledTimes(3);
  });
});
