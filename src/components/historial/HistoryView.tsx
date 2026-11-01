import type { History } from "@/lib/data";
import { rankingCriteriaText, snapshotNotice, splitStandings, toPodiumEntries } from "@/lib/historial";
import { eventStatusLabel } from "@/lib/parches";
import Badge from "../ui/Badge";
import Card from "../ui/Card";
import EventResults from "./EventResults";
import StandingsList from "./StandingsList";
import PodiumView from "../podio/PodiumView";
import UnrankedList from "./UnrankedList";

function formatDate(iso: string) {
  return new Intl.DateTimeFormat("es-CO", { dateStyle: "long", timeZone: "America/Bogota" }).format(new Date(iso));
}

// Historial consolidado de un parche en un torneo. Solo datos deportivos.
export default function HistoryView({
  history,
  parcheName,
  currentUserId,
  celebrationKey = history.eventName,
}: {
  history: History;
  parcheName: string;
  currentUserId: string;
  /** Identifica la celebración en la sesión del navegador (una vez por torneo y parche). */
  celebrationKey?: string;
}) {
  const { ranked, unranked } = splitStandings(history.rows);
  const notice = snapshotNotice(history.snapshot);
  const criteria = rankingCriteriaText(history.snapshot.rankingOrder);
  const entries = toPodiumEntries(ranked);

  return (
    <div className="flex flex-col gap-6">
      <section className="animate-fade-in-up">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="gray">{eventStatusLabel(history.eventStatus)}</Badge>
          <Badge variant="blue">{notice.title}</Badge>
        </div>
        <h1 className="mt-2 text-2xl font-black text-fg sm:text-3xl">{history.eventName}</h1>
        <p className="mt-1 text-sm text-fg-2">{parcheName}</p>
        <div role="note" className="mt-4 rounded-xl border border-var-blue/25 bg-var-blue/[0.07] px-4 py-3 text-sm text-fg-2">
          <p>{notice.body}</p>
          {history.snapshot.dataCutoffAt && (
            <p className="mt-1 text-fg-3">Datos hasta el {formatDate(history.snapshot.dataCutoffAt)}.</p>
          )}
        </div>
      </section>

      {history.results.length > 0 && (
        <Card className="p-4">
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-fg-2">Resultados del torneo</h2>
          <EventResults results={history.results} />
        </Card>
      )}

      <section aria-labelledby="clasificacion">
        <h2 id="clasificacion" className="sr-only">
          Clasificación
        </h2>
        <p className="mb-3 text-sm text-fg-2">
          {ranked.length} participantes clasificados.{criteria ? ` ${criteria}` : ""}
        </p>
        {/* Experiencia original de La Penúltima: podio, resumen y clasificación (tema oscuro propio). */}
        <div data-theme="dark" className="rounded-3xl border border-[#1e1e35] bg-[#0a0a12] p-4 text-[#f1f5f9] sm:p-6">
          {entries ? (
            <PodiumView leaderboard={entries} currentUserId={currentUserId} parcheName={parcheName} celebrationKey={celebrationKey} />
          ) : (
            <StandingsList rows={ranked} currentUserId={currentUserId} />
          )}
        </div>
        <p className="mt-2 text-center font-mono text-[11px] text-fg-3">
          <span className="text-gold">⚡ marcador exacto</span> · <span className="text-cancha-text">✓ resultado acertado</span>
        </p>
      </section>

      {unranked.length > 0 && (
        <section aria-labelledby="sin-clasificacion">
          <h2 id="sin-clasificacion" className="text-lg font-bold text-fg">
            Miembros sin clasificación
          </h2>
          <p className="mb-3 text-sm text-fg-2">Formaban parte del parche, pero no compitieron en la tabla.</p>
          <UnrankedList rows={unranked} currentUserId={currentUserId} />
        </section>
      )}
    </div>
  );
}
