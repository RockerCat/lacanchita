import { Crown } from "lucide-react";
import { cn } from "@/lib/juego/utils";
import { formatRelativeDate, type MemberDetail } from "@/lib/juego/groups";

interface MemberListProps {
  members: MemberDetail[];
  currentUserId: string;
}

export default function MemberList({ members, currentUserId }: MemberListProps) {
  if (members.length === 0) {
    return (
      <div className="bg-[#18182a] border border-dashed border-[#2a2a45] rounded-2xl p-5 text-center">
        <p className="text-xs text-[#64748b]">Sin miembros registrados.</p>
      </div>
    );
  }

  return (
    <div className="bg-[#18182a] border border-[#2a2a45] rounded-2xl divide-y divide-[#1e1e35]">
      {members.map((member) => {
        const isCurrentUser = member.user_id === currentUserId;
        const letter = member.display_name.charAt(0).toUpperCase();

        return (
          <div
            key={member.user_id}
            className={cn(
              "flex items-center gap-3 px-4 py-3",
              isCurrentUser && "bg-[#00c85a]/[0.03]"
            )}
          >
            {/* Avatar */}
            <div
              className={cn(
                "w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-xs font-bold",
                isCurrentUser
                  ? "bg-[#00c85a]/20 text-[#00c85a]"
                  : "bg-[#1e1e35] text-[#94a3b8]"
              )}
            >
              {letter}
            </div>

            {/* Name + badges */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span
                  className={cn(
                    "text-sm font-bold truncate",
                    isCurrentUser ? "text-[#00c85a]" : "text-[#f1f5f9]"
                  )}
                >
                  {member.display_name}
                </span>
                {isCurrentUser && (
                  <span className="text-[10px] text-[#00c85a]/60 font-mono shrink-0">
                    tú
                  </span>
                )}
                {member.role === "owner" && (
                  <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-[#f59e0b]/10 text-[#f59e0b] text-[10px] font-semibold shrink-0">
                    <Crown size={9} />
                    Admin
                  </span>
                )}
              </div>
            </div>

            {/* Joined date */}
            <span className="text-[11px] text-[#64748b] font-mono shrink-0">
              Desde {formatRelativeDate(member.joined_at)}
            </span>
          </div>
        );
      })}
    </div>
  );
}
