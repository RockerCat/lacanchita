import { describe, it, expect } from "vitest";
import {
  resolveSlot,
  assignBestThirdSlots,
  computeGroupStandings,
  orderSourceMatchesByDestination,
  orderDestinationBySourcePairs,
  computeBracketConnections,
  computeLeafRowPositions,
  computeParentRowPositions,
  type ClassificationTeam,
  type ClassificationMatch,
  type GroupStanding,
  type TeamStanding,
  type BestThirdSlotMatch,
  type KnockoutResult,
} from "./classification";
import { BEST_THIRD_ASSIGNMENT_MATRIX, BEST_THIRD_MATCH_NUMBERS } from "./best-third-matrix";

// ── Fixtures ─────────────────────────────────────────────────────────────

function team(code: string, id: string = `id-${code}`): ClassificationTeam {
  return { id, name: `Team ${code}`, code, flag_emoji: null };
}

function standing(t: ClassificationTeam, group_code: string, overrides: Partial<TeamStanding> = {}): TeamStanding {
  return {
    team: t,
    group_code,
    played: 1, won: 1, drawn: 0, lost: 0,
    goals_for: 3, goals_against: 1, goal_diff: 2, points: 3,
    ...overrides,
  };
}

// A realistic 4-team group whose 3rd-placed team is `thirdTeam`. By default
// the group still has pending matches (played < 3 each) — most best-third
// candidate/matrix tests care about *who* is 3rd, not whether the group
// has finished, so they get this unless `complete` is set.
function groupWithThird(
  group_code: string,
  thirdTeam: ClassificationTeam,
  opts: { complete?: boolean } = {}
): GroupStanding {
  const played = opts.complete ? 3 : 1;
  const filler = (n: number) => standing(team(`${group_code}-filler${n}`), group_code, { played });
  return {
    group_code,
    teams: [filler(1), filler(2), standing(thirdTeam, group_code, { played }), filler(3)],
  };
}

function bestThirdMatch(id: string, match_number: number, awayPlaceholder: string, homePlaceholder = "Winner Group X"): BestThirdSlotMatch {
  return { id, match_number, home_placeholder: homePlaceholder, away_placeholder: awayPlaceholder };
}

// ── BEST_THIRD_ASSIGNMENT_MATRIX integrity ────────────────────────────────

describe("BEST_THIRD_ASSIGNMENT_MATRIX", () => {
  it("has all 495 combinations of 8 of the 12 groups", () => {
    expect(BEST_THIRD_ASSIGNMENT_MATRIX.size).toBe(495);
  });

  it("lists the 8 official Best-3rd round-of-32 match numbers", () => {
    expect([...BEST_THIRD_MATCH_NUMBERS].sort()).toEqual([74, 77, 79, 80, 81, 82, 85, 87]);
  });

  it("every row assigns exactly its own 8 advancing groups (a true permutation)", () => {
    for (const [key, assignment] of BEST_THIRD_ASSIGNMENT_MATRIX) {
      const advancing = key.split("").sort();
      const assigned = Object.values(assignment).sort();
      expect(assigned).toEqual(advancing);
      expect(Object.keys(assignment).map(Number).sort()).toEqual([...BEST_THIRD_MATCH_NUMBERS].sort());
    }
  });
});

// ── assignBestThirdSlots + resolveSlot (candidate / matrix selection) ────

