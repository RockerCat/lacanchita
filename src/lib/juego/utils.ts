import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

// Misma utilidad que La Penúltima (lib/utils.ts): une clases de Tailwind resolviendo conflictos.
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
