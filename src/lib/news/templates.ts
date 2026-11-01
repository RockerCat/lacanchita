// Plantillas editoriales de las noticias automáticas, recuperadas de La Penúltima (lib/news/templates.ts).
// Se omiten, a propósito: la narrativa de «equipo de la comunidad» (Colombia), las etiquetas curadas de selecciones del
// Mundial 2026 (afirmaciones no verificables en otros torneos) y la «zona de premios» (La Canchita no maneja dinero).
// Pure data + pure classifiers. No randomness, no external calls.
// Selection of *which* template within a category is done by the caller
// via pick.ts (deterministic, seeded by matchId).

// ── blockResult ──────────────────────────────────────────────────────

export type ResultCategory = "ajustada" | "normal" | "goleada" | "empate";

export function classifyResultCategory(
  homeScore: number,
  awayScore: number,
): ResultCategory {
  const margin = Math.abs(homeScore - awayScore);
  if (margin === 0) return "empate";
  if (margin === 1) return "ajustada";
  if (margin === 2) return "normal";
  return "goleada";
}

export const RESULT_TEMPLATES: Record<ResultCategory, string[]> = {
  normal: [
    "⚽ {team} venció a {opponent} {score}.",
    "⚽ {team} se impuso con autoridad y ganó {score} ante {opponent}.",
    "⚽ {team} resolvió bien y se quedó con la victoria {score} ante {opponent}.",
  ],
  ajustada: [
    "⚽ {team} sufrió, pero ganó {score} ante {opponent}.",
    "⚽ Un gol bastó para que {team} se quedara con la victoria {score} ante {opponent}.",
    "⚽ {team} ganó por la mínima en un partido cerrado: {score} ante {opponent}.",
  ],
  goleada: [
    "⚽ {team} pasó por encima de {opponent} con un contundente {score}.",
    "⚽ {team} no tuvo piedad y firmó una goleada: {score} ante {opponent}.",
    "⚽ Actuación dominante: {team} se quedó con la victoria {score} ante {opponent}.",
  ],
  empate: [
    "⚽ {team} y {opponent} repartieron puntos en un duelo parejo: {score}.",
    "⚽ {team} y {opponent} no se sacaron diferencias: terminó {score}.",
    "⚽ El encuentro entre {team} y {opponent} acabó sin vencedores ni vencidos: {score}.",
  ],
};

export const RESULT_SORPRESA_TEMPLATES: string[] = [
  "⚽ Sorpresa: {team} le ganó {score} a {opponent}, a quien la mayoría de la comunidad daba como ganador.",
  "⚽ Contra el pronóstico de la mayoría, {team} se quedó con la victoria {score} ante {opponent}.",
  "⚽ Nadie lo vio venir: {team} dio el golpe y venció {score} a {opponent}.",
];

// ── blockLeader ──────────────────────────────────────────────────────

export type LeaderCategory =
  | "mantiene"
  | "apretado"
  | "nuevo"
  | "rompe_empate"
  | "alcanza_empate"
  | "empate_nuevo"
  | "empate_sostenido";

export const LEADER_TEMPLATES: Record<LeaderCategory, string[]> = {
  mantiene: [
    "🏆 {leader} mantiene el liderato con {points} pts.",
    "🏆 {leader} sigue en lo más alto de la tabla con {points} pts.",
    "🏆 Nadie logra bajar a {leader} de la cima: sigue con {points} pts.",
  ],
  apretado: [
    "🏆 {leader} manda, pero la diferencia con el resto es mínima.",
    "🏆 {leader} está al frente, aunque la persecución sigue muy cerca.",
    "🏆 La cima sigue apretada con {leader} al mando.",
  ],
  nuevo: [
    "🏆 Nuevo líder: {leader} sube al primer puesto con {points} pts.",
    "🏆 Cambio de mando en la clasificación: {leader} toma la punta con {points} pts.",
    "🏆 {leader} es el nuevo dueño de la cima con {points} pts.",
  ],
  rompe_empate: [
    "🏆 {leader} rompe el empate y toma la punta en solitario con {points} pts.",
    "🏆 {leader} se despega del resto y queda solo en la cima con {points} pts.",
  ],
  // Líder único anterior es alcanzado por uno o más perseguidores que
  // empatan en puntos. {chasers}/{verb} (alcanza/alcanzan) y {groupWord}
  // (ambos/todos) los calcula el caller según el número de perseguidores.
  alcanza_empate: [
    "🏆 {chasers} {verb} a {previousLeader} y ahora {groupWord} comparten la cima con {points} pts.",
  ],
  // Empate en la cima que no existía antes del partido, sin un líder único
  // previo identificable (p. ej. primer partido con puntos, o el empate
  // surge entre jugadores que no incluyen al líder anterior).
  empate_nuevo: [
    "🏆 {names} comparten el liderato con {points} pts.",
    "🏆 Empate en la cima: {names} con {points} pts.",
    "🏆 {names} llegan juntos a lo más alto de la tabla con {points} pts.",
  ],
  // El empate en la cima ya existía antes del partido y se mantiene igual.
  empate_sostenido: [
    "🏆 {names} siguen compartiendo el liderato con {points} pts.",
  ],
};

