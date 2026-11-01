import Link from "next/link";

const TABS = [
  { key: "resumen", label: "Resumen", path: "" },
  { key: "fases", label: "Fases", path: "/fases" },
  { key: "equipos", label: "Equipos", path: "/equipos" },
  { key: "partidos", label: "Partidos", path: "/partidos" },
  { key: "resultados", label: "Resultados", path: "/resultados" },
  { key: "actividad", label: "Actividad", path: "/actividad" },
] as const;

export type ControlTab = (typeof TABS)[number]["key"];

// Pestañas de un torneo dentro de La Canchita Control.
export default function ControlNav({ slug, active }: { slug: string; active: ControlTab }) {
  return (
    <nav aria-label="Secciones del torneo" className="-mx-1 flex gap-1 overflow-x-auto rounded-xl border border-line bg-surface p-1">
      {TABS.map((t) => (
        <Link
          key={t.key}
          href={`/control/torneos/${slug}${t.path}`}
          aria-current={active === t.key ? "page" : undefined}
          className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-semibold ${
            active === t.key ? "bg-cancha/15 text-cancha-text" : "text-fg-2 hover:bg-surface-raised hover:text-fg"
          }`}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