describe("Best 3rd placeholder resolution", () => {
  it("resolves directly when exactly one candidate is eligible", () => {
    // M81 allows B/E/F/I/J. Only group B is among the (8) advancing thirds.
    const advancing = ["A", "C", "D", "G", "H", "K", "L", "B"];
    const groups = advancing.map((g) => groupWithThird(g, team(g)));
    const matches = [bestThirdMatch("m81", 81, "Best 3rd (B/E/F/I/J)")];

    const assignment = assignBestThirdSlots(groups, matches);
    const resolved = assignment.get("m81:away") ?? null;

    expect(resolved?.team.code).toBe("B");

    const slot = resolveSlot(null, "Best 3rd (B/E/F/I/J)", groups, resolved);
    expect(slot).toEqual({ kind: "projected", team: team("B") });
  });

  it("applies the official FIFA matrix when multiple candidates qualify", () => {
    // Combination EFGHIJKL (row 1 of the official table): M81 (B/E/F/I/J)
    // has 4 candidates among the advancing groups — E, F, I, J — and the
    // matrix breaks the tie in favor of group I, not alphabetical order.
    const advancing = ["E", "F", "G", "H", "I", "J", "K", "L"];
    const groups = advancing.map((g) => groupWithThird(g, team(g)));
    const matches = [bestThirdMatch("m81", 81, "Best 3rd (B/E/F/I/J)")];

    const assignment = assignBestThirdSlots(groups, matches);
    expect(assignment.get("m81:away")?.team.code).toBe("I");
  });

  it("keeps the placeholder and marks it pending when info is insufficient", () => {
    // Only 5 groups have a recorded third (fewer than the 8 the matrix
    // requires). M81 still has 3 ambiguous candidates (E, F, I) but no
    // matrix row can apply yet — must NOT guess alphabetically.
    const advancing = ["E", "F", "G", "H", "I"];
    const groups = advancing.map((g) => groupWithThird(g, team(g)));
    const matches = [bestThirdMatch("m81", 81, "Best 3rd (B/E/F/I/J)")];

    const assignment = assignBestThirdSlots(groups, matches);
    expect(assignment.has("m81:away")).toBe(false);

    const slot = resolveSlot(null, "Best 3rd (B/E/F/I/J)", groups, assignment.get("m81:away") ?? null);
    expect(slot).toEqual({ kind: "unresolved", label: "Best 3rd (B/E/F/I/J)", pending: true });
  });

  it("ignores a candidate without a real team_id", () => {
    const badTeam = team("E", "");
    const groups = [
      groupWithThird("B", team("B")),
      groupWithThird("E", badTeam),
    ];
    const matches = [bestThirdMatch("m81", 81, "Best 3rd (B/E/F/I/J)")];

    const assignment = assignBestThirdSlots(groups, matches);
    expect(assignment.get("m81:away")?.team.code).toBe("B");
  });

  it("does not disturb an already-official slot on the same match (mixed bracket)", () => {
    const usa = team("USA");
    const advancing = ["A", "C", "D", "G", "H", "K", "L", "B"];
    const groups = advancing.map((g) => groupWithThird(g, team(g)));
    const matches = [bestThirdMatch("m81", 81, "Best 3rd (B/E/F/I/J)", "Winner Group D")];

    const assignment = assignBestThirdSlots(groups, matches);
    const homeSlot = resolveSlot(usa, "Winner Group D", groups);
    const awaySlot = resolveSlot(null, "Best 3rd (B/E/F/I/J)", groups, assignment.get("m81:away") ?? null);

    expect(homeSlot).toEqual({ kind: "official", team: usa });
    expect(awaySlot.kind).toBe("projected");
    expect(awaySlot.kind === "projected" && awaySlot.team.code).toBe("B");
  });

  it("M81: USA vs Best 3rd (B/E/F/I/J) resolves to a real team once the combination is defined", () => {
    const usa = team("USA");
    const advancing = ["E", "F", "G", "H", "I", "J", "K", "L"];
    const groups = advancing.map((g) => groupWithThird(g, team(g)));
    const matches = [bestThirdMatch("m81", 81, "Best 3rd (B/E/F/I/J)", "Winner Group D")];

    const assignment = assignBestThirdSlots(groups, matches);
    const homeSlot = resolveSlot(usa, "Winner Group D", groups);
    const awaySlot = resolveSlot(null, "Best 3rd (B/E/F/I/J)", groups, assignment.get("m81:away") ?? null);

    expect(homeSlot).toEqual({ kind: "official", team: usa });
    expect(awaySlot.kind).toBe("projected");
    expect(awaySlot.kind === "projected" && awaySlot.team.code).toBe("I");
    expect(awaySlot.kind === "projected" && awaySlot.team.id).not.toBe("");
  });
});

// ── Reconciliation: official vs projected based on group completion ──────

describe("Official/projected reconciliation by group completion", () => {
  it("keeps Winner Group X projected (🔮) while its group still has pending matches", () => {
    const groupA: GroupStanding = {
      group_code: "A",
      teams: [
        standing(team("MEX"), "A", { points: 6, played: 2 }),
        standing(team("CAN"), "A", { points: 4, played: 2 }),
        standing(team("BRA"), "A", { points: 1, played: 2 }),
        standing(team("PAN"), "A", { points: 0, played: 2 }),
      ],
    };
    expect(resolveSlot(null, "Winner Group A", [groupA])).toEqual({
      kind: "projected",
      team: team("MEX"),
    });
  });

  it("upgrades Winner Group X to official once every match in the group is finished", () => {
    const groupA: GroupStanding = {
      group_code: "A",
      teams: [
        standing(team("MEX"), "A", { points: 9, played: 3 }),
        standing(team("CAN"), "A", { points: 6, played: 3 }),
        standing(team("BRA"), "A", { points: 3, played: 3 }),
        standing(team("PAN"), "A", { points: 0, played: 3 }),
      ],
    };
    expect(resolveSlot(null, "Winner Group A", [groupA])).toEqual({
      kind: "official",
      team: team("MEX"),
    });
  });

  it("upgrades Runner-up Group X to official once the group is finished", () => {
    const groupA: GroupStanding = {
      group_code: "A",
      teams: [
        standing(team("MEX"), "A", { points: 9, played: 3 }),
        standing(team("CAN"), "A", { points: 6, played: 3 }),
        standing(team("BRA"), "A", { points: 3, played: 3 }),
        standing(team("PAN"), "A", { points: 0, played: 3 }),
      ],
    };
    expect(resolveSlot(null, "Runner-up Group A", [groupA])).toEqual({
      kind: "official",
      team: team("CAN"),
    });
  });

  it("upgrades a Best 3rd projection to official once its specific source group is finished", () => {
    // Only group B's match count flips to "complete" — the other 7
    // advancing groups stay in progress, which must NOT matter: the
    // reconciliation only cares about the chosen team's own group.
    const advancing = ["A", "C", "D", "G", "H", "K", "L"];
    const groups = [
      ...advancing.map((g) => groupWithThird(g, team(g))),
      groupWithThird("B", team("B"), { complete: true }),
    ];
    const matches = [bestThirdMatch("m81", 81, "Best 3rd (B/E/F/I/J)")];

    const assignment = assignBestThirdSlots(groups, matches);
    const slot = resolveSlot(null, "Best 3rd (B/E/F/I/J)", groups, assignment.get("m81:away") ?? null);

    expect(slot).toEqual({ kind: "official", team: team("B") });
  });

  it("keeps a Best 3rd projection (🔮) while its source group still has pending matches", () => {
    const advancing = ["A", "C", "D", "G", "H", "K", "L", "B"];
    const groups = advancing.map((g) => groupWithThird(g, team(g))); // all incomplete (default)
    const matches = [bestThirdMatch("m81", 81, "Best 3rd (B/E/F/I/J)")];

    const assignment = assignBestThirdSlots(groups, matches);
    const slot = resolveSlot(null, "Best 3rd (B/E/F/I/J)", groups, assignment.get("m81:away") ?? null);

    expect(slot).toEqual({ kind: "projected", team: team("B") });
  });

  it("does not touch an unresolved/pending placeholder — reconciliation only applies to resolved projections", () => {
    const advancing = ["E", "F", "G", "H", "I"]; // fewer than 8 → matrix can't apply
    const groups = advancing.map((g) => groupWithThird(g, team(g), { complete: true }));
    const matches = [bestThirdMatch("m81", 81, "Best 3rd (B/E/F/I/J)")];

    const assignment = assignBestThirdSlots(groups, matches);
    const slot = resolveSlot(null, "Best 3rd (B/E/F/I/J)", groups, assignment.get("m81:away") ?? null);

    expect(slot).toEqual({ kind: "unresolved", label: "Best 3rd (B/E/F/I/J)", pending: true });
  });
});

