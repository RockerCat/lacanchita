"use client";

import { useActionState, useState } from "react";
import { leaveParcheAction, type ActionState } from "@/app/(privado)/parches/actions";
import { buttonClasses } from "../ui/button";

const initial: ActionState = { error: null };

// Salir requiere confirmar: para volver hace falta una invitación nueva.
export default function LeaveParche({ parcheId, parcheName }: { parcheId: string; parcheName: string }) {
  const [confirming, setConfirming] = useState(false);
  const [state, action, pending] = useActionState(leaveParcheAction, initial);

  return (
    <div className="rounded-2xl border border-line bg-surface p-4 sm:p-5">
      <h2 className="text-base font-bold text-fg">Salir del parche</h2>
      <p className="mt-1 text-sm text-fg-2">Dejarás de ver {parcheName}. Para volver necesitarás una invitación nueva.</p>
      {!confirming ? (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="mt-3 h-9 rounded-xl border border-danger/30 px-4 text-sm font-semibold text-danger hover:bg-danger/10"
        >
          Salir del parche
        </button>
      ) : (
        <form action={action} className="mt-3 flex flex-wrap items-center gap-2">
          <input type="hidden" name="parche_id" value={parcheId} />
          <button
            type="submit"
            disabled={pending}
            className="h-9 rounded-xl border border-danger/50 bg-danger/15 px-4 text-sm font-semibold text-danger hover:bg-danger/25 disabled:opacity-50"
          >
            {pending ? "Saliendo…" : "Sí, salir"}
          </button>
          <button type="button" onClick={() => setConfirming(false)} className={buttonClasses({ variant: "ghost", size: "sm" })}>
            Cancelar
          </button>
        </form>
      )}
      {state.error && (
        <p role="alert" className="mt-2 text-sm text-danger">
          {state.error}
        </p>
      )}
    </div>
  );
}
