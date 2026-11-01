import { headers } from "next/headers";

// Origen público de la app para construir enlaces (invitaciones, confirmación de correo).
// NEXT_PUBLIC_SITE_URL manda si está definido (producción); si no, se usa la cabecera Host.
export async function requestOrigin(): Promise<string> {
  const configured = process.env.NEXT_PUBLIC_SITE_URL;
  if (configured) return configured.replace(/\/+$/, "");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") || host.startsWith("127.0.0.1") ? "http" : "https");
  return `${proto}://${host}`;
}
