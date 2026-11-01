// Presentación del historial consolidado (standing_snapshots / standing_snapshot_rows).
// No depende de pronósticos: solo de la fotografía sellada.
// La Canchita no gestiona dinero: aquí no existen cuotas, bolsas ni premios.

export type SnapshotRow = {
  row_number: number;
  user_id: string | null;
  display_name: string;
  participation: string;
  unranked_reason: string | null;
  position: number | null;
  position_shared: boolean | null;
  stats_status: string;
  points: number | null;
  exact_hits: number | null;
  result_hits: number | null;
  misses: number | null;
  predictions_count: number | null;
};

export type StandingsView = {
  ranked: SnapshotRow[];
  unranked: SnapshotRow[];
};

export function splitStandings(rows: SnapshotRow[]): StandingsView {
  const sorted = [...rows].sort((a, b) => a.row_number - b.row_number);
  return {
    ranked: sorted.filter((r) => r.participation === "ranked" && r.position !== null),
    unranked: sorted.filter((r) => r.participation !== "ranked" || r.position === null),
  };
}

export const UNRANKED_REASON_LABELS: Record<string, string> = {
  disabled: "Membresía deshabilitada durante el torneo",
  platform_admin: "Administraba el parche y no competía",
  no_participation: "No participó en el torneo",
  other: "Sin clasificación",
};

export function unrankedReasonLabel(reason: string | null): string {
  return (reason && UNRANKED_REASON_LABELS[reason]) || "Sin clasificación";
}

// "—" distingue dato desconocido / no aplica de un cero real.
export function statValue(row: SnapshotRow, value: number | null): string {
  if (row.stats_status !== "verified" || value === null) return "—";
  return String(value);
}

// Acento de podio (deportivo, sin premios): 1.º oro, 2.º plata, 3.º bronce.
export type PodiumTone = "gold" | "silver" | "bronze" | null;
export function podiumTone(position: number | null): PodiumTone {
  return position === 1 ? "gold" : position === 2 ? "silver" : position === 3 ? "bronze" : null;
}

export type SnapshotMeta = { kind: string; source: string };

export function snapshotNotice(meta: SnapshotMeta): { title: string; body: string } {
  if (meta.kind === "final_close") {
    return {
      title: "Clasificación final oficial",
      body: "Resultado consolidado en el cierre definitivo del torneo en La Canchita.",
    };
  }
  return {
    title: "Corte histórico",
    body:
      meta.source === "legacy_import"
        ? "Clasificación importada de La Penúltima y verificada contra su respaldo. No es un cierre oficial de La Canchita."
        : "Clasificación verificada en un momento dado. No es un cierre oficial.",
  };
}

export const RANKING_CRITERIA_LABELS: Record<string, string> = {
  "points desc": "puntos",
  "exact_hits desc": "marcadores exactos",
  "result_hits desc": "resultados acertados",
};

export function rankingCriteriaText(order: unknown): string | null {
  if (!Array.isArray(order) || order.length === 0) return null;
  const labels = order.map((o) => RANKING_CRITERIA_LABELS[String(o)] ?? String(o));
  return `Orden: ${labels.join(", luego ")}.`;
}

export const RESULT_LABELS: Record<string, string> = {
  champion: "Campeón",
  runner_up: "Subcampeón",
  third_place: "Tercer puesto",
  fourth_place: "Cuarto puesto",
};

// Adaptador para los componentes recuperados del podio y la clasificación (LeaderboardEntry).
// Solo pasa filas clasificadas con estadísticas verificadas: un valor desconocido nunca se presenta como cero.
// El orden es el de la fotografía (posición y luego row_number); la posición oficial viaja en `rank`.
export type PodiumEntry = {
  user_id: string;
  display_name: string;
  total_points: number;
  exact_count: number;
  result_count: number;
  pred_count: number;
  rank: number;
};

export function toPodiumEntries(ranked: SnapshotRow[]): PodiumEntry[] | null {
  const out: PodiumEntry[] = [];
  for (const r of [...ranked].sort((a, b) => (a.position ?? 0) - (b.position ?? 0) || a.row_number - b.row_number)) {
    if (
      r.stats_status !== "verified" ||
      r.position === null ||
      r.points === null ||
      r.exact_hits === null ||
      r.result_hits === null ||
      r.predictions_count === null
    )
      return null;
    out.push({
      // Filas cuyo usuario ya no existe conservan su nombre histórico; la clave solo debe ser única.
      user_id: r.user_id ?? `historico-${r.row_number}`,
      display_name: r.display_name,
      total_points: r.points,
      exact_count: r.exact_hits,
      result_count: r.result_hits,
      pred_count: r.predictions_count,
      rank: r.position,
    });
  }
  return out;
}
