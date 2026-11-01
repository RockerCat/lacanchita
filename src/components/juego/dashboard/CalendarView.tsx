"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/juego/utils";
import { matchClosedReason, type MatchWithPrediction } from "@/lib/juego/matches";
import CalendarMatchRow from "./CalendarMatchRow";

// ── Filter types ──────────────────────────────────────────────────────

type Filter = "today" | "pending" | "live" | "finished" | "all";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "today",    label: "Hoy"        },
  { id: "pending",  label: "Pendientes" },
  { id: "all",      label: "Por Fecha"      },
  { id: "finished", label: "Finalizados"},
];

// ── Date helpers ──────────────────────────────────────────────────────

// Día calendario en la zona horaria del torneo (no se asume Colombia).
function tzDateKey(startsAt: string, tz: string): string {
  return new Date(startsAt).toLocaleDateString("en-CA", {
    timeZone: tz,
  }); // "YYYY-MM-DD" — stable sort key
}

function todayTzKey(tz: string): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: tz });
}

function formatDateHeader(dateKey: string): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  const date = new Date(y, m - 1, d, 12);
  const raw = date.toLocaleDateString("es-CO", {
    weekday: "short",
    day:     "numeric",
    month:   "long", // "junio" (full month name)
  });
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

// ── Filter logic ──────────────────────────────────────────────────────

function applyFilter(matches: MatchWithPrediction[], filter: Filter): MatchWithPrediction[] {
  if (filter === "all")      return matches;
  if (filter === "live")     return matches.filter((m) => m.status === "live");
  if (filter === "finished") return matches.filter((m) => m.status === "finished");
  if (filter === "today")    return matches.filter(
    (m) => tzDateKey(m.starts_at, m.tz) === todayTzKey(m.tz)
  );
  if (filter === "pending")  return matches.filter(
    (m) => m.status === "scheduled" && matchClosedReason(m) === null && !m.prediction
  );
  return matches;
}

// ── Default open date — computed from unfiltered matches ──────────────
// Priority: live date → next scheduled date → last finished date

function computeDefaultKey(matches: MatchWithPrediction[]): string | null {
  const live = matches.find((m) => m.status === "live");
  if (live) return tzDateKey(live.starts_at, live.tz);

  const next = matches.find(
    (m) => m.status === "scheduled" && matchClosedReason(m) === null
  );
  if (next) return tzDateKey(next.starts_at, next.tz);

  const last = [...matches].reverse().find((m) => m.status === "finished");
  if (last) return tzDateKey(last.starts_at, last.tz);

  return null;
}

// ── Best visible date for a given filter + days ───────────────────────

function bestVisibleKey(days: [string, MatchWithPrediction[]][]): string | null {
  // live date first
  const liveDay = days.find(([, ms]) => ms.some((m) => m.status === "live"));
  if (liveDay) return liveDay[0];
  // next scheduled open day
  const scheduledDay = days.find(([, ms]) =>
    ms.some((m) => m.status === "scheduled" && matchClosedReason(m) === null)
  );
  if (scheduledDay) return scheduledDay[0];
  // last day as fallback
  return days[days.length - 1]?.[0] ?? null;
}

// ── Day header subtitle ───────────────────────────────────────────────

type SubtitleKind = "live" | "pending" | "done" | "neutral";

function daySubtitle(
  dayMatches: MatchWithPrediction[]
): { text: string; kind: SubtitleKind } {
  const total    = dayMatches.length;
  const liveN    = dayMatches.filter((m) => m.status === "live").length;
  const pendingN = dayMatches.filter(
    (m) => m.status === "scheduled" && matchClosedReason(m) === null && !m.prediction
  ).length;
  const finN     = dayMatches.filter((m) => m.status === "finished").length;

  const matchStr = `${total} partido${total !== 1 ? "s" : ""}`;

  if (liveN > 0)      return { text: `${matchStr} · ${liveN} en vivo`,                    kind: "live"    };
  if (pendingN > 0)   return { text: `${matchStr} · ${pendingN} pendiente${pendingN !== 1 ? "s" : ""}`, kind: "pending" };
  if (finN === total) return { text: `${matchStr} · ✓ completado`,                        kind: "done"    };
  return               { text: matchStr,                                                   kind: "neutral" };
}

const SUBTITLE_COLOR: Record<SubtitleKind, string> = {
  live:    "text-[#ef4444]",
  pending: "text-[#f59e0b]",
  done:    "text-[#00c85a]/70",
  neutral: "text-[#475569]",
};

// ── Date accordion section ────────────────────────────────────────────

