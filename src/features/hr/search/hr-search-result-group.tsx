"use client";

import {
  Users, UserPlus, ShieldCheck, Clock, Wallet, Briefcase,
  ClipboardList, CheckSquare, ChevronDown, ChevronRight,
} from "lucide-react";
import { useState } from "react";
import type { HrSearchResult, HrSearchCategory } from "@/lib/hr/search/types";
import { HR_SEARCH_CATEGORY_LABELS } from "@/lib/hr/search/types";
import { HrSearchResultCard } from "./hr-search-result-card";
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

const CATEGORY_COLORS: Record<HrSearchCategory, string> = {
  employees: "text-blue-600 bg-blue-50 border-blue-200",
  candidates: "text-purple-600 bg-purple-50 border-purple-200",
  compliance: "text-amber-600 bg-amber-50 border-amber-200",
  time: "text-cyan-600 bg-cyan-50 border-cyan-200",
  payroll: "text-green-600 bg-green-50 border-green-200",
  operations: "text-orange-600 bg-orange-50 border-orange-200",
  actions: "text-red-600 bg-red-50 border-red-200",
  onboarding: "text-teal-600 bg-teal-50 border-teal-200",
};

type Props = {
  category: HrSearchCategory;
  results: HrSearchResult[];
  count: number;
  defaultExpanded?: boolean;
};

export function HrSearchResultGroup({ category, results, count, defaultExpanded = true }: Props) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const Icon = CATEGORY_ICONS[category];
  const colorClass = CATEGORY_COLORS[category];

  return (
    <div className="border rounded-lg overflow-hidden">
      <button
        type="button"
        className="w-full flex items-center gap-3 px-4 py-3 bg-muted/40 hover:bg-muted/60 transition-colors"
        onClick={() => setExpanded((v) => !v)}
      >
        <div className={cn("flex items-center justify-center w-7 h-7 rounded-md border", colorClass)}>
          <Icon className="h-3.5 w-3.5" />
        </div>
        <span className="font-medium text-sm flex-1 text-left">
          {HR_SEARCH_CATEGORY_LABELS[category]}
        </span>
        <span className="text-xs text-muted-foreground bg-background px-2 py-0.5 rounded-full border">
          {count} result{count !== 1 ? "s" : ""}
        </span>
        {expanded ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        )}
      </button>

      {expanded && (
        <div className="p-3 space-y-2">
          {results.map((r) => (
            <HrSearchResultCard key={r.id} result={r} />
          ))}
        </div>
      )}
    </div>
  );
}
