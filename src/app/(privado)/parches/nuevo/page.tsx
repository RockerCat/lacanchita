import type { Metadata } from "next";
import Link from "next/link";
import Card from "@/components/ui/Card";
import { redirect } from "next/navigation";
import { isPlatformAdmin, requireUser } from "@/lib/auth";
import { CONTROL_PATH, safeReturnToPlay } from "@/lib/jugar";
import CreateParcheForm from "./CreateParcheForm";

export const metadata: Metadata = { title: "Crear parche" };

export default async function NewParchePage({ searchParams }: { searchParams: Promise<{ next?: string | string[] }> }) {
  await requireUser();
  if (await isPlatformAdmin()) redirect(CONTROL_PATH);
  const sp = await searchParams;
  // Si venía de «Jugar este torneo», al crear el parche regresa a ese torneo (solo rutas /jugar/<slug>).
  const back = safeReturnToPlay(Array.isArray(sp.next) ? sp.next[0] : sp.next);
  // Identificador de este formulario: si se envía dos veces (doble clic, reintento), se crea un solo parche.
  const requestId = crypto.randomUUID();

  return (
    <div className="mx-auto flex max-w-md flex-col gap-4 animate-fade-in-up">
      <nav aria-label="Ruta" className="text-sm">
        <Link href="/parches" className="font-semibold text-fg-2 hover:text-cancha-text">
          ← Mis parches
        </Link>
      </nav>
      <Card variant="glow-green" className="p-6">
        <h1 className="text-xl font-black text-fg">Crear parche</h1>
        <p className="mt-1 text-sm text-fg-2">
          Un parche es un grupo privado para competir con tus amigos. Después podrás invitarlos con un enlace.
        </p>
        <CreateParcheForm requestId={requestId} back={back} />
      </Card>
    </div>
  );
}
