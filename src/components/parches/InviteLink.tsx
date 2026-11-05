"use client";

import Link from "next/link";
import { createContext, useActionState, useContext, useRef, useState } from "react";
import { createInvitationAction, type InvitationState } from "@/app/(privado)/parches/actions";
import type { OpenInvitation } from "@/lib/data";
import { buttonClasses } from "../ui/button";
import Spinner from "../ui/Spinner";

const initial: InvitationState = { error: null, url: null, expiresAt: null };

type Ctx = {
  parcheId: string;
  url: string | null;
  error: string | null;
  creating: boolean;
  createAction: (formData: FormData) => void;
  active: OpenInvitation | null;
  copied: "ok" | "fail" | null;
  copy: () => void;
};
const InviteCtx = createContext<Ctx | null>(null);

// Estado ÚNICO del enlace de invitación de un parche en la pantalla (bloque superior y modal de inscripción lo
// comparten: una sola llamada a createInvitationAction, un solo enlace). Quienes lo usan solo se montan para
// owner/admin activos; la base vuelve a validar el permiso. El token solo se conoce al crearlo (en la base solo está su
// hash): si ya hay un enlace activo no se genera otro a espaldas del usuario, porque revocaría el ya compartido.
export function InviteProvider({ parcheId, invitation, children }: { parcheId: string; invitation: OpenInvitation | null; children: React.ReactNode }) {
  const [created, createAction, creating] = useActionState(createInvitationAction, initial);
  const [copied, setCopied] = useState<"ok" | "fail" | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const active = invitation && !invitation.expired ? invitation : null;

  async function copy() {
    if (!created.url) return;
    try {
      await navigator.clipboard.writeText(created.url);
      setCopied("ok");
    } catch {
      setCopied("fail");
    }
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(null), 2500);
  }

  return (
    <InviteCtx.Provider value={{ parcheId, url: created.url, error: created.error, creating, createAction, active, copied, copy }}>
      {children}
    </InviteCtx.Provider>
  );
}

// Crear y copiar el enlace (o remitir a Participantes si ya hay uno activo). `idPrefix` evita ids repetidos.
export function InviteLinkControls({ idPrefix }: { idPrefix: string }) {
  const c = useContext(InviteCtx);
  if (!c) throw new Error("InviteLinkControls fuera de InviteProvider");
  const inputId = `${idPrefix}-invite-url`;

  if (c.url) {
    return (
      <div className="flex flex-col gap-2">
        <label htmlFor={inputId} className="text-xs font-semibold text-fg-2">Enlace de invitación</label>
        <input
          id={inputId}
          readOnly
          value={c.url}
          onFocus={(e) => e.currentTarget.select()}
          className="h-11 w-full rounded-xl border border-cancha/40 bg-surface-deep px-3 font-mono text-xs text-fg"
        />
        <button type="button" onClick={c.copy} className={buttonClasses({ size: "sm", fullWidth: true })}>
          {c.copied === "ok" ? "¡Enlace copiado!" : "Copiar enlace de invitación"}
        </button>
        <p role="status" className="min-h-4 text-xs text-fg-3">
          {c.copied === "fail" ? "No se pudo copiar automáticamente: selecciona el enlace y cópialo." : "Sirve para varias personas durante 7 días."}
        </p>
      </div>
    );
  }
  if (c.active) {
    return (
      <p className="rounded-xl border border-line bg-surface-raised px-3 py-2.5 text-sm text-fg-2">
        Ya tienes un enlace de invitación activo. Por seguridad no se vuelve a mostrar; puedes generar uno nuevo en{" "}
        <Link href={`/parches/${c.parcheId}/participantes`} className="font-semibold text-cancha-text hover:underline">Participantes</Link>.
      </p>
    );
  }
  return (
    <form action={c.createAction} className="flex flex-col gap-2">
      <input type="hidden" name="parche_id" value={c.parcheId} />
      <button type="submit" disabled={c.creating} aria-busy={c.creating} className={buttonClasses({ size: "sm" })}>
        {c.creating ? <Spinner /> : null}
        Crear enlace de invitación
      </button>
      {c.error && <p role="alert" className="text-sm text-danger">{c.error}</p>}
    </form>
  );
}
