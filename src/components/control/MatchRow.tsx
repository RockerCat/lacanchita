"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { AlertCircle, Check, ExternalLink, Loader2 } from "lucide-react";
import { reopenMatchAction, updateLiveResultAction, type ControlState } from "@/app/(privado)/control/actions";
import TeamBadge from "./TeamBadge";
import type { Side } from "./MatchCard";
import { formatKickoffTime } from "@/lib/control/board";
import type { ResultState } from "@/lib/control/results";

// Datos serializables de un partido para el calendario operativo de Control.
export type RowData = {
  id: string;
  eventId: string;
  startsAt: string;
  status: string;
  state: ResultState;
  homeScore: number | null;
  awayScore: number | null;
  winnerSide: string | null;
  revision: number;
  stageName?: string;
  isKnockout: boolean;
  matchNumber: number | null;
  groupCode: string | null;
  roundLabel: string | null;
  home: Side;
  away: Side;
  // Ambos equipos asignados y el partido no está aplazado ni cancelado.
  playable: boolean;
  pending?: { home: number; away: number } | null;
};


function StatusDot({ status, state }: { status: string; state: ResultState }) {
  if (state === "live") {
    return (
      <span className="flex shrink-0 items-center gap-1 rounded-md border border-danger/25 bg-danger/15 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wide text-danger">
        <span className="relative flex h-1.5 w-1.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-danger opacity-60" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-danger" />
        </span>
        En vivo
      </span>
    );
  }
  if (state === "official") return <span className="shrink-0 text-[9px] font-semibold uppercase tracking-wide text-cancha-text">Fin.</span>;
  if (state === "imported") return <span className="shrink-0 text-[9px] font-semibold uppercase tracking-wide text-fg-3">Hist.</span>;
  if (state === "pending") return <span className="shrink-0 text-[9px] font-semibold uppercase tracking-wide text-gold">Pend.</span>;
  if (status === "postponed") return <span className="shrink-0 text-[9px] font-semibold uppercase tracking-wide text-gold">Aplaz.</span>;
  if (status === "cancelled") return <span className="shrink-0 text-[9px] font-semibold uppercase tracking-wide text-danger">Canc.</span>;
  return <span className="shrink-0 text-[9px] uppercase tracking-wide text-fg-3">Prog.</span>;
}

const CONTROL = "h-8 rounded-lg border border-line bg-bg text-fg focus:border-cancha/60 focus:outline-none transition-colors";

function ScoreInput({ name, value, onChange, label }: { name: string; value: string; onChange: (v: string) => void; label: string }) {
  return (
    <input
      type="number"
      name={name}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      min={0}
      max={30}
      step={1}
      inputMode="numeric"
      placeholder="–"
      aria-label={label}
      title={label}
      className={`${CONTROL} w-10 text-center text-sm font-bold tabular-nums placeholder:text-fg-3`}
      style={{ MozAppearance: "textfield" } as React.CSSProperties}
    />
  );
}

const validScore = (v: string) => /^\d+$/.test(v) && Number(v) >= 0 && Number(v) <= 30;

