"use client";

import { useMemo, useState } from "react";
import MatchRow, { type RowData } from "./MatchRow";
import { applyQuickFilter, defaultFilter, formatDayHeader, groupByDay, isLive, QUICK_FILTERS, type QuickFilter } from "@/lib/control/board";

const EMPTY: Record<QuickFilter, string> = {
  all: "No hay partidos con estos filtros.",
  live: "No hay partidos en vivo.",
  today: "No hay partidos hoy.",
  upcoming: "No hay próximos partidos.",
  finished: "No hay partidos finalizados.",
  other: "No hay partidos aplazados ni cancelados.",
};

// Calendario operativo de Partidos (AdminCalendarView): filtros rápidos (arranca en «En vivo» si hay partidos en juego),
// secciones por día de la zona del torneo (los días pasados empiezan plegados) y una fila operable por partido.
export default function MatchBoard({ rows, timezone, todayKey, base, editable }: { rows: RowData[]; timezone: string; todayKey: string; base: string; editable: boolean }) {
  const items = rows;
  const [filter, setFilter] = useState<QuickFilter>(() => defaultFilter(items));
  const filtered = useMemo(() => applyQuickFilter(items, filter, todayKey, timezone), [items, filter, todayKey, timezone]);
  const days = useMemo(() => groupByDay(filtered, timezone), [filtered, timezone]);
  const liveCount = items.filter(isLive).length;
  const [closed, setClosed] = useState<Record<string, boolean>>({});

  return (
    <div className="flex flex-col gap-4">
      {liveCount > 0 && (
        <button type="button" onClick={() => setFilter("live")} className="flex items-center gap-2 rounded-xl border border-danger/30 bg-danger/[0.06] px-4 py-3 text-left text-sm font-semibold text-danger">
          <span aria-hidden="true" className="h-2 w-2 animate-live-pulse rounded-full bg-danger" />
          {liveCount === 1 ? "1 partido en vivo" : `${liveCount} partidos en vivo`} · edita el marcador aquí mismo
        </button>
      )}

      <div className="flex flex-wrap items-center gap-1" role="group" aria-label="Filtro rápido">
        {QUICK_FILTERS.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            aria-pressed={filter === id}
            onClick={() => setFilter(id)}
            className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors ${filter === id ? "border-cancha/30 bg-cancha/15 text-cancha-text" : "border-line bg-surface-raised text-fg-2 hover:text-fg"}`}
          >
            {label}
            {id === "live" && liveCount > 0 && <span className="rounded bg-danger/15 px-1 text-[10px] font-bold text-danger">{liveCount}</span>}
          </button>
        ))}
      </div>

      {days.length === 0 && <p className="py-10 text-center text-sm text-fg-2">{EMPTY[filter]}</p>}

      {days.map(([key, list]) => {
        const isToday = key === todayKey;
        const open = closed[key] === undefined ? key >= todayKey : !closed[key];
        const live = list.filter(isLive).length;
        const fin = list.filter((r) => r.state === "official" || r.state === "imported").length;
        const prog = list.filter((r) => r.status === "scheduled").length;
        return (
          <section key={key}>
            <button type="button" aria-expanded={open} onClick={() => setClosed((c) => ({ ...c, [key]: open }))} className="sticky top-12 z-20 mb-2 flex w-full items-center gap-2 bg-bg/95 py-2 text-left backdrop-blur-sm">
              <span aria-hidden="true" className="w-3 text-xs text-fg-3">{open ? "▾" : "▸"}</span>
              <span className={`text-xs font-bold uppercase tracking-wide ${isToday ? "text-cancha-text" : "text-fg-2"}`}>
                {formatDayHeader(key)}
                {isToday && <span className="ml-1.5 font-mono text-[9px] opacity-70">hoy</span>}
              </span>
              <span className="ml-1 flex items-center gap-1">
                <span className="text-[9px] text-fg-3">{list.length} partidos</span>
                {live > 0 && <span className="rounded bg-danger/10 px-1 text-[9px] font-bold text-danger">{live} vivo</span>}
                {fin > 0 && <span className="rounded bg-cancha/10 px-1 text-[9px] text-cancha-text">{fin} fin.</span>}
                {prog > 0 && <span className="rounded bg-surface-raised px-1 text-[9px] text-fg-3">{prog} prog.</span>}
              </span>
            </button>
            {open && (
              <div className="flex flex-col gap-2">
                {list.map((r) => <MatchRow key={r.id} row={r} base={base} timezone={timezone} editable={editable} />)}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
