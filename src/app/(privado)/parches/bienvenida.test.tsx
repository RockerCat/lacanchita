import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = {
  invitation: null as null | { status: string; parche_id: string; parche_name: string },
  membership: { parcheName: "Los del barrio", role: "member", status: "active" } as { parcheName: string; role: string; status: string },
  active: 1,
  landing: [] as unknown[],
  available: [] as { id: string; name: string; status: string; slug?: string }[],
  events: [] as { id: string; eventName: string; eventStatus: string; snapshot: null }[],
};
vi.mock("next/navigation", () => ({ redirect: () => { throw new Error("redirect"); }, notFound: () => { throw new Error("404"); } }));
vi.mock("@/lib/auth", () => ({
  requireUser: async () => ({ user: { id: "u", email: "a@b.c", user_metadata: { username: "Ana" } }, supabase: { rpc: async (fn: string) => ({ data: fn === "get_landing_tournaments" ? state.landing : state.invitation ? [state.invitation] : [] }) } }),
}));
vi.mock("@/lib/data", () => ({
  getMembership: async () => state.membership,
  getParcheEvents: async () => state.events,
  getAvailableEvents: async () => state.available,
  getParcheMembers: async () => Array.from({ length: state.active }, () => ({ status: "active" })),
  getOpenInvitation: async () => null,
}));
vi.mock("@/app/(privado)/parches/actions", () => ({ enrollEventAction: async () => ({ error: null }), createInvitationAction: async () => ({ error: null, url: null, expiresAt: null }) }));
vi.mock("../invitacion/[token]/actions", () => ({ acceptInvitationAction: async () => ({ error: null, status: null }) }));

import InvitationPage from "../invitacion/[token]/page";
import ParchePage from "./[parcheId]/page";

const text = (h: string) => h.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
const TOKEN = "a".repeat(43);
const invite = async () => renderToStaticMarkup(await InvitationPage({ params: Promise.resolve({ token: TOKEN }) }));
const parche = async () => text(renderToStaticMarkup(await ParchePage({ params: Promise.resolve({ parcheId: "p1" }) })));
beforeEach(() => { state.invitation = null; state.membership = { parcheName: "Los del barrio", role: "member", status: "active" }; state.events = []; state.active = 1; state.available = []; state.landing = []; });

describe("pantalla de invitación", () => {
  it("válida: bienvenida con el nombre real, ilustración y acción de unirse", async () => {
    state.invitation = { status: "valid", parche_id: "p1", parche_name: "Los del barrio" };
    const h = await invite();
    expect(text(h)).toContain("¡Te invitaron a jugar en La Canchita!");
    expect(text(h)).toContain("Los del barrio");
    expect(text(h)).toContain("Unirme al parche");
    expect(h).toContain("crear-parche.png");
  });
  it.each([["expired", "Este enlace venció"], ["revoked", "Este enlace ya no funciona"], ["exhausted", "Este enlace ya se usó"], ["not_found", "Invitación no encontrada"]])("%s: mensaje propio, sin ilustración ni botón de unirse", async (status, title) => {
    state.invitation = status === "not_found" ? null : { status, parche_id: "p1", parche_name: "Los del barrio" };
    const h = await invite();
    expect(text(h)).toContain(title);
    expect(text(h)).not.toContain("Unirme al parche");
    expect(h).not.toContain("crear-parche.png");
  });
  it("ya es miembro: sigue ofreciendo ir al parche", async () => {
    state.invitation = { status: "already_member", parche_id: "p1", parche_name: "Los del barrio" };
    expect(text(await invite())).toContain("Ir al parche");
  });
});

