"use client";

import { useContext, useId, useState } from "react";
import ActionForm from "@/components/ActionForm";
import { FormContext } from "@/components/form-context";
import { updateLiveResultAction } from "@/app/(privado)/control/actions";
import { inputClass, TextAreaField } from "./inputs";

function ScoreInput({ name, label, value, onChange }: { name: string; label: string; value: string; onChange: (v: string) => void }) {
  const { errors } = useContext(FormContext);
  const id = `${name}-${useId()}`;
  const error = errors[name];
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label htmlFor={id} className="truncate text-xs font-semibold text-fg-2">{label}</label>
      <input
        id={id}
        name={name}
        type="number"
        required
        min={0}
        max={30}
        step={1}
        inputMode="numeric"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={error ? true : undefined}
        className={`${inputClass} text-center font-mono ${error ? "border-danger/60" : "border-line"}`}
      />
      {error && <p className="text-xs font-medium text-danger">⚠ {error}</p>}
    </div>
  );
}

// Editor de resultado recuperado de La Penúltima (MatchEditorCard): estado (En vivo / Finalizado), marcador local y
// visitante, ganador de la llave en eliminatorias y «Guardar resultado» — guardado directo, sin aprobación por
// guardado. Finalizar (o corregir un finalizado) pide confirmación explícita con el marcador exacto que se enviará
// (los campos son controlados: el diálogo y el envío usan los mismos valores).
export default function LiveResultEditor({ matchId, eventId, matchStatus, revision, home, away, homeScore, awayScore, winnerSide, isKnockout }: {
  matchId: string; eventId: string; matchStatus: string; revision: number; home: string; away: string;
  homeScore: number | null; awayScore: number | null; winnerSide: string | null; isKnockout: boolean;
}) {
  const wasFinished = matchStatus === "finished";
  const [status, setStatus] = useState<"live" | "finished">(wasFinished ? "finished" : "live");
  const [h, setH] = useState(String(homeScore ?? 0));
  const [a, setA] = useState(String(awayScore ?? 0));
  const [w, setW] = useState(winnerSide ?? "");
  const finishing = status === "finished";
  const tie = h !== "" && a !== "" && Number(h) === Number(a);
  const winnerLabel = w === "home" ? home : w === "away" ? away : null;
  const summary = `${home} ${h} – ${a} ${away}${finishing && tie && winnerLabel ? ` · avanza ${winnerLabel} (penales)` : ""}`;

  const submitLabel = wasFinished ? "Guardar corrección" : finishing ? "Finalizar partido" : matchStatus === "live" ? "Guardar marcador" : "Iniciar partido";
  const confirm = finishing ? (
    <div className="flex flex-col gap-1">
      <p><strong>{summary}</strong></p>
      <p className="text-fg-2">
        {wasFinished
          ? "La corrección reemplaza el resultado, recalcula los puntos de todos los parches y queda auditada con tu motivo."
          : "Finalizar fija el resultado y calcula los puntos de todos los parches. Podrás corregirlo después (con motivo)."}
      </p>
    </div>
  ) : undefined;

  return (
    <ActionForm action={updateLiveResultAction} submitLabel={submitLabel} variant={finishing ? "primary" : "secondary"} size="sm" confirm={confirm} confirmLabel={wasFinished ? "Sí, corregir" : "Sí, finalizar"}>
      <input type="hidden" name="match_id" value={matchId} />
      <input type="hidden" name="event_id" value={eventId} />
      <input type="hidden" name="expected_revision" value={revision} />
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`st-${matchId}`} className="text-xs font-semibold text-fg-2">Estado</label>
        <select id={`st-${matchId}`} name="status" value={status} onChange={(e) => setStatus(e.target.value as "live" | "finished")} className={`${inputClass} border-line`}>
          <option value="live">🔴 En vivo</option>
          <option value="finished">✓ Finalizado</option>
        </select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <ScoreInput name="home_score" label={`${home} (local)`} value={h} onChange={setH} />
        <ScoreInput name="away_score" label={`${away} (visitante)`} value={a} onChange={setA} />
      </div>
      {isKnockout && finishing && (
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`w-${matchId}`} className="text-xs font-semibold text-fg-2">Ganador de la llave</label>
          <select id={`w-${matchId}`} name="winner_side" value={w} onChange={(e) => setW(e.target.value)} className={`${inputClass} border-line`}>
            <option value="">— Solo si empatan —</option>
            <option value="home">{home} (local)</option>
            <option value="away">{away} (visitante)</option>
          </select>
          {tie && !w ? <p className="text-xs text-gold">Empate en eliminatoria: indica quién avanzó por penales. No suma puntos.</p> : <p className="text-xs text-fg-3">Los penales no suman puntos.</p>}
        </div>
      )}
      {wasFinished && (
        <TextAreaField name="reason" label="Motivo de la corrección (obligatorio)" required minLength={5} maxLength={500} rows={2} placeholder="Ej.: el marcador oficial fue 2-1 según el acta del partido" />
      )}
      {!finishing && <p className="text-xs text-fg-3">Cada guardado se muestra al instante a los jugadores y no calcula puntos. «Finalizado» cierra el partido y calcula los puntos.</p>}
    </ActionForm>
  );
}
