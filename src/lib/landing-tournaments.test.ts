import { describe, expect, it } from "vitest";
import { autoOrder, describeTournament, describeTournamentLine, pickFeatured, playPath, toLandingTournaments, type LandingTournament } from "./landing-tournaments";

const T = (o: Partial<LandingTournament> & { slug: string }): LandingTournament => ({
  name: o.slug.toUpperCase(), status: "scheduled", timezone: "America/Bogota", firstMatchAt: "2027-03-01T20:00:00Z", nextMatchAt: "2027-03-01T20:00:00Z", lastMatchAt: null, hasLive: false, isManual: false, ...o,
});

describe("selección del torneo destacado", () => {
  it("ninguno elegible → sin destacado ni otros", () => {
    expect(pickFeatured([])).toEqual({ featured: null, others: [] });
    expect(toLandingTournaments(null)).toEqual([]);
  });
  it("uno solo → es el destacado", () => {
    expect(pickFeatured([T({ slug: "a" })]).featured?.slug).toBe("a");
  });
  it("automático: en juego antes que próximo; entre en juego, el próximo partido más cercano; entre próximos, el que empieza antes", () => {
    const list = [
      T({ slug: "prox-tarde", firstMatchAt: "2027-05-01T00:00:00Z" }),
      T({ slug: "prox-pronto", firstMatchAt: "2027-02-01T00:00:00Z" }),
      T({ slug: "juego-lejos", status: "in_progress", nextMatchAt: "2027-01-20T00:00:00Z" }),
      T({ slug: "juego-cerca", status: "in_progress", nextMatchAt: "2027-01-05T00:00:00Z" }),
    ];
    expect(autoOrder(list).map((x) => x.slug)).toEqual(["juego-cerca", "juego-lejos", "prox-pronto", "prox-tarde"]);
    expect(pickFeatured(list).featured?.slug).toBe("juego-cerca");
    expect(pickFeatured(list).others).toHaveLength(3);
  });
  it("es determinista: el orden de llegada no cambia el resultado y los empates se resuelven por nombre y slug", () => {
    const a = [T({ slug: "b", name: "Beta" }), T({ slug: "a", name: "Alfa" }), T({ slug: "c", name: "Alfa" })];
    expect(pickFeatured(a).featured?.slug).toBe("a");
    expect(pickFeatured([...a].reverse()).featured?.slug).toBe("a");
  });
  it("manual elegible → manda sobre el orden automático", () => {
    const list = [T({ slug: "auto", status: "in_progress" }), T({ slug: "manual", isManual: true, firstMatchAt: "2028-01-01T00:00:00Z" })];
    expect(pickFeatured(list).featured?.slug).toBe("manual");
    expect(pickFeatured(list).others.map((x) => x.slug)).toEqual(["auto"]);
  });
  it("manual inválido (la base ya no lo devuelve como elegible) → cae al automático sin errores", () => {
    expect(pickFeatured([T({ slug: "uno" }), T({ slug: "dos", firstMatchAt: "2027-09-01T00:00:00Z" })]).featured?.slug).toBe("uno");
  });
  it("descarta estados que no admiten participantes (defensa en profundidad)", () => {
    const rows = ["draft", "finished", "closed", "cancelled", "scheduled"].map((status) => ({ slug: status, name: status, status, timezone: "America/Bogota", first_match_at: null, next_match_at: null, last_match_at: null, has_live: false, is_manual: false }));
    expect(toLandingTournaments(rows).map((x) => x.slug)).toEqual(["scheduled"]);
  });
});

const NOW = new Date("2027-03-01T15:00:00Z"); // 10:00 en Bogotá

