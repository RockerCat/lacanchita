"use client";

import { useActionState, useState } from "react";
import ActionForm from "@/components/ActionForm";
import Spinner from "@/components/ui/Spinner";
import Card from "@/components/ui/Card";
import {
  removeCrestAction, removeEventTeamAction, saveTeamAction, setEventTeamAction, uploadCrestAction, type ControlState,
} from "@/app/(privado)/control/actions";
import { FileField, TextField } from "./inputs";
import TeamBadge from "./TeamBadge";
import TeamFields, { KIND_LABELS } from "./TeamFields";
import { MAX_CREST_BYTES } from "@/lib/control/crest";
import type { Team } from "@/lib/control/data";

export type TeamItem = Pick<Team, "id" | "name" | "code" | "kind" | "flag_emoji" | "crest_path"> & { group: string | null };
type Filter = "all" | "national" | "club";

const GRID = "grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6";
const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "Todos" },
  { key: "national", label: "Selecciones" },
  { key: "club", label: "Clubes" },
];

function TileBody({ team }: { team: TeamItem }) {
  return (
    <>
      <TeamBadge team={team} />
      <span className="min-w-0 flex-1 text-left">
        <span className="block truncate text-xs font-semibold text-fg">{team.name}</span>
        <span className="block truncate font-mono text-[10px] text-fg-3">
          {team.code ?? KIND_LABELS[team.kind]}
          {team.group ? ` · Grupo ${team.group}` : ""}
        </span>
      </span>
    </>
  );
}

const tileClass =
  "flex w-full items-center gap-2 rounded-xl border bg-surface p-2 text-left hover:border-line-strong hover:bg-surface-raised focus-visible:outline-2 disabled:cursor-wait disabled:opacity-70";

// Equipo del catálogo que aún no está en el torneo: un clic lo añade.
function AddTile({ eventId, team }: { eventId: string; team: TeamItem }) {
  const [state, action, pending] = useActionState<ControlState, FormData>(setEventTeamAction, { error: null });
  return (
    <li>
      <form action={action}>
        <input type="hidden" name="event_id" value={eventId} />
        <input type="hidden" name="team_id" value={team.id} />
        <button type="submit" disabled={pending} aria-busy={pending} aria-label={`Añadir ${team.name} al torneo`} className={`${tileClass} border-dashed border-line`}>
          <TileBody team={team} />
          <span aria-hidden="true" className="shrink-0 text-fg-2">{pending ? <Spinner /> : "＋"}</span>
        </button>
        {state.error && <p role="alert" className="mt-1 text-xs text-danger">{state.error}</p>}
      </form>
    </li>
  );
}

// Selecciones y clubes comparten un único catálogo; el filtro solo cambia lo que se muestra. Si todos los
// equipos del torneo son de un mismo tipo, ese es el filtro inicial (se puede cambiar).
function initialFilter(inEvent: TeamItem[]): Filter {
  if (inEvent.length === 0) return "all";
  if (inEvent.every((t) => t.kind === "national")) return "national";
  if (inEvent.every((t) => t.kind === "club")) return "club";
  return "all";
}

