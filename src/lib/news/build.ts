// Generador determinista de noticias, recuperado de La Penúltima (lib/db/news.ts: bloques narrativos y resumen).
// Funciones puras sobre el CONTEXTO OFICIAL que entrega la base (`control_news_context`): sin IA, sin azar, sin
// relojes ni llamadas externas; la elección de plantilla es una función del partido (pickTemplate) y por eso
// regenerar el mismo acontecimiento produce el mismo texto. Adaptaciones frente al original: una noticia por
// ÁMBITO (torneo: solo el resultado; parche: la narrativa completa con la tabla de ESE parche), sin «zona de
// premios», sin narrativa del «equipo de la comunidad» ni etiquetas curadas de selecciones.
import { pickTemplate, fillTemplate } from "./pick";
import {
  classifyResultCategory, RESULT_TEMPLATES, RESULT_SORPRESA_TEMPLATES, LEADER_TEMPLATES,
  classifyExactosCategory, EXACTOS_TEMPLATES, classifyParticipantsCategory, PARTICIPANTS_TEMPLATES, MOVEMENT_TEMPLATES,
} from "./templates";

// ── Contexto (forma de control_news_context) ─────────────────────────
export type NewsTeam = { id: string; name: string; flag: string | null };
export type NewsMatchCtx = { id: string; event_id: string; revision: number; home_score: number; away_score: number; winner_side: string | null; home: NewsTeam; away: NewsTeam };
export type NewsLbRow = { user_id: string; display_name: string; total_points: number; exact_count: number; result_count: number; rank: number };
export type NewsPredRow = { user_id: string; points: number; points_reason: string | null; home: number; away: number };
export type NewsItemCtx = { parche_event_id: string; leaderboard: NewsLbRow[]; predictions: NewsPredRow[] };
export type NewsContext = { match: NewsMatchCtx; items: NewsItemCtx[] };
export type NewsDraft = { parche_event_id: string | null; title: string; summary: string; content: string };

type LbRow = NewsLbRow;
type PredRow = { user_id: string; display_name: string; points: number; points_reason: string | null; pred_home: number; pred_away: number };
type Rankable = { user_id: string; display_name: string; total_points: number; exact_count: number; result_count: number };
type Ranked = Rankable & { rank: number };
type Movement = { user_id: string; display_name: string; rank_before: number; rank_after: number; change: number };

function assignRanks(players: Rankable[]): Ranked[] {
  const sorted = [...players].sort((a, b) => b.total_points - a.total_points);

  let currentRank = 1;
  return sorted.map((p, i) => {
    if (i > 0) {
      const prev = sorted[i - 1];
      if (p.total_points !== prev.total_points) currentRank = i + 1;
    }
    return { ...p, rank: currentRank };
  });
}

// "Líder" se define por el máximo de total_points (empate real de puntos),
// no por el campo `rank` de la tabla: ese rank usa total_points/exact_count/
// result_count como desempate visual, lo que puede separar en filas distintas
// a dos jugadores con los mismos puntos y ocultar un empate editorial real.
function topScorers<T extends { total_points: number }>(players: T[]): T[] {
  if (players.length === 0) return [];
  const topPoints = Math.max(...players.map((p) => p.total_points));
  return players.filter((p) => p.total_points === topPoints);
}


// ── Bloque de resultado (sin narrativas específicas de una comunidad ni de un torneo) ──
function blockResult(
  matchId: string, homeFlag: string, homeName: string, homeScore: number, awayFlag: string, awayName: string, awayScore: number,
  preds: PredRow[],
): string {
  const h = homeFlag ? `${homeFlag} ` : "";
  const a = awayFlag ? `${awayFlag} ` : "";
  if (homeScore === awayScore) {
    return fillTemplate(pickTemplate(RESULT_TEMPLATES.empate, `${matchId}:result`), {
      team: `${h}${homeName}`, opponent: `${a}${awayName}`, score: `${homeScore}-${awayScore}`,
    });
  }
  const homeWins = homeScore > awayScore;
  const vars = {
    team: homeWins ? `${h}${homeName}` : `${a}${awayName}`,
    opponent: homeWins ? `${a}${awayName}` : `${h}${homeName}`,
    score: homeWins ? `${homeScore}-${awayScore}` : `${awayScore}-${homeScore}`,
  };
  // Sorpresa: la mayoría de los pronósticos del parche favorecía al perdedor (solo con pronósticos).
  const homeVotes = preds.filter((p) => p.pred_home > p.pred_away).length;
  const awayVotes = preds.filter((p) => p.pred_away > p.pred_home).length;
  const favoredHome = homeVotes > awayVotes && homeVotes > preds.length / 2;
  const favoredAway = awayVotes > homeVotes && awayVotes > preds.length / 2;
  if (preds.length > 0 && ((favoredHome && !homeWins) || (favoredAway && homeWins))) {
    return fillTemplate(pickTemplate(RESULT_SORPRESA_TEMPLATES, `${matchId}:result`), vars);
  }
  const category = classifyResultCategory(homeScore, awayScore);
  return fillTemplate(pickTemplate(RESULT_TEMPLATES[category], `${matchId}:result`), vars);
}