function DateSection({
  dateKey,
  dayMatches,
  isOpen,
  onToggle,
}: {
  dateKey:    string;
  dayMatches: MatchWithPrediction[];
  isOpen:     boolean;
  onToggle:   () => void;
}) {
  const sub = daySubtitle(dayMatches);

  return (
    <div className="rounded-2xl border border-[#1e1e35] overflow-hidden">

      {/* Accordion header — full-width tap target */}
      <button
        type="button"
        onClick={onToggle}
        className={cn(
          "w-full flex items-center gap-3 px-4 py-3.5 text-left transition-colors",
          isOpen ? "bg-[#11111c]" : "bg-[#11111c] hover:bg-[#18182a]"
        )}
      >
        {/* Chevron */}
        {isOpen
          ? <ChevronDown  size={14} className="text-[#475569] shrink-0" />
          : <ChevronRight size={14} className="text-[#475569] shrink-0" />}

        {/* Date + subtitle */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-[#f1f5f9] leading-none mb-0.5">
            {formatDateHeader(dateKey)}
          </p>
          <p className={cn("text-[10px]", SUBTITLE_COLOR[sub.kind])}>
            {sub.text}
          </p>
        </div>

        {/* Live pulse dot */}
        {sub.kind === "live" && (
          <span className="relative flex h-2 w-2 shrink-0">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#ef4444] opacity-60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-[#ef4444]" />
          </span>
        )}
      </button>

      {/* Collapsible content — CSS grid height animation */}
      <div className={cn(
        "grid transition-all duration-200 ease-in-out",
        isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
      )}>
        <div className="overflow-hidden min-h-0">
          <div className="flex flex-col gap-2 px-3 pb-3 pt-1">
            {dayMatches.map((match) => (
              <CalendarMatchRow key={match.id} match={match} />
            ))}
          </div>
        </div>
      </div>

    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────

export default function CalendarView({ matches }: { matches: MatchWithPrediction[] }) {

  const [filter, setFilter] = useState<Filter>("today");

  const filtered = useMemo(() => applyFilter(matches, filter), [matches, filter]);

  const days = useMemo(() => {
    const map = new Map<string, MatchWithPrediction[]>();
    for (const m of filtered) {
      const key = tzDateKey(m.starts_at, m.tz);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(m);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [filtered]);

  // Open set — tracks which date keys are expanded.
  // Initialised once with the default open date from the full match list.
  // Survives router.refresh() because it lives in client state.
  const [openDates, setOpenDates] = useState<Set<string>>(() => {
    const key = computeDefaultKey(matches);
    return key ? new Set([key]) : new Set();
  });

  // When the user switches filters, reset open state to the best visible date
  // for that filter — but only on explicit filter change (not on polling refresh).
  useEffect(() => {
    const best = bestVisibleKey(days);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- comportamiento original de La Penúltima: cerrar el editor al guardar
    setOpenDates(best ? new Set([best]) : new Set());
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]); // intentionally omit `days` so polling refreshes don't reset state

  function toggleDate(key: string) {
    setOpenDates((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const liveCount    = matches.filter((m) => m.status === "live").length;
  const pendingCount = matches.filter(
    (m) => m.status === "scheduled" && matchClosedReason(m) === null && !m.prediction
  ).length;
  const todayCount   = matches.filter(
    (m) => tzDateKey(m.starts_at, m.tz) === todayTzKey(m.tz)
  ).length;

  return (
    <div className="flex flex-col gap-3">

      {/* ── Filter tabs ───────────────────────────────────────────── */}
      <div className="flex items-center gap-1 overflow-x-auto no-scrollbar pb-0.5">
        {FILTERS.map(({ id, label }) => {
          const badge =
            id === "live"    ? liveCount :
            id === "pending" ? pendingCount :
            id === "today"   ? todayCount :
            0;
          return (
            <button
              key={id}
              onClick={() => setFilter(id)}
              className={cn(
                "shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors",
                filter === id
                  ? "bg-[#00c85a]/15 text-[#00c85a] border border-[#00c85a]/25"
                  : "text-[#94a3b8] hover:text-[#f1f5f9] hover:bg-[#18182a] border border-transparent"
              )}
            >
              {label}
              {badge > 0 && (
                <span className={cn(
                  "text-[9px] font-bold rounded-full px-1 min-w-[16px] text-center",
                  id === "live" ? "bg-[#ef4444]/15 text-[#ef4444]" : "bg-[#f59e0b]/15 text-[#f59e0b]"
                )}>
                  {badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ── Empty state ───────────────────────────────────────────── */}
      {days.length === 0 && (
        <div className="bg-[#18182a] border border-dashed border-[#2a2a45] rounded-2xl p-8 text-center">
          <p className="text-sm text-[#64748b]">
            {filter === "live"     ? "No hay partidos en vivo ahora." :
             filter === "pending"  ? "No tienes predicciones pendientes. ¡Al día!" :
             filter === "finished" ? "No hay partidos finalizados todavía." :
             filter === "today"    ? "No hay partidos programados para hoy." :
             "No hay partidos disponibles."}
          </p>
        </div>
      )}

      {/* ── Date accordions ───────────────────────────────────────── */}
      {days.map(([dateKey, dayMatches]) => (
        <DateSection
          key={dateKey}
          dateKey={dateKey}
          dayMatches={dayMatches}
          isOpen={openDates.has(dateKey)}
          onToggle={() => toggleDate(dateKey)}
        />
      ))}

    </div>
  );
}
