import type { Metadata } from "next";
import ActionForm from "@/components/ActionForm";
import EventHeader from "@/components/control/EventHeader";
import { SelectField, TextField } from "@/components/control/inputs";
import Card from "@/components/ui/Card";
import { getStages } from "@/lib/control/data";
import { moveStageAction, saveStageAction } from "../../../actions";
import { loadEvent } from "../event";

export const metadata: Metadata = { title: "Fases · Control" };

export default async function StagesPage({ params }: { params: Promise<{ eventSlug: string }> }) {
  const { eventSlug } = await params;
  const { supabase, event } = await loadEvent(eventSlug, "/fases");
  const stages = await getStages(supabase, event.id);
  const editable = !event.locked;

  return (
    <div className="flex flex-col gap-6 animate-fade-in-up">
      <EventHeader event={event} active="fases" />
      <Card variant="raised" className="p-4 text-sm text-fg-2">
        <p>
          Las fases las carga la importación del torneo; aquí puedes ajustar su nombre, su formato y sus puntos. Los puntos quedan guardados
          para el futuro motor de puntuación (todavía no se calcula nada).
        </p>
        <ul className="mt-2 list-inside list-disc space-y-1 text-fg-3">
          <li><strong className="text-fg-2">Marcador exacto:</strong> puntos de quien acierta el marcador exacto del partido. No suma además los de resultado.</li>
          <li><strong className="text-fg-2">Resultado acertado:</strong> puntos de quien acierta quién gana o el empate, sin acertar el marcador exacto.</li>
          <li><strong className="text-fg-2">Eliminación directa:</strong> si un partido termina empatado se indica quién avanza por penales (los penales no suman puntos).</li>
          <li>Con resultados oficiales en una fase, sus puntos y su formato ya no se pueden cambiar.</li>
        </ul>
      </Card>

      {stages.length === 0 ? (
        <Card variant="dashed" className="p-5 text-center text-sm text-fg-3">Este torneo aún no tiene fases cargadas.</Card>
      ) : (
        <ul className="flex flex-col gap-3">
          {stages.map((s, i) => (
            <li key={s.id}>
              <Card className="p-4 sm:p-5">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-bold text-fg">
                    <span className="mr-2 font-mono text-xs text-fg-3">{i + 1}.</span>
                    {s.name}
                  </p>
                  {editable && stages.length > 1 && (
                    <div className="flex gap-1">
                      {([["up", "↑", "Subir"], ["down", "↓", "Bajar"]] as const).map(([dir, icon, label]) => (
                        <ActionForm key={dir} action={moveStageAction} submitLabel={icon} buttonLabel={`${label} «${s.name}»`} pendingLabel="…" variant="ghost" size="sm" className="flex flex-col">
                          <input type="hidden" name="event_id" value={event.id} />
                          <input type="hidden" name="stage_id" value={s.id} />
                          <input type="hidden" name="direction" value={dir} />
                        </ActionForm>
                      ))}
                    </div>
                  )}
                </div>
                {editable ? (
                  <ActionForm action={saveStageAction} submitLabel="Guardar fase" size="sm" variant="secondary">
                    <input type="hidden" name="event_id" value={event.id} />
                    <input type="hidden" name="stage_id" value={s.id} />
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                      <TextField name="name" label="Nombre de la fase" required minLength={2} maxLength={80} defaultValue={s.name} className="col-span-2" />
                      <SelectField name="format" label="Formato" defaultValue={s.is_knockout ? "knockout" : "league"}>
                        <option value="league">Fase de grupos o liga</option>
                        <option value="knockout">Eliminación directa</option>
                      </SelectField>
                      <div className="hidden sm:block" />
                      <TextField name="exact_points" type="number" label="Puntos: marcador exacto" required min={0} max={100} step={1} inputMode="numeric" defaultValue={s.exact_points} />
                      <TextField name="result_points" type="number" label="Puntos: resultado acertado" required min={0} max={100} step={1} inputMode="numeric" defaultValue={s.result_points} />
                    </div>
                  </ActionForm>
                ) : (
                  <p className="text-sm text-fg-2">
                    {s.is_knockout ? "Eliminación directa" : "Fase de grupos o liga"} · marcador exacto {s.exact_points} pts · resultado acertado {s.result_points} pts
                  </p>
                )}
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
