import { describe, expect, it } from "vitest";
import { invitationMessage, invitationUrl, isInvitationPath, isValidTokenFormat, whatsappShareUrl } from "./invitations";

const TOKEN = "Ab3_-defGHIjklMNOpqrSTUvwxYZ0123456789abcd";

describe("invitaciones", () => {
  it("formato de token", () => {
    expect(isValidTokenFormat(TOKEN)).toBe(true);
    expect(isValidTokenFormat("corto")).toBe(false);
    expect(isValidTokenFormat("con espacios y ' comillas que no valen")).toBe(false);
  });
  it("URL y ruta", () => {
    expect(invitationUrl("https://lacanchita.example/", TOKEN)).toBe(`https://lacanchita.example/invitacion/${TOKEN}`);
    expect(isInvitationPath(`/invitacion/${TOKEN}`)).toBe(true);
    expect(isInvitationPath("/parches")).toBe(false);
    expect(isInvitationPath("/invitacion/../parches")).toBe(false);
  });
  it.each(["valid", "already_member", "disabled_member", "revoked", "expired", "exhausted", "not_found"] as const)(
    "mensaje comprensible para %s",
    (s) => {
      const m = invitationMessage(s);
      expect(m.title.length).toBeGreaterThan(5);
      expect(m.body.length).toBeGreaterThan(10);
    }
  );
  it("vencida y revocada explican qué pasó", () => {
    expect(invitationMessage("expired").title).toMatch(/venció/);
    expect(invitationMessage("revoked").body).toMatch(/desactivó/);
  });
  it("WhatsApp incluye el enlace codificado", () => {
    expect(whatsappShareUrl(`https://x.test/invitacion/${TOKEN}`, "Los del barrio")).toContain(encodeURIComponent(TOKEN));
  });
});
