"use client";

import { useActionState } from "react";
import { buttonClasses } from "@/components/ui/button";
import Spinner from "@/components/ui/Spinner";
import { createParcheAction, type CreateParcheState } from "../actions";

const initial: CreateParcheState = { error: null, name: "" };

export default function CreateParcheForm({ requestId, back = null }: { requestId: string; back?: string | null }) {
  const [state, action, pending] = useActionState(createParcheAction, initial);

  return (
    <form action={action} className="mt-5 flex flex-col gap-4">
      <input type="hidden" name="request_id" value={requestId} />
      {back && <input type="hidden" name="next" value={back} />}
      {back && <p className="rounded-xl border border-cancha/30 bg-cancha/[0.08] px-3 py-2 text-sm text-fg-2">Al crear tu parche volverás al torneo que elegiste para inscribirlo.</p>}
      <div className="flex flex-col gap-1.5">
        <label htmlFor="name" className="text-sm font-medium text-fg-2">
          Nombre del parche
        </label>
        <input
          id="name"
          name="name"
          required
          minLength={2}
          maxLength={50}
          autoComplete="off"
          placeholder="Los del barrio"
          defaultValue={state.name}
          aria-invalid={state.error ? true : undefined}
          aria-describedby={state.error ? "create-error" : undefined}
          className="h-12 w-full rounded-xl border border-line bg-surface-deep px-4 text-base text-fg placeholder:text-fg-3 focus:border-cancha/60 focus:outline-none focus:ring-4 focus:ring-cancha/10"
        />
      </div>
      <div aria-live="polite">
        {state.error && (
          <p id="create-error" role="alert" className="rounded-xl border border-danger/25 bg-danger/[0.08] px-3 py-2.5 text-sm text-danger">
            {state.error}
          </p>
        )}
      </div>
      <button type="submit" disabled={pending} aria-busy={pending} className={buttonClasses({ fullWidth: true })}>
        {pending ? (
          <>
            <Spinner />
            <span>Creando…</span>
          </>
        ) : (
          "Crear parche"
        )}
      </button>
    </form>
  );
}