function blockLeader(
  matchId:      string,
  after:        LbRow[],
  before:       Ranked[],
  allZeroBefore: boolean,
): string {
  const leaders = topScorers(after);
  if (leaders.length === 0) return "🏆 La tabla se mueve";

  const pts             = leaders[0].total_points;
  const prevLeaders     = topScorers(before);
  const prevIds         = new Set(prevLeaders.map((p) => p.user_id));
  const prevLeaderCount = prevLeaders.length;
  const seed             = `${matchId}:leader`;

  const joined = (arr: { display_name: string }[]) =>
    arr.length === 1 ? arr[0].display_name
    : arr.length === 2 ? `${arr[0].display_name} y ${arr[1].display_name}`
    : `${arr.slice(0, -1).map((l) => l.display_name).join(", ")} y ${arr[arr.length - 1].display_name}`;

  const isNewSoleLeader =
    leaders.length === 1 && (allZeroBefore || !prevIds.has(leaders[0].user_id));

  if (isNewSoleLeader) {
    const template = pickTemplate(LEADER_TEMPLATES.nuevo, seed);
    return fillTemplate(template, { leader: leaders[0].display_name, points: pts });
  }

  if (leaders.length === 1) {
    // Was tied for 1st before, now leads alone: a tie broken, not a new arrival.
    const brokeTie = prevLeaderCount > 1 && prevIds.has(leaders[0].user_id);
    if (brokeTie) {
      const template = pickTemplate(LEADER_TEMPLATES.rompe_empate, seed);
      return fillTemplate(template, { leader: leaders[0].display_name, points: pts });
    }

    // Apretado: the runner-up trails by 2 points or less.
    const runnerUpPts = after.find((p) => p.rank === 2)?.total_points;
    const isApretado  = runnerUpPts != null && pts - runnerUpPts <= 2;
    const category    = isApretado ? "apretado" : "mantiene";
    const template    = pickTemplate(LEADER_TEMPLATES[category], seed);
    return fillTemplate(template, { leader: leaders[0].display_name, points: pts });
  }

  // Tie at the top now (leaders.length > 1).
  const sameTieAsBefore =
    !allZeroBefore &&
    prevLeaderCount > 1 &&
    prevLeaderCount === leaders.length &&
    leaders.every((l) => prevIds.has(l.user_id));

  if (sameTieAsBefore) {
    const template = pickTemplate(LEADER_TEMPLATES.empate_sostenido, seed);
    return fillTemplate(template, { names: joined(leaders), points: pts });
  }

  // A single previous sole leader got caught by one or more chasers and
  // is still part of the new tie: the headline event is "X alcanza a Y".
  if (!allZeroBefore && prevLeaderCount === 1 && leaders.some((l) => l.user_id === prevLeaders[0].user_id)) {
    const previousLeader = prevLeaders[0];
    const chasers         = leaders.filter((l) => l.user_id !== previousLeader.user_id);
    const verb            = chasers.length === 1 ? "alcanza" : "alcanzan";
    const groupWord        = leaders.length === 2 ? "ambos" : "todos";
    const template         = pickTemplate(LEADER_TEMPLATES.alcanza_empate, seed);
    return fillTemplate(template, {
      chasers:        joined(chasers),
      verb,
      groupWord,
      previousLeader: previousLeader.display_name,
      points:         pts,
    });
  }

  // Any other new tie at the top (first scored match, or a tie that
  // doesn't involve the previous sole leader).
  const template = pickTemplate(LEADER_TEMPLATES.empate_nuevo, seed);
  return fillTemplate(template, { names: joined(leaders), points: pts });
}

