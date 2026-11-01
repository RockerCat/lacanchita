// Tema claro/oscuro. La preferencia vive solo en el navegador (localStorage), sin Supabase.
// Por defecto: oscuro, el aspecto original de La Penúltima. La elección explícita del usuario
// manda sobre la preferencia del sistema operativo.
export type Theme = "dark" | "light";

export const THEME_STORAGE_KEY = "lacanchita-theme";
export const DEFAULT_THEME: Theme = "dark";
export const THEME_EVENT = "lacanchita-theme-change";

export function parseTheme(value: unknown): Theme {
  return value === "light" || value === "dark" ? value : DEFAULT_THEME;
}

export function otherTheme(theme: Theme): Theme {
  return theme === "dark" ? "light" : "dark";
}

// Se ejecuta en <head> antes de pintar: aplica el tema guardado sin destellos.
// Debe ser autocontenido (se inserta como texto); si localStorage no está disponible, queda el oscuro.
export const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem(${JSON.stringify(
  THEME_STORAGE_KEY
)});if(t!=="light"&&t!=="dark")t=${JSON.stringify(DEFAULT_THEME)};var d=document.documentElement;d.dataset.theme=t;d.style.colorScheme=t;}catch(e){}})();`;
