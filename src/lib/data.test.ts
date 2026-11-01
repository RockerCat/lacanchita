import { describe, expect, it } from "vitest";
import { getMembership, getMemberships, isUuid, pickSnapshot } from "./data";

// Cliente simulado: devuelve las filas que RLS habría dejado ver y registra los filtros aplicados.
function mockClient(rows: unknown[]) {
  const calls: { table: string; filters: [string, unknown][] } = { table: "", filters: [] };
  const builder = {
    select: () => builder,
    eq: (col: string, val: unknown) => (calls.filters.push([col, val]), builder),
    maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
    then: (resolve: (v: unknown) => void) => resolve({ data: rows, error: null }),
  };
  const client = { from: (table: string) => ((calls.table = table), builder) };
  return { client: client as never, calls };
}

const P1 = "11111111-1111-4111-8111-111111111111";

describe("getMemberships", () => {
  it("varios parches (fixture) y filtro por el usuario autenticado", async () => {
    const { client, calls } = mockClient([
      { role: "owner", status: "active", parches: { id: P1, name: "Uno" } },
      { role: "member", status: "disabled", parches: { id: "p2", name: "Dos" } },
    ]);
    const ms = await getMemberships(client, "user-1");
    expect(calls.table).toBe("parche_members");
    expect(calls.filters).toEqual([["user_id", "user-1"]]);
    expect(ms).toEqual([
      { parcheId: P1, parcheName: "Uno", role: "owner", status: "active" },
      { parcheId: "p2", parcheName: "Dos", role: "member", status: "disabled" },
    ]);
  });
  it("usuario sin parches", async () => {
    expect(await getMemberships(mockClient([]).client, "user-1")).toEqual([]);
  });
});

describe("getMembership", () => {
  it("parche ajeno o inexistente → null (la página responde 404)", async () => {
    expect(await getMembership(mockClient([]).client, "user-1", P1)).toBeNull();
  });
  it("id no válido → null sin consultar", async () => {
    const { client, calls } = mockClient([{ role: "member", status: "active", parches: { id: P1, name: "Uno" } }]);
    expect(await getMembership(client, "user-1", "no-es-uuid")).toBeNull();
    expect(calls.table).toBe("");
  });
});

describe("pickSnapshot", () => {
  it("prefiere el cierre oficial y si no, la versión sellada más reciente", () => {
    expect(
      pickSnapshot([
        { kind: "historical_cut", version: 1, sealed_at: "x" },
        { kind: "historical_cut", version: 2, sealed_at: "x" },
      ])?.version
    ).toBe(2);
    expect(
      pickSnapshot([
        { kind: "historical_cut", version: 3, sealed_at: "x" },
        { kind: "final_close", version: 2, sealed_at: "x" },
      ])?.kind
    ).toBe("final_close");
    expect(pickSnapshot([{ kind: "final_close", version: 1, sealed_at: null }])).toBeNull();
  });
  it("valida UUID", () => {
    expect(isUuid(P1)).toBe(true);
    expect(isUuid("1; drop")).toBe(false);
  });
});