function nUnidad(n: number): string {
  return `${n} puesto${n === 1 ? "" : "s"}`;
}

function blockMovements(
  matchId:       string,
  movements:     Movement[],
  allZeroBefore: boolean,
): string | null {
  // No meaningful ranking existed before the first match
  if (allZeroBefore) return null;

  // Notable upward moves: ≥2 positions, or entering Top 3 for the first time
  const ups = movements
    .filter((m) => m.change >= 2 || (m.change >= 1 && m.rank_after <= 3 && m.rank_before > 3))
    .sort((a, b) => b.change - a.change)
    .slice(0, 2);

  // Notable downward moves: fell ≥3 positions
  const downs = movements
    .filter((m) => m.change <= -3)
    .sort((a, b) => a.change - b.change)
    .slice(0, 1);

  const notable = [...ups, ...downs];
  if (notable.length === 0) return null;

  return notable
    .map((m) => {
      if (m.change > 0) {
        const n = m.change;
        const enteredTop3 = m.rank_before > 3 && m.rank_after <= 3;
        const category    = enteredTop3 ? "top3" : "sube";
        const template     = pickTemplate(MOVEMENT_TEMPLATES[category], `${matchId}:movement:${m.user_id}`);
        return fillTemplate(template, { name: m.display_name, n_unidad: nUnidad(n), position: m.rank_after });
      }
      const n = Math.abs(m.change);
      const template = pickTemplate(MOVEMENT_TEMPLATES.cae, `${matchId}:movement:${m.user_id}`);
      return fillTemplate(template, { name: m.display_name, n_unidad: nUnidad(n), position: m.rank_after });
    })
    .join("\n");
}

function blockExactos(matchId: string, preds: PredRow[]): string {
  const exactos = preds.filter((p) => p.points_reason === "exact");
  const names   = exactos.map((p) => p.display_name);
  const joined  =
    names.length <= 1 ? (names[0] ?? "")
    : names.slice(0, -1).join(", ") + " y " + names[names.length - 1];

  const category = classifyExactosCategory(names.length);
  const template = pickTemplate(EXACTOS_TEMPLATES[category], `${matchId}:exactos`);
  return fillTemplate(template, { names: joined, count: names.length });
}

function blockParticipants(matchId: string, preds: PredRow[]): string | null {
  if (preds.length === 0) return null;
  const scorers = preds.filter((p) => p.points > 0).length;

  const category = classifyParticipantsCategory(scorers, preds.length);
  const template = pickTemplate(PARTICIPANTS_TEMPLATES[category], `${matchId}:participants`);
  return fillTemplate(template, { count: scorers, total: preds.length });
}

function buildSummary(
  after:         LbRow[],
  before:        Ranked[],
  preds:         PredRow[],
  movements:     Movement[],
  allZeroBefore: boolean,
): string {
  const leaders    = topScorers(after);
  const prevLeaders = topScorers(before);
  const prevIds    = new Set(prevLeaders.map((p) => p.user_id));
  const leaderName = leaders[0]?.display_name ?? "";
  const scorers    = preds.filter((p) => p.points > 0).length;
  const exactos    = preds.filter((p) => p.points_reason === "exact");

  // 1. New sole leader
  const isNewSoleLeader =
    leaders.length === 1 && (allZeroBefore || !prevIds.has(leaders[0].user_id));
  if (isNewSoleLeader) {
    return `${leaderName} es el nuevo líder con ${leaders[0].total_points} pts.`;
  }

  // 2. New tie at the top
  const prevLeaderCount = prevLeaders.length;
  const nowTied         = leaders.length > 1;
  const tieIsNew        = nowTied && prevLeaderCount !== leaders.length && !allZeroBefore;
  if (tieIsNew) {
    const names = leaders.slice(0, 2).map((l) => l.display_name).join(" y ");
    return `Empate en la cima: ${names} con ${leaders[0]?.total_points ?? 0} pts.`;
  }

  // 3. Nobody scored
  if (scorers === 0 && preds.length > 0) {
    return "Nadie sumó puntos en este partido.";
  }

  // 4. Sole exacto (most notable individual achievement)
  if (exactos.length === 1) {
    return `${exactos[0].display_name} acertó el marcador exacto y ${leaderName} mantiene el liderato.`;
  }

  // 5. Big position jump
  const bigUp = movements
    .filter((m) => m.change >= 3 && !allZeroBefore)
    .sort((a, b) => b.change - a.change)[0];
  if (bigUp) {
    return `${bigUp.display_name} sube ${bigUp.change} posiciones y ${leaderName} mantiene el liderato.`;
  }

  // 6. Stable situation
  const scorerText =
    scorers === preds.length && preds.length > 0
      ? "todos sumaron puntos"
      : `${scorers} de ${preds.length} sumaron puntos`;
  return `${leaderName} mantiene el liderato, ${scorerText}.`;
}


