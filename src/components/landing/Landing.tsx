import Image from "next/image";
import Link from "next/link";
import UserMenu from "@/components/layout/UserMenu";
import ThemeToggle from "@/components/ThemeToggle";
import { logout } from "@/app/login/actions";
import { POST_LOGIN_PATH } from "@/lib/navigation";
import { CONTROL_PATH } from "@/lib/jugar";
import { LogoHorizontal } from "@/components/ui/Logo";
import { buttonClasses } from "@/components/ui/button";
import { describeTournament, describeTournamentLine, pickFeatured, playPath, type LandingTournament } from "@/lib/landing-tournaments";
import { BASICS, FAQ, LIVE_FEATURES, SCORING_EXAMPLE, SCORING_NOTES, STEPS } from "@/lib/landing";
import { AuthButton, AuthModalProvider, type AuthMode } from "./AuthModal";

const section = "mx-auto w-full max-w-5xl px-4 py-12 sm:py-16";
const eyebrow = "font-mono text-[11px] uppercase tracking-widest text-cancha-text";
const h2 = "mt-2 text-2xl font-black text-fg sm:text-3xl";
const primary = buttonClasses({ size: "lg" });

// Portada pública de La Canchita (mobile-first). Login, registro y recuperación se abren en un modal sin salir de
// la página; /login y /registro muestran esta misma portada con el modal abierto.
// Botón de llamada a la acción: visitante → abre el modal de registro; con sesión → siguiente paso lógico (/inicio:
// su parche o Mis parches, donde puede crear uno). Nunca crea nada por sí solo.
function Cta({ user, className, children, authed, admin = false }: { user: boolean; className: string; children: React.ReactNode; authed: string; admin?: boolean }) {
  if (admin) return <Link href={CONTROL_PATH} className={className}>Ir a Control</Link>;
  return user ? <Link href={POST_LOGIN_PATH} className={className}>{authed}</Link> : <AuthButton mode="signup" className={className}>{children}</AuthButton>;
}

// Botón «Jugar»: visitante → registro con el torneo como destino posterior; con sesión → elegir con qué parche jugarlo.
function PlayButton({ t, authed, admin = false, className, children }: { t: LandingTournament; authed: boolean; admin?: boolean; className: string; children: React.ReactNode }) {
  if (admin) return <Link href={CONTROL_PATH} className={className}>Administrar en Control</Link>;
  return authed ? <Link href={playPath(t.slug)} className={className}>{children}</Link> : <AuthButton mode="signup" next={playPath(t.slug)} className={className}>{children}</AuthButton>;
}

