import { describe, expect, it } from "vitest";
import { autoOrder, describeTournament, isUpcoming, promoPriority, describeTournamentLine, pickFeatured, playPath, toLandingTournaments, type LandingTournament } from "./landing-tournaments";

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
  it("automático: el PRÓXIMO con inscripciones abiertas antes que el en curso; entre próximos, el que empieza antes; entre en curso, el próximo partido más cercano", () => {
    const list = [
      T({ slug: "prox-tarde", firstMatchAt: "2027-05-01T00:00:00Z" }),
      T({ slug: "prox-pronto", firstMatchAt: "2027-02-01T00:00:00Z" }),
      T({ slug: "juego-lejos", status: "in_progress", nextMatchAt: "2027-01-20T00:00:00Z" }),
      T({ slug: "juego-cerca", status: "in_progress", nextMatchAt: "2027-01-05T00:00:00Z" }),
    ];
    const now = new Date("2026-12-01T00:00:00Z");
    expect(autoOrder(list, now).map((x) => x.slug)).toEqual(["prox-pronto", "prox-tarde", "juego-cerca", "juego-lejos"]);
    expect(pickFeatured(list, now).featured?.slug).toBe("prox-pronto");
    expect(pickFeatured(list).others).toHaveLength(3);
  });
  it("es determinista: el orden de llegada no cambia el resultado y los empates se resuelven por nombre y slug", () => {
    const a = [T({ slug: "b", name: "Beta" }), T({ slug: "a", name: "Alfa" }), T({ slug: "c", name: "Alfa" })];
    expect(pickFeatured(a).featured?.slug).toBe("a");
    expect(pickFeatured([...a].reverse()).featured?.slug).toBe("a");
  });
  it("manual elegible → manda sobre el orden automático", () => {
    const list = [T({ slug: "auto" }), T({ slug: "manual", isManual: true, firstMatchAt: "2028-01-01T00:00:00Z" })];
    expect(pickFeatured(list).featured?.slug).toBe("manual");
    expect(pickFeatured(list).others.map((x) => x.slug)).toEqual(["auto"]);
  });
  it("manual inválido (la base ya no lo devuelve como elegible) → cae al automático sin errores", () => {
    expect(pickFeatured([T({ slug: "uno" }), T({ slug: "dos", firstMatchAt: "2027-09-01T00:00:00Z" })]).featured?.slug).toBe("uno");
  });
  it("sin calendario: la fecha anunciada ordena; sin ninguna fecha va al final; una anunciada ya pasada deja de ser «próxima»", () => {
    const now = new Date("2026-11-03T15:00:00Z");
    const sin = { firstMatchAt: null, nextMatchAt: null };
    const list = [T({ slug: "sin-fecha", ...sin }), T({ slug: "tarde", ...sin, announcedStart: "2026-12-20" }), T({ slug: "pronto", ...sin, announcedStart: "2026-11-14" }), T({ slug: "vencida", ...sin, announcedStart: "2026-10-01" })];
    expect(autoOrder(list, now).map((x) => x.slug)).toEqual(["pronto", "tarde", "sin-fecha", "vencida"]);
    expect(promoPriority(list[3], now)).toBe(2);
    expect(promoPriority(list[2], now)).toBe(1);
  });
  it("la fecha anunciada del mismo día en la zona del torneo sigue siendo próxima", () => {
    const x = T({ slug: "hoy", firstMatchAt: null, nextMatchAt: null, announcedStart: "2026-11-14" });
    expect(isUpcoming(x, new Date("2026-11-15T03:00:00Z"))).toBe(true); // 22:00 del 14 en Bogotá
    expect(isUpcoming(x, new Date("2026-11-15T06:00:00Z"))).toBe(false);
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
    expect(d).toMatchObject({ headline: "Próximamente", enrollment: "Inscripciones abiertas", detail: "Empieza el 5 de marzo", label: "Próximo torneo", note: null });
  });
  it("oficialmente en curso: En juego + próximo partido; con partido en vivo: En juego ahora", () => {
    expect(describeTournament(T({ slug: "a", status: "in_progress", nextMatchAt: "2027-03-09T20:00:00Z" }), NOW)).toMatchObject({ headline: "En juego", enrollment: "Inscripciones abiertas", detail: "Próximo partido: 9 de marzo" });
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
    expect(d).toMatchObject({ headline: null, enrollment: "Inscripciones abiertas", detail: null });
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
  it("fecha anunciada sin partidos: «Inicio previsto» + aviso; sin hora ni día corrido por zona; sin fecha no se inventa", () => {
    const now = new Date("2026-11-03T15:00:00Z");
    const x = T({ slug: "a", firstMatchAt: null, nextMatchAt: null, announcedStart: "2026-11-14" });
    expect(describeTournament(x, now)).toMatchObject({ headline: "Próximamente", detail: "Inicio previsto: 14 de noviembre", note: "Sujeto a programación oficial", label: "Próximo torneo" });
    expect(describeTournament({ ...x, timezone: "Asia/Tokyo" }, now).detail).toBe("Inicio previsto: 14 de noviembre");
    expect(describeTournament({ ...x, announcedStart: null }, now)).toMatchObject({ detail: null, note: null });
    expect(describeTournament({ ...x, announcedStart: "basura" }, now).detail).toBeNull();
  });
  it("con partidos cargados manda la fecha oficial del primer partido, no la anunciada", () => {
    const x = T({ slug: "a", firstMatchAt: "2026-11-15T01:00:00Z", announcedStart: "2026-11-14" });
    expect(describeTournament(x, new Date("2026-11-03T15:00:00Z"))).toMatchObject({ detail: "Empieza el 14 de noviembre", note: null });
  });
  it("el destino del CTA codifica el slug", () => {
    expect(playPath("liga-x")).toBe("/jugar/liga-x");
    expect(playPath("a/b")).toBe("/jugar/a%2Fb");
  });
});

describe("ilustración en la lectura de la portada", () => {
  it("se propaga la ruta (o null) sin afectar la selección", () => {
    const base = { name: "n", status: "scheduled", timezone: "America/Bogota", first_match_at: null, next_match_at: null, last_match_at: null, has_live: false, is_manual: false };
    const [a, b] = toLandingTournaments([{ ...base, slug: "a", illustration_path: "e/x.png" }, { ...base, slug: "b" }]);
    expect(a.illustrationPath).toBe("e/x.png");
    expect(b.illustrationPath).toBeNull();
  });
});
