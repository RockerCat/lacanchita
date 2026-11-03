import { ImageIcon } from "lucide-react";
import ActionForm from "@/components/ActionForm";
import Card from "@/components/ui/Card";
import { FileField } from "@/components/control/inputs";
import { MAX_ILLUSTRATION_BYTES } from "@/lib/control/illustration";
import { illustrationUrl } from "@/lib/illustration";
import { removeIllustrationAction, uploadIllustrationAction } from "@/app/(privado)/control/actions";

// Ilustración opcional de portada del torneo (Control → Torneo). Sin editor: se sube el archivo ya preparado.
export default function IllustrationPanel({ eventId, eventName, path, editable }: { eventId: string; eventName: string; path: string | null; editable: boolean }) {
  const url = illustrationUrl(path);
  return (
    <Card className="p-5">
      <h2 className="text-base font-bold text-fg">Ilustración del torneo</h2>
      <p className="mt-1 max-w-lg text-sm text-fg-2">Opcional. Se muestra en la portada, en Mis parches y en el torneo. Sube solo imágenes cuyo uso esté permitido; el torneo funciona igual sin ella.</p>
      <div className="mt-4 grid max-w-3xl gap-4 md:grid-cols-[1fr_1fr]">
        <div className="relative aspect-video w-full overflow-hidden rounded-2xl border border-line bg-surface-deep">
          {url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={url} alt={`Ilustración de ${eventName}`} className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-2 border-2 border-dashed border-line text-fg-3">
              <ImageIcon aria-hidden="true" className="h-8 w-8" />
              <span className="text-sm font-semibold">Sin ilustración</span>
            </div>
          )}
        </div>
        {editable ? (
          <div className="flex flex-col gap-3">
            <ActionForm action={uploadIllustrationAction} submitLabel={url ? "Reemplazar ilustración" : "Subir ilustración"} pendingLabel="Subiendo…" resetOnSuccess>
              <input type="hidden" name="event_id" value={eventId} />
              <FileField name="illustration" label={url ? "Nuevo archivo" : "Archivo de la ilustración"} accept="image/png,image/jpeg,image/webp" maxBytes={MAX_ILLUSTRATION_BYTES} maxLabel="5 MB" hint="PNG, JPG o WebP · máximo 5 MB · recomendado 16:9, 1600 × 900 px." />
            </ActionForm>
            {url && (
              <ActionForm action={removeIllustrationAction} submitLabel="Quitar ilustración" pendingLabel="Quitando…" variant="ghost" size="sm" confirm="Se quitará la ilustración de este torneo." confirmLabel="Sí, quitar">
                <input type="hidden" name="event_id" value={eventId} />
              </ActionForm>
            )}
          </div>
        ) : (
          <p className="text-sm text-fg-2">Este torneo es de solo lectura.</p>
        )}
      </div>
    </Card>
  );
}
