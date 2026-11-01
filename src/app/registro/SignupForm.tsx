"use client";

import { useActionState } from "react";
import { buttonClasses } from "@/components/ui/button";
import Spinner from "@/components/ui/Spinner";
import { PendingGuard } from "@/components/landing/AuthModal";
import { isNextControlFlow, NETWORK_ERROR_MESSAGE } from "@/lib/auth-errors";
import { signupAction, type SignupState } from "./actions";

const initial: SignupState = { error: null, sentTo: null, name: "", email: "" };
const inputClass =
  "h-12 w-full rounded-xl border border-line bg-surface-deep px-4 text-base text-fg placeholder:text-fg-3 " +
  "focus:border-cancha/60 focus:outline-none focus:ring-4 focus:ring-cancha/10";

async function safeSignup(prev: SignupState, fd: FormData): Promise<SignupState> {
  try {
    return await signupAction(prev, fd);
  } catch (e) {
    if (isNextControlFlow(e)) throw e;
    return { error: NETWORK_ERROR_MESSAGE, sentTo: null, name: String(fd.get("name") ?? ""), email: String(fd.get("email") ?? "") };
  }
}

export default function SignupForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState(safeSignup, initial);

  if (state.sentTo) {
    return (
      <div role="status" className="mt-5 rounded-xl border border-cancha/30 bg-cancha/[0.08] p-4 text-sm text-fg-2">
        <p className="font-semibold text-fg">Revisa tu correo</p>
        <p className="mt-1">
          Si {state.sentTo} no tenía cuenta, te enviamos un enlace para confirmarla. Ábrelo en este mismo dispositivo y
          volverás aquí automáticamente. Si ya tenías cuenta, inicia sesión.
        </p>
      </div>
    );
  }

  return (
    <form action={action} className="mt-5 flex flex-col gap-4">
      <PendingGuard />
      <input type="hidden" name="next" value={next} />
      <div className="flex flex-col gap-1.5">
        <label htmlFor="name" className="text-sm font-medium text-fg-2">
          Tu nombre (así te verán en el parche)
        </label>
        <input id="name" name="name" required minLength={2} maxLength={30} autoComplete="nickname" defaultValue={state.name} aria-invalid={state.error ? true : undefined} aria-describedby={state.error ? "signup-error" : undefined} className={inputClass} />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="email" className="text-sm font-medium text-fg-2">
          Correo electrónico
        </label>
        <input id="email" name="email" type="email" required autoComplete="email" inputMode="email" defaultValue={state.email} aria-invalid={state.error ? true : undefined} aria-describedby={state.error ? "signup-error" : undefined} className={inputClass} />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="password" className="text-sm font-medium text-fg-2">
          Contraseña
        </label>
        <input id="password" name="password" type="password" required minLength={8} maxLength={72} autoComplete="new-password" className={inputClass} />
        <p className="text-xs text-fg-3">Mínimo 8 caracteres.</p>
      </div>
      <div aria-live="polite">
        {state.error && (
          <p id="signup-error" role="alert" className="rounded-xl border border-danger/25 bg-danger/[0.08] px-3 py-2.5 text-sm text-danger">
            {state.error}
          </p>
        )}
      </div>
      <button type="submit" disabled={pending} aria-busy={pending} className={buttonClasses({ size: "lg", fullWidth: true })}>
        {pending ? (
          <>
            <Spinner />
            <span>Creando cuenta…</span>
          </>
        ) : (
          "Crear cuenta"
        )}
      </button>
    </form>
  );
}
