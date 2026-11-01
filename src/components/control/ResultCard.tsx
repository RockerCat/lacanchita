import Link from "next/link";
import ActionForm from "@/components/ActionForm";
import Card from "@/components/ui/Card";
import { reopenMatchAction, resolvePendingAction } from "@/app/(privado)/control/actions";
import LiveResultEditor from "./LiveResultEditor";
import MatchCard, { type Side } from "./MatchCard";
import { TextAreaField } from "./inputs";
import type { Match, Stage } from "@/lib/control/data";
import { resultState, type PendingDraft } from "@/lib/control/results";

// Una tarjeta por partido con el ciclo original: iniciar/guardar marcador en vivo → finalizar → (corregir | reabrir).
// Un marcador pendiente del flujo anterior (draft) se muestra aparte y se resuelve de forma explícita.
export default function ResultCard({ match, stage, draft, home, away, eventName, eventSlug, timezone, editable }: {
  match: Match; stage: Stage | undefined; draft?: PendingDraft; home: Side; away: Side; eventName: string; eventSlug: string; timezone: string; editable: boolean;
}) {
  void eventName;
  const state = resultState(match, draft);
  const shown = state === "pending" && draft ? { home: draft.home_score, away: draft.away_score } : { home: match.home_score, away: match.away_score };
  const winnerText = match.winner_side && match.home_score === match.away_score && match.status === "finished"
    ? `Avanza ${match.winner_side === "home" ? home.name : away.name} (penales)`
    : null;
  const playable = Boolean(match.home_team_id && match.away_team_id) && !["postponed", "cancelled"].includes(match.status);
  const hidden = (
    <>
      <input type="hidden" name="match_id" value={match.id} />
      <input type="hidden" name="event_id" value={match.event_id} />
    </>
  );
  const editLink = (
    <Link href={`/control/torneos/${eventSlug}/partidos/${match.id}`} className="text-sm font-semibold text-fg-2 hover:text-cancha-text">
      Editar programación · aplazar · cancelar
    </Link>
  );

  return (
    <Card className="p-4 sm:p-5">
      <MatchCard match={match} stageName={stage?.name} home={home} away={away} state={state} shown={shown} timezone={timezone}>
        {winnerText && <p className="text-xs text-fg-2">{winnerText}</p>}
        {state === "official" && <p className="text-xs text-fg-3">Revisión {match.result_revision}</p>}
      </MatchCard>

      {!editable ? (
        <p className="mt-3 text-sm text-fg-2">
          {state === "imported"
            ? "Torneo histórico: este marcador se importó de La Penúltima sin un cierre explícito registrado. No se modifica desde Control."
            : "Torneo de solo lectura."}
        </p>
      ) : state === "imported" ? (
        <p className="mt-3 text-sm text-fg-2">Marcador importado: no se edita desde Control.</p>
      ) : state === "official" ? (
        <div className="mt-4 flex flex-col gap-3 border-t border-line-subtle pt-4">
          <details>
            <summary className="cursor-pointer text-sm font-semibold text-fg-2 hover:text-cancha-text">Corregir resultado…</summary>
            <div className="mt-3">
              <LiveResultEditor matchId={match.id} eventId={match.event_id} matchStatus="finished" revision={match.result_revision} home={home.name} away={away.name}
                homeScore={match.home_score} awayScore={match.away_score} winnerSide={match.winner_side} isKnockout={Boolean(stage?.is_knockout)} />
            </div>
          </details>
          <details>
            <summary className="cursor-pointer text-sm font-semibold text-fg-2 hover:text-cancha-text">Reabrir partido (excepcional)…</summary>
            <div className="mt-3">
              <ActionForm action={reopenMatchAction} submitLabel="Reabrir partido" variant="secondary" size="sm"
                confirm="El partido volverá a «En vivo» y se retirarán sus puntos de todos los parches hasta que lo finalices otra vez. Los pronósticos siguen bloqueados. ¿Reabrir?" confirmLabel="Sí, reabrir">
                {hidden}
                <input type="hidden" name="expected_revision" value={match.result_revision} />
                <TextAreaField name="reason" label="Motivo de la reapertura (obligatorio)" required minLength={5} maxLength={500} rows={2} placeholder="Ej.: el acta corrigió el gol del minuto 88" />
              </ActionForm>
            </div>
          </details>
        </div>
      ) : !playable ? (
        <div className="mt-3 flex flex-col gap-1 text-sm text-fg-2">
          <p>{match.status === "cancelled" ? "El partido está cancelado (definitivo): no admite resultado." : match.status === "postponed" ? "El partido está aplazado: no admite resultado hasta reprogramarlo." : "Asigna los dos equipos en Partidos antes de iniciar el partido."}</p>
          {editLink}
        </div>
      ) : (
        <div className="mt-4 flex flex-col gap-4 border-t border-line-subtle pt-4">
          {state === "pending" && draft && (
            <div className="flex flex-col gap-2 rounded-xl border border-gold/40 bg-gold/[0.08] p-3">
              <p className="text-sm text-fg">
                <strong>Marcador pendiente del flujo anterior:</strong> {home.name} {draft.home_score} – {draft.away_score} {away.name}. Nada se publica solo: decide qué hacer con él.
              </p>
              <div className="flex flex-wrap gap-2">
                <ActionForm action={resolvePendingAction} submitLabel="Aplicar como marcador en vivo" variant="secondary" size="sm" className="flex flex-col gap-2"
                  confirm={`Se aplicará ${draft.home_score} – ${draft.away_score} como marcador EN VIVO (público). No finaliza el partido.`} confirmLabel="Sí, aplicar">
                  {hidden}
                  <input type="hidden" name="expected_revision" value={draft.revision} />
                  <input type="hidden" name="action" value="apply_live" />
                </ActionForm>
                <ActionForm action={resolvePendingAction} submitLabel="Descartar" variant="ghost" size="sm" className="flex flex-col gap-2"
                  confirm="El marcador pendiente se eliminará. El partido no cambia." confirmLabel="Sí, descartar">
                  {hidden}
                  <input type="hidden" name="expected_revision" value={draft.revision} />
                  <input type="hidden" name="action" value="discard" />
                </ActionForm>
              </div>
            </div>
          )}
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-fg-3">{match.status === "live" ? "Marcador en vivo" : "Iniciar partido"}</p>
            <LiveResultEditor key={`${match.result_revision}-${match.status}`} matchId={match.id} eventId={match.event_id} matchStatus={match.status} revision={match.result_revision}
              home={home.name} away={away.name} homeScore={match.home_score} awayScore={match.away_score} winnerSide={match.winner_side} isKnockout={Boolean(stage?.is_knockout)} />
          </div>
          {editLink}
        </div>
      )}
    </Card>
  );
}
