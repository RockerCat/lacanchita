"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { playerProfileHref } from "@/lib/navigation";
import { HOME_PATH } from "@/lib/navigation";
import { CONTROL_PATH } from "@/lib/jugar";
import { ThemeIcon, useTheme } from "../ThemeToggle";

// Menú global de usuario, recuperado de UserMenuButton de La Penúltima (botón con avatar, nombre y chevron; panel
// desplegable con opciones y cierre de sesión al final). Adaptado a La Canchita: Mi perfil · Mis parches · Apariencia ·
// Cerrar sesión. La apariencia usa el mecanismo existente (useTheme) y el cierre de sesión la acción de servidor actual.
export default function UserMenu({
  displayName,
  logoutAction,
  variant = "app",
  superadmin = false,
  defaultOpen = false,
}: {
  displayName: string;
  logoutAction: () => void | Promise<void>;
  // «landing»: portada pública. El nombre se ve también en móvil y «Mi perfil» solo aparece si hay una ruta funcional.
  variant?: "app" | "landing";
  // Superadministrador global: administra desde Control y no participa como jugador (sin Mis parches ni Mi perfil).
  superadmin?: boolean;
  // Solo para pruebas de render: arranca con el menú desplegado.
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const pathname = usePathname();
  const { next, label, toggle } = useTheme();
  const profileHref = playerProfileHref(pathname);
  const initial = displayName.trim().charAt(0).toUpperCase() || "?";

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    return () => document.removeEventListener("mousedown", onPointer);
  }, [open]);

  function items(): HTMLElement[] {
    return Array.from(rootRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([aria-disabled="true"])') ?? []);
  }

  function close(returnFocus = false) {
    setOpen(false);
    if (returnFocus) buttonRef.current?.focus();
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape" && open) {
      e.preventDefault();
      close(true);
    } else if (e.key === "Tab" && open) {
      setOpen(false);
    } else if ((e.key === "ArrowDown" || e.key === "ArrowUp") && open) {
      e.preventDefault();
      const list = items();
      const i = list.indexOf(document.activeElement as HTMLElement);
      const nextIndex = e.key === "ArrowDown" ? (i + 1) % list.length : (i <= 0 ? list.length - 1 : i - 1);
      list[nextIndex]?.focus();
    }
  }

  const row =
    "flex min-h-11 w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm text-fg-2 transition-colors hover:bg-surface-raised hover:text-fg focus-visible:bg-surface-raised focus-visible:text-fg focus-visible:outline-none";

  return (
    <div ref={rootRef} className="relative" onKeyDown={onKeyDown}>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Menú de usuario"
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex h-9 min-w-0 items-center gap-1.5 rounded-xl border border-line bg-surface py-1 pl-1.5 pr-2 transition-colors hover:border-line-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cancha"
      >
        <span aria-hidden="true" className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-cancha/20 text-xs font-bold text-cancha-text">
          {initial}
        </span>
        <span className={`${variant === "landing" ? "max-w-[6.5rem] sm:max-w-[9rem]" : "hidden max-w-[7rem] sm:inline"} truncate text-sm font-medium text-fg-2`}>{displayName}</span>
        <svg aria-hidden="true" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={`shrink-0 text-fg-3 transition-transform duration-150 ${open ? "rotate-180" : ""}`}>
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div role="menu" aria-label="Menú de usuario" className="absolute right-0 top-full z-50 mt-2 w-60 max-w-[calc(100vw-1.5rem)] overflow-hidden rounded-xl border border-line bg-surface shadow-2xl">
          <p className="truncate border-b border-line px-4 py-2.5 text-xs font-semibold text-fg-3">{displayName}</p>
          {superadmin ? (
            <Link role="menuitem" href={CONTROL_PATH} onClick={() => close()} className={row}>
              Control
            </Link>
          ) : (
            <>
              {profileHref ? (
                <Link role="menuitem" href={profileHref} onClick={() => close()} className={row}>
                  Mi perfil
                </Link>
              ) : variant === "landing" ? null : (
                <span role="menuitem" aria-disabled="true" className="flex min-h-11 w-full flex-col justify-center px-4 py-2 text-sm text-fg-3">
                  Mi perfil
                  <span className="text-[11px]">Disponible dentro de un torneo</span>
                </span>
              )}
              <Link role="menuitem" href={HOME_PATH} onClick={() => close()} className={row}>
                Mis parches
              </Link>
            </>
          )}
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              toggle();
              close();
            }}
            className={row}
          >
            <ThemeIcon next={next} />
            Apariencia: {label.toLowerCase()}
          </button>
          <form action={logoutAction} className="border-t border-line">
            <button type="submit" role="menuitem" className={`${row} hover:text-danger focus-visible:text-danger`}>
              Cerrar sesión
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
