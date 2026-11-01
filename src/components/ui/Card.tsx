import type { HTMLAttributes } from "react";

// Adaptado de el-var/src/components/ui/Card.tsx (mismas variantes y radios).
type Variant = "default" | "raised" | "bordered" | "glow-green" | "dashed";

const VARIANTS: Record<Variant, string> = {
  default: "bg-surface border border-line",
  raised: "bg-surface-raised border border-line",
  bordered: "bg-transparent border border-line",
  "glow-green": "bg-surface border border-cancha/30 shadow-card-glow",
  dashed: "bg-surface border border-dashed border-line",
};

export default function Card({
  variant = "default",
  className = "",
  ...props
}: HTMLAttributes<HTMLDivElement> & { variant?: Variant }) {
  return <div className={`rounded-2xl ${VARIANTS[variant]} ${className}`} {...props} />;
}
