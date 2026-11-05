"use client";

import { useEffect, useRef } from "react";
import { buttonClasses } from "../ui/button";
import { InviteLinkControls } from "./InviteLink";

// Aviso cuando el parche solo tiene a su creador: hacen falta al menos 2 integrantes activos para incorporar un torneo. <dialog> nativo (foco, Escape y fondo
// inerte los aporta el navegador). El enlace sale del mecanismo de invitaciones existente: el token solo se conoce al
// crearlo (en la base se guarda su hash), así que si ya hay un enlace activo no se genera otro a espaldas del usuario
// (revocaría el que ya compartió): se le remite a Participantes.
export default function SoloInviteDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      aria-labelledby="solo-title"
      className="m-auto w-[calc(100%-2rem)] max-w-md rounded-2xl border border-cancha/30 bg-surface p-0 text-fg shadow-card-glow backdrop:bg-black/70"
    >
      <div className="flex flex-col gap-4 p-5 sm:p-6">
        <div>
          <h2 id="solo-title" className="text-lg font-black text-fg">¡Tu parche está listo para jugar!</h2>
          <p className="mt-2 text-sm text-fg-2">
            Por ahora eres el único integrante, y para jugar un torneo tu parche necesita al menos un amigo más. Invita a tus amigos para que también hagan sus pronósticos y compitan contigo.
          </p>
        </div>

        <InviteLinkControls idPrefix="solo" />

        <button type="button" onClick={onClose} className={buttonClasses({ variant: "ghost", size: "sm" })}>
          Cerrar
        </button>
      </div>
    </dialog>
  );
}
