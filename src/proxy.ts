import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { routeDecision } from "@/lib/navigation";
import { supabaseEnv } from "@/lib/supabase/env";

// Renueva la sesión en cada petición y protege las rutas privadas.
// Las páginas vuelven a comprobar la sesión en el servidor y RLS limita los datos.
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  const { url, key } = supabaseEnv();

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  // No añadir lógica entre createServerClient y getUser(): getUser() renueva el token.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const decision = routeDecision(request.nextUrl.pathname, request.nextUrl.search, Boolean(user));
  if (decision.redirectTo) {
    const redirect = NextResponse.redirect(new URL(decision.redirectTo, request.url));
    response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
    return redirect;
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
