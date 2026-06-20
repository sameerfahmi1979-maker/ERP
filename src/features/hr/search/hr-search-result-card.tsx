"use client";

import Link from "next/link";
import {
  Users, UserPlus, ShieldCheck, Clock, Wallet, Briefcase,
  ClipboardList, CheckSquare, ExternalLink, CalendarDays,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { HrSearchResult, HrSearchCategory } from "@/lib/hr/search/types";
import { cn } from "@/lib/utils";

const CATEGORY_ICONS: Record<HrSearchCategory, React.ComponentType<{ className?: string }>> = {
  employees: Users,
  candidates: UserPlus,
  compliance: ShieldCheck,
  time: Clock,
  payroll: Wallet,
  operations: Briefcase,
  actions: ClipboardList,
  onboarding: CheckSquare,
};

const STATUS_VARIANT_CLASSES: Record<string, string> = {
  success: "bg-emerald-100 text-emerald-700 border-emerald-200",
  warning: "bg-amber-100 text-amber-700 border-amber-200",
  danger: "bg-red-100 text-red-700 border-red-200",
  muted: "bg-slate-100 text-slate-600 border-slate-200",
};

type Props = {
  result: HrSearchResult;
};

export function HrSearchResultCard({ result }: Props) {
  const Icon = CATEGORY_ICONS[result.category];
  const statusClass = STATUS_VARIANT_CLASSES[result.statusVariant ?? "muted"];

  return (
    <Link href={result.href} className="group block">
      <div className="flex items-start gap-3 p-3 rounded-lg border bg-card hover:bg-accent/50 hover:border-primary/30 transition-all">
        <div className={cn(
          "flex-shrink-0 w-8 h-8 rounded-md flex items-center justify-center",
          result.category === "employees" ? "bg-blue-100 text-blue-600" :
          result.category === "candidates" ? "bg-purple-100 text-purple-600" :
          result.category === "compliance" ? "bg-amber-100 text-amber-600" :
          result.category === "time" ? "bg-cyan-100 text-cyan-600" :
          result.category === "payroll" ? "bg-green-100 text-green-600" :
          result.category === "operations" ? "bg-orange-100 text-orange-600" :
          result.category === "actions" ? "bg-red-100 text-red-600" :
          "bg-teal-100 text-teal-600"
        )}>
          <Icon className="h-4 w-4" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <p className="font-medium text-sm truncate">{result.title}</p>
              {result.subtitle && (
                <p className="text-xs text-muted-foreground truncate mt-0.5">{result.subtitle}</p>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {result.status && (
                <span className={cn("text-xs px-1.5 py-0.5 rounded border font-medium capitalize", statusClass)}>
                  {result.status.replace(/_/g, " ")}
                </span>
              )}
              <ExternalLink className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
          </div>

          {result.description && (
            <p className="text-xs text-muted-foreground mt-1 truncate">{result.description}</p>
          )}

          <div className="flex items-center gap-3 mt-1.5">
            {result.date && (
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <CalendarDays className="h-3 w-3" />
                {result.date}
              </span>
            )}
            {result.matchedFields && result.matchedFields.length > 0 && (
              <span className="text-xs text-muted-foreground">
                Matched: {result.matchedFields.join(", ")}
              </span>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
}
