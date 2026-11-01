"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { FormContext } from "@/components/form-context";
import { buttonClasses } from "@/components/ui/button";
import Spinner from "@/components/ui/Spinner";
import { validateForm } from "@/lib/control/validation";

export type FormState = {
  error: string | null;
  ok?: boolean;
  message?: string;
  // Error asociado a cada campo (por su atributo name) y valores enviados, para no perder lo escrito.
  fieldErrors?: Record<string, string>;
  values?: Record<string, string>;
};

type Props = {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  submitLabel: string;
  pendingLabel?: string;
  variant?: "primary" | "secondary" | "ghost";
  size?: "sm" | "md";
  // Operaciones sensibles: el primer clic pide confirmación explícita; el segundo ejecuta.
  confirm?: React.ReactNode;
  confirmLabel?: string;
  // Nombre accesible del botón cuando el texto visible es solo un icono.
  buttonLabel?: string;
  resetOnSuccess?: boolean;
  className?: string;
  children?: React.ReactNode;
};

// Formulario con Server Action: validación propia en español (noValidate: sin globos del navegador),
// error junto a cada campo, foco en el primer campo inválido, valores conservados tras un error,
// estado "guardando" y mensaje de éxito. El servidor y la base repiten toda validación.
export default function ActionForm({
  action,
  submitLabel,
  pendingLabel = "Guardando…",
  variant = "primary",
  size = "md",
  confirm,
  confirmLabel = "Sí, continuar",
  buttonLabel,
  resetOnSuccess = false,
  className = "flex flex-col gap-3",
  children,
}: Props) {
  const [state, formAction, pending] = useActionState(action, { error: null });
  // La confirmación queda "armada" solo para el estado actual: cuando la acción responde (éxito o
  // error) el estado cambia y la confirmación se desarma sola.
  const [armedFor, setArmedFor] = useState<FormState | null>(null);
  const armed = armedFor === state;
  // Errores del navegador (antes de enviar), válidos solo mientras no llegue una respuesta nueva.
  const [client, setClient] = useState<{ forState: FormState; errors: Record<string, string> } | null>(null);
  const ref = useRef<HTMLFormElement>(null);

  const errors = client && client.forState === state ? client.errors : (state.fieldErrors ?? {});
  const hasFieldErrors = Object.keys(errors).length > 0;

  useEffect(() => {
    if (state.ok && resetOnSuccess) ref.current?.reset();
    if (state.fieldErrors && Object.keys(state.fieldErrors).length > 0) {
      ref.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
    }
  }, [state, resetOnSuccess]);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    const found = validateForm(e.currentTarget);
    if (Object.keys(found).length > 0) {
      e.preventDefault();
      setClient({ forState: state, errors: found });
      setArmedFor(null);
      const first = Object.keys(found)[0];
      e.currentTarget.querySelector<HTMLElement>(`[name="${CSS.escape(first)}"]`)?.focus();
    }
  }

  function onInput(e: React.FormEvent<HTMLFormElement>) {
    const name = (e.target as HTMLInputElement).name;
    if (name && errors[name]) {
      const next = { ...errors };
      delete next[name];
      setClient({ forState: state, errors: next });
    }
  }

  return (
    <FormContext.Provider value={{ errors, values: state.values ?? {} }}>
      <form ref={ref} action={formAction} onSubmit={onSubmit} onInput={onInput} noValidate className={className}>
        {children}
        <div aria-live="polite" className="flex flex-col gap-2">
          {state.error && (
            <p role="alert" className="rounded-xl border border-danger/25 bg-danger/[0.08] px-3 py-2.5 text-sm text-danger">
              {state.error}
            </p>
          )}
          {!state.error && hasFieldErrors && (
            <p role="alert" className="text-sm text-danger">
              Revisa los campos marcados.
            </p>
          )}
          {!state.error && !hasFieldErrors && state.message && (
            <p role="status" className="rounded-xl border border-cancha/25 bg-cancha/[0.08] px-3 py-2.5 text-sm text-cancha-text">
              {state.message}
            </p>
          )}
        </div>
        {confirm && armed ? (
          <div className="flex flex-col gap-2 rounded-xl border border-gold/30 bg-gold/[0.08] p-3">
            <div className="text-sm text-fg">{confirm}</div>
            <div className="flex flex-wrap gap-2">
              <button type="submit" disabled={pending} aria-busy={pending} className={buttonClasses({ variant: "primary", size: "sm" })}>
                {pending ? (
                  <>
                    <Spinner />
                    <span>{pendingLabel}</span>
                  </>
                ) : (
                  confirmLabel
                )}
              </button>
              <button type="button" disabled={pending} onClick={() => setArmedFor(null)} className={buttonClasses({ variant: "ghost", size: "sm" })}>
                Cancelar
              </button>
            </div>
          </div>
        ) : (
          <button
            type={confirm ? "button" : "submit"}
            onClick={
              confirm
                ? (e) => {
                    // Valida antes de pedir la confirmación.
                    const form = e.currentTarget.form;
                    const found = form ? validateForm(form) : {};
                    if (Object.keys(found).length > 0 && form) {
                      setClient({ forState: state, errors: found });
                      form.querySelector<HTMLElement>(`[name="${CSS.escape(Object.keys(found)[0])}"]`)?.focus();
                      return;
                    }
                    setArmedFor(state);
                  }
                : undefined
            }
            disabled={pending}
            aria-busy={pending}
            aria-label={buttonLabel}
            className={buttonClasses({ variant, size })}
          >
            {pending ? (
              <>
                <Spinner />
                <span>{pendingLabel}</span>
              </>
            ) : (
              submitLabel
            )}
          </button>
        )}
      </form>
    </FormContext.Provider>
  );
}
