"use server";

import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { invitationPath, isValidTokenFormat, type InvitationStatus } from "@/lib/invitations";
import { LOGIN_PATH } from "@/lib/navigation";
import { parcheErrorMessage } from "@/lib/parche-errors";

export type AcceptState = { error: string | null; status: InvitationStatus | null };

export async function acceptInvitationAction(_prev: AcceptState, formData: FormData): Promise<AcceptState> {
  const token = String(formData.get("token") ?? "");
  if (!isValidTokenFormat(token)) return { error: null, status: "not_found" };
  const { supabase, user } = await getCurrentUser();
  if (!user) redirect(`${LOGIN_PATH}?next=${encodeURIComponent(invitationPath(token))}`);

  const { data, error } = await supabase.rpc("accept_parche_invitation", { p_token: token });
  const row = Array.isArray(data) ? data[0] : null;
  if (error || !row) return { error: parcheErrorMessage(error), status: null };
  if ((row.status === "joined" || row.status === "already_member") && row.parche_id) {
    redirect(`/parches/${row.parche_id}`);
  }
  return { error: null, status: row.status as InvitationStatus };
}
