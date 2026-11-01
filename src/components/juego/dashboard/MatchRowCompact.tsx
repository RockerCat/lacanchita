"use client";

import { useActionState, useEffect, useState } from "react";
import { cn } from "@/lib/juego/utils";
import {
  formatKickoff,
  matchClosedReason,
  matchTeamName,
  matchTeamFlag,
  type MatchWithPrediction,
  type PredictionActionState,
  type Team,
} from "@/lib/juego/matches";
import { savePredictionAction } from "@/lib/juego/prediction-action";
import { useRouter } from "next/navigation";
import { Check, Lock, Loader2 } from "lucide-react";
import { useJuego } from "@/lib/juego/context";

// ─────────────────────────────────────────────────────────────────────

export default function MatchRowCompact({ match }: { match: MatchWithPrediction }) {
  const { home_team, away_team, status } = match;
  const router = useRouter();
  const { base } = useJuego();

  function handleCardClick(e: React.MouseEvent<HTMLDivElement>) {
    if ((e.target as Element).closest("input, button, select, a")) return;
    router.push(`${base}/matches/${match.id}`);
  }

  const { parcheEventId } = useJuego();

  const [formState, formAction, isPending] = useActionState<PredictionActionState, FormData>(
    savePredictionAction,
    null
  );
  // Start NOT editing when a saved prediction already exists
  const [isEditing, setIsEditing] = useState(!match.prediction);


  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- comportamiento original de La Penúltima: cerrar el editor al guardar
    if (formState && "success" in formState) setIsEditing(false);
  }, [formState]);

  const saved =
    formState && "success" in formState ? formState.prediction : match.prediction;

  const isOpen     = matchClosedReason(match) === null;
  const isLive     = status === "live";
  const isFinished = status === "finished";
  const hasScore   = match.home_score !== null && match.away_score !== null;

  // ──────────────────────────────────────────────────────────────────
  // 🔴  EN VIVO — most prominent card state
  // ──────────────────────────────────────────────────────────────────
  if (isLive) {
    return (
      <div
        onClick={handleCardClick}
        className="rounded-xl border border-[#ef4444]/25 bg-gradient-to-br from-[#ef4444]/[0.09] to-[#18182a] animate-live-glow overflow-hidden cursor-pointer transition-all hover:border-[#ef4444]/45"
      >
        <div className="px-4 py-4">

          {/* Status badge + time */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              {/* Double-ring pulse — more alive than a single dot */}
              <span className="relative flex h-2.5 w-2.5 shrink-0">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#ef4444] opacity-50" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-[#ef4444]" />
              </span>
              <span className="text-xs font-black text-[#ef4444] uppercase tracking-wide">
                EN VIVO
              </span>
            </div>
            <span className="text-[10px] text-[#64748b]">{formatKickoff(match.starts_at, match.tz)}</span>
          </div>

          {/* Teams + live score — score is the largest element */}
          <div className="flex items-center gap-3 mb-3">
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <span className="text-2xl leading-none shrink-0">{matchTeamFlag(home_team)}</span>
              <span className="text-sm font-bold text-[#f1f5f9] truncate">{matchTeamName(home_team, match.home_placeholder)}</span>
            </div>

            <div className="shrink-0 text-center px-1">
              {hasScore ? (
                <span className="text-2xl font-black text-[#ef4444] tabular-nums animate-live-pulse">
                  {match.home_score}
                  <span className="text-[#ef4444]/30 mx-1 font-light">–</span>
                  {match.away_score}
                </span>
              ) : (
                <span className="text-xl font-black text-[#ef4444] animate-live-pulse">–</span>
              )}
            </div>

            <div className="flex items-center gap-2 flex-1 flex-row-reverse min-w-0">
              <span className="text-2xl leading-none shrink-0">{matchTeamFlag(away_team)}</span>
              <span className="text-sm font-bold text-[#f1f5f9] truncate text-right">
                {matchTeamName(away_team, match.away_placeholder)}
              </span>
            </div>
          </div>

          {/* Prediction + locked notice */}
          <div className="flex items-center justify-between pt-2.5 border-t border-[#ef4444]/10">
            {saved ? (
              <span className="text-xs text-[#94a3b8]">
                Tu pronóstico:{" "}
                <span className="font-mono font-bold text-[#94a3b8]">
                  {saved.home_score}–{saved.away_score}
                </span>
              </span>
            ) : (
              <span className="text-xs text-[#64748b]">Sin predicción</span>
            )}
            <span className="flex items-center gap-1 text-[10px] text-[#64748b]">
              <Lock size={9} className="shrink-0" />
              Cerrado
            </span>
          </div>

        </div>
      </div>
    );
  }

  // ──────────────────────────────────────────────────────────────────
  // ⚪  FINALIZADO
  // ──────────────────────────────────────────────────────────────────
  if (isFinished && hasScore) {
    const hasPred   = !!saved;
    const isScored  = hasPred && saved.scored_at !== null;
    const gotPoints = isScored && saved.points > 0;
    const gotZero   = isScored && saved.points === 0;

    const cardClass = cn(
      "rounded-xl border overflow-hidden",
      gotPoints ? "border-[#00c85a]/30 bg-[#00c85a]/[0.05]" :
      gotZero   ? "border-[#ef4444]/25 bg-[#ef4444]/[0.04]" :
                  "border-[#2a2a45] bg-[#18182a]"
    );

    return (
      <div onClick={handleCardClick} className={cn(cardClass, "cursor-pointer")}>
        <div className="px-3 py-3">

          {/* Status + points */}
          <div className="flex items-center justify-between mb-2.5">
            <span className="text-[10px] font-semibold text-[#64748b] uppercase tracking-widest">
              FINALIZADO
            </span>
            {isScored ? (
              <span className={cn(
                "text-xs font-black font-mono",
                gotPoints ? "text-[#00c85a]" : "text-[#ef4444]"
              )}>
                {gotPoints ? `+${saved.points} pts` : "0 pts"}
              </span>
            ) : (
              <span className="text-[10px] text-[#64748b]">{formatKickoff(match.starts_at, match.tz)}</span>
            )}
          </div>

          {/* Teams + final score */}
          <TeamsWithScore
            homeTeam={home_team}
            awayTeam={away_team}
            homePlaceholder={match.home_placeholder}
            awayPlaceholder={match.away_placeholder}
            homeScore={match.home_score}
            awayScore={match.away_score}
          />

          {/* Prediction + reason */}
          <div className="mt-2 flex items-center justify-between gap-2">
            {hasPred ? (
              <span className="text-xs text-[#94a3b8]">
                Pronóstico:{" "}
                <span className="font-mono font-bold text-[#94a3b8]">
                  {saved.home_score}–{saved.away_score}
                </span>
              </span>
            ) : (
              <span className="text-xs text-[#64748b]">Sin predicción</span>
            )}
            {isScored && saved.points_reason && (
              <span className={cn(
                "text-[10px] font-mono shrink-0",
                gotPoints ? "text-[#00c85a]/60" : "text-[#64748b]/60"
              )}>
                {saved.points_reason}
              </span>
            )}
          </div>

        </div>
      </div>
    );
  }

  // ──────────────────────────────────────────────────────────────────
  // 🟢  PROGRAMADO
  // ──────────────────────────────────────────────────────────────────
  return (
    <div
      onClick={handleCardClick}
      className="rounded-xl border border-[#2a2a45] bg-[#18182a] overflow-hidden cursor-pointer transition-all hover:border-[#3a3a60]"
    >
      <div className="px-3 py-3">

        {/* Status badge + kickoff */}
        <div className="flex items-center justify-between mb-2.5">
          {isOpen ? (
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-[#00c85a] shrink-0" />
              <span className="text-[10px] font-bold text-[#00c85a] uppercase tracking-widest">
                PRONOSTICAR
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5">
              <Lock size={9} className="text-[#64748b] shrink-0" />
              <span className="text-[10px] font-semibold text-[#64748b] uppercase tracking-widest">
                CERRADO
              </span>
            </div>
          )}
          <span className="text-[10px] text-[#64748b]">{formatKickoff(match.starts_at, match.tz)}</span>
        </div>

        {/* Teams */}
        <TeamsVs homeTeam={home_team} awayTeam={away_team} homePlaceholder={match.home_placeholder} awayPlaceholder={match.away_placeholder} />

        {/* Prediction area */}
        {isOpen ? (

          isEditing ? (
            /* Input form */
            <form action={formAction} className="mt-3">
              <input type="hidden" name="match_id" value={match.id} />
<input type="hidden" name="parche_event_id" value={parcheEventId} />
              <div className="flex items-center gap-2">
                <ScoreInput name="home_score" defaultValue={saved?.home_score} disabled={isPending} />
                <span className="text-[#94a3b8] text-sm font-light select-none">–</span>
                <ScoreInput name="away_score" defaultValue={saved?.away_score} disabled={isPending} />
                <button
                  type="submit"
                  disabled={isPending}
                  className="h-9 px-3 bg-[#00c85a] text-[#0a0a12] text-xs font-bold rounded-lg hover:bg-[#00e87a] disabled:opacity-40 transition-colors flex items-center gap-1.5 shrink-0"
                >
                  {isPending ? (
                    <Loader2 size={12} className="animate-spin" />
                  ) : (
                    <>
                      <Check size={11} strokeWidth={2.5} />
                      {saved ? "Actualizar" : "Guardar"}
                    </>
                  )}
                </button>
                {saved && (
                  <button
                    type="button"
                    onClick={() => setIsEditing(false)}
                    className="text-[10px] text-[#64748b] hover:text-[#94a3b8] transition-colors shrink-0"
                  >
                    Cancelar
                  </button>
                )}
              </div>
              {formState && "error" in formState && (
                <p className="text-[10px] text-[#ef4444] mt-1.5">{formState.error}</p>
              )}
            </form>
          ) : (
            /* Saved — show clearly, with edit option */
            <div className="mt-2.5 flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Check size={11} className="text-[#00c85a] shrink-0" />
                <span className="text-xs text-[#f1f5f9]">
                  Tu pronóstico:{" "}
                  <span className="font-mono font-black text-[#00c85a]">
                    {saved!.home_score}–{saved!.away_score}
                  </span>
                </span>
              </div>
              <button
                onClick={() => setIsEditing(true)}
                className="text-[10px] text-[#64748b] hover:text-[#94a3b8] transition-colors shrink-0"
              >
                Editar
              </button>
            </div>
          )

        ) : (

          /* Closed — read-only */
          <div className="mt-2.5">
            {saved ? (
              <span className="text-xs text-[#94a3b8]">
                Tu pronóstico:{" "}
                <span className="font-mono font-bold text-[#94a3b8]">
                  {saved.home_score}–{saved.away_score}
                </span>
              </span>
            ) : (
              <span className="text-xs text-[#64748b]">Sin predicción</span>
            )}
          </div>

        )}

      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────

function TeamsWithScore({
  homeTeam, awayTeam, homePlaceholder, awayPlaceholder, homeScore, awayScore,
}: {
  homeTeam: Team | null;
  awayTeam: Team | null;
  homePlaceholder: string | null;
  awayPlaceholder: string | null;
  homeScore: number | null;
  awayScore: number | null;
}) {
  return (
    <div className="flex items-center gap-2">
      <TeamSide team={homeTeam} placeholder={homePlaceholder} side="home" />
      <div className="shrink-0 w-14 text-center">
        {homeScore !== null && awayScore !== null ? (
          <span className="text-base font-black text-[#f1f5f9] tabular-nums">
            {homeScore}–{awayScore}
          </span>
        ) : (
          <span className="text-xs text-[#64748b]">···</span>
        )}
      </div>
      <TeamSide team={awayTeam} placeholder={awayPlaceholder} side="away" />
    </div>
  );
}

function TeamsVs({ homeTeam, awayTeam, homePlaceholder, awayPlaceholder }: {
  homeTeam: Team | null;
  awayTeam: Team | null;
  homePlaceholder: string | null;
  awayPlaceholder: string | null;
}) {
  return (
    <div className="flex items-center gap-2">
      <TeamSide team={homeTeam} placeholder={homePlaceholder} side="home" />
      <span className="shrink-0 text-[10px] text-[#2a2a45] font-bold w-14 text-center">
        vs
      </span>
      <TeamSide team={awayTeam} placeholder={awayPlaceholder} side="away" />
    </div>
  );
}

function TeamSide({ team, placeholder, side }: { team: Team | null; placeholder: string | null; side: "home" | "away" }) {
  return (
    <div className={cn(
      "flex items-center gap-1.5 flex-1 min-w-0",
      side === "away" && "flex-row-reverse"
    )}>
      <span className="text-lg leading-none shrink-0">{matchTeamFlag(team)}</span>
      <span className={cn(
        "text-xs font-semibold text-[#f1f5f9] truncate",
        side === "away" && "text-right"
      )}>
        {matchTeamName(team, placeholder)}
      </span>
    </div>
  );
}

// High-contrast input — clearly editable on dark backgrounds.
// bg-[#2a2a50] + border-[#5252a0] provides strong contrast against
// the card background (#18182a) without looking out of place in dark theme.
function ScoreInput({
  name,
  defaultValue,
  disabled,
}: {
  name: string;
  defaultValue?: number;
  disabled?: boolean;
}) {
  return (
    <input
      type="number"
      name={name}
      min={0}
      max={30}
      step={1}
      defaultValue={defaultValue ?? ""}
      placeholder="0"
      disabled={disabled}
      required
      className="w-12 h-9 text-center text-sm font-black rounded-xl bg-[#2a2a50] border-2 border-[#5252a0] text-[#f1f5f9] placeholder:text-[#5252a0] hover:border-[#6a6ac0] focus:border-[#00c85a] focus:ring-2 focus:ring-[#00c85a]/20 focus:bg-[#00c85a]/[0.05] disabled:opacity-40 tabular-nums transition-colors outline-none"
      style={{ MozAppearance: "textfield" } as React.CSSProperties}
    />
  );
}
