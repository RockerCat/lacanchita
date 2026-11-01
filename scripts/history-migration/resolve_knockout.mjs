// Resuelve los equipos de las 32 eliminatorias del Mundial 2026 con la lógica ORIGINAL
// de La Penúltima (el-var/src/lib/enrich.ts + classification.ts + best-third-matrix.ts).
// Copia esos tres archivos a un directorio temporal (sin modificar el-var), ajusta las
// rutas de import y los ejecuta con Node >= 22 (--experimental-strip-types).
//
// Uso:
//   node --experimental-strip-types scripts/history-migration/resolve_knockout.mjs \
//        --legacy-lib ../el-var/src/lib --input <matches.json> --output <resolved.json>
// <matches.json> lo genera prepare_wc2026_import.py (partidos y equipos; sin datos personales).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const arg = (name) => {
  const i = process.argv.indexOf(name);
  if (i < 0 || !process.argv[i + 1]) throw new Error(`falta ${name}`);
  return process.argv[i + 1];
};
const legacyLib = path.resolve(arg("--legacy-lib"));
const input = JSON.parse(fs.readFileSync(arg("--input"), "utf8"));
const outPath = arg("--output");

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "legacy-enrich-"));
for (const f of ["enrich", "classification", "best-third-matrix"]) {
  const src = fs.readFileSync(path.join(legacyLib, `${f}.ts`), "utf8")
    .replace(/from "\.\/(classification|best-third-matrix)"/g, 'from "./$1.ts"');
  fs.writeFileSync(path.join(tmp, `${f}.ts`), src);
}
const { enrichWithResolvedTeams } = await import(pathToFileURL(path.join(tmp, "enrich.ts")));
const { computeGroupStandings, computeBestThirds } = await import(pathToFileURL(path.join(tmp, "classification.ts")));
fs.rmSync(tmp, { recursive: true, force: true });

const teams = new Map(input.teams.map((t) => [t.id, { id: t.id, name: t.name, code: t.code, flag_emoji: t.flag_emoji }]));
// Mismo orden que las páginas originales: starts_at ASC (match_number como desempate estable).
const matches = input.matches
  .map((m) => ({ ...m, home_team: teams.get(m.home_team_id) ?? null, away_team: teams.get(m.away_team_id) ?? null }))
  .sort((a, b) => a.starts_at.localeCompare(b.starts_at) || (a.match_number ?? 0) - (b.match_number ?? 0));

const enriched = enrichWithResolvedTeams(matches);

// Detecta si alguna decisión de clasificación dependió del desempate alfabético
// (criterio técnico, no oficial): empate total en puntos, cara a cara, diferencia y goles.
const groupMatches = matches.filter((m) => m.stage === "group");
const standings = computeGroupStandings(groupMatches.map((m) => ({ ...m })));
const warnings = [];
const h2h = (ids) => {
  const s = new Map([...ids].map((id) => [id, [0, 0, 0]]));
  for (const m of groupMatches) {
    if (!ids.has(m.home_team_id) || !ids.has(m.away_team_id)) continue;
    const h = s.get(m.home_team_id), a = s.get(m.away_team_id), hg = m.home_score, ag = m.away_score;
    h[1] += hg - ag; h[2] += hg; a[1] += ag - hg; a[2] += ag;
    if (hg > ag) h[0] += 3; else if (hg < ag) a[0] += 3; else { h[0]++; a[0]++; }
  }
  return s;
};
for (const g of standings) {
  for (let i = 0; i < g.teams.length - 1; i++) {
    const a = g.teams[i], b = g.teams[i + 1];
    if (a.points !== b.points) continue;
    const cluster = new Set(g.teams.filter((t) => t.points === a.points).map((t) => t.team.id));
    const hh = h2h(cluster), ha = hh.get(a.team.id), hb = hh.get(b.team.id);
    if (ha.join() === hb.join() && a.goal_diff === b.goal_diff && a.goals_for === b.goals_for)
      warnings.push(`grupo ${g.group_code}: posiciones ${i + 1}/${i + 2} decididas por orden alfabético`);
  }
}
const thirds = computeBestThirds(standings);
const [t8, t9] = [thirds[7], thirds[8]];
if (t8 && t9 && t8.points === t9.points && t8.goal_diff === t9.goal_diff && t8.goals_for === t9.goals_for)
  warnings.push("mejores terceros: corte 8.º/9.º decidido por orden alfabético");

const knockout = enriched.filter((m) => m.stage !== "group").map((m) => {
  const res = { id: m.id, match_number: m.match_number, stage: m.stage,
    home_team_id: m.home_team?.id ?? null, away_team_id: m.away_team?.id ?? null,
    stored_home: m.home_team_id ?? null, stored_away: m.away_team_id ?? null };
  if (m.home_score !== null && m.away_score !== null && res.home_team_id && res.away_team_id) {
    const homeWins = m.home_score > m.away_score || (m.home_score === m.away_score && m.winner_side === "home");
    const awayWins = m.away_score > m.home_score || (m.home_score === m.away_score && m.winner_side === "away");
    res.winner_team_id = homeWins ? res.home_team_id : awayWins ? res.away_team_id : null;
    res.loser_team_id = homeWins ? res.away_team_id : awayWins ? res.home_team_id : null;
  }
  return res;
});
fs.writeFileSync(outPath, JSON.stringify({
  knockout,
  group_positions: standings.map((g) => ({ group_code: g.group_code, team_ids: g.teams.map((t) => t.team.id) })),
  best_thirds_qualified: thirds.slice(0, 8).map((t) => t.team.id),
  warnings,
}, null, 2));
console.log(JSON.stringify({ knockout: knockout.length, unresolved: knockout.filter((k) => !k.home_team_id || !k.away_team_id).length,
  without_winner: knockout.filter((k) => !k.winner_team_id).length, warnings }));
