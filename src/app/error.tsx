"use client";

import { buttonClasses } from "@/components/ui/button";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4">
      <div className="w-full max-w-md rounded-2xl border border-danger/25 bg-surface p-8 text-center">
        <p className="font-mono text-xs uppercase tracking-widest text-danger">Fuera de lugar</p>
        <h1 className="mt-2 text-xl font-black text-fg">Algo salió mal</h1>
        <p className="mt-2 text-sm text-fg-2">No pudimos cargar esta información. Revisa tu conexión e inténtalo de nuevo.</p>
        <button type="button" onClick={reset} className={`${buttonClasses()} mt-6`}>
          Reintentar
        </button>
      </div>
    </main>
  );
}
