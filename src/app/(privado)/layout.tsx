import Link from "next/link";
import AppFooter from "@/components/AppFooter";
import UserMenu from "@/components/layout/UserMenu";
import { LogoHorizontal } from "@/components/ui/Logo";
import { isPlatformAdmin, requireUser } from "@/lib/auth";
import { CONTROL_PATH } from "@/lib/jugar";
import { HOME_PATH } from "@/lib/navigation";
import { displayNameOf } from "@/lib/users";
import { logout } from "../login/actions";

// Cabecera fija con desenfoque, como la Navbar de La Penúltima.
export default async function PrivateLayout({ children }: { children: React.ReactNode }) {
  const { user } = await requireUser();
  const name = displayNameOf(user);
  const superadmin = await isPlatformAdmin();

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="header-blur sticky top-0 z-50 border-b border-line-subtle backdrop-blur-xl">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-2 px-3 py-2 sm:px-4">
          <div className="flex min-w-0 items-center gap-3 sm:gap-4">
            <Link href={superadmin ? CONTROL_PATH : HOME_PATH} aria-label={superadmin ? "La Canchita, ir a Control" : "La Canchita, ir a mis parches"} className="shrink-0 rounded-xl">
              <LogoHorizontal />
            </Link>
            <nav aria-label="Principal" className="hidden sm:block">
              {superadmin ? (
                <Link href={CONTROL_PATH} className="rounded-lg px-2 py-1 text-sm font-semibold text-var-blue hover:bg-surface">
                  Control
                </Link>
              ) : (
                <Link href={HOME_PATH} className="rounded-lg px-2 py-1 text-sm font-semibold text-fg-2 hover:bg-surface hover:text-fg">
                  Mis parches
                </Link>
              )}
            </nav>
          </div>
          <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
            <UserMenu displayName={name} logoutAction={logout} superadmin={superadmin} />
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 sm:py-8">{children}</main>
      <AppFooter />
    </div>
  );
}
