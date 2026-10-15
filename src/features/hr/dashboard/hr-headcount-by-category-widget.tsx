"use client";

import { LayoutGrid, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import type {HrDashboard} from "@/lib/reads/hr-dashboard-schema";
import { HrDashboardSectionCard } from "./hr-dashboard-section-card";

export function HrHeadcountByCategoryWidget({data, isLoading, retry}: {data?: HrDashboard["headcount"]; isLoading: boolean; retry: () => void}) {
  const items = data?.status === "ready" ? data.items : [];
  const total = data?.status === "ready" ? data.total : 0;

  return (
    <HrDashboardSectionCard
      title="Headcount by Category"
      icon={LayoutGrid}
      iconColor="text-indigo-600"
      href="/admin/hr/employees"
      restricted={data?.status === "restricted"}
    >
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-7 w-full" />
          ))}
        </div>
      ) : !data || data.status === "failed" ? (
        <div className="flex flex-col items-center gap-2 py-3">
          <p className="text-xs text-destructive">
            Failed to load headcount data
          </p>
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs gap-1.5"
            onClick={retry}
            aria-label="Retry headcount"
          >
            <RefreshCw className="h-3 w-3" /> Retry
          </Button>
        </div>
      ) : items.length === 0 ? (
        <p className="text-xs text-muted-foreground py-2">No active employees</p>
      ) : (
        <>
          <div className="space-y-0.5">
            {items.map((item) => (
              <div
                key={item.categoryId ?? "uncategorised"}
                className="flex items-center justify-between py-2 border-b border-border/20 last:border-0"
              >
                <span className="text-xs text-muted-foreground truncate pr-2">
                  {item.categoryName}
                </span>
                <Badge
                  variant="secondary"
                  className="text-[11px] font-semibold tabular-nums shrink-0 px-2 py-0.5"
                >
                  {item.count}
                </Badge>
              </div>
            ))}
          </div>
          {items.length > 1 && (
            <div className="flex items-center justify-between pt-2 mt-1 border-t border-border/40">
              <span className="text-xs font-medium text-foreground">Total active</span>
              <Badge className="text-[11px] font-bold tabular-nums px-2 py-0.5">
                {total}
              </Badge>
            </div>
          )}
        </>
      )}
    </HrDashboardSectionCard>
  );
}
