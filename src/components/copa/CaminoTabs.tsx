"use client";

import { useEffect, useMemo, useState } from "react";
import type { GroupStanding, SlotResolution, BracketConnection } from "@/lib/copa/classification";
import {
  orderSourceMatchesByDestination,
  computeBracketConnections,
  computeLeafRowPositions,
  computeParentRowPositions,
} from "@/lib/copa/classification";
import { resolveCopa, type CopaMatch, type CopaModel, type CopaResolved, type CopaRound } from "@/lib/copa/format";
import { formatKickoff } from "@/lib/juego/matches";

// «Camino a la Copa» recuperado de La Penúltima (components/admin/ClassificationTabs.tsx, usado por /copa): vista
// «Por fase» (grupos, rondas, final y tercer puesto) y vista «Bracket» con conectores. Las tarjetas, estilos y la
// resolución de cupos son los del original; las adaptaciones son: las rondas salen de las fases del torneo (no
// de códigos fijos del Mundial), la hora usa la zona del torneo y el Bracket solo se ofrece si el cuadro es
// verificable (Winner M## consistentes). Todo se calcula con resultados OFICIALES.

type ViewId = "phase" | "bracket";

// ── Shared helpers ─────────────────────────────────────────────────────

function positionBorder(idx: number): string {
  if (idx === 0) return "border-l-2 border-l-[#f59e0b]";
  if (idx === 1) return "border-l-2 border-l-[#00c85a]";
  if (idx === 2) return "border-l-2 border-l-[#f59e0b]/50";
  return "border-l-2 border-l-transparent";
}

function goalDiffColor(d: number): string {
  if (d > 0) return "text-[#00c85a]";
  if (d < 0) return "text-red-400";
  return "text-[#64748b]";
}

function fmtDiff(d: number): string {
  return d > 0 ? `+${d}` : String(d);
}

// Unresolved Best-3rd slots (not enough data / ambiguous combination yet)
// keep showing the original placeholder text, tagged as a pending
// projection rather than a plain "no info" placeholder.
function pendingLabel(slot: Extract<SlotResolution, { kind: "unresolved" }>): string {
  return slot.pending ? `⏳ ${slot.label}` : slot.label;
}

// ══════════════════════════════════════════════════════════════════════
// PHASE VIEW — components
// ══════════════════════════════════════════════════════════════════════


// ── GroupCard (phase view — full stats table) ──────────────────────────

