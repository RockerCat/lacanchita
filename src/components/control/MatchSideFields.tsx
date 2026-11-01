"use client";

import { useState } from "react";
import { SelectField, TextField } from "./inputs";

type Team = { id: string; name: string };

// Un lado del partido: equipo y, solo cuando hace falta (no hay equipo) o ya hay un texto, la descripción de
// cómo se definirá. La descripción no se borra al elegir un equipo.
export default function MatchSideFields({ prefix, label, teams, defaultTeam, defaultPlaceholder, example }: {
  prefix: "home" | "away"; label: string; teams: Team[]; defaultTeam: string; defaultPlaceholder: string; example: string;
}) {
  const [team, setTeam] = useState(defaultTeam);
  const [forceOpen, setForceOpen] = useState(false);
  const showDescription = !team || Boolean(defaultPlaceholder) || forceOpen;

  return (
    <div className="flex flex-col gap-2">
      <SelectField name={`${prefix}_team_id`} label={label} value={team} onChange={(e) => setTeam(e.target.value)}>
        <option value="">— Todavía no se sabe —</option>
        {teams.map((t) => (
          <option key={t.id} value={t.id}>{t.name}</option>
        ))}
      </SelectField>
      {showDescription ? (
        <TextField
          name={`${prefix}_placeholder`}
          label={team ? "Descripción (opcional, queda guardada)" : "¿Cómo se definirá este equipo?"}
          maxLength={60}
          placeholder={example}
          defaultValue={defaultPlaceholder}
        />
      ) : (
        <button type="button" onClick={() => setForceOpen(true)} className="self-start text-xs font-semibold text-fg-2 underline hover:text-fg">
          Añadir una descripción (opcional)
        </button>
      )}
    </div>
  );
}