// ── Real-data regression: Group B and Group C fully finished (6/6) ───────
// Reproduces the exact scenario reported in production: Canadá/Suiza
// (Group B) and Brasil/Marruecos (Group C) must render as official, with
// no 🔮, once their group's 6 matches are all finished. Goes through the
// full real pipeline (raw ClassificationMatch[] → computeGroupStandings →
// resolveSlot), not hand-built GroupStanding fixtures, so it also catches
// any wiring bug between match data and the resolved standings.

describe("Group B (CAN/SUI) and Group C (BRA/MAR) fully finished — real pipeline", () => {
  function finished(homeCode: string, awayCode: string, hg: number, ag: number, group_code: string): ClassificationMatch {
    return {
      group_code,
      home_score: hg,
      away_score: ag,
      status: "finished",
      home_team: team(homeCode),
      away_team: team(awayCode),
    };
  }

  const groupBMatches: ClassificationMatch[] = [
    finished("CAN", "BIH", 2, 0, "B"),
    finished("QAT", "SUI", 0, 3, "B"),
    finished("SUI", "BIH", 2, 1, "B"),
    finished("CAN", "QAT", 1, 0, "B"),
    finished("SUI", "CAN", 1, 1, "B"),
    finished("BIH", "QAT", 0, 0, "B"),
  ];

  const groupCMatches: ClassificationMatch[] = [
    finished("BRA", "HAI", 3, 0, "C"),
    finished("MAR", "SCO", 2, 1, "C"),
    finished("BRA", "MAR", 1, 1, "C"),
    finished("HAI", "SCO", 0, 0, "C"),
    finished("BRA", "SCO", 2, 0, "C"),
    finished("MAR", "HAI", 1, 0, "C"),
  ];

  const groups = computeGroupStandings([...groupBMatches, ...groupCMatches]);

  it("Group B is 6/6 finished, with Suiza 1st and Canadá 2nd", () => {
    const groupB = groups.find((g) => g.group_code === "B")!;
    expect(groupB.teams.every((t) => t.played === 3)).toBe(true);
    expect(groupB.teams[0].team.code).toBe("SUI");
    expect(groupB.teams[1].team.code).toBe("CAN");
  });

  it("Group C is 6/6 finished, with Brasil 1st and Marruecos 2nd", () => {
    const groupC = groups.find((g) => g.group_code === "C")!;
    expect(groupC.teams.every((t) => t.played === 3)).toBe(true);
    expect(groupC.teams[0].team.code).toBe("BRA");
    expect(groupC.teams[1].team.code).toBe("MAR");
  });

  it("Suiza and Canadá resolve as official (no 🔮) for M84/M73/M88-style Group B slots", () => {
    expect(resolveSlot(null, "Winner Group B", groups)).toEqual({ kind: "official", team: team("SUI") });
    expect(resolveSlot(null, "Runner-up Group B", groups)).toEqual({ kind: "official", team: team("CAN") });
  });

  it("Brasil and Marruecos resolve as official (no 🔮) for Group C slots", () => {
    expect(resolveSlot(null, "Winner Group C", groups)).toEqual({ kind: "official", team: team("BRA") });
    expect(resolveSlot(null, "Runner-up Group C", groups)).toEqual({ kind: "official", team: team("MAR") });
  });
});

