import Link from "next/link";

// Pestañas dentro de un parche. La lista de parches queda siempre a un clic ("← Mis parches").
export default function ParcheNav({ parcheId, active }: { parcheId: string; active: "resumen" | "participantes" }) {
  const tabs = [
    { key: "resumen", label: "Resumen", href: `/parches/${parcheId}` },
    { key: "participantes", label: "Participantes", href: `/parches/${parcheId}/participantes` },
  ] as const;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <nav aria-label="Secciones del parche" className="flex gap-1 rounded-xl border border-line bg-surface p-1">
        {tabs.map((t) => (
          <Link
            key={t.key}
            href={t.href}
            aria-current={active === t.key ? "page" : undefined}
            className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${
              active === t.key ? "bg-cancha/15 text-cancha-text" : "text-fg-2 hover:bg-surface-raised hover:text-fg"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </nav>
      <Link href="/parches" className="text-sm font-semibold text-fg-2 hover:text-cancha-text">
        ← Mis parches
      </Link>
    </div>
  );
}
