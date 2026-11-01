import { SelectField, TextField } from "./inputs";
import type { Team } from "@/lib/control/data";

export const KIND_LABELS: Record<string, string> = { national: "Selección", club: "Club", other: "Otro" };

// Campos del catálogo global de equipos (validación propia en español; el servidor repite todo).
export default function TeamFields({ team }: { team?: Team }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <TextField name="name" label="Nombre" required minLength={2} maxLength={80} defaultValue={team?.name} className="col-span-2" autoComplete="off" />
      <TextField
        name="code"
        label="Código corto"
        maxLength={8}
        pattern="[A-Za-z0-9]{2,8}"
        data-pattern-message="Usa de 2 a 8 letras o números, sin espacios."
        defaultValue={team?.code ?? ""}
        hint="Opcional. Ej.: ESP"
        className="[&_input]:font-mono [&_input]:uppercase"
        autoComplete="off"
      />
      <SelectField name="kind" label="Tipo" defaultValue={team?.kind ?? "national"}>
        {Object.entries(KIND_LABELS).map(([v, l]) => (
          <option key={v} value={v}>{l}</option>
        ))}
      </SelectField>
      <TextField name="flag_emoji" label="Bandera o emblema" maxLength={16} defaultValue={team?.flag_emoji ?? ""} hint="Opcional. Selecciones: si lo dejas vacío se sugiere por el nombre." className="col-span-2 sm:col-span-1" autoComplete="off" />
    </div>
  );
}
