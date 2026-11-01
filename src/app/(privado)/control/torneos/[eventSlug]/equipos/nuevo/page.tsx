import type { Metadata } from "next";
import Link from "next/link";
import ActionForm from "@/components/ActionForm";
import EventHeader from "@/components/control/EventHeader";
import { TextField } from "@/components/control/inputs";
import TeamFields from "@/components/control/TeamFields";
import Card from "@/components/ui/Card";
import { saveTeamAction } from "../../../../actions";
import { loadEvent } from "../../event";

export const metadata: Metadata = { title: "Nuevo equipo · Control" };

export default async function NewTeamPage({ params }: { params: Promise<{ eventSlug: string }> }) {
  const { eventSlug } = await params;
  const { event } = await loadEvent(eventSlug, "/equipos/nuevo");

  return (
    <div className="flex flex-col gap-5 animate-fade-in-up">
      <EventHeader event={event} active="equipos" />
      <Link href={`/control/torneos/${event.slug}/equipos`} className="text-sm font-semibold text-fg-2 hover:text-cancha-text">← Equipos</Link>
      {event.locked ? (
        <Card className="p-5 text-sm text-fg-2">Este torneo es de solo lectura.</Card>
      ) : (
        <Card className="p-5">
          <h2 className="text-lg font-bold text-fg">Nuevo equipo</h2>
          <p className="mb-4 mt-1 text-sm text-fg-2">
            Se crea en el catálogo global y se asocia a este torneo. Si ya existe un equipo con ese nombre y tipo, no se duplica: búscalo y añádelo desde la lista.
          </p>
          <ActionForm action={saveTeamAction} submitLabel="Crear equipo y asociarlo" pendingLabel="Creando…">
            <input type="hidden" name="event_id" value={event.id} />
            <TeamFields />
            <TextField name="group_code" label="Grupo en este torneo (opcional)" maxLength={6} pattern="[A-Za-z0-9]{1,6}" data-pattern-message="Usa hasta 6 letras o números." hint="Opcional. Ejemplo: A o B. Vale solo para este torneo." className="w-64 [&_input]:uppercase" autoComplete="off" />
          </ActionForm>
        </Card>
      )}
    </div>
  );
}
