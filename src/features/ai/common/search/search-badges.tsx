"use client";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { ErpSearchBadgeData } from "@/lib/ai/common/search/types";

const RISK_COLORS: Record<string, string> = {
  critical: "bg-red-100 text-red-800 border-red-200 dark:bg-red-950 dark:text-red-200 dark:border-red-800",
  high: "bg-orange-100 text-orange-800 border-orange-200 dark:bg-orange-950 dark:text-orange-200 dark:border-orange-800",
  medium: "bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-950 dark:text-yellow-200 dark:border-yellow-800",
  low: "bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-950 dark:text-blue-200 dark:border-blue-800",
  none: "bg-muted text-muted-foreground border-border",
};

interface SearchBadgesProps {
  badges?: ErpSearchBadgeData;
  isConfidential?: boolean;
  semanticSimilarity?: number | null;
  className?: string;
}

export function SearchBadges({ badges, isConfidential, semanticSimilarity, className }: SearchBadgesProps) {
  const items: React.ReactNode[] = [];

  if (isConfidential) {
    items.push(
      <Badge key="confidential" variant="outline" className="text-xs border-red-300 text-red-700 bg-red-50 dark:border-red-800 dark:text-red-200 dark:bg-red-950">
        Confidential
      </Badge>
    );
  }

  if (badges?.riskLevel && badges.riskLevel !== "none") {
    items.push(
      <Badge
        key="risk"
        variant="outline"
        className={cn("text-xs", RISK_COLORS[badges.riskLevel])}
      >
        Risk: {badges.riskLevel}
      </Badge>
    );
  }

  if (badges?.criticalComplianceCount && badges.criticalComplianceCount > 0) {
    items.push(
      <Badge key="compliance-crit" variant="outline" className="text-xs bg-red-100 text-red-800 border-red-200 dark:bg-red-950 dark:text-red-200 dark:border-red-800">
        {badges.criticalComplianceCount} critical finding{badges.criticalComplianceCount > 1 ? "s" : ""}
      </Badge>
    );
  } else if (badges?.openComplianceCount && badges.openComplianceCount > 0) {
    items.push(
      <Badge key="compliance" variant="outline" className="text-xs bg-orange-100 text-orange-800 border-orange-200 dark:bg-orange-950 dark:text-orange-200 dark:border-orange-800">
        {badges.openComplianceCount} open finding{badges.openComplianceCount > 1 ? "s" : ""}
      </Badge>
    );
  }

  if (badges?.pendingDuplicateCount && badges.pendingDuplicateCount > 0) {
    items.push(
      <Badge key="dup" variant="outline" className="text-xs bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-950 dark:text-yellow-200 dark:border-yellow-800">
        {badges.pendingDuplicateCount} duplicate{badges.pendingDuplicateCount > 1 ? "s" : ""}
      </Badge>
    );
  }

  if (semanticSimilarity != null && semanticSimilarity > 0) {
    items.push(
      <Badge key="sim" variant="outline" className="text-xs bg-violet-100 text-violet-800 border-violet-200 dark:bg-violet-950 dark:text-violet-200 dark:border-violet-800">
        {Math.round(semanticSimilarity * 100)}% match
      </Badge>
    );
  }

  if (items.length === 0) return null;

  return (
    <div className={cn("flex flex-wrap gap-1 mt-1", className)}>
      {items}
    </div>
  );
}
