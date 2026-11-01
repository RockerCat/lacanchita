"use client";

import { useActionState } from "react";
import { setMemberRoleAction, setMemberStatusAction, type ActionState } from "@/app/(privado)/parches/actions";
import type { ParcheMember } from "@/lib/data";
import type { MemberActions } from "@/lib/permissions";

const initial: ActionState = { error: null };
const small = "h-8 rounded-lg border px-2.5 text-xs font-semibold disabled:opacity-50";

export default function MemberActionsButtons({
  parcheId,
  member,
  actions,
}: {
  parcheId: string;
  member: ParcheMember;
  actions: MemberActions;
}) {
  const [statusState, statusAction, statusPending] = useActionState(setMemberStatusAction, initial);
  const [roleState, roleAction, rolePending] = useActionState(setMemberRoleAction, initial);
  const error = statusState.error ?? roleState.error;
  const name = member.displayName;

  return (
    <div className="flex w-full flex-col items-end gap-1 sm:w-auto">
      <div className="flex flex-wrap justify-end gap-1.5">
        {actions.toggleRole && (
          <form action={roleAction}>
            <input type="hidden" name="parche_id" value={parcheId} />
            <input type="hidden" name="user_id" value={member.userId} />
            <input type="hidden" name="role" value={member.role === "admin" ? "member" : "admin"} />
            <button type="submit" disabled={rolePending} className={`${small} border-line text-fg-2 hover:border-cancha/50 hover:text-cancha-text`}>
              {member.role === "admin" ? "Quitar admin" : "Hacer admin"}
              <span className="sr-only"> a {name}</span>
            </button>
          </form>
        )}
        {actions.toggleStatus && (
          <form action={statusAction}>
            <input type="hidden" name="parche_id" value={parcheId} />
            <input type="hidden" name="user_id" value={member.userId} />
            <input type="hidden" name="status" value={member.status === "active" ? "disabled" : "active"} />
            <button
              type="submit"
              disabled={statusPending}
              className={`${small} ${
                member.status === "active"
                  ? "border-line text-fg-2 hover:border-danger/50 hover:text-danger"
                  : "border-cancha/40 text-cancha-text hover:bg-cancha/10"
              }`}
            >
              {member.status === "active" ? "Deshabilitar" : "Reactivar"}
              <span className="sr-only"> a {name}</span>
            </button>
          </form>
        )}
      </div>
      {error && (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
