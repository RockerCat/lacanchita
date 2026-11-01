import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/(privado)/control/actions", () => ({
  uploadCrestAction: async () => ({ error: null }),
  removeCrestAction: async () => ({ error: null }),
  removeEventTeamAction: async () => ({ error: null }),
  saveTeamAction: async () => ({ error: null }),
  setEventTeamAction: async () => ({ error: null }),
}));

import { FormContext } from "@/components/form-context";
import ControlNav from "./ControlNav";
import { SelectField, TextField } from "./inputs";
import TeamsBoard, { type TeamItem } from "./TeamsBoard";

const textOf = (html: string) => html.replace(/<script[\s\S]*?<\/script>/g, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

describe("campos con validación propia", () => {
  it("muestra el error junto al campo, lo marca como inválido y conserva el valor escrito", () => {
    const html = renderToStaticMarkup(
      <FormContext.Provider value={{ errors: { name: "Ya existe un equipo con ese nombre y tipo." }, values: { name: "Águilas FC" } }}>
        <TextField name="name" label="Nombre" required defaultValue="otro" />
      </FormContext.Provider>
    );
    expect(html).toContain('aria-invalid="true"');
    expect(html).toContain('value="Águilas FC"');
    expect(textOf(html)).toContain("Ya existe un equipo con ese nombre y tipo.");
    expect(html).toMatch(/aria-describedby="name-[^"]*-msg"/);
  });
  it("sin error muestra la ayuda y no marca el campo", () => {
    const html = renderToStaticMarkup(<TextField name="slug" label="Identificador" hint="Solo minúsculas" />);
    expect(html).not.toContain("aria-invalid");
    expect(textOf(html)).toContain("Solo minúsculas");
  });
  it("select con valor conservado", () => {
    const html = renderToStaticMarkup(
      <FormContext.Provider value={{ errors: {}, values: { kind: "club" } }}>
        <SelectField name="kind" label="Tipo" defaultValue="national">
          <option value="national">Selección</option>
          <option value="club">Club</option>
        </SelectField>
      </FormContext.Provider>
    );
    expect(html).toMatch(/<option value="club" selected/);
  });
});

describe("rutas con slug", () => {
  it("las pestañas enlazan por slug, nunca por UUID", () => {
    const html = renderToStaticMarkup(<ControlNav slug="copa-de-prueba" active="equipos" />);
    for (const sub of ["", "/fases", "/equipos", "/partidos", "/resultados", "/actividad"]) {
      expect(html).toContain(`href="/control/torneos/copa-de-prueba${sub}"`);
    }
    expect(html).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-/);
  });
});

describe("TeamsBoard (cuadrícula compacta)", () => {
  const t = (n: number, over: Partial<TeamItem> = {}): TeamItem => ({ id: `t${n}`, name: `Equipo ${n}`, code: `E${n}`, kind: "national", flag_emoji: null, crest_path: null, group: null, ...over });
  const html = renderToStaticMarkup(
    <TeamsBoard eventId="e1" editable inEvent={[t(1, { flag_emoji: "🇪🇸", group: "A" }), t(2), t(3)]} available={[t(4), t(5)]} query="" />
  );
  it("una tarjeta por equipo, en rejilla responsive, con nombre y código", () => {
    expect(html).toMatch(/grid grid-cols-2[^"]*sm:grid-cols-3[^"]*lg:grid-cols-5/);
    for (const n of ["Equipo 1", "Equipo 2", "Equipo 3", "Equipo 4", "Equipo 5"]) expect(textOf(html)).toContain(n);
    expect(textOf(html)).toContain("E1 · Grupo A");
  });
  it("usa la bandera existente o las iniciales; sin imágenes", () => {
    expect(html).toContain("🇪🇸");
    expect(textOf(html)).toContain("E2"); // iniciales de «Equipo 2»
    expect(html).not.toContain("<img");
  });
  it("asociados y no asociados se distinguen; añadir es un clic con nombre accesible", () => {
    expect(textOf(html)).toContain("En el torneo (3)");
    expect(textOf(html)).toContain("añadir un equipo existente");
    expect(html).toContain('aria-label="Añadir Equipo 4 al torneo"');
    expect(html).toContain('aria-pressed="false"');
  });
  it("filtros Todos / Selecciones / Clubes; con un torneo de selecciones arranca en «Selecciones»", () => {
    expect(textOf(html)).toContain("Todos");
    expect(textOf(html)).toContain("Selecciones");
    expect(textOf(html)).toContain("Clubes");
    // equipos del torneo = selecciones → filtro inicial «Selecciones»; el club del catálogo no aparece
    const mixed = renderToStaticMarkup(<TeamsBoard eventId="e1" editable inEvent={[t(1)]} available={[t(4), t(5, { kind: "club", name: "Club Cinco" })]} query="" />);
    expect(textOf(mixed)).not.toContain("Club Cinco");
    expect(mixed).toMatch(/aria-pressed="true"[^>]*>Selecciones/);
    const clubs = renderToStaticMarkup(<TeamsBoard eventId="e1" editable inEvent={[t(1, { kind: "club" })]} available={[t(4), t(5, { kind: "club", name: "Club Cinco" })]} query="" />);
    expect(textOf(clubs)).toContain("Club Cinco");
    expect(textOf(clubs)).not.toContain("Equipo 4");
  });
  it("un club con escudo lo muestra; sin escudo, iniciales", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://x.supabase.co";
    const h = renderToStaticMarkup(
      <TeamsBoard eventId="e1" editable inEvent={[t(1, { kind: "club", name: "Atlético Nacional", crest_path: "a/b.png" }), t(2, { kind: "club", name: "Millonarios FC" })]} available={[]} query="" />
    );
    expect(h).toContain('src="https://x.supabase.co/storage/v1/object/public/team-crests/a/b.png"');
    expect(textOf(h)).toContain("MF");
  });
  it("torneo de solo lectura: sin catálogo ni añadir", () => {
    const ro = renderToStaticMarkup(<TeamsBoard eventId="e1" editable={false} inEvent={[t(1)]} available={[t(4)]} query="" />);
    expect(ro).not.toContain("Añadir Equipo 4");
    expect(textOf(ro)).not.toContain("Catálogo");
  });
});
