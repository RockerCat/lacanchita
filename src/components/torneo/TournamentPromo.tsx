import { describeTournament, type LandingTournament } from "@/lib/landing-tournaments";
import { DEFAULT_PROMO_BLURB } from "@/lib/jugar";
import { illustrationUrl } from "@/lib/illustration";

// Promoción del torneo destacado (presentacional: la acción llega como `children` porque depende de la sesión).
// «full» es la sección de la portada; «compact» es la tarjeta de /parches. La ilustración es opcional: con ella, móvil →
// imagen arriba y una columna; escritorio → imagen a la derecha. Sin ella, el diseño de siempre (sin huecos ni íconos).
// Título, fechas, estado y CTA siempre son texto HTML.
export default function TournamentPromo({ t, now, variant = "full", id, children, extra }: { t: LandingTournament; now: Date; variant?: "full" | "compact"; id?: string; children?: React.ReactNode; extra?: React.ReactNode }) {
  const d = describeTournament(t, now);
  const noSchedule = !t.firstMatchAt && t.status === "scheduled";
  const full = variant === "full";
  const art = illustrationUrl(t.illustrationPath);

  const text = (
    <>
      <p className="inline-flex items-center gap-2 font-mono text-[11px] font-bold uppercase tracking-widest text-cancha-text">
        <span aria-hidden="true">⚽</span>{d.label}
        {d.headline && d.headline !== "Próximamente" && <span className="rounded-full bg-cancha/15 px-2 py-0.5 normal-case tracking-normal">{d.headline}</span>}
      </p>
      <h2 className={`mt-2 text-balance font-black leading-tight text-fg ${full ? "text-2xl sm:text-3xl" : "text-lg sm:text-xl"}`}>{t.name}</h2>
      {full && <p className="mt-2 max-w-xl text-fg-2">{t.blurb || DEFAULT_PROMO_BLURB}</p>}
      <ul className="mt-3 flex flex-col gap-1 text-sm text-fg-2">
        {d.detail && (
          <li>
            <span aria-hidden="true" className="mr-1.5">📅</span><strong className="font-semibold text-fg">{d.detail}</strong>
            {d.note && <span className="ml-2 text-xs text-fg-3">{d.note}</span>}
          </li>
        )}
        <li><span aria-hidden="true" className="mr-1.5">✅</span><strong className="font-semibold text-cancha-text">{d.enrollment}</strong></li>
      </ul>
      {noSchedule && <p className={`mt-2 text-fg-3 ${full ? "text-sm" : "text-xs"}`}>Los equipos y partidos se anunciarán cuando se confirme la programación oficial.</p>}
      {extra}
    </>
  );

  const picture = art ? (
    <div className={`relative aspect-video overflow-hidden rounded-2xl border border-line bg-surface-deep ${full ? "w-full" : "w-full sm:w-44 sm:shrink-0 md:w-52"}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={art} alt={`Ilustración de ${t.name}`} width={1600} height={900} loading={full ? "eager" : "lazy"} decoding="async" className="h-full w-full object-cover" />
    </div>
  ) : null;

  return (
    <section id={id} aria-label={d.label} className={`relative overflow-hidden rounded-3xl border border-cancha/30 bg-gradient-to-br from-cancha/[0.12] via-surface to-surface ${full ? "p-5 sm:p-8" : "p-4 sm:p-5"}`}>
      <div aria-hidden="true" className="halo-green pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full opacity-60 blur-[70px]" />
      {picture && full && (
        <div className="relative grid gap-5 md:grid-cols-[1.2fr_1fr] md:items-center md:gap-8">
          <div className="min-w-0 md:order-1">
            {text}
            {children && <div className="mt-5">{children}</div>}
          </div>
          <div className="md:order-2">{picture}</div>
        </div>
      )}
      {picture && !full && (
        <div className="relative flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
          {picture}
          <div className="min-w-0 flex-1">
            {text}
            {children && <div className="mt-3">{children}</div>}
          </div>
        </div>
      )}
      {!picture && (
        <div className={`relative grid gap-4 ${full ? "md:grid-cols-[1.4fr_1fr] md:items-center md:gap-8" : "sm:grid-cols-[1fr_auto] sm:items-center"}`}>
          <div className="min-w-0">{text}</div>
          {children && <div className={full ? "md:justify-self-end" : "sm:justify-self-end"}>{children}</div>}
        </div>
      )}
    </section>
  );
}
