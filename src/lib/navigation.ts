export const LOGIN_PATH = "/login";
export const SIGNUP_PATH = "/registro";
// Lista de parches (navegación). Tras iniciar sesión se va a LANDING_PATH, que entra directo
// al parche si el usuario tiene uno solo.
export const HOME_PATH = "/parches";
export const LANDING_PATH = "/";

// Destino tras iniciar sesión: solo rutas internas ("/algo"), nunca URLs externas
// ni "//dominio" o "/\dominio", que el navegador interpretaría como otro sitio.
export function safeNextPath(value: unknown): string {
  if (typeof value !== "string" || value.length === 0 || value.length > 512) return LANDING_PATH;
  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return LANDING_PATH;
  if (/[\u0000-\u001f]/.test(value)) return LANDING_PATH;
  if ([LOGIN_PATH, SIGNUP_PATH, AUTH_CALLBACK_PREFIX.slice(0, -1)].some((p) => value === p || value.startsWith(`${p}?`) || value.startsWith(`${p}/`))) {
    return LANDING_PATH;
  }
  return value;
}

// Tras autenticarse sin un destino concreto (next = «/») se entra a la experiencia del usuario (/inicio: parche único
// o Mis parches), no a la portada pública, que sigue siendo visible con sesión.
export const POST_LOGIN_PATH = "/inicio";
export const afterLoginPath = (next: string): string => (next === LANDING_PATH ? POST_LOGIN_PATH : next);

// Páginas para usuarios sin sesión (con sesión redirigen al destino). «/» es la portada pública: sin sesión muestra
// la landing y con sesión la página decide (Mis parches o el parche único). /login y /registro abren la misma
// landing con el modal correspondiente (se conservan por enlaces guardados, invitaciones y redirecciones).
export function isPublicPath(pathname: string): boolean {
  return pathname === LANDING_PATH || [LOGIN_PATH, SIGNUP_PATH].some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

// Retorno de los enlaces de confirmación de correo: accesible con o sin sesión.
export const AUTH_CALLBACK_PREFIX = "/auth/";
export function isAuthCallbackPath(pathname: string): boolean {
  return pathname.startsWith(AUTH_CALLBACK_PREFIX);
}

export type RouteDecision = { redirectTo: string } | { redirectTo: null };

// Decisión del proxy: sin sesión → login (recordando el destino); con sesión en /login → destino seguro.
export function routeDecision(pathname: string, search: string, hasUser: boolean): RouteDecision {
  if (isAuthCallbackPath(pathname)) return { redirectTo: null };
  if (!hasUser && !isPublicPath(pathname)) {
    const next = `${pathname}${search}`;
    return { redirectTo: `${LOGIN_PATH}?next=${encodeURIComponent(next)}` };
  }
  if (hasUser && pathname !== LANDING_PATH && isPublicPath(pathname)) {
    const next = new URLSearchParams(search).get("next");
    return { redirectTo: afterLoginPath(safeNextPath(next)) };
  }
  return { redirectTo: null };
}

// Perfil del jugador según el contexto: solo dentro de un torneo (/parches/<parche>/torneos/<inscripción>/…) existe
// el perfil, y nunca se asume el primer parche ni torneo. El historial sellado no tiene perfil de juego.
const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const TORNEO_RE = new RegExp(`^(/parches/${UUID}/torneos/${UUID})(?:/(.*))?$`, "i");

export function playerProfileHref(pathname: string): string | null {
  const m = TORNEO_RE.exec(pathname.replace(/\/+$/, ""));
  if (!m) return null;
  if (m[2]?.split("/")[0] === "historial") return null;
  return `${m[1]}/profile`;
}
