// Encuadre de los logos horizontales oficiales dentro de un marco común (mismo espacio en ambos temas).
// Medidas en píxeles de los PNG originales (no se modifican):
//   LaCanchita_hor.png          832×300, contenido visible x 113–739, y 67–214
//   LaCanchita_whitebg_hor.png  2089×753, contenido visible x 161–1935, y 179–575
export type Crop = { imageWidth: number; imageHeight: number; x: number; y: number; width: number; height: number };

export const FRAME = { width: 636, height: 156 };

export const DARK_LOGO_CROP: Crop = { imageWidth: 832, imageHeight: 300, x: 109, y: 63, width: 636, height: 156 };
export const LIGHT_LOGO_CROP: Crop = { imageWidth: 2089, imageHeight: 753, x: 150, y: 157, width: 1797, height: 441 };

export const DARK_LOGO_CONTENT = { x0: 113, y0: 67, x1: 739, y1: 214 };
export const LIGHT_LOGO_CONTENT = { x0: 161, y0: 179, x1: 1935, y1: 575 };

const pct = (n: number) => `${(Math.round(n * 100) / 100).toFixed(2)}%`;

// Estilo para un <img> posicionado en absoluto dentro del marco: escala y desplaza para mostrar el recorte.
export function cropStyle(c: Crop) {
  return {
    width: pct((c.imageWidth / c.width) * 100),
    left: pct((-c.x / c.width) * 100),
    top: pct((-c.y / c.height) * 100),
  };
}
