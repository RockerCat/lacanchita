import type { Metadata } from "next";
import Link from "next/link";
import EventHeader from "@/components/control/EventHeader";
import { inputClass } from "@/components/control/inputs";
import TeamsBoard, { type TeamItem } from "@/components/control/TeamsBoard";
import { buttonClasses } from "@/components/ui/button";
import { getEventTeams, searchTeams } from "@/lib/control/data";
import { loadEvent } from "../event";

export const metadata: Metadata = { title: "Equipos · Control" };

export default async function TeamsPage({ params, searchParams }: { params: Promise<{ eventSlug: string }>; searchParams: Promise<{ q?: string; creado?: string }> }) {
  const { eventSlug } = await params;
  const { q = "", creado } = await searchParams;
  const { supabase, event } = await loadEvent(eventSlug, "/equipos");
  const [teams, catalog] = await Promise.all([getEventTeams(supabase, event.id), searchTeams(supabase, q, 120)]);
  const term = q.trim().toLowerCase();
  const matches = (t: { name: string; code: string | null }) => !term || t.name.toLowerCase().includes(term) || (t.code ?? "").toLowerCase().includes(term);
  const inIds = new Set(teams.map((t) => t.team.id));
  const item = (t: { id: string; name: string; code: string | null; kind: string; flag_emoji: string | null; crest_path: string | null }, group: string | null): TeamItem => ({
    id: t.id, name: t.name, code: t.code, kind: t.kind, flag_emoji: t.flag_emoji, crest_path: t.crest_path, group,
  });
  const inEvent = teams.filter(({ team }) => matches(team)).map(({ team, groupCode }) => item(team, groupCode));
  const available = catalog.filter((t) => !inIds.has(t.id)).map((t) => item(t, null));
  const editable = !event.locked;

  return (
    <div className="flex flex-col gap-5 animate-fade-in-up">
      <EventHeader event={event} active="equipos" />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-bold text-fg">Equipos ({teams.length})</h2>
        {editable && (
          <Link href={`/control/torneos/${event.slug}/equipos/nuevo`} className={buttonClasses({ size: "sm" })}>
            + Nuevo equipo
          </Link>
        )}
      </div>

      {creado && (
        <p role="status" className="rounded-xl border border-cancha/25 bg-cancha/[0.08] px-3 py-2.5 text-sm text-cancha-text">
          Equipo creado y asociado al torneo.
        </p>
      )}

      <form method="get" role="search" className="flex gap-2">
        <input name="q" defaultValue={q} placeholder="Buscar por nombre o código" aria-label="Buscar equipos" className={`${inputClass} border-line`} />
        <button type="submit" className={buttonClasses({ variant: "secondary", size: "md" })}>Buscar</button>
        {q && (
          <Link href={`/control/torneos/${event.slug}/equipos`} className={buttonClasses({ variant: "ghost", size: "md" })}>Limpiar</Link>
        )}
      </form>

      <TeamsBoard eventId={event.id} editable={editable} inEvent={inEvent} available={available} query={q} />
    </div>
  );
}