export default function Landing({ initialMode = null, next = "/", notice = null, user = null, tournaments = [], now: nowIso }: { initialMode?: AuthMode | null; next?: string; notice?: string | null; user?: { name: string; superadmin?: boolean } | null; tournaments?: LandingTournament[]; now?: string }) {
  const authed = Boolean(user);
  const admin = Boolean(user?.superadmin);
  const { featured, others } = pickFeatured(tournaments);
  // Instante de la petición (la página es dinámica): los textos de fecha y estado se calculan al servirla, no al compilar.
  const now = nowIso ? new Date(nowIso) : new Date();
  const featuredInfo = featured ? describeTournament(featured, now) : null;
  return (
    <AuthModalProvider initialMode={initialMode} next={next} notice={notice}>
      <div className="relative flex min-h-dvh flex-col overflow-x-hidden">
        <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-[520px] overflow-hidden">
          <div className="halo-green absolute left-1/2 top-0 h-[320px] w-[560px] -translate-x-1/2 rounded-full blur-[120px]" />
          <div className="halo-blue absolute right-[10%] top-40 h-[200px] w-[300px] rounded-full blur-[90px]" />
        </div>

        <header className="header-blur sticky top-0 z-30 border-b border-line-subtle backdrop-blur-xl">
          <div className="mx-auto flex max-w-5xl items-center justify-between gap-2 px-3 py-2 sm:px-4">
            <Link href="/" aria-label="La Canchita, inicio" className="shrink-0 rounded-xl"><LogoHorizontal /></Link>
            <nav aria-label="Secciones" className="hidden items-center gap-1 md:flex">
              {admin && <Link href={CONTROL_PATH} className="rounded-lg px-3 py-1.5 text-sm font-semibold text-var-blue hover:bg-surface">Control</Link>}
              {[["#como-funciona", "Cómo funciona"], ["#puntos", "Puntos"], ["#preguntas", "Preguntas"]].map(([href, label]) => (
                <a key={href} href={href} className="rounded-lg px-3 py-1.5 text-sm font-semibold text-fg-2 hover:bg-surface hover:text-fg">{label}</a>
              ))}
            </nav>
            <div className="flex shrink-0 items-center gap-1.5">
              {user ? (
                <UserMenu displayName={user.name} logoutAction={logout} variant="landing" superadmin={admin} />
              ) : (
                <>
                  <AuthButton mode="login" className="h-10 rounded-xl px-2.5 text-sm font-semibold text-fg-2 hover:bg-surface hover:text-fg sm:px-3">Iniciar sesión</AuthButton>
                  <AuthButton mode="signup" className={featured ? "h-9 rounded-xl border border-line px-3 text-sm font-semibold text-fg hover:border-line-strong hover:bg-surface" : buttonClasses({ size: "sm" })}>Crear cuenta</AuthButton>
                </>
              )}
            </div>
          </div>
        </header>

        <main className="relative flex-1">
          {/* Hero de ancho completo: la ilustración es la capa de fondo (decorativa) y el contenido va encima. */}
          <section aria-labelledby="hero" className="relative isolate overflow-hidden">
            <div aria-hidden="true" className="absolute inset-0 -z-10">
              {/* Escenario: se ancla abajo a la derecha con su proporción original (sin recortes); en pantallas pequeñas ocupa todo el ancho bajo el texto. */}
              <div className="absolute bottom-0 right-0 aspect-[1672/941] w-full lg:w-[72%] lg:max-w-[1100px]">
                <Image src="/img/hero-bg.png" alt="" fill priority sizes="(min-width: 1024px) 1100px, 100vw" className="object-contain" />
                <div className="absolute inset-x-0 top-0 h-2/5 bg-gradient-to-b from-bg to-transparent lg:h-12" />
                <div className="absolute inset-y-0 left-0 hidden w-1/2 bg-gradient-to-r from-bg via-bg/60 to-transparent lg:block" />
              </div>
              <div className="absolute inset-x-0 bottom-0 h-28 bg-gradient-to-b from-transparent to-bg" />
            </div>
            <div className="mx-auto w-full max-w-5xl px-4 pb-[calc(56vw+1rem)] pt-10 sm:pt-14 lg:min-h-[min(41vw,640px)] lg:pb-24 lg:pt-16">
            <div className="animate-fade-in-up max-w-xl lg:max-w-[35rem]">
              <p className={eyebrow}>El fútbol se vive mejor en parche</p>
              <h1 id="hero" className="mt-3 text-[2rem] font-black leading-[1.08] text-fg sm:text-5xl">
                Pronostica partidos de fútbol y <span className="text-cancha-text">compite con tus amigos</span>
              </h1>
              <p className="mt-4 max-w-xl text-base text-fg-2 sm:text-lg">
                La Canchita es un juego donde creas un <strong className="text-fg">parche</strong> (tu grupo de amigos), eliges los marcadores de los partidos de un torneo y sumas puntos por tus aciertos. Al final, gana quien más puntos consiga.
              </p>
              {featured ? (
                <section aria-label="Torneo destacado" className="mt-5 rounded-2xl border border-cancha/30 bg-cancha/[0.07] p-4">
                  <p className="font-mono text-[11px] uppercase tracking-widest text-cancha-text">Torneo destacado</p>
                  <h2 className="mt-1 text-xl font-black text-fg">{featured.name}</h2>
                  {featuredInfo && (
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-sm text-fg-2">
                      {featuredInfo.headline && <span className="font-semibold text-fg">{featuredInfo.headline}</span>}
                      <span className="font-semibold text-cancha-text">{featuredInfo.headline ? "· " : ""}{featuredInfo.enrollment}</span>
                      {featuredInfo.detail && <span>· {featuredInfo.detail}</span>}
                    </p>
                  )}
                  <p className="mt-2 text-sm text-fg-2">Arma tu parche y compite pronosticando los partidos de este torneo.</p>
                  <PlayButton t={featured} authed={authed} admin={admin} className={`${buttonClasses({ size: "md" })} mt-3 w-full sm:w-auto`}>Jugar este torneo</PlayButton>
                </section>
              ) : null}
              {featured ? (
                <p className="mt-4 text-sm">
                  <a href="#como-funciona" className="font-semibold text-cancha-text underline-offset-4 hover:underline">Cómo funciona ↓</a>
                </p>
              ) : (
                <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                  <Cta user={authed} admin={admin} authed="Ir a mis parches" className={`${primary} sm:w-auto`}>Empezar a jugar</Cta>
                  <a href="#como-funciona" className={buttonClasses({ variant: "secondary", size: "lg" })}>Cómo funciona</a>
                </div>
              )}
            </div>

            </div>
          </section>

          <section aria-label="Lo básico y reglas del juego" className="mx-auto w-full max-w-5xl px-4 pb-4 pt-6">
          <dl aria-label="Lo básico del juego" className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
            {BASICS.map((b) => (
              <div key={b.term} className="rounded-xl border border-line bg-surface px-3 py-2.5">
                <dt className="text-sm font-bold text-fg"><span aria-hidden="true" className="mr-1">{b.icon}</span>{b.term}</dt>
                <dd className="mt-0.5 text-xs leading-snug text-fg-2">{b.text}</dd>
              </div>
            ))}
          </dl>
            <p className="mt-4 text-sm text-fg-3">Sin apuestas ni dinero: se juega por puntos y por orgullo.</p>
          </section>

          <section id="como-funciona" aria-labelledby="como" className={section}>
            <p className={eyebrow}>Cómo funciona</p>
            <h2 id="como" className={h2}>Cuatro pasos y a jugar</h2>
            <p className="mt-2 max-w-2xl text-fg-2">Un parche es tu grupo de amigos, familiares o compañeros con quienes compites haciendo pronósticos.</p>
            <ol className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {STEPS.map((s, i) => (
                <li key={s.title} className="flex gap-4 rounded-2xl border border-line bg-surface p-5">
                  <span aria-hidden="true" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-cancha/15 text-xl">{s.icon}</span>
                  <div>
                    <h3 className="font-bold text-fg"><span className="mr-1.5 font-mono text-sm text-cancha-text">{i + 1}.</span>{s.title}</h3>
                    <p className="mt-1 text-sm text-fg-2">{s.text}</p>
                  </div>
                </li>
              ))}
            </ol>
          </section>

          <section id="puntos" aria-labelledby="pts" className={section}>
            <p className={eyebrow}>Cómo se ganan los puntos</p>
            <h2 id="pts" className={h2}>Acierta el marcador y sube en la tabla</h2>
            <p className="mt-2 max-w-2xl text-fg-2">
              Ejemplo: el partido terminó <strong className="text-fg">{SCORING_EXAMPLE.match}</strong>. Mira cuántos puntos da cada pronóstico.
            </p>
            <ul className="mt-8 grid gap-4 md:grid-cols-3">
              {SCORING_EXAMPLE.cases.map((c) => (
                <li key={c.label} className={`rounded-2xl border p-5 ${c.tone === "exact" ? "border-gold/30 bg-gold/[0.06]" : c.tone === "result" ? "border-cancha/30 bg-cancha/[0.06]" : "border-line bg-surface"}`}>
                  <p className="text-xs uppercase tracking-widest text-fg-3">Pronosticaste</p>
                  <p className="mt-1 font-mono text-3xl font-black tabular-nums text-fg">{c.guess}</p>
                  <p className="mt-3 font-bold text-fg">{c.label}</p>
                  <p className="mt-1 text-sm text-fg-2">{c.detail}</p>
                  <p className="mt-3 font-mono text-lg font-black text-fg">{c.points === 0 ? "0 puntos" : `+${c.points} ${c.points === 1 ? "punto" : "puntos"}`}</p>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-fg-3">En el ejemplo, los puntos son los de la fase de grupos del Mundial 2026 ({SCORING_EXAMPLE.exactPoints} por marcador exacto y {SCORING_EXAMPLE.resultPoints} por resultado).</p>
            <ul className="mt-5 flex flex-col gap-2 text-sm text-fg-2">
              {SCORING_NOTES.map((n) => <li key={n} className="flex gap-2"><span aria-hidden="true" className="text-cancha-text">•</span><span>{n}</span></li>)}
            </ul>
          </section>

          <section aria-labelledby="vive" className={section}>
            <p className={eyebrow}>Vive los partidos</p>
            <h2 id="vive" className={h2}>Cada partido, como si estuvieran en la misma cancha</h2>
            <ul className="mt-8 grid gap-4 sm:grid-cols-2 md:grid-cols-3">
              {LIVE_FEATURES.map((f) => (
                <li key={f.title} className="rounded-2xl border border-line bg-surface p-5">
                  <p aria-hidden="true" className="text-2xl">{f.icon}</p>
                  <h3 className="mt-2 font-bold text-fg">{f.title}</h3>
                  <p className="mt-1 text-sm text-fg-2">{f.text}</p>
                </li>
              ))}
            </ul>
          </section>

          <section id="torneos" aria-labelledby="torneos-t" className={section}>
            <p className={eyebrow}>Torneos</p>
            <h2 id="torneos-t" className={h2}>{featured ? "Otros torneos que puedes jugar" : "Los torneos están en camino"}</h2>
            {others.length > 0 ? (
              <ul className="mt-6 grid gap-3 sm:grid-cols-2">
                {others.map((o) => (
                  <li key={o.slug} className="flex items-center justify-between gap-3 rounded-2xl border border-line bg-surface p-4">
                    <div className="min-w-0">
                      <p className="truncate font-bold text-fg">{o.name}</p>
                      <p className="text-xs text-fg-2">{describeTournamentLine(o, now)}</p>
                    </div>
                    <PlayButton t={o} authed={authed} admin={admin} className={buttonClasses({ variant: "secondary", size: "sm" })}>Jugar</PlayButton>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="mt-6 rounded-2xl border border-dashed border-line bg-surface p-6">
                <p className="font-semibold text-fg">{featured ? "Por ahora es el único torneo disponible." : "Estamos preparando los próximos torneos."}</p>
                <p className="mt-1 text-fg-2">
                  {featured ? "Cuando haya más, los verás aquí." : "Crea tu cuenta y arma tu parche: cuando haya un torneo disponible, podrás elegirlo y empezar a pronosticar."}
                </p>
              </div>
            )}
          </section>

          <section id="preguntas" aria-labelledby="faq" className={`${section} max-w-3xl`}>
            <p className={eyebrow}>Preguntas frecuentes</p>
            <h2 id="faq" className={h2}>Lo que casi todos preguntan</h2>
            <div className="mt-6 flex flex-col gap-2">
              {FAQ.map((f) => (
                <details key={f.q} className="group rounded-2xl border border-line bg-surface px-4 py-3 open:bg-surface-raised">
                  <summary className="flex min-h-10 cursor-pointer list-none items-center justify-between gap-3 font-bold text-fg">
                    {f.q}
                    <span aria-hidden="true" className="text-fg-3 transition-transform group-open:rotate-45">+</span>
                  </summary>
                  <p className="pb-2 pt-1 text-sm text-fg-2">{f.a}</p>
                </details>
              ))}
            </div>
          </section>

          <section aria-labelledby="cierre" className="mx-auto w-full max-w-5xl px-4 pb-16">
            <div className="rounded-3xl border border-cancha/30 bg-cancha/[0.07] px-6 py-10 text-center">
              <h2 id="cierre" className="text-2xl font-black text-fg sm:text-3xl">¿Listo para armar tu parche?</h2>
              <p className="mx-auto mt-2 max-w-md text-fg-2">Crea tu cuenta, invita a los tuyos y que empiece la rivalidad sana.</p>
              <Cta user={authed} admin={admin} authed="Ir a mis parches" className={`${primary} mt-6`}>Empezar a jugar</Cta>
            </div>
          </section>
        </main>

        <footer className="border-t border-line-subtle px-4 py-8">
          <div className="mx-auto flex max-w-5xl flex-col items-center gap-4 text-center sm:flex-row sm:justify-between sm:text-left">
            <div>
              <p className="font-black text-fg">La Canchita</p>
              <p className="mt-1 max-w-xs text-sm text-fg-3">Pronósticos de fútbol entre amigos, en tus parches. Hecho en Colombia 🇨🇴</p>
            </div>
            <div className="flex items-center gap-3">
              {!authed && <AuthButton mode="login" className="text-sm font-semibold text-cancha-text hover:underline">Iniciar sesión</AuthButton>}
              <ThemeToggle />
            </div>
          </div>
        </footer>
      </div>
    </AuthModalProvider>
  );
}
