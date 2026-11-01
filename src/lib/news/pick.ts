// Deterministic template selection — same seed always yields the same
// index, so regenerating news for the same match never changes the text.
// No randomness, no clocks, no external calls.

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

export function pickTemplate(templates: string[], seed: string): string {
  if (templates.length === 0) return "";
  const idx = hashString(seed) % templates.length;
  return templates[idx];
}

export function fillTemplate(
  template: string,
  vars: Record<string, string | number>,
): string {
  return template.replace(/\{(\w+)\}/g, (_, key) =>
    key in vars ? String(vars[key]) : `{${key}}`,
  );
}
