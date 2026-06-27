"use client";

import { useState, useCallback, useTransition } from "react";
import type { ReviewQueueItem, ReviewQueueCounts, ReviewQueueFilters } from "@/server/actions/dms/review-queue";
import { getDmsReviewQueueItems, getDmsReviewQueueCounts, getDmsReviewQueueItem } from "@/server/actions/dms/review-queue";
import { DmsReviewQueueDashboardCards } from "./dms-review-queue-dashboard-cards";
import { DmsReviewQueueFilters } from "./dms-review-queue-filters";
import { DmsReviewQueueTable } from "./dms-review-queue-table";
import { DmsReviewQueueItemDrawer } from "./dms-review-queue-item-drawer";
import { Button } from "@/components/ui/button";
import { RefreshCw, ChevronLeft, ChevronRight } from "lucide-react";

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  initialItems:  ReviewQueueItem[];
  initialTotal:  number;
  initialCounts: ReviewQueueCounts | null;
  canManage:     boolean;
  canAdmin:      boolean;
}

// ── Page client ───────────────────────────────────────────────────────────────

export function DmsReviewQueuePageClient({
  initialItems,
  initialTotal,
  initialCounts,
  canManage,
}: Props) {
  const [items, setItems]       = useState<ReviewQueueItem[]>(initialItems);
  const [total, setTotal]       = useState(initialTotal);
  const [counts, setCounts]     = useState<ReviewQueueCounts | null>(initialCounts);
  const [filters, setFilters]   = useState<ReviewQueueFilters>({});
  const [page, setPage]         = useState(1);
  const [pageSize]              = useState(25);
  const [isPending, startTransition] = useTransition();

  const [selectedItem, setSelectedItem] = useState<ReviewQueueItem | null>(null);
  const [drawerOpen, setDrawerOpen]     = useState(false);

  const refresh = useCallback((nextFilters?: ReviewQueueFilters, nextPage?: number) => {
    const f = nextFilters ?? filters;
    const p = nextPage ?? page;

    startTransition(async () => {
      const [itemsResult, countsResult] = await Promise.all([
        getDmsReviewQueueItems({ ...f, page: p, pageSize }),
        getDmsReviewQueueCounts(),
      ]);
      if (itemsResult.success && itemsResult.data) {
        setItems(itemsResult.data.items);
        setTotal(itemsResult.data.total);
      }
      if (countsResult.success && countsResult.data) {
        setCounts(countsResult.data);
      }
    });
  }, [filters, page, pageSize]);

  const handleFilterChange = (f: ReviewQueueFilters) => {
    setFilters(f);
    setPage(1);
    refresh(f, 1);
  };

  const handlePageChange = (p: number) => {
    setPage(p);
    refresh(filters, p);
  };

  const handleViewItem = (item: ReviewQueueItem) => {
    // Optimistically open with list data, then fetch full detail (includes Phase 13 finding/candidate)
    setSelectedItem(item);
    setDrawerOpen(true);
    getDmsReviewQueueItem(item.id).then((result) => {
      if (result.success && result.data) setSelectedItem(result.data);
    }).catch(() => { /* non-fatal — keep list item */ });
  };

  const handleMutated = () => {
    setDrawerOpen(false);
    setSelectedItem(null);
    refresh();
  };

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-4">
      {/* Dashboard cards */}
      <DmsReviewQueueDashboardCards counts={counts} />

      {/* Filters */}
      <DmsReviewQueueFilters
        filters={filters}
        onChange={handleFilterChange}
        isLoading={isPending}
      />

      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">
          {total} item{total !== 1 ? "s" : ""} found
          {Object.keys(filters).length > 0 ? " (filtered)" : ""}
        </p>
        <Button
          variant="outline"
          size="sm"
          onClick={() => refresh()}
          disabled={isPending}
        >
          <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${isPending ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* Table */}
      <DmsReviewQueueTable
        items={items}
        isLoading={isPending}
        onViewItem={handleViewItem}
        canManage={canManage}
      />

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between border-t border-slate-100 pt-3">
          <p className="text-xs text-slate-500">
            Page {page} of {totalPages}
          </p>
          <div className="flex gap-1.5">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1 || isPending}
              onClick={() => handlePageChange(page - 1)}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages || isPending}
              onClick={() => handlePageChange(page + 1)}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Item drawer */}
      {drawerOpen && selectedItem && (
        <>
          {/* Overlay */}
          <div
            className="fixed inset-0 z-[100] bg-slate-950/60 backdrop-blur-[2px]"
            onClick={() => setDrawerOpen(false)}
          />
          {/* Drawer */}
          <div className="fixed right-0 top-0 z-[110] h-full w-full max-w-xl bg-white shadow-2xl flex flex-col">
            <DmsReviewQueueItemDrawer
              item={selectedItem}
              canManage={canManage}
              onClose={() => { setDrawerOpen(false); setSelectedItem(null); }}
              onMutated={handleMutated}
            />
          </div>
        </>
      )}
    </div>
  );
}
