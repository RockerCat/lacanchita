/** Formatea la fecha de una noticia (instante UTC) en la zona horaria del torneo; no se asume Colombia. */
export function formatNewsDate(iso: string, tz: string, options?: Intl.DateTimeFormatOptions): string {
  return new Date(iso).toLocaleDateString("es", { ...options, timeZone: tz });
}
