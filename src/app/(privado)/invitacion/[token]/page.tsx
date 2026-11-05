import type { Metadata } from "next";
import Link from "next/link";
import { buttonClasses } from "@/components/ui/button";
import ParcheArt from "@/components/parches/ParcheArt";
import Card from "@/components/ui/Card";
import { requireUser } from "@/lib/auth";
import { invitationMessage, isValidTokenFormat, type InvitationStatus } from "@/lib/invitations";
import AcceptInvitation from "./AcceptInvitation";

// El token va en la ruta: no enviarlo como Referer a otros sitios.
export const metadata: Metadata = { title: "Invitación", referrer: "no-referrer" };

export default async function InvitationPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const { supabase } = await requireUser();

  let status: InvitationStatus = "not_found";
  let parcheId: string | null = null;
  let parcheName: string | null = null;
  if (isValidTokenFormat(token)) {
    const { data } = await supabase.rpc("get_parche_invitation", { p_token: token });
    const row = Array.isArray(data) ? data[0] : null;
    if (row) {
      status = row.status as InvitationStatus;
      parcheId = row.parche_id;
      parcheName = row.parche_name;
    }
  }
  const msg = invitationMessage(status);
  const valid = status === "valid";
  // Invitación válida: bienvenida ilustrada (el mensaje de las demás situaciones no cambia).
  const title = valid ? "¡Te invitaron a jugar en La Canchita!" : msg.title;

  return (
    <div className={`mx-auto animate-fade-in-up ${valid ? "max-w-md sm:max-w-3xl" : "max-w-md"}`}>
      <Card variant={valid ? "glow-green" : "default"} className={valid ? "flex flex-col overflow-hidden sm:flex-row sm:items-center" : "p-6 text-center"}>
        <div className={valid ? "p-5 text-center sm:flex-1 sm:p-6 sm:text-left" : undefined}>
          {!valid && (
            <p aria-hidden="true" className="text-3xl">
              {status === "already_member" ? "✅" : "🟨"}
            </p>
          )}
          <h1 className={`text-xl font-black text-fg ${valid ? "" : "mt-3"}`}>{title}</h1>
          {parcheName && <p className="mt-2 text-lg font-bold text-cancha-text">{parcheName}</p>}
          <p className="mt-2 text-sm text-fg-2">{msg.body}</p>
          <div className={`mt-6 flex flex-col gap-2 ${valid ? "items-stretch sm:items-start" : "items-center"}`}>
            {valid ? (
              <AcceptInvitation token={token} />
            ) : parcheId ? (
              <Link href={`/parches/${parcheId}`} className={buttonClasses()}>
                Ir al parche
              </Link>
            ) : (
              <Link href="/parches" className={buttonClasses({ variant: "secondary" })}>
                Ir a mis parches
              </Link>
            )}
          </div>
        </div>
        {valid && <ParcheArt />}
      </Card>
    </div>
  );
}
