/* eslint-disable @next/next/no-img-element -- escudos servidos desde el bucket público de Supabase; sin optimizador */
import { teamVisual, type VisualTeam } from "@/lib/control/team-visual";

const SIZES = { sm: "h-8 w-8 text-base", md: "h-10 w-10 text-xl", lg: "h-12 w-12 text-2xl" } as const;

// Bandera emoji, escudo del club o iniciales. Decorativo: el nombre del equipo siempre va en texto al lado.
export default function TeamBadge({ team, size = "md" }: { team: VisualTeam | null; size?: keyof typeof SIZES }) {
  const base = `flex shrink-0 items-center justify-center overflow-hidden rounded-xl bg-surface-raised ${SIZES[size]}`;
  if (!team) return <span aria-hidden="true" className={`${base} text-xs font-bold text-fg-3`}>?</span>;
  const v = teamVisual(team);
  return (
    <span aria-hidden="true" className={base}>
      {v.type === "flag" && v.emoji}
      {v.type === "crest" && <img src={v.url} alt="" loading="lazy" className="h-full w-full object-contain p-0.5" />}
      {v.type === "initials" && <span className="text-xs font-bold text-fg-2">{v.text}</span>}
    </span>
  );
}