function GroupCard({ group }: { group: GroupStanding }) {
  const matchesPlayed = group.teams.reduce((s, t) => s + t.played, 0) / 2;
  const totalMatches = (group.teams.length * (group.teams.length - 1)) / 2;

  return (
    <div className="bg-[#11111c] border border-[#1e1e35] rounded-2xl overflow-hidden">
      <div className="px-4 py-3 border-b border-[#1e1e35] flex items-center justify-between">
        <h3 className="text-xs font-black text-[#f1f5f9] uppercase tracking-widest">
          Grupo {group.group_code}
        </h3>
        <span className="text-[10px] font-mono text-[#64748b]">{matchesPlayed}/{totalMatches}</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-[#1e1e35]">
              <th className="pl-3 pr-1 py-2 text-left text-[10px] font-semibold text-[#64748b] uppercase w-5">#</th>
              <th className="px-2 py-2 text-left text-[10px] font-semibold text-[#64748b] uppercase min-w-[88px]">Equipo</th>
              {["PJ","G","E","P","GF","GC","DG","PTS"].map((h) => (
                <th key={h} className="px-1 py-2 text-center text-[10px] font-semibold text-[#64748b] uppercase w-7">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[#1e1e35]">
            {group.teams.map((s, idx) => (
              <tr key={s.team.id} className={positionBorder(idx)}>
                <td className="pl-3 pr-1 py-2.5 text-[10px] font-mono text-[#64748b] text-center">{idx + 1}</td>
                <td className="px-2 py-2.5">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm leading-none">{s.team.flag_emoji ?? "🏳️"}</span>
                    <span className={`text-[11px] font-bold ${idx <= 1 ? "text-[#f1f5f9]" : "text-[#94a3b8]"}`}>
                      {s.team.code}
                    </span>
                  </div>
                </td>
                <td className="px-1 py-2.5 text-center font-mono text-[#94a3b8]">{s.played}</td>
                <td className="px-1 py-2.5 text-center font-mono text-[#94a3b8]">{s.won}</td>
                <td className="px-1 py-2.5 text-center font-mono text-[#94a3b8]">{s.drawn}</td>
                <td className="px-1 py-2.5 text-center font-mono text-[#94a3b8]">{s.lost}</td>
                <td className="px-1 py-2.5 text-center font-mono text-[#94a3b8]">{s.goals_for}</td>
                <td className="px-1 py-2.5 text-center font-mono text-[#94a3b8]">{s.goals_against}</td>
                <td className={`px-1 py-2.5 text-center font-mono ${goalDiffColor(s.goal_diff)}`}>
                  {fmtDiff(s.goal_diff)}
                </td>
                <td className={`px-1 py-2.5 text-center font-black text-sm ${
                  idx === 0 ? "text-[#f59e0b]" : idx === 1 ? "text-[#00c85a]" : "text-[#94a3b8]"
                }`}>
                  {s.points}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}



// ── Tarjeta de cruce (vista por fase) ──────────────────────────────────

function KnockoutMatchCard({ match, large = false, slots, tz }: { match: CopaMatch; large?: boolean; slots: CopaResolved["slots"]; tz: string }) {
  const pair = slots.get(match.id);
  const homeSlot: SlotResolution = pair?.home ?? { kind: "unresolved", label: "Por definir" };
  const awaySlot: SlotResolution = pair?.away ?? { kind: "unresolved", label: "Por definir" };
  const homeTeam  = homeSlot.kind !== "unresolved" ? homeSlot.team : null;
  const awayTeam  = awaySlot.kind !== "unresolved" ? awaySlot.team : null;
  const isHomeProjected = homeSlot.kind === "projected";
  const isAwayProjected = awaySlot.kind === "projected";
  const homeFlag  = homeTeam?.flag_emoji;
  const awayFlag  = awayTeam?.flag_emoji;
  const homeCode  = homeSlot.kind === "unresolved" ? pendingLabel(homeSlot) : homeTeam!.code;
  const awayCode  = awaySlot.kind === "unresolved" ? pendingLabel(awaySlot) : awayTeam!.code;
  const hasScore  = match.home_score !== null && match.away_score !== null && match.status !== "cancelled" && match.status !== "scheduled";
  const isLive    = match.status === "live";
  const isFinished = match.status === "finished";
  const flagSize  = large ? "text-3xl" : "text-2xl";
  const nameSize  = large ? "text-sm"  : "text-xs";
  const scoreSize = large ? "text-2xl" : "text-base";
  const tie = isFinished && match.home_score === match.away_score;
  const advances = tie ? (match.winner_side === "home" ? homeTeam : match.winner_side === "away" ? awayTeam : null) : null;

  return (
    <div className={`bg-[#11111c] border border-[#1e1e35] rounded-2xl overflow-hidden${large ? " ring-1 ring-[#f59e0b]/15" : ""}`}>
      <div className="px-4 py-2.5 border-b border-[#1e1e35] flex items-center gap-2 min-w-0">
        {match.match_number !== null && (
          <span className="text-[10px] font-mono text-[#64748b] shrink-0">M{match.match_number}</span>
        )}
        <span className="text-[10px] text-[#64748b] flex-1 truncate">{formatKickoff(match.starts_at, tz)}</span>
        {isLive && (
          <div className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-[#ef4444]/15 border border-[#ef4444]/20 shrink-0">
            <span className="w-1.5 h-1.5 rounded-full bg-[#ef4444] animate-pulse" />
            <span className="text-[9px] font-black text-[#ef4444] uppercase tracking-wide">En vivo</span>
          </div>
        )}
        {isFinished && (
          <span className="text-[9px] font-mono text-[#64748b] uppercase tracking-widest shrink-0">Fin.</span>
        )}
        {match.status === "postponed" && <span className="text-[9px] font-mono text-[#f59e0b] uppercase tracking-widest shrink-0">Aplazado</span>}
        {match.status === "cancelled" && <span className="text-[9px] font-mono text-[#ef4444] uppercase tracking-widest shrink-0">Cancelado</span>}
      </div>
      <div className="px-4 py-3 flex items-center gap-2">
        <div className="flex-1 flex items-center gap-2 min-w-0">
          <span className={`${flagSize} leading-none shrink-0 ${!homeTeam ? "opacity-30" : isHomeProjected ? "opacity-80" : ""}`}>{homeFlag ?? "🏳️"}</span>
          <div className="min-w-0">
            {homeTeam ? (
              <>
                <p className={`${nameSize} font-bold truncate ${isHomeProjected ? "italic text-[#3b82f6] opacity-80" : "text-[#f1f5f9]"}`}>
                  {isHomeProjected && "🔮 "}{homeTeam.name}
                </p>
                <p className={`text-[10px] font-mono ${isHomeProjected ? "text-[#3b82f6]/70 italic" : "text-[#64748b]"}`}>{homeTeam.code}</p>
              </>
            ) : (
              <p className={`${nameSize} font-mono text-[#64748b] italic truncate`}>{homeCode}</p>
            )}
          </div>
        </div>
        <div className="shrink-0 text-center min-w-[52px]">
          {hasScore ? (
            <p className={`${scoreSize} font-black tabular-nums ${isLive ? "text-[#ef4444]" : "text-[#f1f5f9]"}`}>
              {match.home_score}<span className="mx-1 text-[#2a2a45]">-</span>{match.away_score}
            </p>
          ) : (
            <p className="text-[11px] text-[#2a2a45] font-mono">vs</p>
          )}
        </div>
        <div className="flex-1 flex items-center gap-2 justify-end min-w-0">
          <div className="min-w-0 text-right">
            {awayTeam ? (
              <>
                <p className={`${nameSize} font-bold truncate ${isAwayProjected ? "italic text-[#3b82f6] opacity-80" : "text-[#f1f5f9]"}`}>
                  {awayTeam.name}{isAwayProjected && " 🔮"}
                </p>
                <p className={`text-[10px] font-mono ${isAwayProjected ? "text-[#3b82f6]/70 italic" : "text-[#64748b]"}`}>{awayTeam.code}</p>
              </>
            ) : (
              <p className={`${nameSize} font-mono text-[#64748b] italic truncate`}>{awayCode}</p>
            )}
          </div>
          <span className={`${flagSize} leading-none shrink-0 ${!awayTeam ? "opacity-30" : isAwayProjected ? "opacity-80" : ""}`}>{awayFlag ?? "🏳️"}</span>
        </div>
      </div>
      {advances && (
        <p className="px-4 pb-2.5 -mt-1 text-[10px] text-[#f59e0b]">Avanza {advances.name} (penales)</p>
      )}
      {match.venue && (
        <div className="px-4 pb-2.5 -mt-1">
          <p className="text-[10px] text-[#64748b] truncate">{match.venue}</p>
        </div>
      )}
    </div>
  );
}

function ProjectionLegend({ thirds }: { thirds: boolean }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-[#64748b]">
      <span className="flex items-center gap-1.5">✅ <span className="text-[#f1f5f9] font-semibold">Oficial</span> — cupo ya definido</span>
      <span className="flex items-center gap-1.5">🔮 <span className="text-[#3b82f6] font-semibold italic">Proyección</span> — basado en posiciones actuales</span>
      <span className="flex items-center gap-1.5"><span className="text-[#64748b] italic">Placeholder</span> — cupo aún sin resolver</span>
      {thirds && <span className="flex items-center gap-1.5">⏳ <span className="text-[#64748b] italic">Proyección pendiente</span> — mejores terceros aún sin definir con certeza</span>}
    </div>
  );
}

const EMPTY_BOX = "bg-[#11111c] border border-[#1e1e35] rounded-2xl px-6 py-10 text-center";

function GruposTab({ groups, thirds }: { groups: GroupStanding[]; thirds: boolean }) {
  if (groups.length === 0) {
    return (
      <div className={EMPTY_BOX}>
        <p className="text-sm text-[#64748b]">No hay equipos de grupos registrados.</p>
      </div>
    );
  }
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-[#64748b]">
        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-[#f59e0b]" /> 1° — clasifica directo</span>
        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-[#00c85a]" /> 2° — clasifica directo</span>
        {thirds && <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-[#f59e0b]/40" /> 3° — posible mejor tercero</span>}
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {groups.map((g) => <GroupCard key={g.group_code} group={g} />)}
      </div>
    </div>
  );
}

function RoundTab({ round, resolved, tz, thirds }: { round: CopaRound; resolved: CopaResolved; tz: string; thirds: boolean }) {
  return (
    <div className="space-y-3">
      <ProjectionLegend thirds={thirds} />
      <div className="grid gap-3 sm:grid-cols-2">
        {round.matches.map((m) => <KnockoutMatchCard key={m.id} match={m} slots={resolved.slots} tz={tz} />)}
      </div>
    </div>
  );
}

function FinalTab({ final, third, resolved, tz }: { final: CopaRound; third: CopaRound | null; resolved: CopaResolved; tz: string }) {
  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <span className="text-base leading-none">🏆</span>
          <h2 className="text-sm font-black text-[#f59e0b] uppercase tracking-widest">{final.stage.name}</h2>
        </div>
        {final.matches.map((m) => <KnockoutMatchCard key={m.id} match={m} large slots={resolved.slots} tz={tz} />)}
      </section>
      {third && (
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-base leading-none">🥉</span>
            <h2 className="text-sm font-black text-[#94a3b8] uppercase tracking-widest">{third.stage.name}</h2>
          </div>
          {third.matches.map((m) => <KnockoutMatchCard key={m.id} match={m} slots={resolved.slots} tz={tz} />)}
        </section>
      )}
    </div>
  );
}

// ── Bracket ────────────────────────────────────────────────────────────

function BracketGroupMini({ group }: { group: GroupStanding }) {
  return (
    <div className="bg-[#11111c] border border-[#1e1e35] rounded-xl px-2.5 py-2 space-y-1.5">
      <p className="text-[9px] font-black text-[#64748b] uppercase tracking-widest">G{group.group_code}</p>
      {group.teams.map((t, i) => (
        <div key={t.team.id} className="flex items-center gap-1 min-w-0">
          <span className={`text-[9px] font-mono w-3 shrink-0 ${
            i === 0 ? "text-[#f59e0b]" : i === 1 ? "text-[#00c85a]" : "text-[#64748b]"
          }`}>{i + 1}</span>
          <span className="text-xs leading-none shrink-0">{t.team.flag_emoji ?? "🏳️"}</span>
          <span className={`text-[10px] font-semibold truncate ${i <= 1 ? "text-[#f1f5f9]" : "text-[#64748b]"}`}>
            {t.team.code}
          </span>
        </div>
      ))}
    </div>
  );
}


function BracketMatchRow({ match, highlight = false, slots }: { match: CopaMatch; highlight?: boolean; slots: CopaResolved["slots"] }) {
  const pair = slots.get(match.id);
  const homeSlot: SlotResolution = pair?.home ?? { kind: "unresolved", label: "Por definir" };
  const awaySlot: SlotResolution = pair?.away ?? { kind: "unresolved", label: "Por definir" };
  const homeTeam  = homeSlot.kind !== "unresolved" ? homeSlot.team : null;
  const awayTeam  = awaySlot.kind !== "unresolved" ? awaySlot.team : null;
  const homeLabel = homeSlot.kind === "unresolved" ? pendingLabel(homeSlot) : homeTeam!.code;
  const awayLabel = awaySlot.kind === "unresolved" ? pendingLabel(awaySlot) : awayTeam!.code;
  const isHomeProjected = homeSlot.kind === "projected";
  const isAwayProjected = awaySlot.kind === "projected";
  const hasScore  = match.home_score !== null && match.away_score !== null && match.status !== "cancelled" && match.status !== "scheduled";
  const isDraw    = hasScore && match.home_score === match.away_score;
  const closed    = match.status === "finished";
  const homeWins  = closed && hasScore && ((match.home_score ?? 0) > (match.away_score ?? 0) || (isDraw && match.winner_side === "home"));
  const awayWins  = closed && hasScore && ((match.away_score ?? 0) > (match.home_score ?? 0) || (isDraw && match.winner_side === "away"));
  const isLive    = match.status === "live";
  const isFinished = match.status === "finished";

  return (
    <div className={`bg-[#11111c] border rounded-xl overflow-hidden ${
      highlight    ? "border-[#f59e0b]/40 ring-1 ring-[#f59e0b]/10" :
      isLive       ? "border-[#ef4444]/40" :
      "border-[#1e1e35]"
    }`}>
      <div className="flex items-center justify-between px-2 py-1 border-b border-[#1e1e35]">
        <span className="text-[9px] font-mono text-[#64748b]">
          {match.match_number ? `M${match.match_number}` : "–"}
        </span>
        {isLive && (
          <span className="text-[8px] font-black text-[#ef4444] uppercase tracking-wide animate-pulse">Live</span>
        )}
        {isFinished && !isLive && (
          <span className="text-[8px] font-mono text-[#64748b] uppercase tracking-widest">Fin</span>
        )}
        {match.status === "cancelled" && <span className="text-[8px] font-mono text-[#ef4444] uppercase tracking-widest">Canc</span>}
      </div>
      <div className={`flex items-center gap-1.5 px-2 py-1.5 border-b border-[#1e1e35]/50 ${homeWins ? "bg-[#00c85a]/[0.06]" : ""}`}>
        <span className={`text-sm leading-none shrink-0 ${!homeTeam ? "opacity-30" : isHomeProjected ? "opacity-80" : ""}`}>
          {homeTeam?.flag_emoji ?? "🏳️"}
        </span>
        <span className={`text-[11px] font-semibold flex-1 truncate ${
          isHomeProjected
            ? "italic text-[#3b82f6] opacity-80"
            : homeTeam ? (homeWins ? "text-[#00c85a]" : "text-[#f1f5f9]") : "text-[#64748b] italic"
        }`}>{isHomeProjected && "🔮 "}{homeLabel}</span>
        {hasScore && (
          <span className={`text-xs font-black tabular-nums shrink-0 ${homeWins ? "text-[#00c85a]" : "text-[#64748b]"}`}>
            {match.home_score}
          </span>
        )}
      </div>
      <div className={`flex items-center gap-1.5 px-2 py-1.5 ${awayWins ? "bg-[#00c85a]/[0.06]" : ""}`}>
        <span className={`text-sm leading-none shrink-0 ${!awayTeam ? "opacity-30" : isAwayProjected ? "opacity-80" : ""}`}>
          {awayTeam?.flag_emoji ?? "🏳️"}
        </span>
        <span className={`text-[11px] font-semibold flex-1 truncate ${
          isAwayProjected
            ? "italic text-[#3b82f6] opacity-80"
            : awayTeam ? (awayWins ? "text-[#00c85a]" : "text-[#f1f5f9]") : "text-[#64748b] italic"
        }`}>{isAwayProjected && "🔮 "}{awayLabel}</span>
        {hasScore && (
          <span className={`text-xs font-black tabular-nums shrink-0 ${awayWins ? "text-[#00c85a]" : "text-[#64748b]"}`}>
            {match.away_score}
          </span>
        )}
      </div>
    </div>
  );
}

// ── Bracket geometry ────────────────────────────────────────────────────
// Dieciseisavos (R32) is the only round with no children, so its rows are
// evenly spaced in plain flow. Every later round is absolutely positioned
// at computeParentRowPositions()'s real midpoint — never a round-based
// slot height — so the whole bracket's total height is just the leaf
// column's height (16 rows × R32_SH), shared by every column via TOTAL_H.

const CARD_H = 88;            // approximate BracketMatchRow rendered height (px)
const HEADER = 44;            // column header (title + subtitle + mb-3) height (px)
const R32_SH = CARD_H + 8;    // Dieciseisavos row height in flat layout = 96

// ── BracketConnectorSVG ─────────────────────────────────────────────────
// Draws simple, local SVG bracket connectors using REAL, already-computed
// row positions (computeLeafRowPositions / computeParentRowPositions in
// lib/classification.ts) — never a round/index-based offset formula. Each
// connection's vertical bar spans only between its own two children
// (never beyond), converging at one shared midpoint x for the whole
// connector — the standard bracket look. This is only correct because the
// column orders feeding this component (see BracketView) are chosen so
// every parent's two real children sit on ADJACENT rows; if a round ever
// needed non-adjacent children again, the right fix is reordering that
// round (as BracketView does for Octavos), not adding lanes/diagonals here.
//
//   ─ left arm   from each source row's real y   (x: 0 → midX)
//   │ vertical   from that source's y             down/up to the dest's real y
//   ─ right arm  from midpoint to dest's real y   (x: midX → W), drawn once
//
// srcY/dstY: real, pre-computed center-y per row index in each column.

function BracketConnectorSVG({
  connections,
  srcY,
  dstY,
  totalH,
}: {
  connections: BracketConnection[];
  srcY:        number[];
  dstY:        number[];
  totalH:      number;
}) {
  const W     = 40;
  const MID_X = W / 2;

  return (
    <div
      className="shrink-0 mx-1"
      style={{
        width:     W,
        marginTop: HEADER,
        filter:    "drop-shadow(0 0 4px rgba(0,200,90,0.22))",
      }}
    >
      <svg width={W} height={totalH} style={{ display: "block", overflow: "visible" }}>
        {connections.map(({ srcRows: [rowA, rowB], destRow }, i) => {
          const y1 = srcY[rowA];
          const y2 = srcY[rowB];
          const yd = dstY[destRow];
          return (
            <g key={i} stroke="rgba(0,200,90,0.6)" strokeWidth="1.5" fill="none" strokeLinecap="round">
              <line x1={0}     y1={y1} x2={MID_X} y2={y1} />
              <line x1={0}     y1={y2} x2={MID_X} y2={y2} />
              <line x1={MID_X} y1={y1} x2={MID_X} y2={yd} />
              <line x1={MID_X} y1={y2} x2={MID_X} y2={yd} />
              <line x1={MID_X} y1={yd} x2={W}     y2={yd} />
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function ColHeader({ title, titleColor = "text-[#f1f5f9]", subtitle }: { title: string; titleColor?: string; subtitle?: string }) {
  return (
    <div style={{ height: HEADER, display: "flex", flexDirection: "column", justifyContent: "flex-end", paddingBottom: 4 }}>
      <p className={`text-[11px] font-black uppercase tracking-widest ${titleColor}`}>{title}</p>
      {subtitle && <p className="text-[10px] text-[#64748b] mt-0.5">{subtitle}</p>}
    </div>
  );
}
function Slot({ h, children }: { h: number; children: React.ReactNode }) {
  return (
    <div style={{ height: h, display: "flex", alignItems: "center" }}>
      <div className="w-full">{children}</div>
    </div>
  );
}
function AbsoluteSlot({ y, children }: { y: number; children: React.ReactNode }) {
  return <div style={{ position: "absolute", left: 0, right: 0, top: y - CARD_H / 2 }}>{children}</div>;
}


// Cada columna se ordena hacia atrás desde la final: los dos partidos que alimentan un cruce quedan siempre
// adyacentes y la posición vertical de cada cruce es el punto medio de sus dos orígenes (como en el original).
export function BracketView({ model, resolved }: { model: CopaModel; resolved: CopaResolved }) {
  const rounds = model.rounds;
  const ordered: CopaMatch[][] = new Array(rounds.length);
  ordered[rounds.length - 1] = [...rounds[rounds.length - 1].matches];
  for (let i = rounds.length - 2; i >= 0; i--) ordered[i] = orderSourceMatchesByDestination(rounds[i].matches, ordered[i + 1]);
  const links: BracketConnection[][] = ordered.slice(0, -1).map((col, i) => computeBracketConnections(col, ordered[i + 1]));

  const TOTAL_H = ordered[0].length * R32_SH;
  const ys: number[][] = [computeLeafRowPositions(ordered[0].length, R32_SH)];
  for (let i = 1; i < ordered.length; i++) ys.push(computeParentRowPositions(links[i - 1], ordered[i].length, ys[i - 1], TOTAL_H));
  const played = resolved.groups.reduce((sum, g) => sum + g.teams.reduce((s, t) => s + t.played, 0) / 2, 0);
  const totalGroup = resolved.groups.reduce((sum, g) => sum + (g.teams.length * (g.teams.length - 1)) / 2, 0);
  const last = rounds.length - 1;

  return (
    <div className="space-y-3">
      <ProjectionLegend thirds={model.kind === "worldcup"} />
      <p className="text-[10px] text-[#64748b] sm:hidden">Desliza horizontalmente para recorrer el cuadro.</p>
      <div className="overflow-x-auto no-scrollbar -mx-4">
      <div className="flex items-start px-4 pb-6 min-w-max" style={{ gap: 0 }}>
        {resolved.groups.length > 0 && (
          <>
            <div className="w-56 shrink-0 pr-3">
              <ColHeader title="Grupos" subtitle={`${played} de ${totalGroup} partidos jugados`} />
              <div className="grid grid-cols-2 gap-2">{resolved.groups.map((g) => <BracketGroupMini key={g.group_code} group={g} />)}</div>
            </div>
            <div className="w-px bg-[#1e1e35] self-stretch mx-3 shrink-0" />
          </>
        )}
        {ordered.map((col, i) => (
          <div key={rounds[i].stage.id} className="contents">
            <div className="w-40 shrink-0">
              <ColHeader title={i === last ? `🏆 ${rounds[i].stage.name}` : rounds[i].stage.name} titleColor={i === last ? "text-[#f59e0b]" : undefined} subtitle={i === last ? undefined : `${col.length}/${col.length}`} />
              {i === 0 ? (
                col.map((m) => (
                  <Slot key={m.id} h={R32_SH}>
                    <BracketMatchRow match={m} slots={resolved.slots} />
                  </Slot>
                ))
              ) : (
                <div style={{ position: "relative", height: TOTAL_H }}>
                  {col.map((m, k) => (
                    <AbsoluteSlot key={m.id} y={ys[i][k]}><BracketMatchRow match={m} highlight={i === last} slots={resolved.slots} /></AbsoluteSlot>
                  ))}
                </div>
              )}
              {i === last && model.thirdPlace && (
                <div className="mt-6">
                  <p className="text-[10px] font-black text-[#94a3b8] uppercase tracking-widest mb-2">🥉 {model.thirdPlace.stage.name}</p>
                  {model.thirdPlace.matches.map((m) => <BracketMatchRow key={m.id} match={m} slots={resolved.slots} />)}
                </div>
              )}
            </div>
            {i < last && <BracketConnectorSVG connections={links[i]} srcY={ys[i]} dstY={ys[i + 1]} totalH={TOTAL_H} />}
          </div>
        ))}
      </div>
      </div>
    </div>
  );
}

// ── Componente principal ───────────────────────────────────────────────

const VIEW_KEY = "lacanchita-copa-view";

export default function CaminoTabs({ model, tz }: { model: CopaModel; tz: string }) {
  const resolved = useMemo(() => resolveCopa(model), [model]);
  const thirds = model.kind === "worldcup";
  const hasGroups = resolved.groups.length > 0;
  const rounds = model.rounds;
  const lastRound = rounds[rounds.length - 1];

  // Pestañas por fase: grupos (si hay), cada ronda y, al final, la final junto al tercer puesto.
  const tabs = [
    ...(hasGroups ? [{ id: "groups", label: "Fase de Grupos", short: "Grupos" }] : []),
    ...rounds.slice(0, -1).map((r) => ({ id: r.stage.id, label: r.stage.name, short: r.stage.name.length > 10 ? r.stage.name.slice(0, 9) + "…" : r.stage.name })),
    { id: lastRound.stage.id, label: lastRound.stage.name, short: lastRound.stage.name },
  ];
  const firstOpen = (): string => {
    if (hasGroups && model.groupMatches.some((m) => m.status !== "finished")) return "groups";
    for (const r of rounds) if (r.matches.some((m) => m.status !== "finished" && m.status !== "cancelled")) return r.stage.id;
    return lastRound.stage.id;
  };
  const [tab, setTab] = useState<string>(firstOpen);
  // Móvil primero: «Por fase» por defecto; la preferencia guardada (si el cuadro es verificable) se aplica al montar.
  const [view, setView] = useState<ViewId>("phase");
  useEffect(() => {
    try {
      const saved = localStorage.getItem(VIEW_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- preferencia del navegador, solo disponible tras montar
      if (saved === "bracket" && model.treeOk) setView("bracket");
    } catch { /* sin almacenamiento: se queda en «Por fase» */ }
  }, [model.treeOk]);

  function handleViewChange(v: ViewId) {
    setView(v);
    try { localStorage.setItem(VIEW_KEY, v); } catch { /* opcional */ }
  }

  const round = rounds.find((r) => r.stage.id === tab);
  return (
    <div className="space-y-4">
      {model.treeOk && (
        <div className="flex items-center gap-3">
          <div className="flex gap-0.5 bg-[#11111c] border border-[#1e1e35] rounded-xl p-1">
            {(["phase", "bracket"] as ViewId[]).map((v) => {
              const label = v === "phase" ? "Por fase" : "Bracket";
              const active = view === v;
              return (
                <button
                  key={v}
                  type="button"
                  aria-pressed={active}
                  onClick={() => handleViewChange(v)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${active ? "bg-[#18182a] text-[#f1f5f9]" : "text-[#64748b] hover:text-[#94a3b8]"}`}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {(view === "phase" || !model.treeOk) && (
        <div className="space-y-4">
          <div className="-mx-4 px-4">
            <div className="flex gap-1 overflow-x-auto no-scrollbar pb-1">
              {tabs.map((t) => {
                const active = tab === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setTab(t.id)}
                    className={`shrink-0 px-4 py-2 rounded-xl text-xs font-semibold transition-colors ${
                      active ? "bg-[#00c85a]/10 text-[#00c85a] border border-[#00c85a]/20" : "text-[#64748b] hover:text-[#94a3b8] border border-transparent"
                    }`}
                  >
                    <span className="hidden sm:inline">{t.label}</span>
                    <span className="sm:hidden">{t.short}</span>
                  </button>
                );
              })}
            </div>
          </div>
          {tab === "groups" && <GruposTab groups={resolved.groups} thirds={thirds} />}
          {round && round !== lastRound && <RoundTab round={round} resolved={resolved} tz={tz} thirds={thirds && round === rounds[0]} />}
          {round && round === lastRound && <FinalTab final={lastRound} third={model.thirdPlace} resolved={resolved} tz={tz} />}
        </div>
      )}

      {view === "bracket" && model.treeOk && <BracketView model={model} resolved={resolved} />}
    </div>
  );
}
