"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser, isPlatformAdmin } from "@/lib/auth";
import { safeReturnToPlay } from "@/lib/jugar";
import { isUuid } from "@/lib/data";
import { invitationUrl } from "@/lib/invitations";
import { LOGIN_PATH } from "@/lib/navigation";
import { requestOrigin } from "@/lib/origin";
import { parcheErrorMessage } from "@/lib/parche-errors";

// Todas las operaciones usan la sesión del usuario y funciones de la base que validan los permisos
// (auth.uid(), rol y estado). Los campos del formulario solo identifican el objetivo.
async function session() {
  const { supabase, user } = await getCurrentUser();
  if (!user) redirect(LOGIN_PATH);
  return supabase;
}

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "");

export type CreateParcheState = { error: string | null; name: string };

export async function createParcheAction(_prev: CreateParcheState, formData: FormData): Promise<CreateParcheState> {
  const name = str(formData, "name").trim();
  const requestId = str(formData, "request_id");
  if (name.length < 2 || name.length > 50) return { error: "El nombre debe tener entre 2 y 50 caracteres.", name };
  if (!isUuid(requestId)) return { error: parcheErrorMessage({ message: "invalid_request" }), name };

  // El superadministrador no participa como jugador: no crea parches (refuerzo del servidor).
  if (await isPlatformAdmin()) return { error: "El superadministrador administra desde Control y no crea parches.", name };
  const supabase = await session();
  const { data, error } = await supabase.rpc("create_parche", { p_name: name, p_request_id: requestId });
  if (error || !data) return { error: parcheErrorMessage(error), name };
  revalidatePath("/parches");
  // Venía de «Jugar este torneo»: vuelve a ese torneo para inscribir el parche (con confirmación); si no, al parche.
  redirect(safeReturnToPlay(str(formData, "next")) ?? `/parches/${data}`);
}

export type ActionState = { error: string | null };

export async function setMemberStatusAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parcheId = str(formData, "parche_id");
  const userId = str(formData, "user_id");
  const status = str(formData, "status");
  if (!isUuid(parcheId) || !isUuid(userId) || !["active", "disabled"].includes(status)) {
    return { error: parcheErrorMessage({ message: "invalid_request" }) };
  }
  const supabase = await session();
  const { error } = await supabase.rpc("set_parche_member_status", { p_parche_id: parcheId, p_user_id: userId, p_status: status });
  if (error) return { error: parcheErrorMessage(error) };
  revalidatePath(`/parches/${parcheId}/participantes`);
  return { error: null };
}

export async function setMemberRoleAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parcheId = str(formData, "parche_id");
  const userId = str(formData, "user_id");
  const role = str(formData, "role");
  if (!isUuid(parcheId) || !isUuid(userId) || !["admin", "member"].includes(role)) {
    return { error: parcheErrorMessage({ message: "invalid_request" }) };
  }
  const supabase = await session();
  const { error } = await supabase.rpc("set_parche_member_role", { p_parche_id: parcheId, p_user_id: userId, p_role: role });
  if (error) return { error: parcheErrorMessage(error) };
  revalidatePath(`/parches/${parcheId}/participantes`);
  return { error: null };
}

export async function leaveParcheAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parcheId = str(formData, "parche_id");
  if (!isUuid(parcheId)) return { error: parcheErrorMessage({ message: "invalid_request" }) };
  const supabase = await session();
  const { error } = await supabase.rpc("leave_parche", { p_parche_id: parcheId });
  if (error) return { error: parcheErrorMessage(error) };
  revalidatePath("/parches");
  redirect("/parches");
}

export type InvitationState = { error: string | null; url: string | null; expiresAt: string | null };

// El token solo viaja en esta respuesta (se muestra una vez); no se registra ni se guarda en claro.
export async function createInvitationAction(_prev: InvitationState, formData: FormData): Promise<InvitationState> {
  const parcheId = str(formData, "parche_id");
  if (!isUuid(parcheId)) return { error: parcheErrorMessage({ message: "invalid_request" }), url: null, expiresAt: null };
  const supabase = await session();
  const { data, error } = await supabase.rpc("create_parche_invitation", { p_parche_id: parcheId });
  const row = Array.isArray(data) ? data[0] : null;
  if (error || !row) return { error: parcheErrorMessage(error), url: null, expiresAt: null };
  revalidatePath(`/parches/${parcheId}/participantes`);
  revalidatePath(`/parches/${parcheId}`);
  return { error: null, url: invitationUrl(await requestOrigin(), row.token), expiresAt: row.expires_at };
}

export async function revokeInvitationAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parcheId = str(formData, "parche_id");
  if (!isUuid(parcheId)) return { error: parcheErrorMessage({ message: "invalid_request" }) };
  const supabase = await session();
  const { error } = await supabase.rpc("revoke_parche_invitation", { p_parche_id: parcheId });
  if (error) return { error: parcheErrorMessage(error) };
  revalidatePath(`/parches/${parcheId}/participantes`);
  return { error: null };
}

export type EnrollState = { error: string | null; ok?: boolean; message?: string };

// Incorpora un torneo publicado a un parche. La función de la base comprueba que quien llama sea
// owner/admin ACTIVO del parche, que el torneo esté publicado y abierto, y que no esté ya incorporado.
export async function enrollEventAction(_prev: EnrollState, formData: FormData): Promise<EnrollState> {
  const parcheId = str(formData, "parche_id");
  const eventId = str(formData, "event_id");
  if (!isUuid(parcheId) || !isUuid(eventId)) return { error: parcheErrorMessage({ message: "invalid_request" }) };
  if (await isPlatformAdmin()) return { error: "El superadministrador administra desde Control y no inscribe parches." };
  const supabase = await session();
  const { error } = await supabase.rpc("add_event_to_parche", { p_parche_id: parcheId, p_event_id: eventId });
  if (error) return { error: parcheErrorMessage(error) };
  revalidatePath(`/parches/${parcheId}`);
  revalidatePath("/jugar/[slug]", "page"); // «Jugar este torneo»: el parche pasa a «Ya participa»
  return { error: null, ok: true, message: "Torneo incorporado al parche." };
}
