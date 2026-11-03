// Estado de un torneo ya abierto a inscripciones pero sin partidos cargados: no hay tabla ni pronósticos que mostrar.
import { illustrationUrl } from "@/lib/illustration";

export default function WaitingSchedule({ eventName, parcheName, illustrationPath = null }: { eventName: string; parcheName: string; illustrationPath?: string | null }) {
  const art = illustrationUrl(illustrationPath);
  return (
    <div className="max-w-2xl mx-auto px-4 py-10">
      {art && (
        <div className="mb-4 aspect-video overflow-hidden rounded-2xl border border-[#2a2a45] bg-[#11111c]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={art} alt={`Ilustración de ${eventName}`} width={1600} height={900} decoding="async" className="h-full w-full object-cover" />
        </div>
      )}
      <div className="bg-[#18182a] border border-dashed border-[#2a2a45] rounded-2xl p-8 text-center">
        <p aria-hidden="true" className="text-4xl">🗓️</p>
        <h1 className="mt-3 text-xl font-black text-[#f1f5f9]">Estamos esperando la programación oficial</h1>
        <p className="mt-2 text-sm text-[#94a3b8]">
          {parcheName} ya está inscrito en {eventName}. Cuando se confirmen los partidos y sus horarios aparecerán aquí para que puedas pronosticarlos.
        </p>
        <p className="mt-3 text-sm text-[#64748b]">Mientras tanto, invita a tus amigos al parche: la tabla se activa con el primer partido.</p>
      </div>
    </div>
  );
}
