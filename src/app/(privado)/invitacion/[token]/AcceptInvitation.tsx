"use client";

import { useActionState } from "react";
import { buttonClasses } from "@/components/ui/button";
import Spinner from "@/components/ui/Spinner";
import { invitationMessage } from "@/lib/invitations";
import { acceptInvitationAction, type AcceptState } from "./actions";

const initial: AcceptState = { error: null, status: null };

export default function AcceptInvitation({ token }: { token: string }) {
  const [state, action, pending] = useActionState(acceptInvitationAction, initial);
  // Si entre la vista previa y el clic el enlace venció o se revocó, se explica aquí.
  const changed = state.status && state.status !== "valid" ? invitationMessage(state.status) : null;

  return (
    <form action={action} className="flex w-full flex-col items-center gap-3">
      <input type="hidden" name="token" value={token} />
      <button type="submit" disabled={pending} aria-busy={pending} className={buttonClasses({ size: "lg", fullWidth: true })}>
        {pending ? (
          <>
            <Spinner />
            <span>Uniéndote…</span>
          </>
        ) : (
          "Unirme al parche"
        )}
      </button>
      {(state.error || changed) && (
        <p role="alert" className="text-sm text-danger">
          {state.error ?? `${changed!.title}. ${changed!.body}`}
        </p>
      )}
    </form>
  );
}
