import Link from "next/link";
import Badge from "@/components/ui/Badge";
import { EventStatusBadge } from "./badges";
import ControlNav, { type ControlTab } from "./ControlNav";
import type { ControlEvent } from "@/lib/control/data";
import { controlErrorMessage } from "@/lib/control/errors";

export default function EventHeader({ event, active }: { event: ControlEvent & { locked: string | null }; active: ControlTab }) {
  return (
    <header className="flex flex-col gap-4">
      <Link href="/control/torneos" className="text-sm font-semibold text-fg-2 hover:text-cancha-text">
        ← Torneos
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h1 className="text-2xl font-black text-fg sm:text-3xl">{event.name}</h1>
          <p className="mt-1 font-mono text-xs text-fg-3">
            {event.slug} · {event.timezone}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {event.locked && <Badge variant="gray">Solo lectura</Badge>}
          <EventStatusBadge status={event.status} />
        </div>
      </div>
      {event.locked && (
        <p role="note" className="rounded-xl border border-gold/25 bg-gold/[0.08] px-4 py-3 text-sm text-fg-2">
          {controlErrorMessage({ message: event.locked })} Puedes consultarlo, pero Control no permite cambios.
        </p>
      )}
      <ControlNav slug={event.slug} active={active} />
    </header>
  );
}
