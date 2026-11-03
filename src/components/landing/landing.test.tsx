import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/login/actions", () => ({ login: vi.fn(), logout: vi.fn(), requestPasswordReset: vi.fn() }));
vi.mock("@/app/registro/actions", () => ({ signupAction: vi.fn() }));
vi.mock("next/navigation", () => ({ usePathname: () => "/", useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));

vi.mock("@/components/ui/Logo", () => ({ LogoHorizontal: () => <span>La Canchita</span>, LogoSquare: () => <span /> }));

import Landing from "./Landing";
import type { LandingTournament } from "@/lib/landing-tournaments";
import { BASICS, FAQ, LANDING_DESCRIPTION, LANDING_TITLE, LIVE_FEATURES, SCORING_EXAMPLE, STEPS } from "@/lib/landing";

const text = (h: string) => h.replace(/<script[\s\S]*?<\/script>/g, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
const html = renderToStaticMarkup(<Landing />);
const t = text(html);

describe("landing pública", () => {
  it("un solo H1 con la propuesta principal y el subtítulo", () => {
    expect(html.match(/<h1/g)).toHaveLength(1);
    expect(t).toContain("Pronostica partidos de fútbol y compite con tus amigos");
    expect(t).toContain("El fútbol se vive mejor en parche"); // frase editorial de apoyo
    // La explicación completa está en el hero, con sus cuatro conceptos.
    const hero = t.slice(0, t.indexOf("Cómo funciona Cuatro pasos"));
    expect(hero).toContain("creas un parche (tu grupo de amigos)");
    expect(hero).toContain("eliges los marcadores de los partidos de un torneo");
    expect(hero).toContain("sumas puntos por tus aciertos");
    expect(hero).toContain("gana quien más puntos consiga");
    expect(hero).toContain("Sin apuestas ni dinero");
  });
  it("CTA principal, secundario, cierre y navegación pública (sin enlaces administrativos)", () => {
    expect(t).toContain("Empezar a jugar");
    expect(t).toContain("Cómo funciona");
    expect(t).toContain("¿Listo para armar tu parche?");
    expect(t).toContain("Iniciar sesión");
    expect(t).toContain("Crear cuenta");
    expect(html).not.toContain("/control");
    expect(html).not.toContain("/admin");
  });
  it("lo básico (parche, pronóstico, puntos, tabla) aparece junto al hero, antes de las secciones largas", () => {
    for (const b of BASICS) expect(t).toContain(b.term);
    const i = (x: string) => t.indexOf(x);
    expect(i("Tu parche")).toBeGreaterThan(-1);
    expect(i("Tu parche")).toBeLessThan(i("Cuatro pasos y a jugar"));
  });
  it("el hero muestra la ilustración decorativa (sin texto propio) en lugar de la tarjeta de demostración", () => {
    expect(html).toContain("hero-bg.png");
    expect(html).toMatch(/<img[^>]*alt=""/);
    expect(t).not.toContain("Ejemplo de demostración");
    expect(t).not.toMatch(/En vivo\s*<|Live/);
    expect(html).not.toContain("animate-live-pulse");
  });
  it("explica qué es un parche y los cuatro pasos", () => {
    expect(t).toContain("Un parche es tu grupo de amigos, familiares o compañeros con quienes compites haciendo pronósticos.");
    for (const s of STEPS) expect(t).toContain(s.title);
    expect(STEPS).toHaveLength(4);
  });
  it("puntos: ejemplo exacto / resultado / sin puntos, sin valores universales ni penales", () => {
    expect(t).toContain("Marcador exacto");
    expect(t).toContain("Resultado acertado");
    expect(t).toContain("No acertaste");
    expect(t).toContain("cada torneo define cuánto vale cada una");
    expect(t).toContain("los penales no suman puntos");
    expect(SCORING_EXAMPLE.cases.map((c) => c.points)).toEqual([3, 1, 0]);
    expect(t).toContain("fase de grupos del Mundial 2026");
  });
  it("preguntas frecuentes: las siete requeridas, con respuestas sobre dinero y plazos fieles al producto", () => {
    expect(FAQ).toHaveLength(7);
    for (const f of FAQ) expect(t).toContain(f.q);
    expect(t).toContain("No. La Canchita no maneja apuestas");
    expect(t).toContain("Hasta que empiece el partido");
    expect(t).toContain("El enlace vence a los 7 días");
  });
  it("no promete lo que no existe: sin precios, planes, pagos, torneos o fechas inventados ni testimonios", () => {
    for (const bad of [/\$\s?\d/, /COP/, /gratis/i, /premium/i, /suscrip/i, /plan(es)?\b/i, /cinco participantes/i, /testimonio/i, /pr[óo]ximamente/i, /2026-\d\d/, /checkout/i, /multitenant|saas|workspace/i]) {
      expect(t).not.toMatch(bad);
    }
    expect(LIVE_FEATURES.length).toBeGreaterThanOrEqual(6);
  });
  it("sin modal abierto no hay formularios en la página (el modal es cerrado por defecto)", () => {
    expect(html).toContain("<dialog");
    expect(html).not.toContain('name="password"');
  });
  it("metadatos de la portada coherentes", () => {
    expect(LANDING_TITLE).toContain("La Canchita");
    expect(LANDING_DESCRIPTION).toContain("Sin apuestas ni dinero");
  });
});

describe("modal de autenticación", () => {
  it("/login: abre con el formulario de inicio de sesión, título accesible y enlaces a registro y recuperación", () => {
    const h = renderToStaticMarkup(<Landing initialMode="login" next="/parches/x" />);
    expect(h).toContain('aria-labelledby="auth-title"');
    expect(h).toContain('id="auth-title"');
    expect(text(h)).toContain("Iniciar sesión");
    expect(h).toContain('name="email"');
    expect(h).toContain('name="password"');
    expect(h).toContain('autoComplete="current-password"');
    expect(text(h)).toContain("Olvidé mi contraseña");
    expect(text(h)).toContain("Créala aquí");
    expect(h).toContain('aria-label="Cerrar"');
    expect(h).toContain('name="next" value="/parches/x"');
  });
  it("/registro: formulario con solo nombre, correo y contraseña, y enlace para iniciar sesión", () => {
    const h = renderToStaticMarkup(<Landing initialMode="signup" next="/" />);
    expect(text(h)).toContain("Crea tu cuenta");
    expect(h).toContain('name="name"');
    expect(h).toContain('name="email"');
    expect(h).toContain('name="password"');
    expect((h.match(/<input(?![^>]*type="hidden")[^>]*>/g) ?? []).length).toBe(3);
    expect(text(h)).toContain("¿Ya tienes cuenta?");
  });
  it("invitación: el destino se conserva y se explica por qué", () => {
    const next = "/invitacion/AbC_def-1234567890123456789012345678901234";
    const h = renderToStaticMarkup(<Landing initialMode="signup" next={next} />);
    expect(h).toContain(`name="next" value="${next}"`);
    expect(text(h)).toContain("Te invitaron a un parche");
  });
  it("aviso de enlace vencido se muestra en el login", () => {
    expect(text(renderToStaticMarkup(<Landing initialMode="login" notice="El enlace venció" />))).toContain("El enlace venció");
  });
});

describe("encabezado y CTA según la sesión", () => {
  it("visitante: botones de login y registro; el CTA principal abre el registro (botón, no enlace)", () => {
    const header = html.slice(html.indexOf("<header"), html.indexOf("</header>"));
    expect(text(header)).toContain("Iniciar sesión");
    expect(text(header)).toContain("Crear cuenta");
    expect(header).not.toContain('aria-label="Menú de usuario"');
    expect(html).not.toContain('href="/inicio"');
  });
  it("con sesión: identidad (inicial y nombre) y menú; sin login/registro; CTA lleva a /inicio sin crear nada", () => {
    const h = renderToStaticMarkup(<Landing user={{ name: "Camila" }} />);
    const header = h.slice(h.indexOf("<header"), h.indexOf("</header>"));
    expect(header).toContain('aria-label="Menú de usuario"');
    expect(header).toContain('aria-haspopup="menu"');
    expect(text(header)).toContain("Camila");
    expect(text(header)).toContain("C");
    expect(text(header)).not.toContain("Iniciar sesión");
    expect(text(header)).not.toContain("Crear cuenta");
    expect(h).toContain('href="/inicio"');
    expect(text(h)).toContain("Ir a mis parches");
    expect(h.match(/href="\/inicio"/g)!.length).toBeGreaterThanOrEqual(2); // hero y cierre
    expect(h).toContain('href="/"'); // el logo sigue enlazando a la portada
  });
});

const T = (o: Partial<LandingTournament> & { slug: string; name: string }): LandingTournament => ({ status: "scheduled", timezone: "America/Bogota", firstMatchAt: "2027-02-01T20:00:00Z", nextMatchAt: "2027-02-01T20:00:00Z", lastMatchAt: "2027-06-01T20:00:00Z", hasLive: false, isManual: false, ...o });

describe("torneo destacado dinámico", () => {
  it("sin torneos elegibles: estado honesto, sin torneo inventado ni oferta de QA", () => {
    const x = text(html);
    expect(x).toContain("Estamos preparando los próximos torneos");
    expect(x).not.toMatch(/Próximo torneo|Torneo en juego/);
    expect(x).not.toMatch(/QA Jugador|Copa de prueba/);
    expect(html).not.toContain("/jugar/");
  });
  it("un torneo: tarjeta protagonista con nombre real, estado, fecha real y CTA; el visitante abre el registro (botón)", () => {
    const h = renderToStaticMarkup(<Landing tournaments={[T({ slug: "liga-x", name: "Liga X 2027" })]} />);
    const x = text(h);
    expect(x).toContain("Próximo torneo");
    expect(x).toContain("Liga X 2027");
    expect(x).toContain("Inscripciones abiertas");
    expect(x).toContain("Empieza el 1 de febrero");
    expect(x).toContain("¡Quiero participar!");
    expect(x).toContain("Por ahora es el único torneo disponible");
    expect(h).not.toContain('href="/jugar/liga-x"');
    // La tarjeta está en el primer tramo: antes de «Cómo funciona».
    expect(x.indexOf("Próximo torneo")).toBeLessThan(x.indexOf("Cuatro pasos y a jugar"));
  });
  it("con sesión el CTA enlaza a elegir parche (/jugar/slug)", () => {
    const h = renderToStaticMarkup(<Landing user={{ name: "Ana" }} tournaments={[T({ slug: "liga-x", name: "Liga X 2027" })]} />);
    expect(h).toContain('href="/jugar/liga-x"');
  });
  it("varios torneos: uno protagonista y los demás en una sección secundaria con su propio acceso", () => {
    const h = renderToStaticMarkup(<Landing tournaments={[T({ slug: "b", name: "Beta", status: "scheduled" }), T({ slug: "a", name: "Alfa", status: "in_progress", hasLive: true, nextMatchAt: "2027-01-10T20:00:00Z" })]} />);
    const x = text(h);
    // Prioridad: el próximo con inscripciones abiertas (Beta) es el protagonista; el torneo en curso queda como secundario.
    expect(x).toContain("Próximo torneo Beta");
    expect(x).not.toContain("Próximo torneo Alfa");
    expect(x).toContain("Otros torneos que puedes jugar");
    expect(x).toContain("Alfa");
    expect(x).toContain("En juego ahora");
  });
  it("fecha anunciada sin partidos: «Inicio previsto» con aviso discreto, sin inventar hora ni equipos", () => {
    const x = text(renderToStaticMarkup(<Landing tournaments={[T({ slug: "liga", name: "Liga Y", firstMatchAt: null, nextMatchAt: null, announcedStart: "2099-11-14" })]} />));
    expect(x).toContain("Inicio previsto: 14 de noviembre");
    expect(x).toContain("Sujeto a programación oficial");
    expect(x).toContain("Inscripciones abiertas");
    expect(x).toContain("Los equipos y partidos se anunciarán cuando se confirme la programación oficial");
    expect(x).not.toMatch(/Empieza el/);
  });
  it("con partidos oficiales la fecha anunciada ya no se muestra", () => {
    const x = text(renderToStaticMarkup(<Landing tournaments={[T({ slug: "liga", name: "Liga Y", announcedStart: "2099-11-14" })]} />));
    expect(x).toContain("Empieza el 1 de febrero");
    expect(x).not.toMatch(/Inicio previsto|Sujeto a programación/);
  });
});

describe("portada para el superadministrador", () => {
  const sa = renderToStaticMarkup(<Landing user={{ name: "Alex", superadmin: true }} tournaments={[T({ slug: "liga-x", name: "Liga X 2027" })]} />);
  it("encabezado con Control; el CTA lleva a Control y nunca al flujo de jugador", () => {
    const header = sa.slice(sa.indexOf("<header"), sa.indexOf("</header>"));
    expect(header).toContain('href="/control"');
    expect(text(sa)).toContain("Ir a Control");
    expect(text(sa)).toContain("Administrar en Control");
    expect(sa).not.toContain('href="/jugar/');
    expect(sa).not.toContain('href="/inicio"');
    expect(text(sa)).not.toContain("Ir a mis parches");
    expect(text(sa)).not.toContain("¡Quiero participar!");
  });
  it("sigue sin mostrar login/registro", () => {
    const header = sa.slice(sa.indexOf("<header"), sa.indexOf("</header>"));
    expect(text(header)).not.toContain("Iniciar sesión");
    expect(text(header)).not.toContain("Crear cuenta");
  });
});

describe("jerarquía de CTAs", () => {
  const featured = [T({ slug: "liga-x", name: "Liga X 2027" })];
  const primaryGreen = (h: string) => (h.match(/bg-cancha text-on-cancha/g) ?? []).length;
  const firstStretch = (h: string) => h.slice(h.indexOf("<main"), h.indexOf('aria-label="Lo básico')); // hero + promoción

  it("visitante con torneo destacado: un único CTA verde en el primer tramo («¡Quiero participar!»); sin «Empezar a jugar»", () => {
    const h = renderToStaticMarkup(<Landing tournaments={featured} />);
    const top = firstStretch(h);
    expect(primaryGreen(top)).toBe(1);
    expect(text(top)).toContain("¡Quiero participar!");
    expect(text(top)).not.toContain("Empezar a jugar");
    // «Cómo funciona» es un enlace discreto a la sección explicativa, no un botón grande.
    expect(top).toContain('href="#como-funciona"');
    expect(top).not.toMatch(/<a href="#como-funciona" class="[^"]*h-14/);
    expect(h).toContain('id="como-funciona"');
  });
  it("el encabezado conserva login y «Crear cuenta», este último sin competir (sin el verde principal)", () => {
    const h = renderToStaticMarkup(<Landing tournaments={featured} />);
    const header = h.slice(h.indexOf("<header"), h.indexOf("</header>"));
    expect(text(header)).toContain("Iniciar sesión");
    expect(text(header)).toContain("Crear cuenta");
    expect(primaryGreen(header)).toBe(0);
  });
  it("sin torneo destacado: el hero conserva «Empezar a jugar» como CTA principal y «Cómo funciona» como secundario; el header mantiene su botón", () => {
    const top = firstStretch(html);
    expect(text(top)).toContain("Empezar a jugar");
    expect(text(top)).toContain("Cómo funciona");
    const header = html.slice(html.indexOf("<header"), html.indexOf("</header>"));
    expect(primaryGreen(header)).toBe(1);
  });
  it("el CTA final se conserva con y sin torneo destacado", () => {
    for (const h of [html, renderToStaticMarkup(<Landing tournaments={featured} />)]) {
      const end = h.slice(h.indexOf('aria-labelledby="cierre"'));
      expect(text(end)).toContain("¿Listo para armar tu parche?");
      expect(text(end)).toContain("Empezar a jugar");
    }
  });
  it("usuario autenticado y superadministrador: sin CTA redundante en el hero cuando hay torneo", () => {
    const player = renderToStaticMarkup(<Landing user={{ name: "Ana" }} tournaments={featured} />);
    expect(text(firstStretch(player))).not.toContain("Ir a mis parches");
    expect(player).toContain('href="/jugar/liga-x"');
    const sa = renderToStaticMarkup(<Landing user={{ name: "Alex", superadmin: true }} tournaments={featured} />);
    expect(text(firstStretch(sa))).not.toContain("Ir a Control");
    expect(text(firstStretch(sa))).toContain("Administrar en Control");
    expect(sa).not.toContain('href="/jugar/');
  });
  it("el CTA del torneo conserva su destino: abre el registro (botón) para el visitante", () => {
    const h = renderToStaticMarkup(<Landing tournaments={featured} />);
    expect(firstStretch(h)).toMatch(/<button type="button" class="[^"]*">¡Quiero participar!<\/button>/);
  });
});

describe("estado temporal en la tarjeta", () => {
  const NOW = "2027-03-01T15:00:00Z";
  const card = (t: LandingTournament) => text(renderToStaticMarkup(<Landing tournaments={[t]} now={NOW} />));
  it("inicio pasado sin declarar en curso: ni «Empieza el» ni «En juego»", () => {
    const x = card(T({ slug: "qa", name: "QA", firstMatchAt: "2026-10-31T19:04:00Z", nextMatchAt: "2027-03-02T19:04:00Z" }));
    expect(x).toContain("Inscripciones abiertas");
    expect(x).toContain("Próximo partido: 2 de marzo");
    expect(x).not.toMatch(/Empieza el|En juego|Próximamente/);
  });
  it("en curso y próximo: muestran su estado real", () => {
    expect(card(T({ slug: "a", name: "A", status: "in_progress", nextMatchAt: "2027-03-09T20:00:00Z" }))).toMatch(/en juego.*En juego.*Próximo partido: 9 de marzo.*Inscripciones abiertas/i);
    expect(card(T({ slug: "a", name: "A", firstMatchAt: "2027-03-20T20:00:00Z" }))).toMatch(/Empieza el 20 de marzo.*Inscripciones abiertas/);
  });
});

describe("ilustración del torneo en la promoción", () => {
  const OLD = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const withArt = () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://proyecto.supabase.co";
    return renderToStaticMarkup(<Landing tournaments={[T({ slug: "liga-x", name: "Liga X 2027", illustrationPath: "ev/img.webp" })]} />);
  };
  it("con ilustración: imagen pública con alt, y título, fecha y CTA siguen siendo texto", () => {
    const h = withArt();
    expect(h).toContain('src="https://proyecto.supabase.co/storage/v1/object/public/event-illustrations/ev/img.webp"');
    expect(h).toContain('alt="Ilustración de Liga X 2027"');
    expect(text(h)).toContain("¡Quiero participar!");
    expect(text(h)).toContain("Empieza el 1 de febrero");
    process.env.NEXT_PUBLIC_SUPABASE_URL = OLD;
  });
  it("sin ilustración (o sin URL base): sin <img> de torneo, sin huecos ni íconos rotos", () => {
    const h = renderToStaticMarkup(<Landing tournaments={[T({ slug: "liga-x", name: "Liga X 2027" })]} />);
    expect(h).not.toContain("event-illustrations");
    expect(h).not.toContain("Ilustración de");
    process.env.NEXT_PUBLIC_SUPABASE_URL = "";
    const g = renderToStaticMarkup(<Landing tournaments={[T({ slug: "liga-x", name: "Liga X 2027", illustrationPath: "ev/img.webp" })]} />);
    expect(g).not.toContain("Ilustración de");
    process.env.NEXT_PUBLIC_SUPABASE_URL = OLD;
  });
});
