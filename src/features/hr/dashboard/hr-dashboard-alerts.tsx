import Link from "next/link";
import { AlertTriangle, AlertCircle, Info, ArrowUpRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { AttentionItem } from "@/server/actions/hr/dashboard";

const categoryLabel: Record<AttentionItem["category"], string> = {
  employee: "Employee",
  compliance: "Compliance",
  time: "Time",
  payroll: "Payroll",
  operations: "Operations",
  actions: "HR Actions",
  recruitment: "Recruitment",
};

const categoryBadgeVariant: Record<AttentionItem["category"], string> = {
  employee: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  compliance: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
  time: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
  payroll: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  operations: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  actions: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  recruitment: "bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400",
};

interface HrDashboardAlertsProps {
  items: AttentionItem[];
}

export function HrDashboardAlerts({ items }: HrDashboardAlertsProps) {
  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <div className="p-3 rounded-full bg-emerald-50 dark:bg-emerald-950/30 mb-3">
          <AlertCircle className="h-5 w-5 text-emerald-500" />
        </div>
        <p className="text-sm font-medium text-foreground">All clear</p>
        <p className="text-xs text-muted-foreground mt-1">No attention items at this time.</p>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {items.map((item) => (
        <div
          key={item.id}
          className={cn(
            "flex items-start gap-3 px-3 py-2.5 rounded-lg border transition-colors",
            item.severity === "critical"
              ? "bg-red-50 border-red-100 dark:bg-red-950/20 dark:border-red-900/30"
              : item.severity === "warning"
              ? "bg-amber-50 border-amber-100 dark:bg-amber-950/20 dark:border-amber-900/30"
              : "bg-blue-50 border-blue-100 dark:bg-blue-950/20 dark:border-blue-900/30"
          )}
        >
          <div className="mt-0.5 shrink-0">
            {item.severity === "critical" ? (
              <AlertCircle className="h-4 w-4 text-red-500" />
            ) : item.severity === "warning" ? (
              <AlertTriangle className="h-4 w-4 text-amber-500" />
            ) : (
              <Info className="h-4 w-4 text-blue-500" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-xs font-semibold text-foreground truncate">{item.title}</p>
              <span className={cn("text-[10px] font-medium px-1.5 py-0.5 rounded-full", categoryBadgeVariant[item.category])}>
                {categoryLabel[item.category]}
              </span>
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5 truncate">{item.description}</p>
            {item.dueDate && (
              <p className="text-[10px] text-muted-foreground mt-0.5">Due: {item.dueDate}</p>
            )}
          </div>
          <Link
            href={item.linkHref}
            className="shrink-0 flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
          >
            {item.linkLabel}
            <ArrowUpRight className="h-3 w-3" />
          </Link>
        </div>
      ))}
    </div>
  );
}
