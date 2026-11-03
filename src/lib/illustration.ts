// URL pública de la ilustración de un torneo (bucket público de lectura). Cada subida usa un nombre nuevo (uuid), por lo
// que la URL cambia al reemplazar y el navegador nunca ve una imagen obsoleta. Sin ruta → null (sin ilustración).
export function illustrationUrl(path: string | null | undefined): string | null {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!path || !base) return null;
  return `${base.replace(/\/$/, "")}/storage/v1/object/public/event-illustrations/${path}`;
}
