"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen, Crown, Home, Newspaper, ListOrdered, Radio, Trophy, User, Users } from "lucide-react";
import { cn } from "@/lib/juego/utils";
import { useJuego } from "@/lib/juego/context";

// Navegación del jugador dentro de un parche y torneo (adaptada de BottomNav/NavActiveLinks de La Penúltima).
// Todas las rutas cuelgan de la inscripción actual; nunca se asume «el primer parche».
// Las cinco pestañas principales no cambian. Con el torneo oficialmente finalizado «Podio» ocupa el lugar de «En Vivo»
// (como en La Penúltima) y «Copa» es un acceso contextual que solo aparece si el torneo tiene eliminatorias.
const ITEMS = [
  { path: "", label: "Inicio", icon: Home },
  { path: "/leaderboard", label: "Tabla", icon: ListOrdered },
  { path: "/en-vivo", label: "En Vivo", icon: Radio },
  { path: "/community", label: "Comunidad", icon: Users },
  { path: "/profile", label: "Perfil", icon: User },
] as const;

const PODIUM_ITEM = { path: "/podio", label: "Podio", icon: Crown } as const;

export default function JuegoNav({ hasLiveMatch, podium = false, copa = false }: { hasLiveMatch: boolean; podium?: boolean; copa?: boolean }) {
  const { base } = useJuego();
  const items = podium ? ITEMS.map((i) => (i.path === "/en-vivo" ? PODIUM_ITEM : i)) : ITEMS;
  const pathname = usePathname();
  const isActive = (path: string) => (path === "" ? pathname === base : pathname === `${base}${path}` || pathname.startsWith(`${base}${path}/`));
  const isMatchDetail = pathname.startsWith(`${base}/matches/`);

  return (
    <>
      {/* Escritorio: pestañas bajo la barra de contexto */}
      <nav aria-label="Torneo" className="hidden md:flex items-center gap-1 px-4 pb-2 max-w-2xl mx-auto">
        {items.map(({ path, label, icon: Icon }) => {
          const active = isActive(path) || (path === "" && isMatchDetail);
          const live = path === "/en-vivo" && hasLiveMatch;
          return (
            <Link
              key={label}
              href={`${base}${path}`}
              aria-current={active ? "page" : undefined}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors",
                active ? (live ? "bg-[#ef4444]/10 text-[#ef4444]" : "bg-[#00c85a]/10 text-[#00c85a]") : "text-[#64748b] hover:text-[#94a3b8]"
              )}
            >
              <Icon size={15} strokeWidth={active ? 2.5 : 1.8} />
              {label}
              {live && <span className="h-1.5 w-1.5 rounded-full bg-[#ef4444] animate-live-pulse" />}
            </Link>
          );
        })}
        <div className="ml-auto flex items-center gap-4">
          {copa && (
            <Link href={`${base}/copa`} className={cn("inline-flex items-center gap-1.5 text-xs font-semibold", isActive("/copa") ? "text-[#00c85a]" : "text-[#64748b] hover:text-[#94a3b8]")}>
              <Trophy size={13} /> Copa
            </Link>
          )}
          <Link href={`${base}/noticias`} className={cn("inline-flex items-center gap-1.5 text-xs font-semibold", isActive("/noticias") ? "text-[#00c85a]" : "text-[#64748b] hover:text-[#94a3b8]")}>
            <Newspaper size={13} /> Noticias
          </Link>
          <Link href={`${base}/rules`} className={cn("inline-flex items-center gap-1.5 text-xs font-semibold", isActive("/rules") ? "text-[#00c85a]" : "text-[#64748b] hover:text-[#94a3b8]")}>
            <BookOpen size={13} /> Reglas
          </Link>
        </div>
      </nav>

      {/* Celular: barra inferior fija */}
      <nav aria-label="Torneo" className="fixed bottom-0 left-0 right-0 z-40 md:hidden bg-[#0a0a12]/90 backdrop-blur-xl border-t border-[#1e1e35]">
        <div className="flex items-stretch h-16 w-full">
          {items.map(({ path, label, icon: Icon }) => {
            const active = isActive(path) || (path === "" && isMatchDetail);
            const live = path === "/en-vivo" && hasLiveMatch;
            return (
              <Link
                key={label}
                href={`${base}${path}`}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex-1 flex flex-col items-center justify-center gap-1 transition-colors",
                  active ? (live ? "text-[#ef4444]" : "text-[#00c85a]") : "text-[#64748b] hover:text-[#94a3b8]"
                )}
              >
                <div className="relative">
                  <Icon size={18} strokeWidth={active ? 2.5 : 1.8} />
                  {live && (
                    <span className="absolute -top-0.5 -right-1 flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#ef4444] opacity-75" />
                      <span className="relative inline-flex h-2 w-2 rounded-full bg-[#ef4444]" />
                    </span>
                  )}
                </div>
                <span className="text-[10px] font-medium">{label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
