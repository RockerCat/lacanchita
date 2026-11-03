"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import ForgotForm from "@/app/login/ForgotForm";
import LoginForm from "@/app/login/LoginForm";
import SignupForm from "@/app/registro/SignupForm";
import { LogoSquare } from "@/components/ui/Logo";

// Login y registro de la portada en un modal accesible. Usa <dialog> nativo con showModal(): el navegador aporta
// la trampa de foco, Escape, el aislamiento del resto de la página (inert), aria-modal y la restauración del foco
// al elemento que lo abrió. Aquí se añaden el bloqueo del scroll de fondo, el foco inicial en el primer campo, el
// cambio entre vistas sin cerrar el modal y la protección contra cerrarlo mientras se envía un formulario.

export type AuthMode = "login" | "signup" | "forgot";
type Ctx = { open: (mode: AuthMode, next?: string) => void };
const AuthModalContext = createContext<Ctx | null>(null);

export function useAuthModal(): Ctx {
  const v = useContext(AuthModalContext);
  if (!v) throw new Error("useAuthModal fuera de AuthModalProvider");
  return v;
}

// Marca en el DOM que hay un envío en curso (dentro de un <form>): el modal no se cierra a mitad de camino.
export function PendingGuard() {
  const { pending } = useFormStatus();
  return <span hidden data-auth-pending={pending ? "true" : "false"} />;
}

const TITLES: Record<AuthMode, string> = { login: "Iniciar sesión", signup: "Crea tu cuenta", forgot: "Recupera tu contraseña" };

export function AuthModalProvider({
  initialMode = null,
  next,
  notice,
  children,
}: {
  initialMode?: AuthMode | null;
  next: string;
  notice?: string | null;
  children: React.ReactNode;
}) {
  const [mode, setMode] = useState<AuthMode | null>(initialMode);
  // Destino tras autenticarse: el de la ruta, o el que fije el botón que abrió el modal (p. ej. «Jugar este torneo»).
  const [nextPath, setNextPath] = useState(next);
  const ref = useRef<HTMLDialogElement>(null);
  const busy = () => ref.current?.querySelector('[data-auth-pending="true"]') != null;

  const open = useCallback((m: AuthMode, n?: string) => { if (n) setNextPath(n); setMode(m); }, []);
  const close = useCallback(() => {
    if (busy()) return;
    setMode(null);
  }, []);

  // Sincroniza el <dialog> con el estado y deja el foco en el primer campo de la vista actual.
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (mode && !d.open) d.showModal();
    if (!mode && d.open) d.close();
    if (mode) d.querySelector<HTMLElement>("input:not([type=hidden])")?.focus();
  }, [mode]);

  // Sin scroll del fondo mientras el modal está abierto.
  useEffect(() => {
    if (!mode) return;
    const root = document.documentElement;
    const prev = root.style.overflow;
    root.style.overflow = "hidden";
    return () => { root.style.overflow = prev; };
  }, [mode]);

  const invited = nextPath.startsWith("/invitacion/");
  const playing = nextPath.startsWith("/jugar/");

  return (
    <AuthModalContext.Provider value={{ open }}>
      {children}
      <dialog
        ref={ref}
        aria-labelledby="auth-title"
        onCancel={(e) => { e.preventDefault(); close(); }}
        onClose={() => setMode(null)}
        className="m-auto max-h-[calc(100dvh-1.5rem)] w-[calc(100%-1.5rem)] max-w-sm overflow-y-auto rounded-2xl border border-line bg-surface p-0 text-fg shadow-2xl backdrop:bg-black/70 backdrop:backdrop-blur-sm"
      >
        {mode && (
          <div className="relative p-6">
            <button
              type="button"
              onClick={close}
              aria-label="Cerrar"
              className="absolute right-3 top-3 flex h-10 w-10 items-center justify-center rounded-xl text-xl text-fg-3 hover:bg-surface-raised hover:text-fg"
            >
              <span aria-hidden="true">×</span>
            </button>
            <div className="flex justify-center pt-2"><LogoSquare compact /></div>
            <h2 id="auth-title" className="mt-4 text-center text-xl font-black text-fg">{TITLES[mode]}</h2>
            {mode !== "forgot" && invited && (
              <p role="note" className="mt-3 rounded-xl border border-cancha/30 bg-cancha/[0.08] px-3 py-2 text-sm text-fg-2">
                Te invitaron a un parche. {mode === "login" ? "Inicia sesión" : "Crea tu cuenta"} para unirte.
              </p>
            )}
            {mode !== "forgot" && playing && (
              <p role="note" className="mt-3 rounded-xl border border-cancha/30 bg-cancha/[0.08] px-3 py-2 text-sm text-fg-2">
                Casi listo: {mode === "login" ? "inicia sesión" : "crea tu cuenta"} y seguimos con el torneo que elegiste.
              </p>
            )}
            {notice && mode === "login" && (
              <p role="note" className="mt-3 rounded-xl border border-gold/30 bg-gold/[0.08] px-3 py-2 text-sm text-fg-2">{notice}</p>
            )}
            {mode === "login" && (
              <>
                <p className="mt-1 text-center text-sm text-fg-2">Entra con tu correo y tu contraseña.</p>
                <div className="mt-4"><LoginForm next={nextPath} /></div>
                <div className="mt-4 flex flex-col items-center gap-2 border-t border-line-subtle pt-4 text-sm text-fg-2">
                  <button type="button" onClick={() => setMode("forgot")} className="font-semibold text-cancha-text hover:underline">Olvidé mi contraseña</button>
                  <p>
                    ¿Aún no tienes cuenta?{" "}
                    <button type="button" onClick={() => setMode("signup")} className="font-semibold text-cancha-text hover:underline">Créala aquí</button>
                  </p>
                </div>
              </>
            )}
            {mode === "signup" && (
              <>
                <p className="mt-1 text-center text-sm text-fg-2">{invited ? "Crea tu cuenta para unirte al parche que te invitó." : "Solo necesitas tu nombre, tu correo y una contraseña."}</p>
                <SignupForm next={nextPath} />
                <p className="mt-4 border-t border-line-subtle pt-4 text-center text-sm text-fg-2">
                  ¿Ya tienes cuenta?{" "}
                  <button type="button" onClick={() => setMode("login")} className="font-semibold text-cancha-text hover:underline">Inicia sesión</button>
                </p>
              </>
            )}
            {mode === "forgot" && (
              <>
                <p className="mt-1 text-center text-sm text-fg-2">Escribe tu correo y te enviamos un enlace para elegir una contraseña nueva.</p>
                <ForgotForm />
                <p className="mt-4 border-t border-line-subtle pt-4 text-center text-sm text-fg-2">
                  <button type="button" onClick={() => setMode("login")} className="font-semibold text-cancha-text hover:underline">← Volver a iniciar sesión</button>
                </p>
              </>
            )}
          </div>
        )}
      </dialog>
    </AuthModalContext.Provider>
  );
}

// Botón que abre el modal en la vista indicada (el foco vuelve a él al cerrar).
export function AuthButton({ mode, className, children, next }: { mode: AuthMode; className?: string; children: React.ReactNode; next?: string }) {
  const { open } = useAuthModal();
  return (
    <button type="button" onClick={() => open(mode, next)} className={className}>
      {children}
    </button>
  );
}
