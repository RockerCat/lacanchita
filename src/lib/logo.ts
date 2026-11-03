// Encuadre de los logos horizontales oficiales dentro de un marco común (mismo espacio en ambos temas).
// Medidas en píxeles de los PNG originales (no se modifican):
//   LaCanchita_hor.png          1887×495, contenido visible x 32–1845, y 34–453
//   LaCanchita_whitebg_hor.png  1887×495, mismas dimensiones y contenido (también con fondo transparente)
export type Crop = { imageWidth: number; imageHeight: number; x: number; y: number; width: number; height: number };

export const FRAME = { width: 1822, height: 428 };

export const DARK_LOGO_CROP: Crop = { imageWidth: 1887, imageHeight: 495, x: 28, y: 30, width: 1822, height: 428 };
export const LIGHT_LOGO_CROP: Crop = { imageWidth: 1887, imageHeight: 495, x: 28, y: 30, width: 1822, height: 428 };

export const DARK_LOGO_CONTENT = { x0: 32, y0: 34, x1: 1845, y1: 453 };
export const LIGHT_LOGO_CONTENT = { x0: 32, y0: 34, x1: 1845, y1: 453 };

const pct = (n: number) => `${(Math.round(n * 100) / 100).toFixed(2)}%`;

// Estilo para un <img> posicionado en absoluto dentro del marco: escala y desplaza para mostrar el recorte.
export function cropStyle(c: Crop) {
  return {
    width: pct((c.imageWidth / c.width) * 100),
    left: pct((-c.x / c.width) * 100),
    top: pct((-c.y / c.height) * 100),
  };
}