// ── Constructores por ámbito ──────────────────────────────────────────
const teamTitle = (m: NewsMatchCtx) => `${m.home.name} ${m.home_score} - ${m.away_score} ${m.away.name}`;

/** Noticia deportiva compartida por todos los parches del torneo: solo el resultado oficial. */
export function buildEventNews(ctx: NewsContext): NewsDraft {
  const m = ctx.match;
  return {
    parche_event_id: null,
    title: teamTitle(m),
    summary: "Resultado oficial del partido.",
    content: blockResult(m.id, m.home.flag ?? "", m.home.name, m.home_score, m.away.flag ?? "", m.away.name, m.away_score, []),
  };
}

/** Noticia del parche: la narrativa original (resultado, liderato, movimientos, exactos, participación). */
export function buildParcheNews(ctx: NewsContext, item: NewsItemCtx): NewsDraft {
  const m = ctx.match;
  const names = new Map(item.leaderboard.map((l) => [l.user_id, l.display_name]));
  const leaderboard: LbRow[] = item.leaderboard.map((e) => ({
    ...e,
    // El orden oficial desempata por exactos; para el relato «líder/segundo» el original usa solo los puntos.
    rank: item.leaderboard.filter((o) => o.total_points > e.total_points).length + 1,
  }));
  const preds: PredRow[] = item.predictions
    .filter((p) => names.has(p.user_id))
    .map((p) => ({ user_id: p.user_id, display_name: names.get(p.user_id)!, points: p.points, points_reason: p.points_reason, pred_home: p.home, pred_away: p.away }));

  // Estado «antes»: se resta la contribución de este partido (como el original).
  const predMap = new Map(preds.map((p) => [p.user_id, p]));
  const beforePlayers: Rankable[] = leaderboard.map((l) => {
    const p = predMap.get(l.user_id);
    return {
      user_id: l.user_id, display_name: l.display_name,
      total_points: l.total_points - (p?.points ?? 0),
      exact_count: l.exact_count - (p?.points_reason === "exact" ? 1 : 0),
      result_count: l.result_count - (p?.points_reason === "result" ? 1 : 0),
    };
  });
  const allZeroBefore = beforePlayers.every((p) => p.total_points <= 0);
  const before = assignRanks(beforePlayers);
  const beforeMap = new Map(before.map((b) => [b.user_id, b]));
  const movements: Movement[] = leaderboard.map((a) => {
    const b = beforeMap.get(a.user_id);
    return { user_id: a.user_id, display_name: a.display_name, rank_before: b?.rank ?? a.rank, rank_after: a.rank, change: (b?.rank ?? a.rank) - a.rank };
  });

  const blocks = [
    blockResult(m.id, m.home.flag ?? "", m.home.name, m.home_score, m.away.flag ?? "", m.away.name, m.away_score, preds),
    leaderboard.length > 0 ? blockLeader(m.id, leaderboard, before, allZeroBefore) : null,
    blockMovements(m.id, movements, allZeroBefore),
    preds.length > 0 ? blockExactos(m.id, preds) : null,
    blockParticipants(m.id, preds),
  ].filter(Boolean) as string[];

  return {
    parche_event_id: item.parche_event_id,
    title: teamTitle(m),
    summary: leaderboard.length > 0 ? buildSummary(leaderboard, before, preds, movements, allZeroBefore) : "Resultado oficial del partido.",
    content: blocks.join("\n\n"),
  };
}

/** Todas las noticias de un partido finalizado: una compartida y una por inscripción activa. */
export function buildMatchNews(ctx: NewsContext): NewsDraft[] {
  return [buildEventNews(ctx), ...ctx.items.map((it) => buildParcheNews(ctx, it))];
}
