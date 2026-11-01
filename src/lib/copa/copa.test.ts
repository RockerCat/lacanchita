import { describe, expect, it } from "vitest";
import { buildCopaModel, resolveCopa, type CopaMatch, type CopaStage } from "./format";
import { planAdvance } from "./plan";
import { BEST_THIRD_MATCH_NUMBERS } from "./best-third-matrix";

const team = (id: string) => ({ id, name: `Equipo ${id}`, code: id.toUpperCase().slice(0, 3), flag_emoji: null });
const stage = (id: string, order: number, ko: boolean): CopaStage => ({ id, code: id, name: id, sort_order: order, is_knockout: ko });
let n = 0;
const match = (o: Partial<CopaMatch> & { stage_id: string }): CopaMatch => ({
  id: `m${++n}`, match_number: null, starts_at: `2027-06-${String(10 + (n % 15)).padStart(2, "0")}T18:00:00Z`, venue: null, status: "scheduled",
  home_score: null, away_score: null, home_placeholder: null, away_placeholder: null, home_team: null, away_team: null, winner_side: null,
  group_code: null, official: false, ...o,
});
// Grupo de 2 equipos: un único partido lo completa.
const grp = (g: string, a: string, b: string, hs: number | null, as: number | null, official = true): CopaMatch =>
  match({ stage_id: "g", group_code: g, home_team: team(a), away_team: team(b), home_score: hs, away_score: as, status: hs === null ? "scheduled" : "finished", official });

const STAGES = [stage("g", 1, false), stage("sf", 2, true), stage("tp", 3, true), stage("f", 4, true)];
const ko = (): CopaMatch[] => [
  match({ stage_id: "sf", match_number: 101, home_placeholder: "Winner Group A", away_placeholder: "Runner-up Group B" }),
  match({ stage_id: "sf", match_number: 102, home_placeholder: "Winner Group B", away_placeholder: "Runner-up Group A" }),
  match({ stage_id: "tp", match_number: 103, home_placeholder: "Loser M101", away_placeholder: "Loser M102" }),
  match({ stage_id: "f", match_number: 104, home_placeholder: "Winner M101", away_placeholder: "Winner M102" }),
];

describe("compatibilidad de formato", () => {
  it("sin eliminatorias → none (no hay Copa)", () => {
    expect(buildCopaModel([stage("g", 1, false)], [grp("A", "a1", "a2", 1, 0)]).kind).toBe("none");
  });
  it("eliminatoria con árbol verificable pero sin matriz de terceros → knockout, árbol ok, tercer puesto detectado", () => {
    const m = buildCopaModel(STAGES, [grp("A", "a1", "a2", 1, 0), grp("B", "b1", "b2", 2, 0), ...ko()]);
    expect(m.kind).toBe("knockout");
    expect(m.treeOk).toBe(true);
    expect(m.rounds.map((r) => r.stage.id)).toEqual(["sf", "f"]);
    expect(m.thirdPlace?.stage.id).toBe("tp");
    expect(m.reasons.join(" ")).toContain("no se aplica la matriz");
  });
  it("una final con cruces en texto libre: hay Copa por fases pero sin bracket", () => {
    const m = buildCopaModel([stage("g", 1, false), stage("f", 2, true)], [grp("A", "a1", "a2", null, null), match({ stage_id: "f", home_placeholder: "Ganador del grupo", away_placeholder: "Segundo" })]);
    expect(m.kind).toBe("knockout");
    expect(m.treeOk).toBe(false);
    expect(m.rounds).toHaveLength(1);
  });
  it("rondas que no se reducen a la mitad o referencias inexistentes invalidan el árbol", () => {
    const bad = ko().filter((x) => x.match_number !== 102);
    expect(buildCopaModel(STAGES, bad).treeOk).toBe(false);
    const badRef = ko();
    badRef[3] = { ...badRef[3], away_placeholder: "Winner M999" };
    expect(buildCopaModel(STAGES, badRef).treeOk).toBe(false);
  });
});

