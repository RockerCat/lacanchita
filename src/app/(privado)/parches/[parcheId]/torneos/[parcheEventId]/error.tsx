"use client";

export default function TorneoError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="mx-auto max-w-lg px-4 py-10 text-center">
      <p className="text-sm font-semibold text-[#f1f5f9]">No se pudo cargar esta pantalla.</p>
      <p className="mt-1 text-xs text-[#64748b]">Revisa tu conexión e inténtalo de nuevo. Tus pronósticos guardados no se pierden.</p>
      <button onClick={reset} className="mt-4 rounded-xl bg-[#00c85a] px-4 py-2 text-sm font-bold text-[#0a0a12]">Reintentar</button>
    </div>
  );
}
