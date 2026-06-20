import { ReactNode } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowUpRight, Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

interface StatItemProps {
  label: string;
  value: number | string;
  href?: string;
  variant?: "default" | "success" | "warning" | "danger" | "muted";
}

export function HrDashboardStatItem({ label, value, href, variant = "default" }: StatItemProps) {
  const colorClass =
    variant === "danger"
      ? "text-red-600 dark:text-red-400"
      : variant === "warning"
      ? "text-amber-600 dark:text-amber-400"
      : variant === "success"
      ? "text-emerald-600 dark:text-emerald-400"
      : variant === "muted"
      ? "text-muted-foreground"
      : "text-foreground";

  const content = (
    <div className="flex items-center justify-between py-2 border-b border-border/20 last:border-0 group">
      <span className="text-xs text-muted-foreground truncate">{label}</span>
      <span className={cn("text-sm font-semibold tabular-nums ml-2 shrink-0", colorClass)}>
        {value}
        {href && (
          <ArrowUpRight className="inline h-3 w-3 ml-1 opacity-0 group-hover:opacity-70 transition-opacity" />
        )}
      </span>
    </div>
  );

  if (href) {
    return <Link href={href} className="block hover:bg-muted/30 -mx-1 px-1 rounded transition-colors">{content}</Link>;
  }
  return content;
}

interface SectionCardProps {
  title: string;
  icon: LucideIcon;
  iconColor?: string;
  href?: string;
  restricted?: boolean;
  children: ReactNode;
  className?: string;
}

export function HrDashboardSectionCard({
  title,
  icon: Icon,
  iconColor = "text-muted-foreground",
  href,
  restricted = false,
  children,
  className,
}: SectionCardProps) {
  return (
    <Card className={cn("border border-border/50 shadow-sm", className)}>
      <CardHeader className="pb-2 px-4 pt-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className={cn("p-1.5 rounded-md bg-muted/50", iconColor)}>
              <Icon className="h-4 w-4" />
            </div>
            <CardTitle className="text-sm font-semibold text-foreground">{title}</CardTitle>
          </div>
          {href && !restricted && (
            <Link href={href} className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors">
              View All <ArrowUpRight className="h-3 w-3" />
            </Link>
          )}
          {restricted && (
            <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <Lock className="h-3 w-3" />
              <span>Restricted</span>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="px-4 pb-4">
        {restricted ? (
          <p className="text-xs text-muted-foreground py-2">
            You do not have permission to view this section.
          </p>
        ) : (
          children
        )}
      </CardContent>
    </Card>
  );
}