// ── Existing placeholder kinds must keep working unmodified ──────────────

describe("Winner Group / Runner-up Group / official slots (regression)", () => {
  const groupA: GroupStanding = {
    group_code: "A",
    teams: [
      standing(team("MEX"), "A", { points: 9, played: 2 }),
      standing(team("CAN"), "A", { points: 6, played: 2 }),
      standing(team("BRA"), "A", { points: 3, played: 2 }),
      standing(team("PAN"), "A", { points: 0, played: 2 }),
    ],
  };

  it("resolves Winner Group X to the group leader", () => {
    expect(resolveSlot(null, "Winner Group A", [groupA])).toEqual({
      kind: "projected",
      team: team("MEX"),
    });
  });

  it("resolves Runner-up Group X to the group's 2nd place", () => {
    expect(resolveSlot(null, "Runner-up Group A", [groupA])).toEqual({
      kind: "projected",
      team: team("CAN"),
    });
  });

  it("returns official as soon as a real team is confirmed, ignoring the placeholder", () => {
    const usa = team("USA");
    expect(resolveSlot(usa, "Best 3rd (B/E/F/I/J)", [])).toEqual({ kind: "official", team: usa });
  });

  it("an unrecognized placeholder (e.g. a future Winner M## cross-reference) stays plainly unresolved", () => {
    expect(resolveSlot(null, "Winner M73", [])).toEqual({ kind: "unresolved", label: "Winner M73" });
  });

  it("no placeholder at all falls back to 'Por definir'", () => {
    expect(resolveSlot(null, null, [])).toEqual({ kind: "unresolved", label: "Por definir" });
  });
});

// ── resolveSlot — Winner Mxx / Loser Mxx (generic, not tied to real match numbers) ──
// These tests validate the primitive that both the Copa/Bracket view (CaminoTabs calls
// resolveSlot directly) and server-side enrichment (enrichWithResolvedTeams calls
// resolveSlot internally) rely on. Proving the primitive covers all 7 scenarios
// also proves both paths are covered, since both go through this same function.

describe("resolveSlot — Winner Mxx / Loser Mxx knockout propagation", () => {
  const WINNER = team("WIN");
  const LOSER  = team("LOS");

  // A finished match (arbitrary number N=42) with a clear winner and loser.
  const withResult: Map<number, KnockoutResult> = new Map([
    [42, { winner: WINNER, loser: LOSER }],
  ]);

  // Scenario 1 — finished match with winner → Winner Mxx resolves to the winning team
  it("1. Winner Mxx resolves to the winning team when the match result is known", () => {
    expect(resolveSlot(null, "Winner M42", [], null, withResult)).toEqual({
      kind: "official",
      team: WINNER,
    });
  });

  // Scenario 2 — finished match with loser → Loser Mxx resolves to the losing team
  it("2. Loser Mxx resolves to the losing team when the match result is known", () => {
    expect(resolveSlot(null, "Loser M42", [], null, withResult)).toEqual({
      kind: "official",
      team: LOSER,
    });
  });

  // Scenario 3 — match not yet finished → placeholder stays unresolved
  it("3. Winner Mxx stays unresolved when the source match is not in the results map", () => {
    expect(resolveSlot(null, "Winner M99", [], null, withResult)).toEqual({
      kind: "unresolved",
      label: "Winner M99",
    });
  });

  // Scenario 4 — draw → not added to results map → placeholder stays unresolved
  // (builds the empty-map case that represents a match that drew — the caller
  //  simply never inserts draws into knockoutResults)
  it("4. Winner Mxx stays unresolved for draws — draws are never added to knockoutResults", () => {
    const empty: Map<number, KnockoutResult> = new Map(); // no result for match 7 — it drew
    expect(resolveSlot(null, "Winner M7", [], null, empty)).toEqual({
      kind: "unresolved",
      label: "Winner M7",
    });
  });

  // Scenario 5 — both slots of a single destination match resolve independently
  it("5. Both home and away Winner Mxx placeholders resolve when both source matches are in the map", () => {
    const TEAM_A = team("AAA");
    const TEAM_B = team("BBB");
    const twoResults: Map<number, KnockoutResult> = new Map([
      [10, { winner: TEAM_A, loser: TEAM_B }],
      [11, { winner: TEAM_B, loser: TEAM_A }],
    ]);
    expect(resolveSlot(null, "Winner M10", [], null, twoResults)).toEqual({ kind: "official", team: TEAM_A });
    expect(resolveSlot(null, "Winner M11", [], null, twoResults)).toEqual({ kind: "official", team: TEAM_B });
  });

  it("confirmed team in the slot always takes precedence over knockoutResults", () => {
    const confirmed = team("CFM");
    expect(resolveSlot(confirmed, "Winner M42", [], null, withResult)).toEqual({
      kind: "official",
      team: confirmed,
    });
  });

  it("match number key is parsed as a number — M10 and M1 are distinct keys", () => {
    const oneResult: Map<number, KnockoutResult> = new Map([[10, { winner: WINNER, loser: LOSER }]]);
    expect(resolveSlot(null, "Winner M10", [], null, oneResult).kind).toBe("official");
    expect(resolveSlot(null, "Winner M1",  [], null, oneResult).kind).toBe("unresolved");
  });
});