describe("descripción del torneo con datos reales", () => {
  it("próximo con inicio futuro: Próximamente + Empieza el … + inscripciones", () => {
    const d = describeTournament(T({ slug: "a", firstMatchAt: "2027-03-05T20:00:00Z" }), NOW);
    expect(d).toEqual({ headline: "Próximamente", enrollment: "Inscripciones abiertas", detail: "Empieza el 5 de marzo" });
  });
  it("oficialmente en curso: En juego + próximo partido; con partido en vivo: En juego ahora", () => {
    expect(describeTournament(T({ slug: "a", status: "in_progress", nextMatchAt: "2027-03-09T20:00:00Z" }), NOW)).toEqual({ headline: "En juego", enrollment: "Inscripciones abiertas", detail: "Próximo partido: 9 de marzo" });
    expect(describeTournament(T({ slug: "a", status: "in_progress", hasLive: true, nextMatchAt: null }), NOW)).toMatchObject({ headline: "En juego ahora", detail: null });
  });
  it("publicado pero con inicio PASADO y sin declarar en curso: nunca «Empieza el» ni «En juego»; solo el próximo partido real", () => {
    const d = describeTournament(T({ slug: "qa", firstMatchAt: "2026-10-31T19:04:00Z", nextMatchAt: "2027-03-02T19:04:00Z" }), NOW);
    expect(d.headline).toBeNull();
    expect(d.detail).toBe("Próximo partido: 2 de marzo");
    expect(describeTournamentLine(T({ slug: "qa", firstMatchAt: "2026-10-31T19:04:00Z", nextMatchAt: "2027-03-02T19:04:00Z" }), NOW)).toBe("Inscripciones abiertas · Próximo partido: 2 de marzo");
    expect(JSON.stringify(d)).not.toMatch(/Empieza|En juego|Próximamente/);
  });
  it("sin próximo partido ni inicio futuro: se omite la fecha en vez de inventarla", () => {
    const d = describeTournament(T({ slug: "a", firstMatchAt: "2026-10-31T19:04:00Z", nextMatchAt: null }), NOW);
    expect(d).toEqual({ headline: null, enrollment: "Inscripciones abiertas", detail: null });
    expect(describeTournament(T({ slug: "a", status: "in_progress", nextMatchAt: null }), NOW).detail).toBeNull();
  });
  it("datos desactualizados: un «próximo partido» que ya pasó no se muestra como futuro", () => {
    expect(describeTournament(T({ slug: "a", status: "in_progress", nextMatchAt: "2027-03-01T14:00:00Z" }), NOW).detail).toBeNull();
    expect(describeTournament(T({ slug: "a", firstMatchAt: "2027-03-01T14:59:59Z" }), NOW).headline).toBeNull();
  });
  it("cambio de día: el mismo torneo cambia de texto cuando pasa el tiempo", () => {
    const x = T({ slug: "a", firstMatchAt: "2027-03-05T20:00:00Z", nextMatchAt: "2027-03-05T20:00:00Z" });
    expect(describeTournament(x, new Date("2027-03-04T12:00:00Z")).headline).toBe("Próximamente");
    expect(describeTournament(x, new Date("2027-03-05T21:00:00Z")).headline).toBeNull();
  });
  it("zona horaria del torneo: 23:30 en Bogotá (04:30 UTC del día siguiente) sigue siendo ese día", () => {
    const x = T({ slug: "a", firstMatchAt: "2027-03-06T04:30:00Z" }); // 5 de marzo, 23:30 en Bogotá
    expect(describeTournament(x, NOW).detail).toBe("Empieza el 5 de marzo");
    expect(describeTournament({ ...x, timezone: "UTC" }, NOW).detail).toBe("Empieza el 6 de marzo");
    expect(describeTournament({ ...x, timezone: "Asia/Tokyo" }, NOW).detail).toBe("Empieza el 6 de marzo");
  });
  it("una zona inválida no rompe la portada (cae a Bogotá)", () => {
    expect(describeTournament(T({ slug: "a", firstMatchAt: "2027-03-06T04:30:00Z", timezone: "No/Existe" }), NOW).detail).toBe("Empieza el 5 de marzo");
  });
  it("el destino del CTA codifica el slug", () => {
    expect(playPath("liga-x")).toBe("/jugar/liga-x");
    expect(playPath("a/b")).toBe("/jugar/a%2Fb");
  });
});
