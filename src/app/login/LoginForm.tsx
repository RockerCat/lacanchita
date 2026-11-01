"use client";

import { useActionState } from "react";
import { buttonClasses } from "@/components/ui/button";
import Spinner from "@/components/ui/Spinner";
import { PendingGuard } from "@/components/landing/AuthModal";
import { isNextControlFlow, NETWORK_ERROR_MESSAGE } from "@/lib/auth-errors";
import { login, type LoginState } from "./actions";

const initialState: LoginState = { error: null, email: "" };

// Campos con el estilo de el-var/src/components/ui/Input.tsx.
const inputClass =
  "w-full h-12 rounded-xl border bg-surface-deep px-4 text-base text-fg placeholder:text-fg-3 " +
  "focus:outline-none focus:ring-4 focus:border-cancha/60 focus:ring-cancha/10";

async function safeLogin(prev: LoginState, fd: FormData): Promise<LoginState> {
  try {
    return await login(prev, fd);
  } catch (e) {
    if (isNextControlFlow(e)) throw e;
    return { error: NETWORK_ERROR_MESSAGE, email: String(fd.get("email") ?? "") };
  }
}

export default function LoginForm({ next }: { next: string }) {
  const [state, formAction, pending] = useActionState(safeLogin, initialState);
  const invalid = Boolean(state.error);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <PendingGuard />
      <input type="hidden" name="next" value={next} />
      <div className="flex flex-col gap-1.5">
        <label htmlFor="email" className="text-sm font-medium text-fg-2">
          Correo electrónico
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          placeholder="tú@ejemplo.com"
          required
          defaultValue={state.email}
          aria-invalid={invalid || undefined}
          aria-describedby={invalid ? "login-error" : undefined}
          className={`${inputClass} ${invalid ? "border-danger/50" : "border-line"}`}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="password" className="text-sm font-medium text-fg-2">
          Contraseña
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          placeholder="••••••••"
          required
          aria-invalid={invalid || undefined}
          aria-describedby={invalid ? "login-error" : undefined}
          className={`${inputClass} ${invalid ? "border-danger/50" : "border-line"}`}
        />
      </div>
      <div aria-live="polite">
        {state.error && (
          <p
            id="login-error"
            role="alert"
            className="rounded-xl border border-danger/25 bg-danger/[0.08] px-3 py-2.5 text-sm leading-relaxed text-danger"
          >
            {state.error}
          </p>
        )}
      </div>
      <button type="submit" disabled={pending} aria-busy={pending} className={buttonClasses({ size: "lg", fullWidth: true })}>
        {pending ? (
          <>
            <Spinner />
            <span>Entrando…</span>
          </>
        ) : (
          "Entrar"
        )}
      </button>
    </form>
  );
}