// ── orderSourceMatchesByDestination — bracket connector ordering ─────────
// Reproduces the exact bug reported: the bracket view drew its connector
// lines assuming consecutive-by-index pairs (source[0]+source[1] → dest[0],
// ...), which does NOT hold for the real FIFA 2026 bracket — e.g. M73 and
// M74 are adjacent by match_number but feed two different matches (M90
// and M89 respectively). Every assertion below is driven by the matches'
// own "Winner M##" placeholders, never by array position.

describe("orderSourceMatchesByDestination", () => {
  function r32(match_number: number): { id: string; match_number: number } {
    return { id: `m${match_number}`, match_number };
  }
  function dest(match_number: number, homeSrc: number, awaySrc: number) {
    return { match_number, home_placeholder: `Winner M${homeSrc}`, away_placeholder: `Winner M${awaySrc}` };
  }

  // The 16 real round-of-32 match numbers, deliberately listed in plain
  // match_number order — i.e. exactly what the DB query returns, and
  // exactly the order that produced the bug.
  const roundOf32 = [73, 74, 75, 76, 77, 78, 79, 80, 81, 82, 83, 84, 85, 86, 87, 88].map(r32);

  // The real round-of-16 feed table (also straight from the migration).
  const roundOf16 = [
    dest(89, 74, 77),
    dest(90, 73, 75),
    dest(91, 76, 78),
    dest(92, 79, 80),
    dest(93, 83, 84),
    dest(94, 81, 82),
    dest(95, 86, 88),
    dest(96, 85, 87),
  ];

  it("never infers a pairing from consecutive array index — M73/M74 are NOT paired", () => {
    const ordered = orderSourceMatchesByDestination(roundOf32, roundOf16);
    const indexOf = (n: number) => ordered.findIndex((m) => m.match_number === n);

    // If the old (buggy) consecutive-index behaviour were still in effect,
    // M73 and M74 (adjacent in raw match_number order) would land on the
    // same connector pair. They must NOT, because M73→M90 and M74→M89.
    const pairIndex = (i: number) => Math.floor(i / 2);
    expect(pairIndex(indexOf(73))).not.toBe(pairIndex(indexOf(74)));
  });

  it("M74 and M77 end up adjacent, in the position that feeds M89", () => {
    const ordered = orderSourceMatchesByDestination(roundOf32, roundOf16);
    // M89 is roundOf16[0], so its two sources must occupy ordered[0] and ordered[1].
    expect(ordered.slice(0, 2).map((m) => m.match_number).sort()).toEqual([74, 77]);
  });

  it("M73 and M75 end up adjacent, in the position that feeds M90", () => {
    const ordered = orderSourceMatchesByDestination(roundOf32, roundOf16);
    // M90 is roundOf16[1], so its two sources must occupy ordered[2] and ordered[3].
    expect(ordered.slice(2, 4).map((m) => m.match_number).sort()).toEqual([73, 75]);
  });

  it("reproduces every round-of-32 pair exactly, for all 8 round-of-16 destinations", () => {
    const ordered = orderSourceMatchesByDestination(roundOf32, roundOf16);
    const pairs = Array.from({ length: 8 }, (_, i) =>
      ordered.slice(i * 2, i * 2 + 2).map((m) => m.match_number).sort((a, b) => a - b)
    );
    expect(pairs).toEqual([
      [74, 77], [73, 75], [76, 78], [79, 80],
      [83, 84], [81, 82], [86, 88], [85, 87],
    ]);
  });

  it("M89 and M90 end up adjacent, in the position that feeds M97 (round of 16 → quarter finals)", () => {
    const roundOf16Matches = [89, 90, 91, 92, 93, 94, 95, 96].map(r32);
    const quarterFinals = [
      dest(97, 89, 90),
      dest(98, 93, 94),
      dest(99, 91, 92),
      dest(100, 95, 96),
    ];
    const ordered = orderSourceMatchesByDestination(roundOf16Matches, quarterFinals);
    expect(ordered.slice(0, 2).map((m) => m.match_number).sort()).toEqual([89, 90]);
    expect(ordered.slice(2, 4).map((m) => m.match_number).sort()).toEqual([93, 94]);
    expect(ordered.slice(4, 6).map((m) => m.match_number).sort()).toEqual([91, 92]);
    expect(ordered.slice(6, 8).map((m) => m.match_number).sort()).toEqual([95, 96]);
  });

  it("a Loser M## placeholder (third place) is matched the same way as Winner M##", () => {
    const semiFinals = [89, 90].map(r32);
    const thirdPlace = [{ match_number: 103, home_placeholder: "Loser M90", away_placeholder: "Loser M89" }];
    const ordered = orderSourceMatchesByDestination(semiFinals, thirdPlace);
    expect(ordered.map((m) => m.match_number)).toEqual([90, 89]);
  });

  it("falls back to original order for source matches the next round doesn't reference yet, without dropping any", () => {
    const ordered = orderSourceMatchesByDestination(roundOf32, []);
    expect(ordered.map((m) => m.match_number)).toEqual(roundOf32.map((m) => m.match_number));
    expect(ordered).toHaveLength(16);
  });
});

