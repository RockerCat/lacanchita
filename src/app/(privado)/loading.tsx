import Spinner from "@/components/ui/Spinner";

export default function Loading() {
  return (
    <div role="status" className="flex items-center justify-center gap-2 py-16 text-sm text-fg-3">
      <Spinner className="h-5 w-5 text-cancha-text" />
      Cargando…
    </div>
  );
}
