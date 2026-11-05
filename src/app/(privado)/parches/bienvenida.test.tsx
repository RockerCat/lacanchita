import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = {
  invitation: null as null | { status: string; parche_id: string; parche_name: string },
  membership: { parcheName: "Los del barrio", role: "member", status: "active" } as { parcheName: string; role: string; status: string },
  events: [] as { id: string; eventName: string; eventStatus: string; snapshot: null }[],
};
vi.mock("next/navigation", () => ({ redirect: () => { throw new Error("redirect"); }, notFound: () => { throw new Error("404"); } }));
vi.mock("@/lib/auth", () => ({
  requireUser: async () => ({ user: { id: "u", email: "a@b.c", user_metadata: { username: "Ana" } }, supabase: { rpc: async () => ({ data: state.invitation ? [state.invitation] : [] }) } }),
}));
vi.mock("@/lib/data", () => ({
  getMembership: async () => state.membership,
  getParcheEvents: async () => state.events,
  getAvailableEvents: async () => [],
  getParcheMembers: async () => [],
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
beforeEach(() => { state.invitation = null; state.membership = { parcheName: "Los del barrio", role: "member", status: "active" }; state.events = []; });

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
  });
  it("integrante con torneos: se oculta la bienvenida", async () => {
    state.events = [{ id: "e1", eventName: "Copa", eventStatus: "scheduled", snapshot: null }];
    expect(await parche()).not.toContain("¡Ya eres parte del parche!");
  });
  it("integrante deshabilitado: sin bienvenida", async () => {
    state.membership = { parcheName: "Los del barrio", role: "member", status: "disabled" };
    expect(await parche()).not.toContain("¡Ya eres parte del parche!");
  });
  it("creador sin torneos: conserva su bloque y sus invitaciones, sin la bienvenida de integrante", async () => {
    state.membership = { parcheName: "Los del barrio", role: "owner", status: "active" };
    const t = await parche();
    expect(t).toContain("Tu parche está listo. ¿Qué sigue?");
    expect(t).toContain("Crear enlace de invitación");
    expect(t).not.toContain("¡Ya eres parte del parche!");
  });
});