describe("progresión con resultados oficiales", () => {
  const setup = (groups: CopaMatch[], extra: CopaMatch[] = ko()) => {
    const model = buildCopaModel(STAGES, [...groups, ...extra]);
    return { model, resolved: resolveCopa(model) };
  };

  it("grupo completo y oficial → clasificado oficial asignable; grupo incompleto → nada", () => {
    const { model, resolved } = setup([grp("A", "a1", "a2", 2, 0), grp("B", "b1", "b2", null, null)]);
    const plan = planAdvance(model, resolved);
    expect(plan.assignments.map((a) => `${a.matchNumber}:${a.side}:${a.team.id}`).sort()).toEqual(["101:home:a1", "102:away:a2"]);
  });

  it("un marcador finalizado pero no oficial (importado) no clasifica a nadie", () => {
    const { model, resolved } = setup([grp("A", "a1", "a2", 2, 0, false), grp("B", "b1", "b2", 1, 0, false)]);
    expect(planAdvance(model, resolved).assignments).toHaveLength(0);
  });

  it("es idempotente: tras asignar, el plan ya no propone nada ni genera conflictos", () => {
    const groups = [grp("A", "a1", "a2", 2, 0), grp("B", "b1", "b2", 1, 0)];
    const first = setup(groups);
    const plan1 = planAdvance(first.model, first.resolved);
    expect(plan1.assignments).toHaveLength(4);
    const applied = ko().map((m) => {
      const mine = plan1.assignments.filter((a) => a.matchNumber === m.match_number);
      return { ...m, home_team: mine.find((a) => a.side === "home")?.team ?? null, away_team: mine.find((a) => a.side === "away")?.team ?? null };
    });
    const second = setup(groups, applied);
    const plan2 = planAdvance(second.model, second.resolved);
    expect(plan2.assignments).toHaveLength(0);
    expect(plan2.conflicts).toHaveLength(0);
  });

  it("la final solo se alimenta del ganador oficial: en vivo, cancelado o empate sin ganador de llave no avanzan", () => {
    const groups = [grp("A", "a1", "a2", 2, 0), grp("B", "b1", "b2", 1, 0)];
    const mk = (over: Partial<CopaMatch>) => ko().map((m) => (m.match_number === 101 ? { ...m, home_team: team("a1"), away_team: team("b2"), home_score: 1, away_score: 1, status: "finished" as const, official: true, ...over } : m));
    const winner = (e: CopaMatch[]) => resolveCopa(buildCopaModel(STAGES, [...groups, ...e])).knockoutResults.get(101)?.winner.id;
    expect(winner(mk({ status: "live" }))).toBeUndefined();
    expect(winner(mk({ status: "cancelled" }))).toBeUndefined();
    expect(winner(mk({}))).toBeUndefined(); // 1-1 sin ganador de llave
    expect(winner(mk({ winner_side: "away" }))).toBe("b2");
    expect(winner(mk({ home_score: 2, away_score: 1 }))).toBe("a1");
    expect(winner(mk({ official: false, home_score: 2 }))).toBeUndefined();
  });

  it("corrección posterior: si el ganador oficial cambia, la final asignada queda en conflicto (no se sobrescribe)", () => {
    const groups = [grp("A", "a1", "a2", 2, 0), grp("B", "b1", "b2", 1, 0)];
    const semi = (hs: number, as: number) => ko().map((m) => m.match_number === 101 ? { ...m, home_team: team("a1"), away_team: team("b2"), home_score: hs, away_score: as, status: "finished" as const, official: true }
      : m.match_number === 104 ? { ...m, home_team: team("a1") } : m);
    const ok = setup(groups, semi(2, 0));
    expect(planAdvance(ok.model, ok.resolved).conflicts).toHaveLength(0);
    const corrected = setup(groups, semi(0, 2)); // ahora gana b2
    const plan = planAdvance(corrected.model, corrected.resolved);
    expect(plan.conflicts).toHaveLength(1);
    expect(plan.conflicts[0]).toMatchObject({ matchNumber: 104, side: "home", assigned: { id: "a1" }, expected: { id: "b2" } });
    expect(plan.assignments.some((a) => a.matchNumber === 104 && a.side === "home")).toBe(false);
  });

  it("un empate total en el grupo no se asigna: queda bloqueado para resolverlo a mano", () => {
    const tied: CopaMatch[] = [
      match({ stage_id: "g", group_code: "A", home_team: team("a1"), away_team: team("a2"), home_score: 1, away_score: 1, status: "finished", official: true }),
      grp("B", "b1", "b2", 1, 0),
    ];
    const { model, resolved } = setup(tied);
    const plan = planAdvance(model, resolved);
    expect(resolved.tiedGroups.has("A")).toBe(true);
    expect(plan.assignments.filter((a) => a.matchNumber === 101 && a.side === "home")).toHaveLength(0);
    expect(plan.blocked.some((b) => b.matchNumber === 101)).toBe(true);
  });

  it("no asigna equipos a partidos que ya empezaron", () => {
    const started = ko().map((m) => (m.match_number === 101 ? { ...m, status: "live" as const } : m));
    const { model, resolved } = setup([grp("A", "a1", "a2", 2, 0), grp("B", "b1", "b2", 1, 0)], started);
    const plan = planAdvance(model, resolved);
    expect(plan.assignments.some((a) => a.matchNumber === 101)).toBe(false);
    expect(plan.blocked.some((b) => b.matchNumber === 101)).toBe(true);
  });

  it("determinismo: el orden de los partidos recibidos no cambia el resultado", () => {
    const all = [grp("A", "a1", "a2", 2, 0), grp("B", "b1", "b2", 1, 0), ...ko()];
    const a = planAdvance(buildCopaModel(STAGES, all), resolveCopa(buildCopaModel(STAGES, all)));
    const rev = [...all].reverse();
    const b = planAdvance(buildCopaModel(STAGES, rev), resolveCopa(buildCopaModel(STAGES, rev)));
    const key = (p: typeof a) => p.assignments.map((x) => `${x.matchNumber}${x.side}${x.team.id}`).sort();
    expect(key(b)).toEqual(key(a));
  });
});

