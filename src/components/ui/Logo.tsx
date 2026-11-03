import Image from "next/image";
import { cropStyle, DARK_LOGO_CROP, FRAME, LIGHT_LOGO_CROP } from "@/lib/logo";
// Logos oficiales, sin modificar:
//   public/branding/LaCanchita_hor.png          horizontal, fondo transparente → modo oscuro
//   public/branding/LaCanchita_whitebg_hor.png  horizontal, fondo blanco → modo claro
//   public/branding/LaCanchita.png              cuadrado (login; recortado en derived/ por derive_logos.mjs)
import logoHorizontalDark from "../../../public/branding/LaCanchita_hor.png";
import logoHorizontalLight from "../../../public/branding/LaCanchita_whitebg_hor.png";
import logoSquare from "../../../public/branding/derived/LaCanchita-trim.png";

// Encuadre de cada horizontal dentro de un marco común (src/lib/logo.ts): los PNG tienen márgenes
// amplios y distintos; la imagen se escala y desplaza para mostrar solo su contenido.
const FRAME_RATIO = `${FRAME.width} / ${FRAME.height}`;
const DARK_CROP = cropStyle(DARK_LOGO_CROP);
const LIGHT_CROP = cropStyle(LIGHT_LOGO_CROP);

// Ambas variantes están en el HTML y el CSS muestra una sola según <html data-theme> (globals.css):
// el cambio es inmediato, sin estado de React (sin riesgo de hidratación) y sin destellos, porque el
// tema se fija antes de pintar. Las dos se cargan de inmediato para que al alternar no haya hueco.
export function LogoHorizontal({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex rounded-xl px-1.5 py-1 min-[360px]:px-2 ${className}`}>
      <span className="relative block h-6 overflow-hidden min-[360px]:h-7 sm:h-8" style={{ aspectRatio: FRAME_RATIO }}>
        <Image
          src={logoHorizontalDark}
          alt="La Canchita"
          loading="eager"
          sizes="180px"
          className="logo-dark absolute h-auto max-w-none"
          style={DARK_CROP}
        />
        <Image
          src={logoHorizontalLight}
          alt="La Canchita"
          loading="eager"
          sizes="180px"
          className="logo-light absolute h-auto max-w-none"
          style={LIGHT_CROP}
        />
      </span>
    </span>
  );
}

// compact: versión para cabeceras de modales (menos relleno y tamaño por ancho: 160 px en móvil, 224 px desde sm).
export function LogoSquare({ className = "", compact = false }: { className?: string; compact?: boolean }) {
  return (
    <span className={`brand-plate rounded-3xl ${compact ? "px-4 py-3" : "px-6 py-5"} ${className}`}>
      <Image src={logoSquare} alt="La Canchita" priority className={compact ? "h-auto w-36 sm:w-[11.5rem]" : "h-auto w-48 sm:w-56"} />
    </span>
  );
}
