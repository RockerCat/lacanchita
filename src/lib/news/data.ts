import type { Client } from "@/lib/data";
import { buildMatchNews, type NewsContext } from "./build";

// Consultas de noticias del jugador. Usan la sesión del usuario: la RLS y las funciones SECURITY INVOKER de la base
// deciden qué ve (torneo compartido + su parche), sin service_role ni filtros solo visuales.
export type NewsListItem = { id: string; title: string; summary: string; match_id: string; scope: "event" | "parche"; created_at: string };
export type NewsDetail = NewsListItem & { content: string };

export const NEWS_PAGE_SIZE = 20;

export async function getNewsFeed(supabase: Client, parcheEventId: string, limit = NEWS_PAGE_SIZE, before: string | null = null): Promise<NewsListItem[]> {
  const { data, error } = await supabase.rpc("get_news_feed", { p_parche_event_id: parcheEventId, p_limit: limit, ...(before ? { p_before: before } : {}) });
  if (error) {
    console.error("[news] getNewsFeed:", error.message);
    return [];
  }
  return (data ?? []) as NewsListItem[];
}

export async function getNewsItem(supabase: Client, parcheEventId: string, newsId: string): Promise<NewsDetail | null> {
  const { data, error } = await supabase.rpc("get_news_item", { p_parche_event_id: parcheEventId, p_news_id: newsId });
  if (error) {
    console.error("[news] getNewsItem:", error.message);
    return null;
  }
  return ((data ?? [])[0] ?? null) as NewsDetail | null;
}

/**
 * Genera y publica las noticias de un partido FINALIZADO (superadministrador). Los datos salen de la base
 * (`control_news_context`: resultado oficial, tabla y pronósticos por inscripción) y las noticias se ligan a la
 * revisión oficial vigente; publicar es idempotente, de modo que reintentar nunca duplica. No recalcula puntos.
 * Devuelve cuántas noticias nuevas se publicaron. Lanza si la base rechaza algo (el llamador decide cómo avisar).
 */
export async function publishMatchNews(supabase: Client, matchId: string): Promise<number> {
  const { data, error } = await supabase.rpc("control_news_context", { p_match_id: matchId });
  if (error) throw new Error(error.message);
  const ctx = data as unknown as NewsContext;
  // Sin parches inscritos no hay audiencia: no se publica nada (al inscribir uno, el reintento de Resultados lo cubre).
  if (!ctx.items || ctx.items.length === 0) return 0;
  const drafts = buildMatchNews(ctx);
  const { data: n, error: pubError } = await supabase.rpc("control_publish_match_news", {
    p_match_id: matchId,
    p_revision: ctx.match.revision,
    p_items: drafts as unknown as never,
  });
  if (pubError) throw new Error(pubError.message);
  return Number(n ?? 0);
}

/** Intenta publicar con un reintento; nunca lanza (la finalización del partido no depende de las noticias). */
export async function publishMatchNewsSafely(supabase: Client, matchId: string): Promise<boolean> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      await publishMatchNews(supabase, matchId);
      return true;
    } catch (err) {
      console.error(`[news] no se pudieron publicar las noticias del partido ${matchId} (intento ${attempt + 1}):`, err);
    }
  }
  return false;
}

/**
 * Reintento seguro: publica las noticias de los partidos finalizados (con resultado oficial confirmado) de un torneo
 * que aún no tienen la noticia compartida de su revisión vigente. Idempotente; solo superadministrador. Se invoca al
 * abrir Control → Resultados por si una publicación anterior falló.
 */
export async function reconcileEventNews(supabase: Client, eventId: string, max = 10): Promise<number> {
  const { data: finished } = await supabase
    .from("matches")
    .select("id, result_revision")
    .eq("event_id", eventId)
    .eq("status", "finished")
    .not("result_confirmed_at", "is", null);
  if (!finished || finished.length === 0) return 0;
  const { data: existing } = await supabase
    .from("news")
    .select("match_id, match_revision")
    .eq("event_id", eventId)
    .is("parche_event_id", null)
    .is("superseded_at", null);
  const have = new Set((existing ?? []).map((n) => `${n.match_id}:${n.match_revision}`));
  const missing = finished.filter((m) => !have.has(`${m.id}:${m.result_revision}`)).slice(0, max);
  let published = 0;
  for (const m of missing) if (await publishMatchNewsSafely(supabase, m.id)) published++;
  return published;
}
