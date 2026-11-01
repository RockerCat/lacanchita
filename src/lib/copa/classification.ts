import { BEST_THIRD_ASSIGNMENT_MATRIX } from "./best-third-matrix";

// ── Types ─────────────────────────────────────────────────────────────

export type ClassificationTeam = {
  id: string;
  name: string;
  code: string;
  flag_emoji: string | null;
};

export type TeamStanding = {
  team: ClassificationTeam;
  group_code: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goals_for: number;
  goals_against: number;
  goal_diff: number;
  points: number;
};

export type GroupStanding = {
  group_code: string;
  teams: TeamStanding[];  // sorted: index 0 = leader
};

export type ClassificationMatch = {
  group_code: string | null;
  home_score: number | null;
  away_score: number | null;
  status: string;
  home_team: ClassificationTeam | null;
  away_team: ClassificationTeam | null;
};

export type KnockoutPreviewMatch = {
  id: string;
  match_number: number | null;
  starts_at: string;
  venue: string | null;
  status: string;
  home_score: number | null;
  away_score: number | null;
  home_placeholder: string | null;
  away_placeholder: string | null;
  home_team: ClassificationTeam | null;
  away_team: ClassificationTeam | null;
  winner_side: 'home' | 'away' | null;
  // La Canchita: estado oficial (resultado cerrado por el superadministrador) y fase del partido.
  official?: boolean;
  stage_id?: string;
};

// ── Sorting comparator ─────────────────────────────────────────────────
// Criteria (in order):
//   1. Points DESC
//   2. Goal difference DESC
//   3. Goals scored DESC
//   4. Alphabetical ASC — deterministic technical fallback ONLY.
//
// This comparator has NO head-to-head step. It's correct to use as-is
// wherever match data between the compared teams either doesn't exist or
// doesn't apply (e.g. comparing third-placed teams across DIFFERENT
// groups in computeBestThirds — those teams never played each other, so
// head-to-head is meaningless there). For same-group comparisons, use
// sortGroupStandings() below instead, which layers head-to-head on top
// of this comparator rather than duplicating its logic.
//
// FIFA remaining criteria not implemented yet:
// fair play points and latest FIFA ranking.
// Alphabetical is only a deterministic technical fallback.

export function compareStandings(a: TeamStanding, b: TeamStanding): number {
  if (b.points     !== a.points)     return b.points     - a.points;
  if (b.goal_diff  !== a.goal_diff)  return b.goal_diff  - a.goal_diff;
  if (b.goals_for  !== a.goals_for)  return b.goals_for  - a.goals_for;
  return a.team.name.localeCompare(b.team.name);
}

// ── aggregateHeadToHead ─────────────────────────────────────────────────
// Builds a mini-table restricted to finished matches played BETWEEN the
// given team ids only (a true mini round-robin among the tied cluster,
// not a single pairwise lookup — this is what keeps sortGroupStandings()
// correct even for cyclic 3+ way results, e.g. A beat B, B beat C, C beat A).

export function aggregateHeadToHead(
  teamIds: Set<string>,
  groupMatches: ClassificationMatch[]
): Map<string, { points: number; goal_diff: number; goals_for: number }> {
  const stats = new Map<string, { points: number; goal_diff: number; goals_for: number }>();
  for (const id of teamIds) stats.set(id, { points: 0, goal_diff: 0, goals_for: 0 });

  for (const m of groupMatches) {
    if (m.status !== "finished") continue;
    if (m.home_score === null || m.away_score === null) continue;
    if (!m.home_team || !m.away_team) continue;
    if (!teamIds.has(m.home_team.id) || !teamIds.has(m.away_team.id)) continue;

    const home = stats.get(m.home_team.id)!;
    const away = stats.get(m.away_team.id)!;
    const hg = m.home_score;
    const ag = m.away_score;

    home.goal_diff += hg - ag;  home.goals_for += hg;
    away.goal_diff += ag - hg;  away.goals_for += ag;

    if (hg > ag)      home.points += 3;
    else if (hg < ag) away.points += 3;
    else              { home.points++; away.points++; }
  }

  return stats;
}

