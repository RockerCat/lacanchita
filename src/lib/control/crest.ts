// Validación de escudos subidos: tipo por firma del archivo (no por nombre ni por el tipo declarado),
// tamaño máximo y sin SVG ni ejecutables. La base y el bucket repiten los límites.
export const MAX_CREST_BYTES = 512 * 1024;

export type CrestType = { ext: "png" | "jpg" | "webp"; mime: "image/png" | "image/jpeg" | "image/webp" };

export function detectCrestType(bytes: Uint8Array): CrestType | null {
  const b = (i: number) => bytes[i];
  if (bytes.length >= 8 && b(0) === 0x89 && b(1) === 0x50 && b(2) === 0x4e && b(3) === 0x47 && b(4) === 0x0d && b(5) === 0x0a && b(6) === 0x1a && b(7) === 0x0a) {
    return { ext: "png", mime: "image/png" };
  }
  if (bytes.length >= 3 && b(0) === 0xff && b(1) === 0xd8 && b(2) === 0xff) return { ext: "jpg", mime: "image/jpeg" };
  if (bytes.length >= 12 && b(0) === 0x52 && b(1) === 0x49 && b(2) === 0x46 && b(3) === 0x46 && b(8) === 0x57 && b(9) === 0x45 && b(10) === 0x42 && b(11) === 0x50) {
    return { ext: "webp", mime: "image/webp" };
  }
  return null;
}

export type CrestCheck = { ok: true; type: CrestType } | { ok: false; code: "crest_required" | "crest_too_large" | "crest_invalid_type" };

export function checkCrest(bytes: Uint8Array): CrestCheck {
  if (bytes.length === 0) return { ok: false, code: "crest_required" };
  if (bytes.length > MAX_CREST_BYTES) return { ok: false, code: "crest_too_large" };
  const type = detectCrestType(bytes);
  return type ? { ok: true, type } : { ok: false, code: "crest_invalid_type" };
}
