import type { Metadata } from "next";
import Link from "next/link";
import ActionForm from "@/components/ActionForm";
import Badge from "@/components/ui/Badge";
import { buttonClasses } from "@/components/ui/button";
import Card from "@/components/ui/Card";
import { enrollEventAction } from "@/app/(privado)/parches/actions";
import { redirect } from "next/navigation";
import { isPlatformAdmin, requireUser } from "@/lib/auth";
import { CONTROL_PATH } from "@/lib/jugar";
import { getMemberships } from "@/lib/data";
import { eventAcceptsEnrollment, playOptions } from "@/lib/jugar";
import { eventStatusLabel } from "@/lib/parches";

export const metadata: Metadata = { title: "Jugar un torneo", robots: { index: false, follow: false } };

// Destino de «Jugar este torneo». Muestra los parches de la persona y qué puede hacer con cada uno; no inscribe nada sin
// un clic explícito. Sin parches: crear uno o unirse con una invitación. Si el torneo ya no admite participantes, lo dice.
export default async function PlayPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { supabase, user } = await requireUser();
  if (await isPlatformAdmin()) redirect(CONTROL_PATH); // el superadministrador no juega: administra desde Control
  const { data: event } = await supabase.from("events").select("id, slug, name, status").eq("slug", slug).maybeSingle();
  const memberships = await getMemberships(supabase, user.id);

  if (!event || !eventAcceptsEnrollment(event.status)) {
    return (
      <div className="mx-auto max-w-md animate-fade-in-up">
        <Card className="p-6 text-center">
          <p aria-hidden="true" className="text-3xl">🟨</p>
          <h1 className="mt-3 text-xl font-black text-fg">{event ? `${event.name} ya no admite nuevos parches` : "Ese torneo no está disponible"}</h1>
          <p className="mt-2 text-sm text-fg-2">Puedes seguir con tus parches o volver a la portada para ver qué torneos hay ahora.</p>
          <div className="mt-5 flex flex-col gap-2">
            <Link href="/parches" className={buttonClasses()}>Ir a mis parches</Link>
            <Link href="/" className={buttonClasses({ variant: "secondary" })}>Ver torneos disponibles</Link>
          </div>
        </Card>
      </div>
    );
  }

  const { data: links } = memberships.length
    ? await supabase.from("parche_events").select("id, parche_id").eq("event_id", event.id).in("parche_id", memberships.map((m) => m.parcheId))
    : { data: [] };
  const enrolled = new Map((links ?? []).map((l) => [l.parche_id, l.id]));
  const options = playOptions(memberships, enrolled, user.id);

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-4 animate-fade-in-up">
      <div>
        <p className="font-mono text-[11px] uppercase tracking-widest text-cancha-text">Vas a jugar</p>
        <h1 className="text-2xl font-black text-fg">{event.name}</h1>
        <p className="mt-1 text-sm text-fg-2">{eventStatusLabel(event.status)}. Cada parche juega con sus propios pronósticos y su propia tabla.</p>
      </div>

      {options.length === 0 ? (
        <Card variant="glow-green" className="p-6">
          <h2 className="text-lg font-bold text-fg">Primero necesitas un parche</h2>
          <p className="mt-2 text-sm text-fg-2">Un parche es tu grupo de amigos, familiares o compañeros con quienes compites. Crea uno y luego lo inscribes en este torneo, o abre el enlace de invitación de un parche que ya exista.</p>
          <Link href={`/parches/nuevo?next=${encodeURIComponent(`/jugar/${event.slug}`)}`} className={`${buttonClasses({ fullWidth: true })} mt-4`}>Crear mi parche</Link>
        </Card>
      ) : (
        <>
          <h2 className="text-base font-bold text-fg">¿Con cuál de tus parches quieres jugarlo?</h2>
          <ul className="flex flex-col gap-3">
            {options.map((o) => (
              <li key={o.parcheId}>
                <Card className="p-4">
                  <p className="font-bold text-fg">{o.parcheName}</p>
                  {o.kind === "enter" && (
                    <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                      <Badge variant="green">Ya participa</Badge>
                      <Link href={`/parches/${o.parcheId}/torneos/${o.parcheEventId}`} className={buttonClasses({ size: "sm" })}>Entrar al torneo</Link>
                    </div>
                  )}
                  {o.kind === "enroll" && (
                    <ActionForm
                      action={enrollEventAction}
                      submitLabel="Inscribir este parche"
                      pendingLabel="Inscribiendo…"
                      size="sm"
                      confirm={`¿Inscribir «${o.parcheName}» en «${event.name}»? No se puede deshacer desde la aplicación.`}
                      confirmLabel="Sí, inscribir"
                      className="mt-2 flex flex-col gap-2"
                    >
                      <input type="hidden" name="parche_id" value={o.parcheId} />
                      <input type="hidden" name="event_id" value={event.id} />
                      <p className="text-sm text-fg-2">Administras este parche: puedes inscribirlo ahora. Después entra al torneo desde el parche.</p>
                    </ActionForm>
                  )}
                  {o.kind === "ask_admin" && <p className="mt-2 text-sm text-fg-2">Este parche aún no participa. Pídele a quien lo administra que lo inscriba en este torneo.</p>}
                  {o.kind === "disabled" && <p className="mt-2 text-sm text-fg-3">Tu participación en este parche está deshabilitada: solo puedes consultar.</p>}
                </Card>
              </li>
            ))}
          </ul>
          <Link href={`/parches/nuevo?next=${encodeURIComponent(`/jugar/${event.slug}`)}`} className="text-center text-sm font-semibold text-fg-2 hover:text-cancha-text">+ Crear otro parche para este torneo</Link>
        </>
      )}
    </div>
  );
}
