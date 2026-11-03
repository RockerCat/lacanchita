// Genera variantes DERIVADAS del logo cuadrado oficial (public/branding/LaCanchita.png) sin alterar
// su diseño: solo recortes del margen transparente, recorte del ícono y redimensionado.
// Los originales no se modifican. Usa sharp (dependencia de next). Los logos horizontales se usan
// tal cual (encuadrados por CSS en src/components/ui/Logo.tsx), sin derivados.
//
//   node scripts/branding/derive_logos.mjs
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");
const sharp = createRequire(path.join(root, "package.json"))("sharp");
const src = (f) => path.join(root, "public", "branding", f);
const out = (f) => path.join(root, f);
const sha = (f) => createHash("sha256").update(readFileSync(f)).digest("hex").slice(0, 12);

const originals = [src("LaCanchita_hor.png"), src("LaCanchita_whitebg_hor.png"), src("LaCanchita.png")];
const before = originals.map(sha);

// Recorte al contenido visible (alfa > 0) con un margen transparente uniforme.
async function trimmed(file, pad) {
  const img = sharp(file).ensureAlpha();
  const { info } = await img.clone().trim({ threshold: 0 }).toBuffer({ resolveWithObject: true });
  return img
    .clone()
    .extract({ left: -info.trimOffsetLeft, top: -info.trimOffsetTop, width: info.width, height: info.height })
    .extend({ top: pad, bottom: pad, left: pad, right: pad, background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png({ compressionLevel: 9 });
}

await (await trimmed(src("LaCanchita.png"), 4)).toFile(out("public/branding/derived/LaCanchita-trim.png"));

// Ícono de la cancha (banda superior del logo cuadrado, sin el texto) para favicon e iconos.
// Banda medida en el original de 701×711: x 125–576, y 103–522 (sobre fondo transparente); el texto empieza en y 553.
const iconBand = { left: 125, top: 103, width: 452, height: 420 };
const icon = await sharp(src("LaCanchita.png"))
  .extract(iconBand)
  .extend({ top: 16, bottom: 16, left: 0, right: 0, background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .png()
  .toBuffer();
await sharp(icon).resize(192, 192).png({ compressionLevel: 9 }).toFile(out("src/app/icon.png"));
// iOS no admite transparencia: se apoya sobre el fondo oscuro de la marca (#0a0a12) con margen.
await sharp(icon)
  .resize(148, 148)
  .extend({ top: 16, bottom: 16, left: 16, right: 16, background: "#0a0a12" })
  .flatten({ background: "#0a0a12" })
  .png({ compressionLevel: 9 })
  .toFile(out("src/app/apple-icon.png"));

const after = originals.map(sha);
if (after.join() !== before.join()) throw new Error("Los originales cambiaron");
for (const f of ["public/branding/derived/LaCanchita-trim.png", "src/app/icon.png", "src/app/apple-icon.png"]) {
  const m = await sharp(out(f)).metadata();
  console.log(`${f}: ${m.width}×${m.height}`);
}
console.log("originales intactos:", before.join(", "));
