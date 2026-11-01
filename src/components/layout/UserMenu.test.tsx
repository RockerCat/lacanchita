import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const path = { value: "/" };
vi.mock("next/navigation", () => ({ usePathname: () => path.value }));
import UserMenu from "./UserMenu";

describe("UserMenu en la portada", () => {
  it("variante landing: el nombre se ve también en móvil (no 'hidden') y trunca", () => {
    const h = renderToStaticMarkup(<UserMenu displayName="Camila" logoutAction={async () => {}} variant="landing" />);
    expect(h).toContain("Camila");
    expect(h).not.toMatch(/hidden max-w-\[7rem\]/);
    expect(h).toContain("truncate");
  });
  it("variante app: conserva el nombre oculto en móvil", () => {
    expect(renderToStaticMarkup(<UserMenu displayName="Camila" logoutAction={async () => {}} />)).toMatch(/hidden max-w-\[7rem\]/);
  });
});

describe("menú por rol", () => {
  const menu = (superadmin: boolean) => renderToStaticMarkup(<UserMenu displayName="Alex" logoutAction={async () => {}} superadmin={superadmin} defaultOpen />);
  it("superadministrador: Control, Apariencia y Cerrar sesión; sin Mis parches ni Mi perfil", () => {
    const h = menu(true);
    expect(h).toContain('href="/control"');
    expect(h).toContain("Cerrar sesión");
    expect(h).toContain("Apariencia");
    expect(h).not.toContain("Mis parches");
    expect(h).not.toContain("Mi perfil");
    expect(h).not.toContain('href="/parches"');
  });
  it("jugador o administrador de parche: conserva Mis parches y Mi perfil, sin Control", () => {
    const h = menu(false);
    expect(h).toContain('href="/parches"');
    expect(h).toContain("Mi perfil");
    expect(h).not.toContain('href="/control"');
  });
});
