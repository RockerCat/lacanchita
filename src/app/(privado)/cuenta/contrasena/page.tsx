import type { Metadata } from "next";
import Link from "next/link";
import Card from "@/components/ui/Card";
import { requireUser } from "@/lib/auth";
import PasswordForm from "./PasswordForm";

export const metadata: Metadata = { title: "Nueva contraseña" };

export default async function PasswordPage() {
  await requireUser();
  return (
    <div className="mx-auto flex max-w-md flex-col gap-4 animate-fade-in-up">
      <Card variant="glow-green" className="p-6">
        <h1 className="text-xl font-black text-fg">Elige tu nueva contraseña</h1>
        <p className="mt-1 text-sm text-fg-2">Escríbela dos veces. Después seguirás con tu cuenta como siempre.</p>
        <PasswordForm />
      </Card>
      <Link href="/parches" className="text-center text-sm font-semibold text-fg-2 hover:text-cancha-text">Volver a mis parches</Link>
    </div>
  );
}
