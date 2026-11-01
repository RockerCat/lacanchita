import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { afterLoginPath, LOGIN_PATH, safeNextPath } from "@/lib/navigation";
import { requestOrigin } from "@/lib/origin";
import { createClient } from "@/lib/supabase/server";

// Retorno del enlace de confirmación de correo. Admite el flujo PKCE (?code=) y el de token_hash.
// Si no se puede completar (p. ej. el correo se abrió en otro dispositivo), lleva al login
// conservando el destino (la invitación).
export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const next = safeNextPath(url.searchParams.get("next"));
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;
  const supabase = await createClient();

  let ok = false;
  if (code) {
    ok = !(await supabase.auth.exchangeCodeForSession(code)).error;
  } else if (tokenHash && type) {
    ok = !(await supabase.auth.verifyOtp({ type, token_hash: tokenHash })).error;
  }
  const target = ok ? afterLoginPath(next) : `${LOGIN_PATH}?next=${encodeURIComponent(next)}&aviso=confirmacion`;
  // Mismo host por el que llegó la petición (las cookies de sesión quedan en ese origen).
  return NextResponse.redirect(new URL(target, await requestOrigin()));
}
