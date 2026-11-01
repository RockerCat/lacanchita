import { resolveSlot, type ClassificationTeam } from "./classification";
import type { CopaMatch, CopaModel, CopaResolved } from "./format";

// Progresión del cuadro hacia la base (solo Control). Se asigna ÚNICAMENTE un equipo ausente cuando lo determinan
// resultados oficiales cerrados y sin empates sin criterio; nunca se sobrescribe un equipo ya asignado, nunca se
// actúa sobre partidos iniciados/finalizados y nunca se borra nada. Si un resultado cambió (corrección o
// reapertura) y un partido posterior quedó con un equipo que ya no corresponde, se informa como conflicto para
// resolverlo a mano: no hay propagación automática destructiva.

export type SlotSide = "home" | "away";
export type Assignment = { matchId: string; matchNumber: number | null; side: SlotSide; team: ClassificationTeam; stageName: string };
export type Conflict = { matchId: string; matchNumber: number | null; side: SlotSide; assigned: ClassificationTeam; expected: ClassificationTeam; stageName: string; locked: boolean };
export type Blocked = { matchNumber: number | null; side: SlotSide; reason: string; stageName: string };
export type AdvancePlan = { assignments: Assignment[]; conflicts: Conflict[]; blocked: Blocked[] };

const GROUP_REF = /^(?:Winner|Runner-up) Group ([A-L])$/;
const THIRD_REF = /^Best 3rd \(/;

export function planAdvance(model: CopaModel, resolved: CopaResolved): AdvancePlan {
  const plan: AdvancePlan = { assignments: [], conflicts: [], blocked: [] };
  const all = [...model.rounds, ...(model.thirdPlace ? [model.thirdPlace] : [])];
  for (const round of all) {
    for (const m of round.matches) {
      for (const side of ["home", "away"] as const) {
        const team = side === "home" ? m.home_team : m.away_team;
        const ph = side === "home" ? m.home_placeholder : m.away_placeholder;
        if (!ph) continue;
        // Qué equipo corresponde según los resultados oficiales (ignorando lo asignado en la base).
        const expected = resolveSlot(null, ph, resolved.groups, resolved.bestThirdAssignment.get(`${m.id}:${side}`) ?? null, resolved.knockoutResults);
        if (expected.kind !== "official") continue;
        const g = GROUP_REF.exec(ph);
        const unsafe = g ? resolved.tiedGroups.has(g[1]) : THIRD_REF.test(ph) ? resolved.thirdsAmbiguous || resolved.tiedGroups.size > 0 : false;
        const started = m.status !== "scheduled";
        if (team) {
          if (team.id !== expected.team.id && !unsafe) plan.conflicts.push({ matchId: m.id, matchNumber: m.match_number, side, assigned: team, expected: expected.team, stageName: round.stage.name, locked: started });
          continue;
        }
        if (unsafe) { plan.blocked.push({ matchNumber: m.match_number, side, stageName: round.stage.name, reason: "Empate sin criterio de desempate definido (juego limpio / ranking): se resuelve a mano" }); continue; }
        if (started) { plan.blocked.push({ matchNumber: m.match_number, side, stageName: round.stage.name, reason: "El partido ya no está programado" }); continue; }
        plan.assignments.push({ matchId: m.id, matchNumber: m.match_number, side, team: expected.team, stageName: round.stage.name });
      }
    }
  }
  return plan;
}

export type { CopaMatch };
