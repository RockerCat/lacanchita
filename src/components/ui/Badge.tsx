// Adaptado de el-var/src/components/ui/Badge.tsx.
type Variant = "green" | "blue" | "gold" | "red" | "gray" | "live";

const VARIANTS: Record<Variant, string> = {
  green: "bg-cancha/15 text-cancha-text",
  blue: "bg-var-blue/15 text-var-blue",
  gold: "bg-gold/15 text-gold",
  red: "bg-danger/15 text-danger",
  gray: "bg-fg-3/15 text-fg-2",
  live: "bg-danger/15 text-danger",
};

export default function Badge({
  children,
  variant = "gray",
  className = "",
}: {
  children: React.ReactNode;
  variant?: Variant;
  className?: string;
}) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${VARIANTS[variant]} ${className}`}>
      {variant === "live" && <span aria-hidden="true" className="h-1.5 w-1.5 animate-live-pulse rounded-full bg-danger" />}
      {children}
    </span>
  );
}