// ── blockExactos ─────────────────────────────────────────────────────

export type ExactosCategory = "nadie" | "unico" | "pocos" | "muchos";

export function classifyExactosCategory(count: number): ExactosCategory {
  if (count === 0) return "nadie";
  if (count === 1) return "unico";
  if (count <= 5) return "pocos";
  return "muchos";
}

export const EXACTOS_TEMPLATES: Record<ExactosCategory, string[]> = {
  nadie: [
    "🎯 Nadie acertó el marcador exacto en este partido.",
    "🎯 El resultado exacto se le escapó a toda la comunidad.",
    "🎯 Ni uno acertó el marcador justo esta vez.",
  ],
  unico: [
    "🎯 {names} fue el único que clavó el marcador exacto.",
    "🎯 Puntería de francotirador: solo {names} acertó el resultado justo.",
    "🎯 {names} se queda con el mérito de ser el único en acertar.",
  ],
  pocos: [
    "🎯 {names} acertaron el marcador exacto.",
    "🎯 Buen ojo: {names} clavaron el resultado justo.",
    "🎯 {count} participantes vieron venir el resultado exacto: {names}.",
  ],
  muchos: [
    "🎯 El partido fue más predecible de lo esperado: {count} participantes acertaron el marcador exacto.",
    "🎯 Marcador cantado: {count} participantes dieron en el clavo.",
    "🎯 Nada de sorpresas: {count} acertaron el resultado exacto.",
  ],
};

// ── blockParticipants ────────────────────────────────────────────────

export type ParticipantsCategory = "todos" | "mayoria" | "pocos" | "nadie";

export function classifyParticipantsCategory(
  scorers: number,
  total: number,
): ParticipantsCategory {
  if (scorers === 0) return "nadie";
  if (scorers === total) return "todos";
  if (scorers > total / 2) return "mayoria";
  return "pocos";
}

export const PARTICIPANTS_TEMPLATES: Record<ParticipantsCategory, string[]> = {
  todos: [
    "⚡ Todos los participantes sumaron puntos en este partido.",
    "⚡ Reparto total: nadie se quedó sin puntos.",
    "⚡ Pleno para la comunidad: todos sumaron algo.",
  ],
  mayoria: [
    "⚡ La mayoría encontró puntos en este encuentro: {count} de {total}.",
    "⚡ {count} de {total} participantes sumaron puntos.",
    "⚡ Buen partido para la mayoría: {count} de {total} sumaron.",
  ],
  pocos: [
    "⚡ Solo {count} de {total} participantes sumaron puntos.",
    "⚡ Partido difícil para los pronósticos: apenas {count} de {total} sumaron.",
    "⚡ Pocos vieron esto venir: solo {count} de {total} sumaron puntos.",
  ],
  nadie: [
    "⚡ Nadie sumó puntos en este partido.",
    "⚡ Noche en blanco para toda la comunidad.",
    "⚡ Este resultado dejó a todos con las manos vacías.",
  ],
};

// ── blockMovements ───────────────────────────────────────────────────

export type MovementCategory = "sube" | "top3" | "cae";

// {n_unidad} is a pre-pluralized phrase ("1 puesto" / "3 puestos"),
// computed by the caller — keeps templates free of pluralization logic.
export const MOVEMENT_TEMPLATES: Record<MovementCategory, string[]> = {
  sube: [
    "📈 {name} sube {n_unidad} y llega al {position}°.",
    "📈 Buen salto de {name}, que avanza {n_unidad}.",
    "📈 {name} escala la tabla y suma {n_unidad}.",
  ],
  top3: [
    "📈 {name} sube {n_unidad} y entra al Top 3.",
    "📈 {name} se mete entre los tres primeros.",
    "📈 Nuevo integrante del Top 3: {name}.",
  ],
  cae: [
    "📉 {name} cae {n_unidad} y queda {position}°.",
    "📉 Mal partido para {name}, que pierde {n_unidad}.",
    "📉 {name} retrocede {n_unidad} en la tabla.",
  ],
};
