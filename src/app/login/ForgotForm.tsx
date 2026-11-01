"use client";

import { useActionState } from "react";
import { PendingGuard } from "@/components/landing/AuthModal";
import { buttonClasses } from "@/components/ui/button";
import Spinner from "@/components/ui/Spinner";
import { isNextControlFlow, NETWORK_ERROR_MESSAGE } from "@/lib/auth-errors";
import { requestPasswordReset, type ForgotState } from "./actions";

const initial: ForgotState = { error: null, sentTo: null, email: "" };
const inputClass =
  "h-12 w-full rounded-xl border bg-surface-deep px-4 text-base text-fg placeholder:text-fg-3 focus:border-cancha/60 focus:outline-none focus:ring-4 focus:ring-cancha/10";

async function safeReset(prev: ForgotState, fd: FormData): Promise<ForgotState> {
  try {
    return await requestPasswordReset(prev, fd);
  } catch (e) {
    if (isNextControlFlow(e)) throw e;
    return { ...prev, error: NETWORK_ERROR_MESSAGE, email: String(fd.get("email") ?? "") };
  }
}

export default function ForgotForm() {
  const [state, action, pending] = useActionState(safeReset, initial);
  if (state.sentTo) {
    return (
      <div role="status" className="mt-5 rounded-xl border border-cancha/30 bg-cancha/[0.08] p-4 text-sm text-fg-2">
        <p className="font-semibold text-fg">Revisa tu correo</p>
        <p className="mt-1">Si {state.sentTo} tiene cuenta, te enviamos un enlace para elegir una contraseña nueva. Puede tardar un par de minutos; revisa también el correo no deseado.</p>
      </div>
    );
  }
  return (
    <form action={action} className="mt-5 flex flex-col gap-4">
      <PendingGuard />
      <div className="flex flex-col gap-1.5">
        <label htmlFor="forgot-email" className="text-sm font-medium text-fg-2">Correo electrónico</label>
        <input
          id="forgot-email"
          name="email"
          type="email"
          required
          autoComplete="email"
          inputMode="email"
          placeholder="tú@ejemplo.com"
          defaultValue={state.email}
          aria-invalid={state.error ? true : undefined}
          aria-describedby={state.error ? "forgot-error" : undefined}
          className={`${inputClass} ${state.error ? "border-danger/50" : "border-line"}`}
        />
      </div>
      <div aria-live="polite">
        {state.error && <p id="forgot-error" role="alert" className="rounded-xl border border-danger/25 bg-danger/[0.08] px-3 py-2.5 text-sm text-danger">{state.error}</p>}
      </div>
      <button type="submit" disabled={pending} aria-busy={pending} className={buttonClasses({ size: "lg", fullWidth: true })}>
        {pending ? <><Spinner /><span>Enviando…</span></> : "Enviarme el enlace"}
      </button>
    </form>
  );
}