describe("formato Mundial: mejores terceros", () => {
  const LETTERS = "ABCDEFGHIJKL".split("");
  const stagesWC: CopaStage[] = [stage("g", 1, false), stage("r32", 2, true), stage("r16", 3, true), stage("qf", 4, true), stage("sf", 5, true), stage("tp", 6, true), stage("f", 7, true)];
  const thirdSlotAllowed: Record<number, string> = { 74: "A/B/C/D/F", 77: "C/D/F/G/H", 79: "C/E/F/H/I", 80: "E/H/I/J/K", 81: "B/E/F/I/J", 82: "A/E/H/I/J", 85: "E/F/G/I/J", 87: "D/E/I/J/L" };
  const wc = (groupsMatches: CopaMatch[]): CopaMatch[] => {
    const out = [...groupsMatches];
    const slots = [...Array(16)].map((_, i) => 73 + i);
    slots.forEach((num, i) => {
      const slot = thirdSlotAllowed[num];
      out.push(match({ stage_id: "r32", match_number: num, home_placeholder: slot ? `Winner Group ${LETTERS[i % 12]}` : `Winner Group ${LETTERS[i % 12]}`, away_placeholder: slot ? `Best 3rd (${slot})` : `Runner-up Group ${LETTERS[(i + 1) % 12]}` }));
    });
    [...Array(8)].forEach((_, i) => out.push(match({ stage_id: "r16", match_number: 89 + i, home_placeholder: `Winner M${73 + 2 * i}`, away_placeholder: `Winner M${74 + 2 * i}` })));
    [...Array(4)].forEach((_, i) => out.push(match({ stage_id: "qf", match_number: 97 + i, home_placeholder: `Winner M${89 + 2 * i}`, away_placeholder: `Winner M${90 + 2 * i}` })));
    [...Array(2)].forEach((_, i) => out.push(match({ stage_id: "sf", match_number: 101 + i, home_placeholder: `Winner M${97 + 2 * i}`, away_placeholder: `Winner M${98 + 2 * i}` })));
    out.push(match({ stage_id: "tp", match_number: 103, home_placeholder: "Loser M101", away_placeholder: "Loser M102" }));
    out.push(match({ stage_id: "f", match_number: 104, home_placeholder: "Winner M101", away_placeholder: "Winner M102" }));
    return out;
  };
  // 12 grupos de 2 equipos; el «tercero» necesita grupos de 3: usamos 3 equipos por grupo (3 partidos).
  const groupsOf3 = (pointsOfThird: (g: string) => number): CopaMatch[] => LETTERS.flatMap((g) => {
    const [x, y, z] = [`${g}1`, `${g}2`, `${g}3`];
    const zWins = pointsOfThird(g); // goles del tercero en su victoria sobre el 2.º: varía el orden de los terceros
    return [
      grp(g, x, y, 3, 0), grp(g, x, z, 2, 0), grp(g, y, z, zWins === 0 ? 1 : 0, zWins === 0 ? 1 : zWins),
    ];
  });

  it("estructura completa → worldcup y se aplica la matriz; incompleta → knockout sin matriz", () => {
    const full = buildCopaModel(stagesWC, wc(groupsOf3(() => 1)));
    expect(full.kind).toBe("worldcup");
    expect(full.treeOk).toBe(true);
    expect([...BEST_THIRD_MATCH_NUMBERS]).toHaveLength(8);
    const withoutLetter = buildCopaModel(stagesWC, wc(groupsOf3(() => 1)).filter((m) => m.group_code !== "L"));
    expect(withoutLetter.kind).toBe("knockout");
    expect(resolveCopa(withoutLetter).bestThirdAssignment.size).toBe(0);
  });

  it("con los 12 grupos cerrados y 8 terceros determinados, cada cruce recibe un tercero de los permitidos (determinista)", () => {
    // Terceros con goles distintos por grupo → el corte del 8.º/9.º no empata.
    const goalsByGroup: Record<string, number> = { A: 9, B: 8, C: 7, D: 6, E: 5, F: 4, G: 3, H: 2, I: 1, J: 0, K: 0, L: 0 };
    const gm = LETTERS.flatMap((g) => {
      const w = goalsByGroup[g] ?? 0;
      return [grp(g, `${g}1`, `${g}2`, 3, 0), grp(g, `${g}1`, `${g}3`, 2, 0), grp(g, `${g}2`, `${g}3`, 0, w + 1)];
    });
    const all = wc(gm);
    const model = buildCopaModel(stagesWC, all);
    const r1 = resolveCopa(model);
    const model2 = buildCopaModel(stagesWC, [...all].reverse());
    const r2 = resolveCopa(model2);
    const byNumber = (mdl: typeof model, r: typeof r1) =>
      [...r.bestThirdAssignment].map(([k, v]) => `${mdl.rounds[0].matches.find((x) => x.id === k.split(":")[0])!.match_number}:${v.group_code}`).sort();
    expect(r1.bestThirdAssignment.size).toBeGreaterThan(0);
    expect(byNumber(model2, r2)).toEqual(byNumber(model, r1));
    for (const [key, ts] of r1.bestThirdAssignment) {
      const matchId = key.split(":")[0];
      const m = model.rounds[0].matches.find((x) => x.id === matchId)!;
      const allowed = /\((.+)\)/.exec(m.away_placeholder ?? "")![1].split("/");
      expect(allowed).toContain(ts.group_code);
    }
  });
});
