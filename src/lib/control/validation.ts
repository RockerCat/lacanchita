// Validación de formularios de Control con mensajes propios en español (sin los globos nativos del
// navegador). Solo es una ayuda de usabilidad: el servidor y la base de datos repiten toda validación.

export type ValidityLike = Partial<Record<
  "valueMissing" | "customError" | "tooShort" | "tooLong" | "patternMismatch" | "rangeUnderflow" | "rangeOverflow" | "badInput" | "stepMismatch" | "typeMismatch",
  boolean
>>;
export type FieldLike = {
  type?: string;
  minLength?: number;
  maxLength?: number;
  min?: string;
  max?: string;
  dataset?: { patternMessage?: string; customMessage?: string; label?: string };
};

// Mensaje para el primer problema del campo; null si es válido.
export function validityMessage(v: ValidityLike, f: FieldLike = {}): string | null {
  if (v.valueMissing) return f.type === "checkbox" ? "Marca esta casilla para continuar." : "Este campo es obligatorio.";
  if (v.customError) return f.dataset?.customMessage || "El valor no es válido.";
  if (v.badInput || v.stepMismatch) return "Escribe un número entero válido.";
  if (v.typeMismatch) return "El formato no es válido.";
  if (v.tooShort) return `Escribe al menos ${f.minLength} caracteres.`;
  if (v.tooLong) return `No puede tener más de ${f.maxLength} caracteres.`;
  if (v.rangeUnderflow) return `Debe ser ${f.min} o más.`;
  if (v.rangeOverflow) return `No puede ser mayor que ${f.max}.`;
  if (v.patternMismatch) return f.dataset?.patternMessage || "El formato no es válido.";
  return null;
}

export type FieldErrors = Record<string, string>;

// Recorre los controles con nombre de un <form> y devuelve los errores por campo (en orden del documento).
export function validateForm(form: HTMLFormElement): FieldErrors {
  const errors: FieldErrors = {};
  for (const el of Array.from(form.elements)) {
    if (!(el instanceof HTMLInputElement || el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement)) continue;
    if (!el.name || el.disabled || el.type === "hidden" || errors[el.name]) continue;
    const msg = validityMessage(el.validity, {
      type: el.type,
      minLength: "minLength" in el ? el.minLength : undefined,
      maxLength: "maxLength" in el ? el.maxLength : undefined,
      min: "min" in el ? el.min : undefined,
      max: "max" in el ? el.max : undefined,
      dataset: el.dataset,
    });
    if (msg) errors[el.name] = msg;
  }
  return errors;
}
