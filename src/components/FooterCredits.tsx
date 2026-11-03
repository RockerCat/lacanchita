// Líneas finales compartidas por el pie de la portada y el de la app autenticada.
export default function FooterCredits({ className = "" }: { className?: string }) {
  return (
    <div className={`text-center text-[11px] leading-5 text-fg-3 ${className}`}>
      <p>Sin apuestas ni dinero: se juega por puntos y por orgullo.</p>
      <p>
        Hecho en Colombia 🇨🇴 por{" "}
        <a href="https://alexsosa.me" target="_blank" rel="noopener noreferrer" className="font-semibold text-cancha-text hover:underline">
          alexsosa.me
        </a>
      </p>
    </div>
  );
}