export default function TeamsBoard({ eventId, editable, inEvent, available, query }: {
  eventId: string; editable: boolean; inEvent: TeamItem[]; available: TeamItem[]; query: string;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>(() => initialFilter(inEvent));
  const selected = inEvent.find((t) => t.id === selectedId) ?? null;
  const catalog = available.filter((t) => filter === "all" || t.kind === filter);

  return (
    <div className="flex flex-col gap-6">
      <section aria-labelledby="del-torneo" className="flex flex-col gap-3">
        <h2 id="del-torneo" className="text-base font-bold text-fg">En el torneo ({inEvent.length})</h2>
        {inEvent.length === 0 ? (
          <Card variant="dashed" className="p-5 text-center text-sm text-fg-3">{query ? "Ningún equipo del torneo coincide con la búsqueda." : "Aún no hay equipos asociados."}</Card>
        ) : (
          <ul className={GRID}>
            {inEvent.map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  aria-pressed={t.id === selectedId}
                  aria-label={`${t.name}${t.code ? ` (${t.code})` : ""}${t.group ? `, grupo ${t.group}` : ""}. ${t.id === selectedId ? "Cerrar detalles" : "Ver detalles"}`}
                  onClick={() => setSelectedId(t.id === selectedId ? null : t.id)}
                  className={`${tileClass} ${t.id === selectedId ? "border-cancha/60 bg-cancha/[0.06]" : "border-line"}`}
                >
                  <TileBody team={t} />
                </button>
              </li>
            ))}
          </ul>
        )}

        {selected && (
          <Card variant="raised" className="p-4" role="region" aria-label={`Detalles de ${selected.name}`}>
            <div className="mb-3 flex items-center justify-between gap-2">
              <p className="flex items-center gap-2 text-sm font-bold text-fg"><TeamBadge team={selected} size="sm" />{selected.name}</p>
              <button type="button" onClick={() => setSelectedId(null)} className="text-xs font-semibold text-fg-2 hover:text-fg">Cerrar</button>
            </div>
            {editable ? (
              <div className="flex flex-col gap-4">
                <ActionForm action={setEventTeamAction} submitLabel="Guardar grupo" size="sm" variant="secondary" className="flex flex-wrap items-end gap-3">
                  <input type="hidden" name="event_id" value={eventId} />
                  <input type="hidden" name="team_id" value={selected.id} />
                  <TextField
                    name="group_code"
                    label="Grupo en este torneo (opcional)"
                    maxLength={6}
                    pattern="[A-Za-z0-9]{1,6}"
                    data-pattern-message="Usa hasta 6 letras o números."
                    defaultValue={selected.group ?? ""}
                    hint="Ejemplo: A o B. Vale solo para este torneo, no para el equipo en general."
                    className="w-64 [&_input]:uppercase"
                    autoComplete="off"
                  />
                </ActionForm>
                <details>
                  <summary className="cursor-pointer text-sm font-semibold text-fg-2 hover:text-cancha-text">Editar datos del equipo (catálogo global)</summary>
                  <p className="mt-2 text-xs text-fg-3">El cambio se aplica al equipo en todos los torneos donde participa.</p>
                  <div className="mt-3">
                    <ActionForm key={selected.id} action={saveTeamAction} submitLabel="Guardar equipo" size="sm" variant="secondary">
                      <input type="hidden" name="team_id" value={selected.id} />
                      <TeamFields team={{ ...selected, created_at: "" }} />
                    </ActionForm>
                  </div>
                </details>
                <details>
                  <summary className="cursor-pointer text-sm font-semibold text-fg-2 hover:text-cancha-text">Escudo del equipo</summary>
                  <p className="mt-2 text-xs text-fg-3">PNG, JPG o WebP de hasta 512 KB. Se usa en todos los torneos del equipo. Sube solo escudos cuyo uso esté permitido.</p>
                  <div className="mt-3 flex flex-col gap-3">
                    <ActionForm action={uploadCrestAction} submitLabel={selected.crest_path ? "Reemplazar escudo" : "Subir escudo"} pendingLabel="Subiendo…" size="sm" variant="secondary" resetOnSuccess>
                      <input type="hidden" name="team_id" value={selected.id} />
                      <FileField name="crest" label="Archivo del escudo" accept="image/png,image/jpeg,image/webp" maxBytes={MAX_CREST_BYTES} maxLabel="512 KB" />
                    </ActionForm>
                    {selected.crest_path && (
                      <ActionForm action={removeCrestAction} submitLabel="Quitar escudo" size="sm" variant="ghost" confirm="Se quitará el escudo del equipo en todos los torneos." confirmLabel="Sí, quitar">
                        <input type="hidden" name="team_id" value={selected.id} />
                      </ActionForm>
                    )}
                  </div>
                </details>
                <ActionForm
                  action={removeEventTeamAction}
                  submitLabel="Quitar del torneo"
                  size="sm"
                  variant="ghost"
                  confirm={`¿Quitar a ${selected.name} de este torneo? El equipo sigue en el catálogo.`}
                  confirmLabel="Sí, quitar"
                >
                  <input type="hidden" name="event_id" value={eventId} />
                  <input type="hidden" name="team_id" value={selected.id} />
                </ActionForm>
              </div>
            ) : (
              <p className="text-sm text-fg-2">{KIND_LABELS[selected.kind]}{selected.code ? ` · ${selected.code}` : ""}{selected.group ? ` · Grupo ${selected.group}` : ""}. Torneo de solo lectura.</p>
            )}
          </Card>
        )}
      </section>

      {editable && (
        <section aria-labelledby="catalogo" className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="catalogo" className="text-base font-bold text-fg">Catálogo: añadir un equipo existente</h2>
            <div role="group" aria-label="Tipo de equipo" className="flex gap-1 rounded-xl border border-line bg-surface p-1">
              {FILTERS.map((f) => (
                <button
                  key={f.key}
                  type="button"
                  aria-pressed={filter === f.key}
                  onClick={() => setFilter(f.key)}
                  className={`rounded-lg px-3 py-1 text-xs font-semibold ${filter === f.key ? "bg-cancha/15 text-cancha-text" : "text-fg-2 hover:bg-surface-raised hover:text-fg"}`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>
          <p className="text-sm text-fg-2">Un equipo puede participar en varios torneos sin duplicarse. Toca un equipo para añadirlo.</p>
          {catalog.length === 0 ? (
            <p className="text-sm text-fg-3">
              {query ? "Ningún equipo del catálogo coincide." : filter !== "all" && available.length > 0 ? "No hay equipos de este tipo disponibles. Prueba con «Todos»." : "No hay más equipos en el catálogo."}
            </p>
          ) : (
            <ul className={GRID}>
              {catalog.map((t) => (
                <AddTile key={t.id} eventId={eventId} team={t} />
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
