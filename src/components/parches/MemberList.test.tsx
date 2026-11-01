import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { ParcheMember } from "@/lib/data";
import MemberList from "./MemberList";

// Las acciones de servidor no se ejecutan al renderizar; se sustituyen por funciones vacías.
vi.mock("@/app/(privado)/parches/actions", () => ({
  setMemberStatusAction: vi.fn(),
  setMemberRoleAction: vi.fn(),
}));

const P = "11111111-1111-4111-8111-111111111111";
const members: ParcheMember[] = [
  { userId: "u-owner", displayName: "Ana", role: "owner", status: "active", joinedAt: "", isMe: false },
  { userId: "u-admin", displayName: "Beto", role: "admin", status: "active", joinedAt: "", isMe: false },
  { userId: "u-m1", displayName: "Caro", role: "member", status: "active", joinedAt: "", isMe: false },
  { userId: "u-m2", displayName: "Dani", role: "member", status: "disabled", joinedAt: "", isMe: false },
];
const render = (viewerId: string, role: "owner" | "admin" | "member") =>
  renderToStaticMarkup(
    <MemberList parcheId={P} members={members.map((m) => ({ ...m, isMe: m.userId === viewerId }))} viewer={{ userId: viewerId, role, status: "active" }} />
  );
const count = (html: string, label: string) => (html.match(new RegExp(`>${label}<`, "g")) ?? []).length;

describe("MemberList", () => {
  it("muestra a todos, con creador, admin y deshabilitado identificados", () => {
    const html = render("u-m1", "member");
    expect(html.match(/data-testid="member-row"/g)).toHaveLength(4);
    expect(html).toContain(">Creador<");
    expect(html).toContain(">Administrador<");
    expect(html).toContain(">Deshabilitado<");
    expect(html).toMatch(/Caro<\/span><span[^>]*>tú</);
  });
  it("miembro normal: sin controles", () => {
    const html = render("u-m1", "member");
    expect(count(html, "Deshabilitar") + count(html, "Reactivar") + count(html, "Hacer admin")).toBe(0);
  });
  it("admin: deshabilita/reactiva miembros, no toca admin ni creador, no cambia roles", () => {
    const html = render("u-admin", "admin");
    expect(count(html, "Deshabilitar")).toBe(1);
    expect(count(html, "Reactivar")).toBe(1);
    expect(count(html, "Hacer admin") + count(html, "Quitar admin")).toBe(0);
  });
  it("creador: gestiona estado y rol (sin promover a deshabilitados)", () => {
    const html = render("u-owner", "owner");
    expect(count(html, "Deshabilitar")).toBe(2);
    expect(count(html, "Reactivar")).toBe(1);
    expect(count(html, "Quitar admin")).toBe(1);
    expect(count(html, "Hacer admin")).toBe(1);
  });
});
