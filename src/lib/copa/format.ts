import {
  assignBestThirdSlots,
  computeBestThirds,
  computeGroupStandings,
  groupHasUnresolvedTie,
  resolveSlot,
  thirdsCutIsAmbiguous,
  type ClassificationMatch,
  type ClassificationTeam,
  type GroupStanding,
  type KnockoutPreviewMatch,
  type KnockoutResult,
  type SlotResolution,
  type TeamStanding,
} from "./classification";
import { BEST_THIRD_MATCH_NUMBERS } from "./best-third-matrix";

// Modelo de la «Copa» (Camino a la Copa de La Penúltima) para torneos configurables. Se deriva SOLO de datos del
// torneo (fases y partidos oficiales); no hay tablas nuevas ni marcadores paralelos. Los resultados salen de
// `matches`; un equipo del cuadro se muestra como «oficial» solo si está asignado en el partido o lo determinan
// resultados cerrados (grupo completo o ganador oficial de la llave).
//
//   none      → sin partidos de eliminatoria: no hay Copa que mostrar.
//   knockout  → eliminatoria sin la matriz de mejores terceros (la matriz NO se extrapola a otros formatos).
//   worldcup  → formato del Mundial 2026: 12 grupos (A–L), 5 rondas y los 8 cruces con «Best 3rd (...)» de la
//               matriz oficial. Solo aquí se aplica la matriz de asignación de terceros.

export type CopaStage = { id: string; code: string; name: string; sort_order: number; is_knockout: boolean };
export type CopaMatch = KnockoutPreviewMatch & { stage_id: string; group_code: string | null; official: boolean };
export type CopaKind = "none" | "knockout" | "worldcup";
export type CopaRound = { stage: CopaStage; matches: CopaMatch[] };

export type CopaModel = {
  kind: CopaKind;
  groupMatches: ClassificationMatch[];
  rounds: CopaRound[]; // eliminatorias en orden, sin el partido por el tercer puesto
  thirdPlace: CopaRound | null;
  treeOk: boolean; // el cuadro completo (Winner Mxx) es verificable: se puede dibujar el bracket
  reasons: string[]; // por qué no es «worldcup» / no hay árbol (para Control y pruebas)
};

const WINNER_REF = /^Winner M(\d+)$/;
const LOSER_REF = /^Loser M(\d+)$/;
const BEST_THIRD = /^Best 3rd \(([A-L](?:\/[A-L])*)\)$/;
const byNumber = (a: CopaMatch, b: CopaMatch) => (a.match_number ?? 0) - (b.match_number ?? 0) || a.starts_at.localeCompare(b.starts_at);

export function buildCopaModel(stages: CopaStage[], matches: CopaMatch[]): CopaModel {
  const ordered = [...stages].sort((a, b) => a.sort_order - b.sort_order);
  const koStages = ordered.filter((s) => s.is_knockout);
  const koSet = new Set(koStages.map((s) => s.id));
  const groupMatches: ClassificationMatch[] = matches
    .filter((m) => !koSet.has(m.stage_id) && m.group_code)
    .map((m) => ({ group_code: m.group_code, home_score: m.home_score, away_score: m.away_score, status: m.status === "finished" && !m.official ? "unofficial" : m.status, home_team: m.home_team, away_team: m.away_team }));

  const withMatches = koStages
    .map((stage) => ({ stage, matches: matches.filter((m) => m.stage_id === stage.id).sort(byNumber) }))
    .filter((r) => r.matches.length > 0);
  const reasons: string[] = [];
  if (withMatches.length === 0) return { kind: "none", groupMatches, rounds: [], thirdPlace: null, treeOk: false, reasons: ["Sin partidos de eliminatoria"] };

  // Tercer puesto: fase cuyos partidos se alimentan únicamente de perdedores («Loser Mxx»).
  const isThird = (r: CopaRound) => r.matches.every((m) => LOSER_REF.test(m.home_placeholder ?? "") && LOSER_REF.test(m.away_placeholder ?? ""));
  const thirdPlace = withMatches.find(isThird) ?? null;
  const rounds = withMatches.filter((r) => r !== thirdPlace);

  // Árbol verificable: cada ronda tiene la mitad de partidos que la anterior, la última es única y cada partido se
  // alimenta de dos «Winner Mxx» que existen en la ronda inmediatamente anterior.
  let treeOk = rounds.length >= 2 && rounds[rounds.length - 1].matches.length === 1;
  if (!treeOk) reasons.push("El cuadro no tiene una final única precedida de al menos otra ronda");
  for (let i = 1; treeOk && i < rounds.length; i++) {
    const prev = rounds[i - 1].matches;
    const nums = new Set(prev.map((m) => m.match_number).filter((n): n is number => n !== null));
    if (prev.length !== rounds[i].matches.length * 2) { treeOk = false; reasons.push(`${rounds[i].stage.name}: debería tener la mitad de partidos que ${rounds[i - 1].stage.name}`); break; }
    const used = new Set<number>();
    for (const m of rounds[i].matches) {
      for (const ph of [m.home_placeholder, m.away_placeholder]) {
        const ref = WINNER_REF.exec(ph ?? "");
        const n = ref ? Number(ref[1]) : NaN;
        if (!ref || !nums.has(n) || used.has(n)) { treeOk = false; reasons.push(`${rounds[i].stage.name}: los cruces no se definen con «Winner M##» de la ronda anterior`); break; }
        used.add(n);
      }
      if (!treeOk) break;
    }
  }

  // Formato del Mundial: 12 grupos A–L, 5 rondas y exactamente los 8 cruces de mejores terceros de la matriz.
  let kind: CopaKind = "knockout";
  const letters = new Set(groupMatches.map((m) => m.group_code as string));
  const first = rounds[0]?.matches ?? [];
  const thirdSlotNumbers = first.filter((m) => BEST_THIRD.test(m.home_placeholder ?? "") || BEST_THIRD.test(m.away_placeholder ?? "")).map((m) => m.match_number).sort((a, b) => (a ?? 0) - (b ?? 0));
  const expected = [...BEST_THIRD_MATCH_NUMBERS];
  const isWorldCup =
    treeOk && rounds.length === 5 && first.length === 16 && letters.size === 12 && "ABCDEFGHIJKL".split("").every((l) => letters.has(l)) &&
    thirdSlotNumbers.length === expected.length && thirdSlotNumbers.every((n, i) => n === expected[i]);
  if (isWorldCup) kind = "worldcup";
  else reasons.push("No corresponde al formato del Mundial 2026 (12 grupos, 16avos, matriz de mejores terceros): no se aplica la matriz");
  return { kind, groupMatches, rounds, thirdPlace, treeOk, reasons };
}

