// Validación de ilustraciones de torneo subidas desde Control. Se confía en el CONTENIDO, no en el nombre ni en el tipo
// declarado: firma del formato, estructura mínima (dimensiones legibles y cierre del archivo) y tamaño. Sin SVG ni HTML.
// La base y el bucket repiten tipo y tamaño. Sin dependencias.
import { detectCrestType, type CrestType } from "./crest";

export const MAX_ILLUSTRATION_BYTES = 5 * 1024 * 1024;
export const MAX_ILLUSTRATION_SIDE = 8000; // evita imágenes gigantes que agoten memoria al decodificarlas
export const ILLUSTRATION_BUCKET = "event-illustrations";

export type ImageInfo = { width: number; height: number };

const u16be = (b: Uint8Array, i: number) => (b[i] << 8) | b[i + 1];
const u32be = (b: Uint8Array, i: number) => ((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]) >>> 0;
const u24le = (b: Uint8Array, i: number) => b[i] | (b[i + 1] << 8) | (b[i + 2] << 16);
const ascii = (b: Uint8Array, i: number, s: string) => [...s].every((c, k) => b[i + k] === c.charCodeAt(0));

function pngInfo(b: Uint8Array): ImageInfo | null {
  // Firma (8) + IHDR (longitud 13) y cierre con el fragmento IEND.
  if (b.length < 45 || u32be(b, 8) !== 13 || !ascii(b, 12, "IHDR")) return null;
  if (!ascii(b, b.length - 8, "IEND")) return null;
  return { width: u32be(b, 16), height: u32be(b, 20) };
}

function jpegInfo(b: Uint8Array): ImageInfo | null {
  let end = b.length;
  while (end > 2 && b[end - 1] === 0) end--; // algunos editores rellenan con ceros
  if (end < 4 || b[end - 2] !== 0xff || b[end - 1] !== 0xd9) return null; // sin EOI = truncado
  let i = 2;
  while (i + 4 <= end) {
    if (b[i] !== 0xff) return null;
    const marker = b[i + 1];
    if (marker === 0xff) { i++; continue; }
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { i += 2; continue; }
    const len = u16be(b, i + 2);
    if (len < 2) return null;
    const isSof = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isSof) return i + 9 <= end ? { height: u16be(b, i + 5), width: u16be(b, i + 7) } : null;
    if (marker === 0xda) return null; // datos de imagen sin haber visto el tamaño
    i += 2 + len;
  }
  return null;
}

function webpInfo(b: Uint8Array): ImageInfo | null {
  if (b.length < 30 || !ascii(b, 0, "RIFF") || !ascii(b, 8, "WEBP")) return null;
  const riff = b[4] | (b[5] << 8) | (b[6] << 16) | (b[7] << 24);
  if (riff + 8 > b.length || riff < 20) return null; // RIFF declara más bytes de los que hay = truncado
  if (ascii(b, 12, "VP8X")) return { width: u24le(b, 24) + 1, height: u24le(b, 27) + 1 };
  if (ascii(b, 12, "VP8L")) {
    if (b[20] !== 0x2f) return null;
    const bits = b[21] | (b[22] << 8) | (b[23] << 16) | (b[24] << 24);
    return { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 };
  }
  if (ascii(b, 12, "VP8 ")) {
    if (b[23] !== 0x9d || b[24] !== 0x01 || b[25] !== 0x2a) return null;
    return { width: (b[26] | (b[27] << 8)) & 0x3fff, height: (b[28] | (b[29] << 8)) & 0x3fff };
  }
  return null;
}

export function readImageInfo(bytes: Uint8Array, type: CrestType): ImageInfo | null {
  const info = type.ext === "png" ? pngInfo(bytes) : type.ext === "jpg" ? jpegInfo(bytes) : webpInfo(bytes);
  if (!info || info.width < 1 || info.height < 1 || info.width > MAX_ILLUSTRATION_SIDE || info.height > MAX_ILLUSTRATION_SIDE) return null;
  return info;
}

export type IllustrationCheck =
  | { ok: true; type: CrestType; info: ImageInfo }
  | { ok: false; code: "illustration_required" | "illustration_too_large" | "illustration_invalid_type" | "illustration_corrupt" };

export function checkIllustration(bytes: Uint8Array): IllustrationCheck {
  if (bytes.length === 0) return { ok: false, code: "illustration_required" };
  if (bytes.length > MAX_ILLUSTRATION_BYTES) return { ok: false, code: "illustration_too_large" };
  const type = detectCrestType(bytes);
  if (!type) return { ok: false, code: "illustration_invalid_type" };
  const info = readImageInfo(bytes, type);
  return info ? { ok: true, type, info } : { ok: false, code: "illustration_corrupt" };
}
