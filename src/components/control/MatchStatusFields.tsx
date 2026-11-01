"use client";

import { useState } from "react";
import { CheckboxField, SelectField } from "./inputs";

// Estado de programación del partido (programado / aplazado / cancelado). «En vivo» y el marcador se manejan en
// Resultados. Para reprogramar un aplazado se cambia la fecha y se vuelve a «Programado». Cancelar es definitivo y
// exige reconocerlo con una casilla (confirmación explícita antes de enviar).
export default function MatchStatusFields({ current }: { current: string }) {
  const [value, setValue] = useState(current);
  return (
    <div className="flex flex-col gap-3">
      <SelectField
        name="status"
        label="Estado del partido"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        hint="Aplazar conserva los pronósticos (editables hasta la nueva hora). Para reprogramar, cambia la fecha y vuelve a «Programado»."
      >
        {current === "live" && <option value="live">En vivo (sin cambios)</option>}
        <option value="scheduled">{current === "live" ? "Programado (revertir el inicio: borra el marcador)" : "Programado"}</option>
        <option value="postponed">Aplazado</option>
        <option value="cancelled">Cancelado (definitivo)</option>
      </SelectField>
      {value === "cancelled" && current !== "cancelled" && (
        <div className="rounded-xl border border-danger/30 bg-danger/[0.06] p-3">
          <CheckboxField name="confirm_cancel" required label="Entiendo que cancelar es DEFINITIVO: no se podrá reactivar, no habrá puntos y los pronósticos quedarán solo como historial." />
        </div>
      )}
    </div>
  );
}
