"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { isUuid } from "@/lib/data";
import { savePrediction } from "@/lib/juego/data";
import type { PredictionActionState } from "@/lib/juego/matches";
import { toPrediction } from "@/lib/juego/queries";
import { LOGIN_PATH } from "@/lib/navigation";

// Contrato de la acción de pronóstico para conectar la UI original (PredictionForm) en la Fase 3.2.
// Misma forma que savePredictionAction de La Penúltima: estado {success, prediction} | {error}.

export async function savePredictionAction(_prev: PredictionActionState, formData: FormData): Promise<PredictionActionState> {
  const parcheEventId = String(formData.get("parche_event_id") ?? "");
  const matchId = String(formData.get("match_id") ?? "");
  const home = Number.parseInt(String(formData.get("home_score") ?? ""), 10);
  const away = Number.parseInt(String(formData.get("away_score") ?? ""), 10);
  if (!isUuid(parcheEventId) || !isUuid(matchId)) return { error: "No pudimos procesar el pronóstico. Recarga la página." };
  if (Number.isNaN(home) || Number.isNaN(away)) return { error: "Ingresa un marcador válido para ambos equipos." };
  if (home < 0 || home > 30 || away < 0 || away > 30) return { error: "Marcador inválido. Cada valor debe estar entre 0 y 30." };

  const { supabase, user } = await getCurrentUser();
  if (!user) redirect(LOGIN_PATH);
  // La identidad sale de la sesión: el formulario no puede suplantar a otro usuario. La base valida el resto.
  const result = await savePrediction(supabase, { parcheEventId, matchId, home, away });
  if (!result.ok) return { error: result.error };
  revalidatePath("/parches", "layout");
  return { success: true, prediction: toPrediction(result.prediction) };
}
