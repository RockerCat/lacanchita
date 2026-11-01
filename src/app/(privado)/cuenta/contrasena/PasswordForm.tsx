"use client";

import { useActionState } from "react";
import { buttonClasses } from "@/components/ui/button";
import Spinner from "@/components/ui/Spinner";
import { updatePasswordAction, type PasswordState } from "./actions";

const inputClass = "h-12 w-full rounded-xl border border-line bg-surface-deep px-4 text-base text-fg focus:border-cancha/60 focus:outline-none focus:ring-4 focus:ring-cancha/10";

export default function PasswordForm() {
  const [state, action, pending] = useActionState<PasswordState, FormData>(updatePasswordAction, { error: null });
  return (
    <form action={action} className="mt-5 flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="password" className="text-sm font-medium text-fg-2">Nueva contraseña</label>
        <input id="password" name="password" type="password" required minLength={8} maxLength={72} autoComplete="new-password" className={inputClass} />
        <p className="text-xs text-fg-3">Mínimo 8 caracteres.</p>
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="confirm" className="text-sm font-medium text-fg-2">Repite la contraseña</label>
        <input id="confirm" name="confirm" type="password" required minLength={8} maxLength={72} autoComplete="new-password" className={inputClass} />
      </div>
      <div aria-live="polite">
        {state.error && <p role="alert" className="rounded-xl border border-danger/25 bg-danger/[0.08] px-3 py-2.5 text-sm text-danger">{state.error}</p>}
      </div>
      <button type="submit" disabled={pending} aria-busy={pending} className={buttonClasses({ size: "lg", fullWidth: true })}>
        {pending ? <><Spinner /><span>Guardando…</span></> : "Guardar contraseña"}
      </button>
    </form>
  );
}
