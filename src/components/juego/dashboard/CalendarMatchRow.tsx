"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/juego/utils";
import {
  matchClosedReason,
  matchTeamName,
  matchTeamFlag,
  type MatchWithPrediction,
  type PredictionActionState,
} from "@/lib/juego/matches";
import { savePredictionAction } from "@/lib/juego/prediction-action";
import { Check, Lock, Loader2 } from "lucide-react";
import { useGoalCelebration } from "@/components/juego/useGoalCelebration";
import GoalCelebrationOverlay from "./GoalCelebrationOverlay";
import { usePredictionEditing } from "@/components/juego/PredictionEditingContext";
import { useJuego } from "@/lib/juego/context";

/** Hora local de inicio en la zona del torneo — "14:00" */
function matchTime(startsAt: string, tz: string): string {
  return new Date(startsAt).toLocaleTimeString("es", {
    hour:     "2-digit",
    minute:   "2-digit",
    timeZone: tz,
  });
}

export default function CalendarMatchRow({ match }: { match: MatchWithPrediction }) {
  const { home_team, away_team, status } = match;
  const router = useRouter();
  const { base } = useJuego();

  // ── Goal animation ─────────────────────────────────────────────────
  const goalAnim = useGoalCelebration(
    { home: match.home_score, away: match.away_score },
    status === "live"
  );

  // ── Per-match save ─────────────────────────────────────────────────
  const { parcheEventId } = useJuego();
  const [formState, formAction, isPending] = useActionState<PredictionActionState, FormData>(
    savePredictionAction,
    null
  );
  const [isEditing, setIsEditing] = useState(!match.prediction);
  // True once the user touches an input — guards against pausing polling
  // for auto-open forms (no prediction yet) where there is nothing to lose.
  const [hasStartedTyping, setHasStartedTyping] = useState(false);

  // ── Draft persistence ──────────────────────────────────────────────
  const homeRef = useRef<HTMLInputElement>(null);
  const awayRef = useRef<HTMLInputElement>(null);

  // Restore draft once after hydration — only for new predictions on open matches.
  useEffect(() => {
    if (match.prediction || matchClosedReason(match) !== null) return;
    try {
      const raw = sessionStorage.getItem(`pred_draft_v1_${match.id}`);
      if (!raw) return;
      const { home, away } = JSON.parse(raw) as { home?: string; away?: string };
      if (homeRef.current && home !== undefined) homeRef.current.value = home;
      if (awayRef.current && away !== undefined) awayRef.current.value = away;
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // intentional: one-shot draft restore after hydration

  useEffect(() => {
    if (formState && "success" in formState) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setIsEditing(false);
      setHasStartedTyping(false);
      try { sessionStorage.removeItem(`pred_draft_v1_${match.id}`); } catch {}
    }
  }, [formState, match.id]);

  function handleInput() {
    setHasStartedTyping(true);
    try {
      sessionStorage.setItem(`pred_draft_v1_${match.id}`, JSON.stringify({
        home: homeRef.current?.value,
        away: awayRef.current?.value,
      }));
    } catch {}
  }

  const saved     = (formState && "success" in formState) ? formState.prediction : match.prediction;
  const isOpen    = matchClosedReason(match) === null;

  // ── Pause auto-refresh only when there is real data at risk ───────
  // • saved !== null  → user clicked "Editar" on an existing prediction
  // • hasStartedTyping → user typed in the auto-open form (new prediction)
  // Auto-open forms with empty inputs do NOT pause polling: inputs are
  // uncontrolled and their DOM values survive router.refresh().
  const { registerEditing } = usePredictionEditing();
  useEffect(() => {
    const formActive = isOpen && isEditing && (saved !== null || hasStartedTyping);
    registerEditing(match.id, formActive);
    return () => registerEditing(match.id, false);
  }, [match.id, isOpen, isEditing, saved, hasStartedTyping, registerEditing]);

  const isLive    = status === "live";
  const isFinished = status === "finished";
  const hasScore  = match.home_score !== null && match.away_score !== null;
  const time      = matchTime(match.starts_at, match.tz);

  function handleCardClick(e: React.MouseEvent<HTMLDivElement>) {
    if ((e.target as Element).closest("input, button, select, a")) return;
    router.push(`${base}/matches/${match.id}`);
  }

  // ── Card styling by state ──────────────────────────────────────────
  const gotPoints  = isFinished && !!saved && ((saved as { points?: number }).points ?? 0) > 0;
  const gotZero    = isFinished && !!saved && (saved as { scored_at?: string }).scored_at && !gotPoints;
  const cardBase   = "relative rounded-2xl border overflow-hidden cursor-pointer transition-all";
  const cardClass  = isLive
    ? cn(cardBase, goalAnim ? "animate-goal-card" : "animate-live-glow",
        "border-[#ef4444]/35 bg-gradient-to-br from-[#ef4444]/[0.10] to-[#18182a] hover:border-[#ef4444]/55")
    : gotPoints
    ? cn(cardBase, "border-[#00c85a]/35 bg-[#00c85a]/[0.05] hover:border-[#00c85a]/50")
    : gotZero
    ? cn(cardBase, "border-[#ef4444]/20 bg-[#ef4444]/[0.04]")
    : isOpen && !saved
    ? cn(cardBase, "border-[#f59e0b]/30 bg-[#f59e0b]/[0.03] hover:border-[#f59e0b]/50")
    : cn(cardBase, "border-[#2a2a45] bg-[#18182a] hover:border-[#3a3a60]");

  return (
    <div className={cardClass} onClick={handleCardClick}>
      {isLive && <GoalCelebrationOverlay active={goalAnim} />}

      <div className="px-3 pt-3 pb-2.5">

        {/* ── Row 1 ────────────────────────────────────────────────── */}
        {isOpen && isEditing ? (
          /* Meta row — teams appear only in the form below, no duplication */
          <div className="flex items-center gap-2 mb-3">
            <span className="text-[10px] font-mono tabular-nums text-[#94a3b8] shrink-0">
              {time}
            </span>
            {match.group_code && (
              <span className="text-[10px] text-[#475569]">· Grupo {match.group_code}</span>
            )}
            <div className="flex-1" />
            {/* Status indicator: ⚠ pending or ✓ saved */}
            {saved
              ? <Check size={12} className="text-[#00c85a] shrink-0" />
              : <span className="text-[#f59e0b] text-xs shrink-0">⚠</span>}
          </div>
        ) : (
          /* Full teams row for live/finished/closed states */
          <div className="flex items-center gap-2 mb-2">
            <span className={cn(
              "text-[10px] font-mono tabular-nums shrink-0 w-10",
              isLive ? "text-[#ef4444]" : "text-[#94a3b8]"
            )}>
              {time}
            </span>
            <div className="flex items-center gap-1 min-w-0 flex-1">
              <span className="text-sm leading-none shrink-0">{matchTeamFlag(home_team)}</span>
              <span className="text-xs font-semibold text-[#f1f5f9] truncate">{matchTeamName(home_team, match.home_placeholder)}</span>
            </div>
            <div className="shrink-0 text-center px-1">
              {isLive && hasScore ? (
                <span className="text-base font-black text-[#ef4444] tabular-nums animate-live-pulse">
                  {match.home_score}<span className="text-[#ef4444]/40 mx-0.5 font-light">–</span>{match.away_score}
                </span>
              ) : isFinished && hasScore ? (
                <span className={cn("text-base font-black tabular-nums", gotPoints ? "text-[#00c85a]" : "text-[#f1f5f9]")}>
                  {match.home_score}<span className="text-[#475569] mx-0.5 font-light">–</span>{match.away_score}
                </span>
              ) : (
                <span className="text-[10px] text-[#475569] font-bold">vs</span>
              )}
            </div>
            <div className="flex items-center gap-1 flex-row-reverse min-w-0 flex-1">
              <span className="text-sm leading-none shrink-0">{matchTeamFlag(away_team)}</span>
              <span className="text-xs font-semibold text-[#f1f5f9] truncate text-right">{matchTeamName(away_team, match.away_placeholder)}</span>
            </div>
            <StatusPill match={match} />
          </div>
        )}

        {/* ── Row 2: prediction area ───────────────────────────────── */}
        <div className={isOpen && isEditing ? "" : "ml-12"}>{/* ml-12 aligns under teams past the time column */}
          {isLive && (
            <div className="flex items-center justify-between">
              {saved ? (
                <span className="text-[10px] text-[#94a3b8]">
                  Mi pronóstico:{" "}
                  <span className="font-mono font-bold">{saved.home_score}–{saved.away_score}</span>
                </span>
              ) : (
                <span className="text-[10px] text-[#475569]">Sin predicción</span>
              )}
              <span className="flex items-center gap-1 text-[10px] text-[#64748b]">
                <Lock size={8} />Cerrado
              </span>
            </div>
          )}

          {isFinished && (
            <div className="flex items-center justify-between">
              {saved ? (
                <span className="text-[10px] text-[#94a3b8]">
                  Pronóstico:{" "}
                  <span className="font-mono font-bold">{saved.home_score}–{saved.away_score}</span>
                </span>
              ) : (
                <span className="text-[10px] text-[#475569]">Sin pronóstico</span>
              )}
              {(saved as { scored_at?: string } | null)?.scored_at && (
                <span className={cn("text-xs font-black font-mono", gotPoints ? "text-[#00c85a]" : "text-[#ef4444]/70")}>
                  {gotPoints ? `+${(saved as {points: number}).points} pts` : "0 pts"}
                </span>
              )}
            </div>
          )}

          {!isLive && !isFinished && !isOpen && saved && (
            <span className="text-[10px] text-[#94a3b8]">
              Pronóstico: <span className="font-mono font-bold">{saved.home_score}–{saved.away_score}</span>
            </span>
          )}
          {!isLive && !isFinished && !isOpen && !saved && (
            <span className="text-[10px] text-[#475569]">Sin predicción</span>
          )}

          {isOpen && (
            isEditing ? (
              <form action={formAction} onInput={handleInput} className="flex flex-col items-center gap-2.5 pt-1">
                <input type="hidden" name="match_id" value={match.id} />
<input type="hidden" name="parche_event_id" value={parcheEventId} />

                {/* Teams with centered inputs */}
                <div className="flex items-center gap-1.5 w-full">
                  <div className="flex items-center gap-1 min-w-0 flex-1">
                    <span className="text-sm leading-none shrink-0">{matchTeamFlag(home_team)}</span>
                    <span className="text-xs font-semibold text-[#f1f5f9] truncate">{matchTeamName(home_team, match.home_placeholder)}</span>
                  </div>
                  <div className="shrink-0 flex items-center gap-1">
                    <ScoreInput name="home_score" defaultValue={saved?.home_score} disabled={isPending} ref={homeRef} />
                    <span className="text-[#94a3b8] text-sm font-light select-none">–</span>
                    <ScoreInput name="away_score" defaultValue={saved?.away_score} disabled={isPending} ref={awayRef} />
                  </div>
                  <div className="flex items-center gap-1 flex-row-reverse min-w-0 flex-1">
                    <span className="text-sm leading-none shrink-0">{matchTeamFlag(away_team)}</span>
                    <span className="text-xs font-semibold text-[#f1f5f9] truncate text-right">{matchTeamName(away_team, match.away_placeholder)}</span>
                  </div>
                </div>

                {/* Save button centered below inputs */}
                <div className="flex flex-col items-center gap-1 w-full">
                  <button
                    type="submit"
                    disabled={isPending}
                    className="h-9 px-6 bg-[#00c85a] text-[#0a0a12] text-xs font-bold rounded-xl hover:bg-[#00e87a] disabled:opacity-40 transition-colors flex items-center gap-1.5"
                  >
                    {isPending
                      ? <><Loader2 size={11} className="animate-spin" />Guardando...</>
                      : <><Check size={11} strokeWidth={2.5} />{saved ? "Actualizar" : "Guardar"}</>}
                  </button>
                  {saved && (
                    <button
                      type="button"
                      onClick={() => {
                        setIsEditing(false);
                        setHasStartedTyping(false);
                        try { sessionStorage.removeItem(`pred_draft_v1_${match.id}`); } catch {}
                      }}
                      className="text-[9px] text-[#475569] hover:text-[#94a3b8] transition-colors"
                    >
                      Cancelar
                    </button>
                  )}
                </div>
              </form>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-[#94a3b8]">
                  <Check size={9} className="inline text-[#00c85a] mr-0.5" />
                  {saved!.home_score}–{saved!.away_score}
                </span>
                <button
                  onClick={() => setIsEditing(true)}
                  className="text-[9px] text-[#475569] hover:text-[#94a3b8]"
                >
                  Editar
                </button>
              </div>
            )
          )}

          {formState && "error" in formState && (
            <p className="text-[9px] text-[#ef4444] mt-1">{formState.error}</p>
          )}
        </div>

      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────

function StatusPill({ match }: { match: MatchWithPrediction }) {
  const { status } = match;
  if (status === "live") {
    return (
      <div className="flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-[#ef4444]/15 border border-[#ef4444]/25 shrink-0">
        <span className="relative flex h-1.5 w-1.5 shrink-0">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#ef4444] opacity-60" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[#ef4444]" />
        </span>
        <span className="text-[9px] font-black text-[#ef4444] uppercase tracking-wide">Vivo</span>
      </div>
    );
  }
  if (status === "finished") {
    return <span className="text-[9px] text-[#64748b] uppercase tracking-widest shrink-0">Fin.</span>;
  }
  const isOpen = matchClosedReason(match) === null;
  if (isOpen) {
    const hasPred = !!match.prediction;
    return hasPred
      ? <Check size={12} className="text-[#00c85a] shrink-0" />
      : <span className="text-[#f59e0b] text-xs shrink-0">⚠</span>;
  }
  return <Lock size={10} className="text-[#475569] shrink-0" />;
}

function ScoreInput({
  name, defaultValue, disabled, ref,
}: {
  name: string;
  defaultValue?: number;
  disabled?: boolean;
  ref?: React.Ref<HTMLInputElement>;
}) {
  return (
    <input
      ref={ref}
      type="number"
      name={name}
      min={0}
      max={30}
      step={1}
      defaultValue={defaultValue ?? ""}
      placeholder="0"
      disabled={disabled}
      required
      className="w-11 h-8 text-center text-base font-black rounded-xl bg-[#2a2a50] border-2 border-[#5252a0] text-[#f1f5f9] placeholder:text-[#5252a0] focus:border-[#00c85a] focus:outline-none focus:ring-2 focus:ring-[#00c85a]/20 disabled:opacity-40 tabular-nums transition-colors"
      style={{ MozAppearance: "textfield" } as React.CSSProperties}
    />
  );
}
