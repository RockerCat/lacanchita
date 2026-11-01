// Clases de botón de el-var/src/components/ui/Button.tsx, con colores por tema.
type Variant = "primary" | "secondary" | "ghost";
type Size = "sm" | "md" | "lg";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-cancha text-on-cancha hover:bg-cancha-hover shadow-cancha",
  secondary: "bg-surface text-fg border border-line hover:bg-surface-raised hover:border-line-strong",
  ghost: "text-fg-2 hover:text-fg hover:bg-surface",
};

const SIZES: Record<Size, string> = {
  sm: "h-9 px-4 text-sm gap-1.5",
  md: "h-11 px-6 text-sm gap-2",
  lg: "h-14 px-8 text-base gap-2",
};

export function buttonClasses({
  variant = "primary",
  size = "md",
  fullWidth = false,
}: { variant?: Variant; size?: Size; fullWidth?: boolean } = {}) {
  return [
    "inline-flex items-center justify-center rounded-xl font-semibold active:scale-[0.97]",
    "disabled:cursor-not-allowed disabled:opacity-50",
    VARIANTS[variant],
    SIZES[size],
    fullWidth ? "w-full" : "",
  ].join(" ");
}
