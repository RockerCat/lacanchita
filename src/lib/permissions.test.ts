import { describe, expect, it } from "vitest";
import { canLeave, canManageParche, memberActions, type Member, type Viewer } from "./permissions";

const v = (role: Viewer["role"], status: Viewer["status"] = "active"): Viewer => ({ userId: "me", role, status });
const t = (role: Member["role"], status: Member["status"] = "active", userId = "otro"): Member => ({ userId, role, status });

describe("permisos de interfaz", () => {
  it("solo owner/admin activos administran", () => {
    expect(canManageParche(v("owner"))).toBe(true);
    expect(canManageParche(v("admin"))).toBe(true);
    expect(canManageParche(v("member"))).toBe(false);
    expect(canManageParche(v("admin", "disabled"))).toBe(false);
  });
  it("miembro normal no ve controles sobre nadie", () => {
    expect(memberActions(v("member"), t("member"))).toEqual({ toggleStatus: false, toggleRole: false });
  });
  it("admin gestiona el estado de miembros, no de admins ni del creador; nunca roles", () => {
    expect(memberActions(v("admin"), t("member"))).toEqual({ toggleStatus: true, toggleRole: false });
    expect(memberActions(v("admin"), t("admin"))).toEqual({ toggleStatus: false, toggleRole: false });
    expect(memberActions(v("admin"), t("owner"))).toEqual({ toggleStatus: false, toggleRole: false });
  });
  it("creador gestiona estado y rol de los demás; solo promueve activos", () => {
    expect(memberActions(v("owner"), t("member"))).toEqual({ toggleStatus: true, toggleRole: true });
    expect(memberActions(v("owner"), t("admin"))).toEqual({ toggleStatus: true, toggleRole: true });
    expect(memberActions(v("owner"), t("member", "disabled"))).toEqual({ toggleStatus: true, toggleRole: false });
  });
  it("nadie se gestiona a sí mismo", () => {
    expect(memberActions(v("owner"), t("owner", "active", "me"))).toEqual({ toggleStatus: false, toggleRole: false });
    expect(memberActions(v("admin"), t("admin", "active", "me"))).toEqual({ toggleStatus: false, toggleRole: false });
  });
  it("el creador no puede salir; los demás sí", () => {
    expect(canLeave(v("owner"))).toBe(false);
    expect(canLeave(v("admin"))).toBe(true);
    expect(canLeave(v("member", "disabled"))).toBe(true);
  });
});
