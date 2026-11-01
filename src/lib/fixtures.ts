// Fixture FICTICIO con la forma de la fotografía del Mundial 2026 (13 clasificados + 5 sin posición).
// Nombres y UUID inventados; las cifras de puntos siguen el patrón real (124, 123, …) solo para QA visual.
import type { History } from "./data";
import type { SnapshotRow } from "./historial";

const POINTS = [124, 123, 121, 120, 116, 116, 108, 106, 106, 101, 94, 88, 75];

const ranked: SnapshotRow[] = POINTS.map((points, i) => ({
  row_number: i + 1,
  user_id: `00000000-0000-4000-8000-0000000000${String(i + 1).padStart(2, "0")}`,
  display_name: `Jugador ${String.fromCharCode(65 + i)}`,
  participation: "ranked",
  unranked_reason: null,
  position: i + 1,
  position_shared: false,
  stats_status: "verified",
  points,
  exact_hits: 13 - (i % 7),
  result_hits: 40 + (i % 9),
  misses: 30 + (i % 5),
  predictions_count: 95 + (i % 9),
}));

const unranked: SnapshotRow[] = ["disabled", "disabled", "disabled", "disabled", "platform_admin"].map((reason, i) => ({
  row_number: 14 + i,
  user_id: `00000000-0000-4000-8000-0000000000${14 + i}`,
  display_name: `Miembro ${i + 1}`,
  participation: "unranked",
  unranked_reason: reason,
  position: null,
  position_shared: null,
  stats_status: "verified",
  points: 0,
  exact_hits: 0,
  result_hits: 0,
  misses: 0,
  predictions_count: 0,
}));

export const historyFixture: History = {
  eventName: "Copa Mundial de la FIFA 2026",
  eventStatus: "finished",
  snapshot: {
    kind: "historical_cut",
    source: "legacy_import",
    version: 1,
    memberCount: 18,
    rankedCount: 13,
    dataCutoffAt: "2026-07-19T22:03:30Z",
    rankingOrder: ["points desc", "exact_hits desc", "result_hits desc"],
  },
  rows: [...unranked, ...ranked].reverse(),
  results: [
    { key: "champion", teamName: "Equipo Uno", flag: null, derived: true },
    { key: "runner_up", teamName: "Equipo Dos", flag: null, derived: true },
    { key: "third_place", teamName: "Equipo Tres", flag: null, derived: true },
    { key: "fourth_place", teamName: "Equipo Cuatro", flag: null, derived: true },
  ],
};
