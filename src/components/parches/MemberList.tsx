import type { ParcheMember } from "@/lib/data";
import { ROLE_LABELS } from "@/lib/parches";
import { memberActions, type Viewer } from "@/lib/permissions";
import Badge from "../ui/Badge";
import MemberActionsButtons from "./MemberActionsButtons";

export default function MemberList({
  parcheId,
  members,
  viewer,
}: {
  parcheId: string;
  members: ParcheMember[];
  viewer: Viewer;
}) {
  return (
    <ul className="divide-y divide-line-subtle overflow-hidden rounded-2xl border border-line bg-surface">
      {members.map((m) => {
        const actions = memberActions(viewer, m);
        return (
          <li key={m.userId} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3" data-testid="member-row">
            <span
              aria-hidden="true"
              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                m.isMe ? "bg-cancha/20 text-cancha-text" : "bg-surface-raised text-fg-2"
              } ${m.status === "disabled" ? "opacity-50" : ""}`}
            >
              {m.displayName.charAt(0).toUpperCase()}
            </span>
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-1.5">
                <span className={`truncate text-sm font-bold ${m.status === "disabled" ? "text-fg-3" : "text-fg"}`}>{m.displayName}</span>
                {m.isMe && <span className="font-mono text-[11px] text-cancha-text">tú</span>}
              </p>
              <p className="mt-1 flex flex-wrap gap-1.5">
                {m.role !== "member" && <Badge variant={m.role === "owner" ? "gold" : "green"}>{ROLE_LABELS[m.role]}</Badge>}
                {m.status === "disabled" && <Badge variant="red">Deshabilitado</Badge>}
              </p>
            </div>
            {(actions.toggleStatus || actions.toggleRole) && (
              <MemberActionsButtons parcheId={parcheId} member={m} actions={actions} />
            )}
          </li>
        );
      })}
    </ul>
  );
}
