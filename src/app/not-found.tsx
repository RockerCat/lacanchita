import Link from "next/link";
import { buttonClasses } from "@/components/ui/button";
import Card from "@/components/ui/Card";
import { HOME_PATH } from "@/lib/navigation";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4">
      <Card className="w-full max-w-md p-8 text-center animate-fade-in-up">
        <p className="font-mono text-xs uppercase tracking-widest text-var-blue">Revisión VAR · 404</p>
        <h1 className="mt-2 text-xl font-black text-fg">No encontramos esta página</h1>
        <p className="mt-2 text-sm text-fg-2">Puede que no exista o que no tengas acceso a ella.</p>
        <Link href={HOME_PATH} className={`${buttonClasses()} mt-6`}>
          Ir a mis parches
        </Link>
      </Card>
    </main>
  );
}
