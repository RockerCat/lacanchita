import { cn } from "@/lib/juego/utils";

export type TabSkeletonVariant = "dashboard" | "leaderboard" | "copa" | "community" | "en-vivo";

function Pulse({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-md bg-[#1e1e35]", className)} />;
}

/** Mimics a calendar/match card: time+status row, then team · score · team. */
export function SkeletonMatchCard() {
  return (
    <div className="rounded-2xl border border-[#1e1e35] bg-[#11111c] p-4">
      <div className="flex items-center gap-2 mb-3">
        <Pulse className="h-3 w-10" />
        <div className="flex-1" />
        <Pulse className="h-3 w-12" />
      </div>
      <div className="flex items-center gap-2">
        <Pulse className="h-4 w-4 rounded-full shrink-0" />
        <Pulse className="h-3 flex-1" />
        <Pulse className="h-4 w-8 shrink-0" />
        <Pulse className="h-3 flex-1" />
        <Pulse className="h-4 w-4 rounded-full shrink-0" />
      </div>
    </div>
  );
}

/** Mimics a leaderboard/ranking row. */
export function SkeletonRow() {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-[#2a2a45] bg-[#18182a] px-4 py-3">
      <Pulse className="h-5 w-5 rounded-full shrink-0" />
      <Pulse className="h-3 flex-1" />
      <Pulse className="h-4 w-10 shrink-0" />
    </div>
  );
}

/** Mimics a copa group/bracket block: header + a few rows. */
export function SkeletonBlock() {
  return (
    <div className="rounded-2xl border border-[#1e1e35] bg-[#11111c] overflow-hidden">
      <div className="px-4 py-3 border-b border-[#1e1e35]">
        <Pulse className="h-3 w-24" />
      </div>
      <div className="p-3 flex flex-col gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Pulse key={i} className="h-6 w-full" />
        ))}
      </div>
    </div>
  );
}

/** Skeleton layout for the content of a given bottom-nav tab. */
export function TabContentSkeleton({
  variant,
  className,
}: {
  variant: TabSkeletonVariant;
  className?: string;
}) {
  return (
    <div
      className={cn("px-4 py-6 max-w-2xl mx-auto w-full flex flex-col gap-3", className)}
      role="status"
      aria-live="polite"
      aria-label="Cargando contenido"
    >
      {variant === "dashboard" && (
        <>
          <SkeletonMatchCard />
          <SkeletonMatchCard />
          <SkeletonMatchCard />
        </>
      )}
      {variant === "en-vivo" && (
        <>
          <SkeletonMatchCard />
          <SkeletonMatchCard />
        </>
      )}
      {variant === "leaderboard" && (
        <>
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonRow key={i} />
          ))}
        </>
      )}
      {variant === "copa" && (
        <>
          <SkeletonBlock />
          <SkeletonBlock />
        </>
      )}
      {variant === "community" && (
        <>
          <SkeletonBlock />
          <SkeletonRow />
          <SkeletonRow />
        </>
      )}
    </div>
  );
}
