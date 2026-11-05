import Image from "next/image";

// Ilustración original de La Canchita (public/img/crear-parche.png) para los bloques ilustrados de un parche.
// Móvil: arriba, 16:9 sin altura excesiva. Desde sm: a la derecha del contenido, en 3:2 (el padre es un flex).
export default function ParcheArt({ className = "" }: { className?: string }) {
  return (
    <Image
      src="/img/crear-parche.png"
      alt="Amigos futboleros de camiseta verde celebrando juntos junto a un balón"
      width={1536}
      height={1024}
      sizes="(min-width: 640px) 320px, 100vw"
      className={`order-first aspect-video w-full object-cover object-[center_25%] sm:order-last sm:aspect-[3/2] sm:w-72 sm:shrink-0 sm:object-center md:w-80 ${className}`}
    />
  );
}