// ── sortGroupStandings ───────────────────────────────────────────────────
// Same-group ranking, FIFA order:
//   1. Points (total)
//   2. Points  — head-to-head among teams tied on (1)
//   3. Goal diff — head-to-head among teams tied on (1)
//   4. Goals for — head-to-head among teams tied on (1)
//   5. Goal diff (total)
//   6. Goals for (total)
//   7. Alphabetical — deterministic technical fallback ONLY (see compareStandings)
//
// Head-to-head is computed once per points-cluster (not per pair), so the
// result is a valid total order even when results are cyclic — a cyclic
// cluster simply ties again in the mini-table and falls through to (5)-(7).

export function sortGroupStandings(
  teams: TeamStanding[],
  groupMatches: ClassificationMatch[]
): TeamStanding[] {
  const byPoints = new Map<number, TeamStanding[]>();
  for (const t of teams) {
    const cluster = byPoints.get(t.points) ?? [];
    cluster.push(t);
    byPoints.set(t.points, cluster);
  }

  const h2h = new Map<string, { points: number; goal_diff: number; goals_for: number }>();
  for (const cluster of byPoints.values()) {
    if (cluster.length < 2) continue;
    const ids = new Set(cluster.map((t) => t.team.id));
    for (const [id, stat] of aggregateHeadToHead(ids, groupMatches)) {
      h2h.set(id, stat);
    }
  }

  return [...teams].sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;       // (1)

    const ah = h2h.get(a.team.id);
    const bh = h2h.get(b.team.id);
    if (ah && bh) {
      if (bh.points    !== ah.points)    return bh.points    - ah.points;    // (2)
      if (bh.goal_diff !== ah.goal_diff) return bh.goal_diff - ah.goal_diff;  // (3)
      if (bh.goals_for !== ah.goals_for) return bh.goals_for - ah.goals_for;  // (4)
    }

    return compareStandings(a, b);  // (5) goal diff, (6) goals for, (7) alphabetical fallback
  });
}

function emptyStanding(
  team: ClassificationTeam,
  group_code: string
): TeamStanding {
  return {
    team,
    group_code,
    played: 0, won: 0, drawn: 0, lost: 0,
    goals_for: 0, goals_against: 0, goal_diff: 0, points: 0,
  };
}

// ── computeGroupStandings ──────────────────────────────────────────────
// Pass ALL group-stage matches (any status) so every team is initialised.
// Only finished matches contribute to stats.

export function computeGroupStandings(
  matches: ClassificationMatch[]
): GroupStanding[] {
  const standingsMap = new Map<string, TeamStanding>();
  const groupSets    = new Map<string, Set<string>>();

  // ── Pass 1: discover every team in every group ─────────────────────
  for (const m of matches) {
    if (!m.group_code) continue;
    for (const team of [m.home_team, m.away_team]) {
      if (!team) continue;
      if (!standingsMap.has(team.id)) {
        standingsMap.set(team.id, emptyStanding(team, m.group_code));
      }
      const s = groupSets.get(m.group_code) ?? new Set<string>();
      s.add(team.id);
      groupSets.set(m.group_code, s);
    }
  }

  // ── Pass 2: accumulate stats from finished matches ─────────────────
  for (const m of matches) {
    if (m.status !== "finished") continue;
    if (!m.group_code || m.home_score === null || m.away_score === null) continue;
    if (!m.home_team || !m.away_team) continue;

    const home = standingsMap.get(m.home_team.id);
    const away = standingsMap.get(m.away_team.id);
    if (!home || !away) continue;

    const hg = m.home_score;
    const ag = m.away_score;

    home.played++; away.played++;
    home.goals_for    += hg;  home.goals_against += ag;
    away.goals_for    += ag;  away.goals_against += hg;
    home.goal_diff = home.goals_for - home.goals_against;
    away.goal_diff = away.goals_for - away.goals_against;

    if (hg > ag) {
      home.won++; away.lost++; home.points += 3;
    } else if (hg < ag) {
      away.won++; home.lost++; away.points += 3;
    } else {
      home.drawn++; away.drawn++; home.points++; away.points++;
    }
  }

  // ── Build sorted groups A → L ──────────────────────────────────────
  const groupsMap = new Map<string, TeamStanding[]>();
  for (const standing of standingsMap.values()) {
    const arr = groupsMap.get(standing.group_code) ?? [];
    arr.push(standing);
    groupsMap.set(standing.group_code, arr);
  }

  return [...groupsMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([group_code, teams]) => ({
      group_code,
      teams: sortGroupStandings(
        teams,
        matches.filter((m) => m.group_code === group_code)
      ),
    }));
}