describe("resumen del parche: bienvenida de integrantes", () => {
  it("integrante sin torneos: bloque de bienvenida con ilustración y sin acciones administrativas", async () => {
    const t = await parche();
    expect(t).toContain("¡Ya eres parte del parche!");
    expect(t).toContain("podrás hacer tus pronósticos y seguir la clasificación");
    expect(t).not.toContain("Incorporar un torneo");
    expect(t).not.toContain("Crear enlace de invitación");
    expect(t).not.toContain("armar tu propio parche");
    expect(t).toContain("¿Tienes otro grupo de amigos?");
    expect(t).toContain("Seguirás formando parte de este parche");
  });
  it("tarjeta independiente: va después de Torneos y su botón lleva a /parches/nuevo", async () => {
    const h = renderToStaticMarkup(await ParchePage({ params: Promise.resolve({ parcheId: "p1" }) }));
    expect(h).toMatch(/<a[^>]*href="\/parches\/nuevo"[^>]*>Crear otro parche<\/a>/);
    expect(h.indexOf("¿Tienes otro grupo de amigos?")).toBeGreaterThan(h.indexOf('id="torneos"'));
  });
  it("integrante con torneos: se oculta la bienvenida", async () => {
    state.events = [{ id: "e1", eventName: "Copa", eventStatus: "scheduled", snapshot: null }];
    const t = await parche();
    expect(t).not.toContain("¡Ya eres parte del parche!");
    expect(t).not.toContain("¿Tienes otro grupo de amigos?");
  });
  it("integrante deshabilitado: sin bienvenida", async () => {
    state.membership = { parcheName: "Los del barrio", role: "member", status: "disabled" };
    expect(await parche()).not.toContain("¡Ya eres parte del parche!");
  });
  it("creador sin torneos: conserva su bloque y sus invitaciones, sin la bienvenida de integrante", async () => {
    state.membership = { parcheName: "Los del barrio", role: "owner", status: "active" };
    const t = await parche();
    expect(t).toContain("¡Tu parche está listo!");
    expect(t).toContain("Suma al menos a un amigo");
    expect(t).not.toContain("¿Qué sigue?");
    expect(t).not.toContain("Jugar con mi parche");
    expect(t).toContain("Crear enlace de invitación");
    expect(t).not.toContain("¡Ya eres parte del parche!");
    expect(t).not.toContain("¿Tienes otro grupo de amigos?");
  });
  it("creador con 2+ activos: torneos directos en el bloque, sin sección separada", async () => {
    state.membership = { parcheName: "Los del barrio", role: "owner", status: "active" };
    state.active = 3;
    state.available = [{ id: "e1", name: "Copa Ficticia", status: "scheduled" }];
    const t = await parche();
    expect(t).toContain("¡Tu parche está listo para competir!");
    expect(t).toContain("Ya son 3 jugadores. ¡Es hora de demostrar quién sabe más de fútbol!");
    expect(t.split("Copa Ficticia")).toHaveLength(2);
    expect(t.split("Jugar con mi parche")).toHaveLength(2);
    expect(t).not.toContain("Incorporar un torneo");
    expect(t).not.toContain("Crear enlace de invitación");
  });
  it("creador con 2+ y varios torneos: destacado en el bloque, otros debajo sin repetir", async () => {
    state.membership = { parcheName: "Los del barrio", role: "owner", status: "active" };
    state.active = 2;
    state.available = [
      { id: "e1", name: "Aaa Copa", status: "scheduled", slug: "aaa" },
      { id: "e2", name: "Zzz Liga", status: "in_progress", slug: "zzz" },
      { id: "e3", name: "Mmm Cup", status: "scheduled", slug: "mmm" },
    ];
    state.landing = [{ slug: "zzz", name: "Zzz Liga", status: "in_progress", first_match_at: null, next_match_at: "2999-01-01T00:00:00Z", last_match_at: null, has_live: false, is_manual: true }];
    const t = await parche();
    for (const n of ["Aaa Copa", "Zzz Liga", "Mmm Cup"]) expect(t.split(n)).toHaveLength(2);
    expect(t.indexOf("Zzz Liga")).toBeLessThan(t.indexOf("Otros torneos disponibles"));
    expect(t.indexOf("Otros torneos disponibles")).toBeLessThan(t.indexOf("Aaa Copa"));
    expect(t.split("Jugar con mi parche")).toHaveLength(4);
  });
  it("creador con 1 participante: ve torneos disponibles para descubrir", async () => {
    state.membership = { parcheName: "Los del barrio", role: "owner", status: "active" };
    state.available = [{ id: "e1", name: "Copa Ficticia", status: "scheduled" }];
    const t = await parche();
    expect(t).toContain("Suma al menos a un amigo");
    expect(t).toContain("Torneos disponibles");
    expect(t.split("Copa Ficticia")).toHaveLength(2);
    expect(t).toContain("Jugar con mi parche");
  });
  it("creador con 2+ activos y sin torneos disponibles: estado vacío sin CTA", async () => {
    state.membership = { parcheName: "Los del barrio", role: "owner", status: "active" };
    state.active = 2;
    const t = await parche();
    expect(t).toContain("Todavía no hay torneos disponibles");
    expect(t).not.toContain("Jugar con mi parche");
  });
  it("creador con torneo inscrito: sin onboarding, inscritos primero y disponibles después", async () => {
    state.membership = { parcheName: "Los del barrio", role: "owner", status: "active" };
    state.active = 3;
    state.events = [{ id: "pe1", eventName: "Liga Inscrita", eventStatus: "scheduled", snapshot: null }];
    state.available = [{ id: "e2", name: "Copa Nueva", status: "scheduled" }];
    const t = await parche();
    expect(t).not.toContain("listo para competir");
    expect(t).toContain("Entrar al torneo");
    expect(t.indexOf("Liga Inscrita")).toBeLessThan(t.indexOf("Incorporar un torneo"));
    expect(t.indexOf("Incorporar un torneo")).toBeLessThan(t.indexOf("Copa Nueva"));
  });
});
