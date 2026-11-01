import type { Metadata } from "next";
import Link from "next/link";
import { buttonClasses } from "@/components/ui/button";
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

  return (
    <div className="mx-auto max-w-md animate-fade-in-up">
      <Card variant={status === "valid" ? "glow-green" : "default"} className="p-6 text-center">
        <p aria-hidden="true" className="text-3xl">
          {status === "valid" ? "⚽" : status === "already_member" ? "✅" : "🟨"}
        </p>
        <h1 className="mt-3 text-xl font-black text-fg">{msg.title}</h1>
        {parcheName && <p className="mt-2 text-lg font-bold text-cancha-text">{parcheName}</p>}
        <p className="mt-2 text-sm text-fg-2">{msg.body}</p>
        <div className="mt-6 flex flex-col items-center gap-2">
          {status === "valid" ? (
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
      </Card>
    </div>
  );
}
