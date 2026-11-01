"use client";

import { useSyncExternalStore } from "react";
import { DEFAULT_THEME, otherTheme, parseTheme, THEME_EVENT, THEME_STORAGE_KEY, type Theme } from "@/lib/theme";

function readTheme(): Theme {
  return parseTheme(document.documentElement.dataset.theme);
}

function subscribe(onChange: () => void) {
  // Otras pestañas: el evento storage mantiene el tema sincronizado.
  const onStorage = (e: StorageEvent) => {
    if (e.key !== THEME_STORAGE_KEY) return;
    applyTheme(parseTheme(e.newValue), false);
  };
  window.addEventListener(THEME_EVENT, onChange);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(THEME_EVENT, onChange);
    window.removeEventListener("storage", onStorage);
  };
}

function applyTheme(theme: Theme, persist: boolean) {
  const root = document.documentElement;
  root.dataset.theme = theme;
  root.style.colorScheme = theme;
  if (persist) {
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // Navegación privada sin almacenamiento: el cambio vale para esta visita.
    }
  }
  window.dispatchEvent(new Event(THEME_EVENT));
}

/** Mecanismo único de apariencia (lo usan el botón público y el menú de usuario); no hay un segundo estado. */
export function useTheme() {
  const theme = useSyncExternalStore(subscribe, readTheme, () => DEFAULT_THEME);
  const next = otherTheme(theme);
  return {
    theme,
    next,
    label: next === "light" ? "Modo claro" : "Modo oscuro",
    toggle: () => applyTheme(next, true),
  };
}

export function ThemeIcon({ next }: { next: Theme }) {
  return next === "light" ? <SunIcon /> : <MoonIcon />;
}

export default function ThemeToggle({ className = "", compact = false }: { className?: string; compact?: boolean }) {
  const { next, label } = useTheme();

  return (
    <button
      type="button"
      onClick={() => applyTheme(next, true)}
      aria-label={`Cambiar a ${label.toLowerCase()}`}
      title={`Cambiar a ${label.toLowerCase()}`}
      className={`inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-xl border border-line bg-surface px-3 text-xs font-semibold text-fg-2 hover:border-line-strong hover:text-fg ${className}`}
    >
      {next === "light" ? <SunIcon /> : <MoonIcon />}
      <span className={compact ? "hidden sm:inline" : undefined}>{label}</span>
    </button>
  );
}

function SunIcon() {
  return (
    <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}
