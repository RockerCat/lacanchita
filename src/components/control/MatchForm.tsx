import ActionForm from "@/components/ActionForm";
import { saveMatchAction } from "@/app/(privado)/control/actions";
import MatchSideFields from "./MatchSideFields";
import MatchStatusFields from "./MatchStatusFields";
import { SelectField, TextField } from "./inputs";
import type { ControlEvent, EventTeam, Match, Stage } from "@/lib/control/data";
import { utcToLocalInput } from "@/lib/control/time";

// Alta excepcional o edición de un partido. La hora se captura en la zona del torneo; la acción la convierte a UTC.
export default function MatchForm({
  event,
  stages,
  teams,
  match,
  suggestedNumber,
  hasPending = false,
}: {
  event: ControlEvent;
  stages: Stage[];
  teams: EventTeam[];
  match?: Match;
  suggestedNumber?: number;
  hasPending?: boolean;
}) {
  const finished = match?.status === "finished";
  return (
    <ActionForm action={saveMatchAction} submitLabel={match ? "Guardar partido" : "Crear partido"} pendingLabel="Guardando…">
      <input type="hidden" name="event_id" value={event.id} />
      {match && <input type="hidden" name="match_id" value={match.id} />}
      {hasPending && (
        <p role="note" className="rounded-xl border border-gold/25 bg-gold/[0.08] px-3 py-2 text-sm text-fg-2">
          Este partido tiene un marcador pendiente: para cambiar equipos o fase, descarta antes el marcador en Resultados.
        </p>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <SelectField name="stage_id" label="Fase" required defaultValue={match?.stage_id ?? ""}>
          <option value="" disabled>Elige una fase</option>
          {stages.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </SelectField>
        <TextField name="match_number" type="number" label="Número de partido" min={1} step={1} inputMode="numeric" hint="Opcional. Único dentro de este torneo." defaultValue={match?.match_number ?? suggestedNumber ?? ""} />
        <TextField name="group_code" label="Grupo (opcional)" maxLength={20} hint="Ejemplo: A. Solo si el torneo tiene grupos." defaultValue={match?.group_code ?? ""} />
        <TextField name="round_label" label="Jornada o ronda (opcional)" maxLength={40} hint="Ejemplo: Jornada 3 o Cuartos de final." defaultValue={match?.round_label ?? ""} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <TextField name="starts_at" type="datetime-local" label={`Fecha y hora (hora de ${event.timezone})`} required hint="Se guarda como instante UTC." defaultValue={utcToLocalInput(match?.starts_at, event.timezone)} />
        <TextField name="venue" label="Sede" maxLength={120} defaultValue={match?.venue ?? ""} />
      </div>
      <fieldset className="grid gap-3 sm:grid-cols-2">
        <legend className="mb-1 text-xs font-semibold text-fg-2">Equipos</legend>
        <p className="text-xs text-fg-3 sm:col-span-2">Si todavía no se conocen los equipos, puedes indicar cómo se definirán.</p>
        <MatchSideFields prefix="home" label="Local" teams={teams.map(({ team }) => ({ id: team.id, name: team.name }))} defaultTeam={match?.home_team_id ?? ""} defaultPlaceholder={match?.home_placeholder ?? ""} example="Ganador del partido 5" />
        <MatchSideFields prefix="away" label="Visitante" teams={teams.map(({ team }) => ({ id: team.id, name: team.name }))} defaultTeam={match?.away_team_id ?? ""} defaultPlaceholder={match?.away_placeholder ?? ""} example="Segundo del grupo B" />
      </fieldset>
      {match && !finished && <MatchStatusFields current={match.status} />}
    </ActionForm>
  );
}