// ── computeBestThirds ──────────────────────────────────────────────────
// Extracts the 3rd-ranked team from each group and ranks them.
// Returns ALL thirds sorted — caller marks top 8 as advancing.

export function computeBestThirds(groups: GroupStanding[]): TeamStanding[] {
  return groups
    .filter((g) => g.teams.length >= 3)
    .map((g) => g.teams[2])
    .sort(compareStandings);
}

// ── isGroupComplete ──────────────────────────────────────────────────────
// True once every team in the group has played all of its group-stage
// matches (i.e. every match for that group is "finished"). Used to
// reconcile a standings-based projection into "official" once there's no
// more group-stage uncertainty left for that specific group — without
// needing the actual persisted team_id on the knockout match row.

function isGroupComplete(group: GroupStanding): boolean {
  return group.teams.length > 0 && group.teams.every((t) => t.played === group.teams.length - 1);
}

// ── resolveSlot ──────────────────────────────────────────────────────────
// Resolves a single bracket slot (one side of a KnockoutPreviewMatch) to
// one of three states:
//   • "official"   — team already confirmed: either home_team/away_team is
//                     already set, OR it's a standings-based projection
//                     whose source group has finished every match (no
//                     more group-stage uncertainty left to flip it).
//   • "projected"   — no team confirmed yet, but the placeholder is a
//                     "Winner Group X" / "Runner-up Group X" / "Best 3rd (...)"
//                     slot, current standings can resolve it, and its
//                     source group still has pending matches.
//   • "unresolved" — placeholder can't be safely resolved yet (e.g. a
//                     "Winner M##" cross-reference, or a group/best-third
//                     pool with too few teams recorded). When the
//                     placeholder is recognizably a "Best 3rd (...)" slot
//                     that just isn't resolvable *yet* (as opposed to an
//                     unrecognized placeholder format), `pending` is set
//                     so the UI can label it "proyección pendiente"
//                     instead of a plain unresolved placeholder.
//
// Only group-position placeholders are ever projected/reconciled. "Best
// 3rd (...)" slots are resolved via assignBestThirdSlots() below, which
// applies the official FIFA combination matrix (best-third-matrix.ts)
// once exactly one candidate exists or the full set of 8 qualifying
// thirds is known. bestThird must be precomputed by the caller and
// passed in; resolveSlot itself stays a pure, single-slot function — the
// official/projected reconciliation only ever reads `groups`, it never
// touches how a team was chosen.

export type SlotResolution =
  | { kind: "official";   team: ClassificationTeam }
  | { kind: "projected";  team: ClassificationTeam }
  | { kind: "unresolved"; label: string; pending?: boolean };

export type KnockoutResult = { winner: ClassificationTeam; loser: ClassificationTeam };

const WINNER_GROUP_RE    = /^Winner Group ([A-L])$/;
const RUNNER_UP_GROUP_RE = /^Runner-up Group ([A-L])$/;
const BEST_THIRD_RE      = /^Best 3rd \(([A-L](?:\/[A-L])*)\)$/;
const WINNER_MATCH_RE    = /^Winner M(\d+)$/;
const LOSER_MATCH_RE     = /^Loser M(\d+)$/;

export function resolveSlot(
  team: ClassificationTeam | null,
  placeholder: string | null,
  groups: GroupStanding[],
  bestThird: TeamStanding | null = null,
  knockoutResults: Map<number, KnockoutResult> = new Map()
): SlotResolution {
  if (team) return { kind: "official", team };
  if (!placeholder) return { kind: "unresolved", label: "Por definir" };

  const winnerMatch = placeholder.match(WINNER_GROUP_RE);
  if (winnerMatch) {
    const group = groups.find((g) => g.group_code === winnerMatch[1]);
    if (group && group.teams.length >= 1) {
      return { kind: isGroupComplete(group) ? "official" : "projected", team: group.teams[0].team };
    }
  }

  const runnerUpMatch = placeholder.match(RUNNER_UP_GROUP_RE);
  if (runnerUpMatch) {
    const group = groups.find((g) => g.group_code === runnerUpMatch[1]);
    if (group && group.teams.length >= 2) {
      return { kind: isGroupComplete(group) ? "official" : "projected", team: group.teams[1].team };
    }
  }

  if (BEST_THIRD_RE.test(placeholder)) {
    if (bestThird) {
      const group = groups.find((g) => g.group_code === bestThird.group_code);
      const kind = group && isGroupComplete(group) ? "official" : "projected";
      return { kind, team: bestThird.team };
    }
    // Recognized as a best-third slot, but assignBestThirdSlots() couldn't
    // resolve it with certainty yet (e.g. fewer than 8 thirds recorded,
    // or an ambiguous combination the FIFA matrix doesn't cover yet).
    return { kind: "unresolved", label: placeholder, pending: true };
  }

  const winnerRef = placeholder.match(WINNER_MATCH_RE);
  if (winnerRef) {
    const res = knockoutResults.get(Number(winnerRef[1]));
    if (res) return { kind: "official", team: res.winner };
  }

  const loserRef = placeholder.match(LOSER_MATCH_RE);
  if (loserRef) {
    const res = knockoutResults.get(Number(loserRef[1]));
    if (res) return { kind: "official", team: res.loser };
  }

  return { kind: "unresolved", label: placeholder };
}