// ── Full bracket visual order + connections (M73–M104) ───────────────────
// Reproduces the third-round bug report: with Octavos pinned to plain
// match_number order, Cuartos' real pairs (M97/M98, M99/M100) landed on
// non-adjacent rows, which forced overlapping/"trunk" connector lines.
// The fix (per explicit user decision) is to use CUARTOS as the anchor
// instead — it's shown in plain match_number order (M97..M100), and every
// other column is derived from it so EVERY connection's two real children
// always end up on adjacent rows. No lanes, no diagonals, ever needed.

describe("Full bracket cascade: Cuartos as anchor, Octavos/Dieciseisavos/Semis/Final derived", () => {
  function num(match_number: number): { id: string; match_number: number } {
    return { id: `m${match_number}`, match_number };
  }
  function feed(match_number: number, homeSrc: number, awaySrc: number) {
    return { id: `m${match_number}`, match_number, home_placeholder: `Winner M${homeSrc}`, away_placeholder: `Winner M${awaySrc}` };
  }

  const roundOf32 = [73, 74, 75, 76, 77, 78, 79, 80, 81, 82, 83, 84, 85, 86, 87, 88].map(num);
  // Round of 16 as returned by the DB — plain match_number order — with
  // its real feeds from round of 32 (migration 035).
  const roundOf16 = [
    feed(89, 74, 77),
    feed(90, 73, 75),
    feed(91, 76, 78),
    feed(92, 79, 80),
    feed(93, 83, 84),
    feed(94, 81, 82),
    feed(95, 86, 88),
    feed(96, 85, 87),
  ];
  // Quarter finals as returned by the DB — plain match_number order — THE ANCHOR.
  const quarterFinals = [
    feed(97, 89, 90),
    feed(98, 93, 94),
    feed(99, 91, 92),
    feed(100, 95, 96),
  ];
  const semiFinals = [feed(101, 97, 98), feed(102, 99, 100)];
  const finals = [feed(104, 101, 102)];

  const orderedQF     = [...quarterFinals].sort((a, b) => (a.match_number ?? 0) - (b.match_number ?? 0));
  const orderedR16    = orderSourceMatchesByDestination(roundOf16, orderedQF);
  const orderedR32    = orderSourceMatchesByDestination(roundOf32, orderedR16);
  const orderedSF     = orderDestinationBySourcePairs(orderedQF, semiFinals);
  const orderedFinals = orderDestinationBySourcePairs(orderedSF, finals);

  const r32ToR16  = computeBracketConnections(orderedR32, orderedR16);
  const r16ToQf   = computeBracketConnections(orderedR16, orderedQF);
  const qfToSf    = computeBracketConnections(orderedQF, orderedSF);
  const sfToFinal = computeBracketConnections(orderedSF, orderedFinals);

  it("Cuartos renders as M97, M98, M99, M100 — plain match_number order, the anchor", () => {
    expect(orderedQF.map((m) => m.match_number)).toEqual([97, 98, 99, 100]);
  });

  it("Octavos renders as M89, M90, M93, M94, M91, M92, M95, M96 — derived backwards from Cuartos", () => {
    expect(orderedR16.map((m) => m.match_number)).toEqual([89, 90, 93, 94, 91, 92, 95, 96]);
  });

  it("Dieciseisavos renders as 74,77,73,75,83,84,81,82,76,78,79,80,86,88,85,87", () => {
    expect(orderedR32.map((m) => m.match_number)).toEqual(
      [74, 77, 73, 75, 83, 84, 81, 82, 76, 78, 79, 80, 86, 88, 85, 87]
    );
  });

  it("Semifinales stays in plain order [101, 102], derived forwards from Cuartos", () => {
    expect(orderedSF.map((m) => m.match_number)).toEqual([101, 102]);
  });

  it("Final renders as [104]", () => {
    expect(orderedFinals.map((m) => m.match_number)).toEqual([104]);
  });

  it("M76/M78 feed M91's row, and not M93's", () => {
    const m91Row = orderedR16.findIndex((m) => m.match_number === 91);
    const m93Row = orderedR16.findIndex((m) => m.match_number === 93);
    const m91Connection = r32ToR16.find((c) => c.destRow === m91Row)!;
    const m93Connection = r32ToR16.find((c) => c.destRow === m93Row)!;

    expect(m91Connection.srcRows.map((r) => orderedR32[r].match_number).sort()).toEqual([76, 78]);
    expect(m93Connection.srcRows.map((r) => orderedR32[r].match_number).sort()).toEqual([83, 84]);
  });

  it("M79/M80 feed M92's row, and not M94's", () => {
    const m92Row = orderedR16.findIndex((m) => m.match_number === 92);
    const m94Row = orderedR16.findIndex((m) => m.match_number === 94);
    const m92Connection = r32ToR16.find((c) => c.destRow === m92Row)!;
    const m94Connection = r32ToR16.find((c) => c.destRow === m94Row)!;

    expect(m92Connection.srcRows.map((r) => orderedR32[r].match_number).sort()).toEqual([79, 80]);
    expect(m94Connection.srcRows.map((r) => orderedR32[r].match_number).sort()).toEqual([81, 82]);
  });

  it("M83/M84 feed M93's row", () => {
    const m93Row = orderedR16.findIndex((m) => m.match_number === 93);
    const connection = r32ToR16.find((c) => c.destRow === m93Row)!;
    expect(connection.srcRows.map((r) => orderedR32[r].match_number).sort()).toEqual([83, 84]);
  });

  it("M81/M82 feed M94's row", () => {
    const m94Row = orderedR16.findIndex((m) => m.match_number === 94);
    const connection = r32ToR16.find((c) => c.destRow === m94Row)!;
    expect(connection.srcRows.map((r) => orderedR32[r].match_number).sort()).toEqual([81, 82]);
  });

  it("M97/M98 feed M101's row, on adjacent rows", () => {
    const m101Row = orderedSF.findIndex((m) => m.match_number === 101);
    const connection = qfToSf.find((c) => c.destRow === m101Row)!;
    expect(connection.srcRows.map((r) => orderedQF[r].match_number).sort()).toEqual([97, 98]);
    expect(Math.abs(connection.srcRows[0] - connection.srcRows[1])).toBe(1);
  });

  it("M99/M100 feed M102's row, on adjacent rows", () => {
    const m102Row = orderedSF.findIndex((m) => m.match_number === 102);
    const connection = qfToSf.find((c) => c.destRow === m102Row)!;
    expect(connection.srcRows.map((r) => orderedQF[r].match_number).sort((a, b) => a! - b!)).toEqual([99, 100]);
    expect(Math.abs(connection.srcRows[0] - connection.srcRows[1])).toBe(1);
  });

  it("M101/M102 feed M104's row, on adjacent rows", () => {
    const connection = sfToFinal.find((c) => c.destRow === 0)!;
    expect(connection.srcRows.map((r) => orderedSF[r].match_number).sort()).toEqual([101, 102]);
    expect(Math.abs(connection.srcRows[0] - connection.srcRows[1])).toBe(1);
  });

  it("every single connection in the bracket — at every round — has its two real children on adjacent rows, never further apart", () => {
    for (const connections of [r32ToR16, r16ToQf, qfToSf, sfToFinal]) {
      for (const { srcRows } of connections) {
        expect(Math.abs(srcRows[0] - srcRows[1])).toBe(1);
      }
    }
  });

  it("no connection is ever inferred from consecutive row index — every srcRows pair is verified against real placeholders", () => {
    for (const { srcRows, destRow } of qfToSf) {
      const expectedNumbers = [orderedSF[destRow].home_placeholder, orderedSF[destRow].away_placeholder]
        .map((p) => Number(p!.match(/M(\d+)/)![1]))
        .sort((a, b) => a - b);
      const actualNumbers = srcRows.map((r) => orderedQF[r].match_number).sort((a, b) => a! - b!);
      expect(actualNumbers).toEqual(expectedNumbers);
    }
  });
});

