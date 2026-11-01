// Presentación del detalle (de La Penúltima: noticias/[newsId]/page.tsx): el contenido son bloques separados por una
// línea en blanco; el emoji inicial decide la etiqueta del bloque. Sin «Premios proyectados» (no hay dinero).
export const BLOCK_LABELS: Record<string, string> = {
  "⚽": "Resultado",
  "🏆": "Liderato",
  "📈": "Movimiento destacado",
  "📉": "Movimiento destacado",
  "🎯": "Marcador exacto",
  "⚡": "Participación",
};

export function detectLabel(text: string): string | null {
  for (const [emoji, label] of Object.entries(BLOCK_LABELS)) if (text.startsWith(emoji)) return label;
  return null;
}

export function parseBlocks(content: string): { label: string | null; text: string }[] {
  if (!content?.trim()) return [];
  return content
    .split("\n\n")
    .map((raw) => raw.trim())
    .filter(Boolean)
    .map((text) => ({ label: detectLabel(text), text }));
}