// Fila del calendario de Partidos: port de AdminCalendarRow de La Penúltima. Fila 1: hora · grupo · estado. Fila 2:
// equipos y marcador. Fila 3: estado · goles · «Guardar» · enlace al partido, todo en una línea compacta (sin +/-: el
// original usa dos cajas numéricas). Se conectan a las acciones seguras actuales: misma revisión (`result_revision`),
// finalizar/corregir/reabrir piden confirmación con el marcador exacto y corregir/reabrir exigen motivo.
export default function MatchRow({ row, base, timezone, editable }: { row: RowData; base: string; timezone: string; editable: boolean }) {
  const { state, status, home, away } = row;
  const live = state === "live";
  const [result, formAction, isPending] = useActionState<ControlState, FormData>(
    // Finalizado → En vivo es la reapertura excepcional (otra operación en la base); el resto es el guardado directo.
    (prev, fd) => (row.status === "finished" && fd.get("status") === "live" ? reopenMatchAction(prev, fd) : updateLiveResultAction(prev, fd)),
    { error: null },
  );
  const savedStatus = status === "finished" ? "finished" : status === "live" ? "live" : "scheduled";
  const [statusVal, setStatusVal] = useState<string>(savedStatus);
  const [h, setH] = useState(String(row.homeScore ?? 0));
  const [a, setA] = useState(String(row.awayScore ?? 0));
  const [winner, setWinner] = useState(row.winnerSide ?? "");
  const [reason, setReason] = useState("");
  const [armed, setArmed] = useState(false);

  // Igual que el original, los valores se sincronizan con lo guardado tras cada operación (se ajusta durante el render).
  const synced = `${row.revision}|${savedStatus}|${row.homeScore}|${row.awayScore}|${row.winnerSide}`;
  const [seen, setSeen] = useState(synced);
  const [seenResult, setSeenResult] = useState(result);
  if (seen !== synced) {
    setSeen(synced);
    setStatusVal(savedStatus);
    setH(String(row.homeScore ?? 0));
    setA(String(row.awayScore ?? 0));
    setWinner(row.winnerSide ?? "");
  }
  if (seenResult !== result) {
    setSeenResult(result);
    setArmed(false);
    if (result.ok) setReason("");
  }

  const shown = state === "pending" && row.pending ? { h: row.pending.home, a: row.pending.away } : { h: row.homeScore, a: row.awayScore };
  const hasScore = state !== "none" && shown.h !== null && shown.a !== null;
  const context = [row.matchNumber ? `#${row.matchNumber}` : null, row.stageName, row.roundLabel].filter(Boolean).join(" · ");
  const editHref = `${base}/partidos/${row.id}`;
  const kickoff = formatKickoffTime(row.startsAt, timezone);

  const scoresOk = validScore(h) && validScore(a);
  const tie = scoresOk && Number(h) === Number(a);
  const showWinner = row.isKnockout && statusVal !== "scheduled" && tie;
  const wasFinished = savedStatus === "finished";
  const reopening = wasFinished && statusVal === "live";
  const finishing = statusVal === "finished";
  const changed = statusVal !== savedStatus || h !== (String(row.homeScore ?? 0)) || a !== (String(row.awayScore ?? 0)) || winner !== (row.winnerSide ?? "");
  const needsReason = wasFinished && changed;
  const reasonOk = !needsReason || reason.trim().length >= 5;
  const needsConfirm = finishing || reopening;
  const canSave = statusVal !== "scheduled" && changed && (reopening || scoresOk) && reasonOk && !isPending;
  const winnerName = winner === "home" ? home.name : winner === "away" ? away.name : null;
  const summary = `${home.name} ${h}–${a} ${away.name}${finishing && tie && winnerName ? ` · avanza ${winnerName} (penales)` : ""}`;

  const tone = live ? "border-danger/30 bg-danger/[0.03]" : state === "official" || state === "imported" ? "border-line bg-surface-raised/50" : "border-line bg-surface-raised";
  const message = result.error ?? Object.values(result.fieldErrors ?? {})[0] ?? null;
  const inline = editable && row.playable && (state === "none" || state === "live" || state === "official");

  return (
    <article className={`rounded-xl border px-3 py-2.5 ${tone}`} aria-label={`${home.name} contra ${away.name}${live ? ", en vivo" : ""}`} data-live={live ? "true" : undefined}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="shrink-0 font-mono text-[10px] tabular-nums text-fg-2">{kickoff}</span>
          {row.groupCode && <span className="shrink-0 rounded border border-line bg-surface px-1.5 py-0.5 font-mono text-[9px] text-fg-3">G.{row.groupCode}</span>}
          {context && <span className="truncate text-[10px] text-fg-3">{context}</span>}
        </div>
        <StatusDot status={status} state={state} />
      </div>

      <div className="mb-2.5 flex items-center gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-1.5">
          <TeamBadge team={home.team} size="sm" />
          <span className="truncate text-xs font-semibold text-fg">{home.name}</span>
        </div>
        <div className="w-12 shrink-0 text-center">
          {hasScore ? (
            <span className={`text-sm font-black tabular-nums ${live ? "text-danger" : state === "pending" ? "text-gold" : "text-fg"}`}>{shown.h}–{shown.a}</span>
          ) : (
            <span className="text-[10px] text-fg-3">vs</span>
          )}
        </div>
        <div className="flex min-w-0 flex-1 flex-row-reverse items-center gap-1.5">
          <TeamBadge team={away.team} size="sm" />
          <span className="truncate text-right text-xs font-semibold text-fg">{away.name}</span>
        </div>
      </div>

      {inline ? (
        <form action={formAction}>
          <input type="hidden" name="match_id" value={row.id} />
          <input type="hidden" name="event_id" value={row.eventId} />
          <input type="hidden" name="expected_revision" value={row.revision} />
          <div className="flex flex-wrap items-center gap-1.5">
            <select name="status" aria-label="Estado" value={statusVal} onChange={(e) => setStatusVal(e.target.value)} className={`${CONTROL} px-2 text-xs`}>
              {savedStatus === "scheduled" && <option value="scheduled">🗓 Programado</option>}
              <option value="live">🔴 En vivo</option>
              <option value="finished">✓ Finalizado</option>
            </select>
            <div className="flex shrink-0 items-center gap-1">
              <ScoreInput name="home_score" value={h} onChange={setH} label={`${home.name} (local)`} />
              <span className="select-none text-xs text-fg-3">–</span>
              <ScoreInput name="away_score" value={a} onChange={setA} label={`${away.name} (visitante)`} />
            </div>
            {needsConfirm ? (
              <button type="button" disabled={!canSave} onClick={() => setArmed(true)} className="flex h-8 shrink-0 items-center gap-1 rounded-lg bg-cancha px-3 text-xs font-bold text-on-cancha transition-colors hover:bg-cancha-hover disabled:opacity-40">
                {reopening ? "Reabrir" : wasFinished ? "Corregir" : "Finalizar"}
              </button>
            ) : (
              <button type="submit" disabled={!canSave} className="flex h-8 shrink-0 items-center gap-1 rounded-lg bg-cancha px-3 text-xs font-bold text-on-cancha transition-colors hover:bg-cancha-hover disabled:opacity-40">
                {isPending ? <><Loader2 size={11} className="animate-spin" />Guardando</> : "Guardar"}
              </button>
            )}
            <Link href={editHref} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-line text-fg-3 transition-colors hover:border-line-strong hover:text-fg-2" title="Partido completo: editar programación, aplazar o cancelar" aria-label="Editar programación, aplazar o cancelar">
              <ExternalLink size={11} />
            </Link>
          </div>

          {showWinner && (
            <div className="mt-2 flex flex-col gap-1">
              <span className="text-[9px] font-medium uppercase tracking-wide text-fg-3">Ganador de la llave</span>
              <select name="winner_side" aria-label="Ganador de la llave" value={winner} onChange={(e) => setWinner(e.target.value)} className={`${CONTROL} w-full border-gold/40 px-2 text-xs`}>
                <option value="">— Por definir —</option>
                <option value="home">{home.name} (local)</option>
                <option value="away">{away.name} (visitante)</option>
              </select>
            </div>
          )}

          {needsReason && (
            <input name="reason" value={reason} onChange={(e) => setReason(e.target.value)} minLength={5} maxLength={500} placeholder={reopening ? "Motivo de la reapertura (obligatorio)" : "Motivo de la corrección (obligatorio)"} aria-label="Motivo" className={`${CONTROL} mt-2 w-full px-2 text-xs placeholder:text-fg-3`} />
          )}

          {armed && needsConfirm && (
            <div className="mt-2 flex flex-col gap-2 rounded-lg border border-gold/30 bg-gold/[0.08] p-2.5 text-xs text-fg">
              <p>
                <strong>{reopening ? `${home.name} ${row.homeScore}–${row.awayScore} ${away.name}` : summary}</strong>
                {" · "}
                {reopening ? "volverá a En vivo y se retiran sus puntos." : wasFinished ? "la corrección recalcula los puntos de todos los parches y queda auditada." : "finalizar calcula los puntos de todos los parches."}
              </p>
              <div className="flex gap-2">
                <button type="submit" disabled={isPending} className="flex h-8 items-center gap-1 rounded-lg bg-cancha px-3 text-xs font-bold text-on-cancha hover:bg-cancha-hover disabled:opacity-40">
                  {isPending ? <><Loader2 size={11} className="animate-spin" />Guardando</> : reopening ? "Sí, reabrir" : wasFinished ? "Sí, corregir" : "Sí, finalizar"}
                </button>
                <button type="button" disabled={isPending} onClick={() => setArmed(false)} className="h-8 rounded-lg px-3 text-xs font-semibold text-fg-2 hover:text-fg">Cancelar</button>
              </div>
            </div>
          )}

          <div aria-live="polite">
            {message && <p role="alert" className="mt-1.5 flex items-center gap-1.5 text-xs text-danger"><AlertCircle size={11} className="shrink-0" />{message}</p>}
            {!message && result.ok && result.message && <p role="status" className="mt-1.5 flex items-center gap-1.5 text-xs text-cancha-text"><Check size={11} className="shrink-0" />{result.message}</p>}
          </div>
        </form>
      ) : !editable ? null : state === "imported" ? (
        <p className="text-xs text-fg-3">Marcador histórico importado: no se modifica desde Control.</p>
      ) : state === "pending" ? (
        <Link href={`${base}/resultados?ver=pendientes`} className="text-xs font-semibold text-gold hover:underline">Resolver el marcador pendiente en Resultados →</Link>
      ) : (
        <div className="flex items-center justify-between gap-2 text-xs text-fg-2">
          <p>
            {status === "cancelled"
              ? "Cancelado (definitivo): no admite resultado."
              : status === "postponed"
                ? "Aplazado: se conservan los pronósticos; reprograma la fecha para reactivarlo."
                : "Asigna los dos equipos antes de iniciar el partido."}
          </p>
          {status !== "cancelled" && <Link href={editHref} className="shrink-0 font-semibold text-fg-3 hover:text-cancha-text">Editar →</Link>}
        </div>
      )}
    </article>
  );
}