describe("assignConnectorLanes is gone", () => {
  it("is no longer exported from classification.ts — lanes were reverted in favor of reordering Octavos", async () => {
    const classification = await import("./classification");
    expect("assignConnectorLanes" in classification).toBe(false);
  });
});

// ── Recursive midpoint row positioning (top(parent) = avg(children)) ─────
// computeParentRowPositions() itself doesn't assume adjacency — it always
// averages the two REAL children, wherever they sit. BracketView's actual
// column orders (Cuartos as the anchor, see above) keep every real pair
// adjacent on purpose, but these tests exercise the primitive directly,
// including a deliberately non-adjacent case, to document that the math
// itself is correct independent of how any particular column happens to
// be ordered today.

describe("computeLeafRowPositions / computeParentRowPositions (recursive midpoint)", () => {
  function feed(match_number: number, homeSrc: number, awaySrc: number) {
    return { id: `m${match_number}`, match_number, home_placeholder: `Winner M${homeSrc}`, away_placeholder: `Winner M${awaySrc}` };
  }

  const ROW_H = 96;
  const quarterFinals = [89, 90, 91, 92].map((n) => ({ id: `m${n}`, match_number: n }));
  const semiFinals = [feed(101, 89, 91), feed(102, 90, 92)]; // deliberately non-adjacent children
  const finals = [feed(104, 101, 102)];

  const orderedSF = orderDestinationBySourcePairs(quarterFinals, semiFinals);
  const orderedFinals = orderDestinationBySourcePairs(orderedSF, finals);

  const qfToSf = computeBracketConnections(quarterFinals, orderedSF);
  const sfToFinal = computeBracketConnections(orderedSF, orderedFinals);

  const TOTAL_H = quarterFinals.length * ROW_H;
  const qfY = computeLeafRowPositions(quarterFinals.length, ROW_H);
  const sfY = computeParentRowPositions(qfToSf, orderedSF.length, qfY, TOTAL_H);
  const finalY = computeParentRowPositions(sfToFinal, orderedFinals.length, sfY, TOTAL_H);

  it("leaf rows are evenly spaced, centered within their own row height", () => {
    const leaves = computeLeafRowPositions(4, 100);
    expect(leaves).toEqual([50, 150, 250, 350]);
  });

  it("M101's position is the exact midpoint of its real two children, even when they're not adjacent rows", () => {
    const m89Row = quarterFinals.findIndex((m) => m.match_number === 89);
    const m91Row = quarterFinals.findIndex((m) => m.match_number === 91);
    const m101Row = orderedSF.findIndex((m) => m.match_number === 101);

    expect(Math.abs(m89Row - m91Row)).toBeGreaterThan(1); // deliberately non-adjacent, for this isolated test only
    expect(sfY[m101Row]).toBe((qfY[m89Row] + qfY[m91Row]) / 2);
  });

  it("M101 and M102 never land on the same y — no overlapping semifinal positions", () => {
    expect(sfY[0]).not.toBe(sfY[1]);
  });

  it("the Final's position is the exact midpoint of M101 and M102", () => {
    expect(finalY[0]).toBe((sfY[0] + sfY[1]) / 2);
  });

  it("layout stays correct for an arbitrary, non-standard round order — position is derived only from connections, never index", () => {
    // Simulate some other valid visual order for a 4-row round and a
    // 2-row parent round, with deliberately scrambled positions.
    const childY = [10, 500, 240, 999];
    const connections = [
      { srcRows: [1, 3] as [number, number], destRow: 0 },
      { srcRows: [0, 2] as [number, number], destRow: 1 },
    ];
    const parentY = computeParentRowPositions(connections, 2, childY, 1000);
    expect(parentY[0]).toBe((childY[1] + childY[3]) / 2);
    expect(parentY[1]).toBe((childY[0] + childY[2]) / 2);
  });

  it("falls back to even spacing (never NaN) when a row has no resolvable connection", () => {
    const childY = [0, 100];
    const parentY = computeParentRowPositions([], 2, childY, 400);
    expect(parentY).toEqual([100, 300]);
  });
});