// ── assignBestThirdSlots ───────────────────────────────────────────────
// Projects which team fills each "Best 3rd (A/B/C/D/F)" slot:
//
//   1. Take the top 8 current thirds (computeBestThirds, already sorted
//      best-first by compareStandings) — this is today's best estimate
//      of which 8 groups' thirds will qualify.
//   2. For each "Best 3rd (...)" slot, filter that pool down to
//      candidates that: belong to the slot's allowed groups, are within
//      the top 8, and have a real team (defensive — computeBestThirds
//      only ever returns real teams, but never trust a join silently).
//   3. Exactly one candidate → assign it directly, no matrix needed.
//   4. More than one candidate → only the official FIFA matrix
//      (best-third-matrix.ts) may break the tie, and ONLY once the full
//      set of 8 advancing groups is known (top 8 actually has 8 teams).
//      The matrix is looked up once per call, not once per slot, since
//      it depends only on the advancing-groups combination.
//   5. Zero candidates, or an ambiguous slot the matrix can't resolve
//      (combination not yet complete) → left unassigned. resolveSlot()
//      then reports "unresolved" with `pending: true` rather than
//      guessing — alphabetical order is never used as a tiebreaker here.
//
// Returns a Map keyed by `${matchId}:home` / `${matchId}:away`.

export type BestThirdSlotMatch = {
  id:               string;
  match_number:     number | null;
  home_placeholder: string | null;
  away_placeholder: string | null;
};

export function assignBestThirdSlots(
  groups: GroupStanding[],
  matches: BestThirdSlotMatch[]
): Map<string, TeamStanding> {
  const top8 = computeBestThirds(groups).slice(0, 8);
  const top8ByGroup = new Map(top8.map((ts) => [ts.group_code, ts]));

  // The matrix only applies once the full 8-group combination is known —
  // with fewer than 8 thirds recorded, "which 8 groups advance" is itself
  // still undetermined, so no matrix row could apply with certainty.
  const advancingKey = top8.length === 8
    ? [...top8].map((ts) => ts.group_code).sort().join("")
    : null;
  const matrixRow = advancingKey ? BEST_THIRD_ASSIGNMENT_MATRIX.get(advancingKey) : undefined;

  const result = new Map<string, TeamStanding>();

  for (const match of matches) {
    for (const side of ["home", "away"] as const) {
      const placeholder = side === "home" ? match.home_placeholder : match.away_placeholder;
      const allowedMatch = placeholder?.match(BEST_THIRD_RE);
      if (!allowedMatch) continue;

      const candidates = allowedMatch[1]
        .split("/")
        .map((g) => top8ByGroup.get(g))
        .filter((ts): ts is TeamStanding => !!ts && !!ts.team.id);

      let chosen: TeamStanding | null = null;

      if (candidates.length === 1) {
        chosen = candidates[0];
      } else if (candidates.length > 1 && matrixRow && match.match_number !== null) {
        const officialGroup = matrixRow[match.match_number];
        chosen = candidates.find((ts) => ts.group_code === officialGroup) ?? null;
      }

      if (chosen) result.set(`${match.id}:${side}`, chosen);
    }
  }

  return result;
}