// ── Resolución del cuadro ────────────────────────────────────────────────────

export type SlotPair = { home: SlotResolution; away: SlotResolution };
export type CopaResolved = {
  groups: GroupStanding[];
  bestThirds: TeamStanding[];
  bestThirdAssignment: Map<string, TeamStanding>;
  knockoutResults: Map<number, KnockoutResult>;
  slots: Map<string, SlotPair>;
  tiedGroups: Set<string>;
  thirdsAmbiguous: boolean;
};

function record(m: CopaMatch, home: ClassificationTeam | null, away: ClassificationTeam | null, results: Map<number, KnockoutResult>) {
  // Solo resultados oficiales cerrados: ni en vivo, ni cancelados, ni importados sin cierre.
  if (m.status !== "finished" || !m.official) return;
  if (m.match_number === null || m.home_score === null || m.away_score === null || !home || !away) return;
  if (m.home_score > m.away_score) results.set(m.match_number, { winner: home, loser: away });
  else if (m.away_score > m.home_score) results.set(m.match_number, { winner: away, loser: home });
  else if (m.winner_side === "home") results.set(m.match_number, { winner: home, loser: away });
  else if (m.winner_side === "away") results.set(m.match_number, { winner: away, loser: home });
  // Empate sin ganador de llave: ambiguo, no avanza nadie.
}

export function resolveCopa(model: CopaModel): CopaResolved {
  const groups = computeGroupStandings(model.groupMatches);
  const bestThirds = computeBestThirds(groups);
  const firstRound = model.rounds[0]?.matches ?? [];
  const bestThirdAssignment = model.kind === "worldcup" ? assignBestThirdSlots(groups, firstRound) : new Map<string, TeamStanding>();
  const knockoutResults = new Map<number, KnockoutResult>();
  const slots = new Map<string, SlotPair>();
  const all = [...model.rounds, ...(model.thirdPlace ? [model.thirdPlace] : [])];
  // Se procesa ronda por ronda: el ganador de una llave alimenta la siguiente.
  for (const round of all) {
    for (const m of round.matches) {
      const home = resolveSlot(m.home_team, m.home_placeholder, groups, bestThirdAssignment.get(`${m.id}:home`) ?? null, knockoutResults);
      const away = resolveSlot(m.away_team, m.away_placeholder, groups, bestThirdAssignment.get(`${m.id}:away`) ?? null, knockoutResults);
      slots.set(m.id, { home, away });
      record(m, home.kind !== "unresolved" ? home.team : null, away.kind !== "unresolved" ? away.team : null, knockoutResults);
    }
  }
  const tiedGroups = new Set(groups.filter((g) => groupHasUnresolvedTie(g, model.groupMatches.filter((m) => m.group_code === g.group_code))).map((g) => g.group_code));
  return { groups, bestThirds, bestThirdAssignment, knockoutResults, slots, tiedGroups, thirdsAmbiguous: model.kind === "worldcup" && thirdsCutIsAmbiguous(bestThirds, 8) };
}