// ── BracketView's real cascade produces adjacent rows everywhere, so its
// computed positions never need overlap-avoiding lanes. ──────────────────

describe("Real cascade (Cuartos anchor) positions: every parent's children are adjacent", () => {
  function num(match_number: number): { id: string; match_number: number } {
    return { id: `m${match_number}`, match_number };
  }
  function feed(match_number: number, homeSrc: number, awaySrc: number) {
    return { id: `m${match_number}`, match_number, home_placeholder: `Winner M${homeSrc}`, away_placeholder: `Winner M${awaySrc}` };
  }

  const ROW_H = 96;
  const roundOf32 = [73, 74, 75, 76, 77, 78, 79, 80, 81, 82, 83, 84, 85, 86, 87, 88].map(num);
  const roundOf16 = [
    feed(89, 74, 77), feed(90, 73, 75), feed(91, 76, 78), feed(92, 79, 80),
    feed(93, 83, 84), feed(94, 81, 82), feed(95, 86, 88), feed(96, 85, 87),
  ];
  const quarterFinals = [feed(97, 89, 90), feed(98, 93, 94), feed(99, 91, 92), feed(100, 95, 96)];
  const semiFinals = [feed(101, 97, 98), feed(102, 99, 100)];
  const finals = [feed(104, 101, 102)];

  const orderedQF     = [...quarterFinals].sort((a, b) => (a.match_number ?? 0) - (b.match_number ?? 0));
  const orderedR16    = orderSourceMatchesByDestination(roundOf16, orderedQF);
  const orderedR32    = orderSourceMatchesByDestination(roundOf32, orderedR16);
  const orderedSF     = orderDestinationBySourcePairs(orderedQF, semiFinals);
  const orderedFinals = orderDestinationBySourcePairs(orderedSF, finals);

  const r32ToR16  = computeBracketConnections(orderedR32, orderedR16);
  const r16ToQf   = computeBracketConnections(orderedR16, orderedQF);
  const qfToSf    = computeBracketConnections(orderedQF, orderedSF);
  const sfToFinal = computeBracketConnections(orderedSF, orderedFinals);

  const TOTAL_H = orderedR32.length * ROW_H;
  const r32Y   = computeLeafRowPositions(orderedR32.length, ROW_H);
  const r16Y   = computeParentRowPositions(r32ToR16, orderedR16.length, r32Y, TOTAL_H);
  const qfY    = computeParentRowPositions(r16ToQf, orderedQF.length, r16Y, TOTAL_H);
  const sfY    = computeParentRowPositions(qfToSf, orderedSF.length, qfY, TOTAL_H);
  const finalY = computeParentRowPositions(sfToFinal, orderedFinals.length, sfY, TOTAL_H);

  it("M101 and M102 sit at distinct y positions with no overlap, computed from adjacent QF rows", () => {
    expect(Math.abs(qfToSf[0].srcRows[0] - qfToSf[0].srcRows[1])).toBe(1);
    expect(Math.abs(qfToSf[1].srcRows[0] - qfToSf[1].srcRows[1])).toBe(1);
    expect(sfY[0]).not.toBe(sfY[1]);
  });

  it("the Final sits exactly at the midpoint of M101 and M102", () => {
    expect(finalY[0]).toBe((sfY[0] + sfY[1]) / 2);
  });
});
