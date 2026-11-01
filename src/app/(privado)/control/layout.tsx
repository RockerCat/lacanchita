import Link from "next/link";
import { requirePlatformAdmin } from "@/lib/auth";

// La Canchita Control: consola exclusiva del superadministrador global. Quien no lo es recibe 404.
// (Cada página y cada acción vuelven a comprobarlo: un layout no se vuelve a ejecutar al navegar.)
export default async function ControlLayout({ children }: { children: React.ReactNode }) {
  await requirePlatformAdmin();
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line-subtle pb-3">
        <Link href="/control/torneos" className="font-mono text-[11px] uppercase tracking-widest text-var-blue hover:underline">
          La Canchita Control
        </Link>
        <p className="text-xs text-fg-3">Administración global de torneos · solo superadministradores</p>
      </div>
      {children}
    </div>
  );
}
