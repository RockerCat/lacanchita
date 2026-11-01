import { isValidTimeZone } from "./time";
import type { ResultState } from "./results";

// Calendario operativo de Control (AdminCalendarView de La Penúltima): partidos agrupados por día de la zona del
// torneo con filtros rápidos. Lógica pura para probarla sin navegador.

export type QuickFilter = "all" | "live" | "today" | "upcoming" | "finished" | "other";

export const QUICK_FILTERS: { id: QuickFilter; label: string }[] = [
  { id: "all", label: "Todos" },
  { id: "live", label: "En vivo" },
  { id: "today", label: "Hoy" },
  { id: "upcoming", label: "Próximos" },
  { id: "finished", label: "Finalizados" },
  { id: "other", label: "Aplazados y cancelados" },
];

export type BoardItem = { id: string; startsAt: string; status: string; state: ResultState };

const zone = (tz: string) => (isValidTimeZone(tz) ? tz : "UTC");

// "YYYY-MM-DD" del instante en la zona del torneo.
export function dayKey(iso: string, tz: string): string {
  return new Date(iso).toLocaleDateString("en-CA", { timeZone: zone(tz) });
}

export function formatDayHeader(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  const raw = new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString("es", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

export function formatKickoffTime(iso: string, tz: string): string {
  return new Date(iso).toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit", timeZone: zone(tz) });
}

// «En vivo» sigue el estado real del partido (state), no solo el estado persistido, para no ocultar nunca un partido en juego.
export const isLive = (m: BoardItem) => m.state === "live";

export function applyQuickFilter<T extends BoardItem>(items: T[], filter: QuickFilter, todayKey: string, tz: string): T[] {
  switch (filter) {
    case "live":
      return items.filter(isLive);
    case "finished":
      return items.filter((m) => m.state === "official" || m.state === "imported" || m.status === "finished");
    case "today":
      return items.filter((m) => dayKey(m.startsAt, tz) === todayKey);
    case "upcoming":
      return items.filter((m) => m.status === "scheduled" && dayKey(m.startsAt, tz) >= todayKey);
    case "other":
      return items.filter((m) => m.status === "postponed" || m.status === "cancelled");
    default:
      return items;
  }
}

// El filtro inicial es «En vivo» si hay partidos en juego (como el original); si no, todos.
export function defaultFilter(items: BoardItem[]): QuickFilter {
  return items.some(isLive) ? "live" : "all";
}

export function groupByDay<T extends BoardItem>(items: T[], tz: string): [string, T[]][] {
  const map = new Map<string, T[]>();
  for (const m of items) {
    const k = dayKey(m.startsAt, tz);
    map.set(k, [...(map.get(k) ?? []), m]);
  }
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => [k, [...v].sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt))]);
}
