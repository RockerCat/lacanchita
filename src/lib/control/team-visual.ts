// Identidad visual de un equipo: bandera emoji (selecciones), escudo (clubes) o iniciales.
// No se generan ni se descargan imágenes: solo emoji Unicode y escudos que el superadministrador sube
// (bucket team-crests, ruta guardada en teams.crest_path).

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

const flagFromIso = (code: string) =>
  String.fromCodePoint(...[...code.toUpperCase()].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));

// Banderas de las naciones del Reino Unido (secuencias de etiquetas, no tienen código ISO propio).
const tagFlag = (tag: string) =>
  String.fromCodePoint(0x1f3f4, ...[...tag].map((c) => 0xe0000 + c.charCodeAt(0)), 0xe007f);
const SUBDIVISIONS: Record<string, string> = {
  inglaterra: tagFlag("gbeng"),
  escocia: tagFlag("gbsct"),
  gales: tagFlag("gbwls"),
};
// Nombres habituales que Intl no devuelve tal cual.
const ALIASES: Record<string, string> = {
  usa: "US", "ee uu": "US", "ee. uu.": "US", "estados unidos": "US", holanda: "NL", "corea del sur": "KR",
  "republica checa": "CZ", "costa de marfil": "CI", turquia: "TR", "rd congo": "CD", "cabo verde": "CV",
};

let byName: Map<string, string> | null = null;
function regionIndex(): Map<string, string> {
  if (byName) return byName;
  byName = new Map();
  try {
    const names = new Intl.DisplayNames(["es"], { type: "region" });
    for (let a = 65; a <= 90; a++) {
      for (let b = 65; b <= 90; b++) {
        const code = String.fromCharCode(a, b);
        const n = names.of(code);
        if (n && n !== code && !/desconocida/i.test(n)) byName.set(norm(n), code);
      }
    }
  } catch {
    // Sin datos de región: no se sugiere nada.
  }
  for (const [alias, code] of Object.entries(ALIASES)) byName.set(alias, code);
  return byName;
}

// Bandera sugerida por el nombre de una selección (español); null si no hay correspondencia válida.
export function suggestFlag(name: string): string | null {
  const n = norm(name);
  if (!n) return null;
  if (SUBDIVISIONS[n]) return SUBDIVISIONS[n];
  const code = regionIndex().get(n);
  return code ? flagFromIso(code) : null;
}

export function teamInitials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "?";
}

// URL pública del escudo (bucket público de lectura).
export function crestUrl(path: string | null | undefined): string | null {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!path || !base) return null;
  return `${base.replace(/\/$/, "")}/storage/v1/object/public/team-crests/${path}`;
}

export type VisualTeam = { name: string; kind?: string; flag_emoji?: string | null; crest_path?: string | null };

// Qué mostrar: selecciones → bandera, luego escudo; clubes → escudo, luego emoji; si no, iniciales.
export function teamVisual(t: VisualTeam): { type: "flag"; emoji: string } | { type: "crest"; url: string } | { type: "initials"; text: string } {
  const crest = crestUrl(t.crest_path);
  const flag = t.flag_emoji?.trim() || null;
  const order = t.kind === "club" ? ["crest", "flag"] : ["flag", "crest"];
  for (const k of order) {
    if (k === "flag" && flag) return { type: "flag", emoji: flag };
    if (k === "crest" && crest) return { type: "crest", url: crest };
  }
  return { type: "initials", text: teamInitials(t.name) };
}
