import { cn } from "@/lib/utils";

const LEVEL_CONFIG: Record<
  string,
  { label: string; className: string }
> = {
  none: { label: "None", className: "bg-slate-100 text-slate-700 border-slate-200" },
  low: { label: "Low", className: "bg-emerald-50 text-emerald-800 border-emerald-200" },
  medium: { label: "Medium", className: "bg-amber-50 text-amber-800 border-amber-200" },
  high: { label: "High", className: "bg-orange-50 text-orange-800 border-orange-200" },
  critical: { label: "Critical", className: "bg-red-50 text-red-800 border-red-200" },
};

interface RiskLevelBadgeProps {
  level: string | null | undefined;
  score?: number | null;
  className?: string;
}

export function RiskLevelBadge({ level, score, className }: RiskLevelBadgeProps) {
  const key = level ?? "none";
  const config = LEVEL_CONFIG[key] ?? LEVEL_CONFIG.none;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium",
        config.className,
        className
      )}
    >
      {config.label}
      {score != null && (
        <span className="opacity-80">({Math.round(score)})</span>
      )}
    </span>
  );
}
