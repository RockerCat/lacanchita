"use client";

import { useActionState, useState } from "react";
import { createInvitationAction, revokeInvitationAction, type ActionState, type InvitationState } from "@/app/(privado)/parches/actions";
import type { OpenInvitation } from "@/lib/data";
import { whatsappShareUrl } from "@/lib/invitations";
import { buttonClasses } from "../ui/button";
import Card from "../ui/Card";
import Spinner from "../ui/Spinner";

const initialCreate: InvitationState = { error: null, url: null, expiresAt: null };
const initialRevoke: ActionState = { error: null };

function formatDate(iso: string) {
  return new Intl.DateTimeFormat("es-CO", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Bogota" }).format(new Date(iso));
}

export default function InvitePanel({
  parcheId,
  parcheName,
  open,
}: {
  parcheId: string;
  parcheName: string;
  open: OpenInvitation | null;
}) {
  const [created, createAction, creating] = useActionState(createInvitationAction, initialCreate);
  const [revoked, revokeAction, revoking] = useActionState(revokeInvitationAction, initialRevoke);
  const [copied, setCopied] = useState(false);
  const active = open && !open.expired ? open : null;
  // El enlace recién creado solo existe en esta respuesta; si el panel se refresca tras revocar, desaparece.
  const url = created.url && active ? created.url : null;

  async function copy() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <Card className="p-4 sm:p-5">
      <h2 className="text-base font-bold text-fg">Invitar al parche</h2>
      <p className="mt-1 text-sm text-fg-2">
        Comparte un enlace por WhatsApp o donde quieras. Sirve para varias personas durante 7 días.
      </p>

      {url ? (
        <div className="mt-4 flex flex-col gap-2">
          <label htmlFor="invite-url" className="text-xs font-semibold text-fg-2">
            Enlace de invitación
          </label>
          <input
            id="invite-url"
            readOnly
            value={url}
            onFocus={(e) => e.currentTarget.select()}
            className="h-11 w-full rounded-xl border border-cancha/40 bg-surface-deep px-3 font-mono text-xs text-fg"
          />
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={copy} className={buttonClasses({ size: "sm" })}>
              {copied ? "¡Copiado!" : "Copiar enlace"}
            </button>
            <a
              href={whatsappShareUrl(url, parcheName)}
              target="_blank"
              rel="noopener noreferrer"
              className={buttonClasses({ variant: "secondary", size: "sm" })}
            >
              Compartir por WhatsApp
            </a>
          </div>
          <p className="text-xs text-fg-3">
            Guárdalo ahora: por seguridad no lo volvemos a mostrar. Si lo pierdes, genera uno nuevo.
          </p>
        </div>
      ) : active ? (
        <p className="mt-4 rounded-xl border border-line bg-surface-raised px-3 py-2.5 text-sm text-fg-2">
          Hay un enlace activo hasta el {formatDate(active.expiresAt)} · usado {active.useCount}{" "}
          {active.useCount === 1 ? "vez" : "veces"}.
        </p>
      ) : (
        <p className="mt-4 text-sm text-fg-3">{open?.expired ? "El último enlace venció." : "No hay ningún enlace activo."}</p>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <form action={createAction}>
          <input type="hidden" name="parche_id" value={parcheId} />
          <button type="submit" disabled={creating} className={buttonClasses({ variant: url ? "secondary" : "primary", size: "sm" })}>
            {creating ? <Spinner /> : null}
            {active ? "Generar enlace nuevo" : "Crear enlace de invitación"}
          </button>
        </form>
        {active && (
          <form action={revokeAction}>
            <input type="hidden" name="parche_id" value={parcheId} />
            <button type="submit" disabled={revoking} className={buttonClasses({ variant: "ghost", size: "sm" })}>
              Desactivar enlace
            </button>
          </form>
        )}
      </div>
      {active && !url && <p className="mt-2 text-xs text-fg-3">Generar uno nuevo desactiva el anterior.</p>}
      {(created.error || revoked.error) && (
        <p role="alert" className="mt-3 text-sm text-danger">
          {created.error ?? revoked.error}
        </p>
      )}
    </Card>
  );
}