// ── orderSourceMatchesByDestination ─────────────────────────────────────
// The bracket view's connector lines are drawn assuming the source column
// is laid out as consecutive pairs — source[0]+source[1] feed dest[0],
// source[2]+source[3] feed dest[1], and so on. The DB returns each column
// sorted by match_number, which is NOT the same thing: e.g. round of 32's
// M73/M75 (which feed M90) are not adjacent in match_number order, while
// M73/M74 (which feed two DIFFERENT matches, M90 and M89) are. Rendering
// in raw match_number order therefore draws connectors between matches
// that don't actually play into each other.
//
// This reorders `sourceMatches` so that, walking `destMatches` in their
// existing order, each destination's two source matches — resolved from
// its own "Winner M##" / "Loser M##" placeholders, never by position —
// end up adjacent and in the same relative order as their destination.
// The result is a pure visual ordering; match_number, placeholders and
// every other field are untouched, and no team-resolution logic changes.

export type BracketFeedDestination = {
  home_placeholder: string | null;
  away_placeholder: string | null;
};

const FEED_MATCH_RE = /^(?:Winner|Loser) M(\d+)$/;

export function orderSourceMatchesByDestination<
  T extends { id: string; match_number: number | null }
>(
  sourceMatches: T[],
  destMatches: BracketFeedDestination[]
): T[] {
  const sourceByNumber = new Map(
    sourceMatches.filter((m) => m.match_number !== null).map((m) => [m.match_number, m] as const)
  );
  const used = new Set<string>();
  const ordered: T[] = [];

  for (const dest of destMatches) {
    for (const placeholder of [dest.home_placeholder, dest.away_placeholder]) {
      const ref = placeholder?.match(FEED_MATCH_RE);
      if (!ref) continue;

      const source = sourceByNumber.get(Number(ref[1]));
      if (source && !used.has(source.id)) {
        used.add(source.id);
        ordered.push(source);
      }
    }
  }

  // Anything destMatches' placeholders didn't reference (e.g. the next
  // round isn't seeded yet) keeps its original relative order, appended
  // at the end — never silently dropped from the bracket.
  for (const source of sourceMatches) {
    if (!used.has(source.id)) ordered.push(source);
  }

  return ordered;
}

// ── orderDestinationBySourcePairs ───────────────────────────────────────
// Companion to orderSourceMatchesByDestination, used when the SOURCE
// column's visual order is the one that's fixed (e.g. Octavos/round of 16
// is shown in plain match_number order) and the NEXT column needs to be
// arranged to match it instead. Walking `orderedSource` two rows at a
// time, each pair's real destination — resolved the same way, from its
// own placeholders — is placed next, so consecutive source rows really do
// feed the destination row in that same position.
//
// This does NOT guarantee the resulting destination order itself forms
// adjacent real pairs for the round after that (round of 16 → quarter
// finals → semis is exactly such a case: quarter finals end up as
// M97,M99,M98,M100, where M97/M98 — the real semifinal pair — are two
// rows apart, not adjacent). That's expected and handled by
// computeBracketConnections, which never assumes adjacency either.

export function orderDestinationBySourcePairs<T extends BracketFeedDestination & { id: string }>(
  orderedSource: { match_number: number | null }[],
  destMatches: T[]
): T[] {
  const destByMatchNumber = new Map<number, T>();
  for (const dest of destMatches) {
    for (const placeholder of [dest.home_placeholder, dest.away_placeholder]) {
      const ref = placeholder?.match(FEED_MATCH_RE);
      if (ref) destByMatchNumber.set(Number(ref[1]), dest);
    }
  }

  const used = new Set<string>();
  const ordered: T[] = [];

  for (let i = 0; i + 1 < orderedSource.length; i += 2) {
    const pair = [orderedSource[i].match_number, orderedSource[i + 1].match_number];
    for (const n of pair) {
      const dest = n !== null ? destByMatchNumber.get(n) : undefined;
      if (dest && !used.has(dest.id)) {
        used.add(dest.id);
        ordered.push(dest);
        break;
      }
    }
  }

  for (const dest of destMatches) {
    if (!used.has(dest.id)) ordered.push(dest);
  }

  return ordered;
}

// ── computeBracketConnections ───────────────────────────────────────────
// Given a column's FINAL visual row order and the next column's FINAL
// visual row order, returns exactly which source row(s) feed each
// destination row — resolved purely from real "Winner M##"/"Loser M##"
// placeholders, never from row adjacency. The two source rows for a given
// destination are NOT guaranteed to be adjacent (see
// orderDestinationBySourcePairs above), so the renderer must draw each
// one independently rather than assume a single shared midpoint.

export type BracketConnection = { srcRows: [number, number]; destRow: number };

export function computeBracketConnections(
  orderedSource: { match_number: number | null }[],
  orderedDest: BracketFeedDestination[]
): BracketConnection[] {
  const rowByMatchNumber = new Map<number, number>();
  orderedSource.forEach((m, row) => {
    if (m.match_number !== null) rowByMatchNumber.set(m.match_number, row);
  });

  const connections: BracketConnection[] = [];

  orderedDest.forEach((dest, destRow) => {
    const rows = [dest.home_placeholder, dest.away_placeholder]
      .map((p) => p?.match(FEED_MATCH_RE))
      .filter((m): m is RegExpMatchArray => !!m)
      .map((m) => rowByMatchNumber.get(Number(m[1])))
      .filter((row): row is number => row !== undefined);

    if (rows.length === 2) {
      connections.push({ srcRows: [rows[0], rows[1]], destRow });
    }
  });

  return connections;
}

// ── Bracket row positioning (recursive midpoint) ─────────────────────────
// The vertical position of every non-leaf match is the midpoint of its two
// real children's positions — never an index- or round-based offset:
//
//   top(parent) = (top(childA) + top(childB)) / 2
//
// Applied recursively from Dieciseisavos (leaves, evenly spaced — they have
// no children to average) up through the Final, this guarantees every
// match is exactly centered on its two sources regardless of how a round
// happens to be visually ordered (e.g. Cuartos rendering as
// M97,M99,M98,M100 — non-adjacent children — still centers M101 and M102
// correctly, so their connector lines never overlap).

export function computeLeafRowPositions(count: number, rowHeight: number): number[] {
  return Array.from({ length: count }, (_, i) => i * rowHeight + rowHeight / 2);
}

export function computeParentRowPositions(
  connections: BracketConnection[],
  parentCount: number,
  childY: number[],
  totalHeight: number
): number[] {
  const y = new Array<number>(parentCount).fill(NaN);

  for (const { srcRows, destRow } of connections) {
    y[destRow] = (childY[srcRows[0]] + childY[srcRows[1]]) / 2;
  }

  // Defensive fallback only: real tournament data always defines every
  // knockout match's two placeholders, so every row should resolve above.
  // If a row somehow has no connection (e.g. malformed data), fall back to
  // even spacing rather than rendering at y = NaN.
  for (let i = 0; i < parentCount; i++) {
    if (Number.isNaN(y[i])) y[i] = (i + 0.5) * (totalHeight / parentCount);
  }

  return y;
}


// ── Empates sin criterio definido (La Canchita) ─────────────────────────────
// El orden de la tabla usa el nombre como último recurso técnico (determinista), pero eso NO es una regla del
// torneo: FIFA aún aplica juego limpio y ranking que aquí no se implementan. Para ASIGNAR un clasificado al cuadro
// (escritura) solo se acepta una posición que no dependa de ese último recurso.

const sameStats = (a: TeamStanding, b: TeamStanding) =>
  a.points === b.points && a.goal_diff === b.goal_diff && a.goals_for === b.goals_for;

/** True si, entre las posiciones 1–4 del grupo, dos equipos consecutivos empatan en TODO criterio implementado. */
export function groupHasUnresolvedTie(group: GroupStanding, groupMatches: ClassificationMatch[]): boolean {
  const t = group.teams;
  for (let i = 0; i + 1 < Math.min(t.length, 4); i++) {
    if (!sameStats(t[i], t[i + 1])) continue;
    const h2h = aggregateHeadToHead(new Set([t[i].team.id, t[i + 1].team.id]), groupMatches);
    const a = h2h.get(t[i].team.id)!;
    const b = h2h.get(t[i + 1].team.id)!;
    if (a.points === b.points && a.goal_diff === b.goal_diff && a.goals_for === b.goals_for) return true;
  }
  return false;
}

/** True si el octavo y el noveno mejor tercero empatan en todo criterio implementado (corte ambiguo). */
export function thirdsCutIsAmbiguous(thirds: TeamStanding[], qualifying = 8): boolean {
  return thirds.length > qualifying && sameStats(thirds[qualifying - 1], thirds[qualifying]);
}
