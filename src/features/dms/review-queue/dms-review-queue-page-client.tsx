"use client";

import { useState, useCallback, useTransition, useRef } from "react";
import { Sheet, SheetContent, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { DmsLoadError } from "@/features/dms/dms-load-error";
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
  initialLoadFailed?: boolean;
  canManage:     boolean;
  canAdmin:      boolean;
}

// ── Page client ───────────────────────────────────────────────────────────────

export function DmsReviewQueuePageClient({
  initialItems,
  initialTotal,
  initialCounts,
  initialLoadFailed = false,
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
  const [loadFailed, setLoadFailed] = useState(initialLoadFailed);
  const [countsFailed, setCountsFailed] = useState(initialCounts === null);
  const [detailFailed, setDetailFailed] = useState(false);
  const [detailPending, setDetailPending] = useState(false);
  const [drawerDirty, setDrawerDirty] = useState(false);
  const [drawerBusy, setDrawerBusy] = useState(false);
  const listSequence = useRef(0);
  const detailSequence = useRef(0);
  const returnFocus = useRef<HTMLElement | null>(null);

  const refresh = useCallback((nextFilters?: ReviewQueueFilters, nextPage?: number) => {
    const f = nextFilters ?? filters;
    const p = nextPage ?? page;
    const sequence = ++listSequence.current;

    startTransition(async () => {
      setLoadFailed(false);
      try {
      const [itemsResult, countsResult] = await Promise.all([
        getDmsReviewQueueItems({ ...f, page: p, pageSize }),
        getDmsReviewQueueCounts(),
      ]);
      if (sequence !== listSequence.current) return;
      if (itemsResult.success && itemsResult.data) {
        setItems(itemsResult.data.items);
        setTotal(itemsResult.data.total);
      } else { setLoadFailed(true); }
      if (countsResult.success && countsResult.data) {
        setCounts(countsResult.data);
      }
      setCountsFailed(!countsResult.success || !countsResult.data);
      } catch { if (sequence === listSequence.current) { setLoadFailed(true); setCountsFailed(true); } }
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

  const loadDetail = useCallback(async (id: number) => {
    const sequence = ++detailSequence.current;
    setDetailPending(true); setDetailFailed(false);
    try {
      const result = await getDmsReviewQueueItem(id);
      if (sequence !== detailSequence.current) return;
      if (result.success && result.data) setSelectedItem(result.data);
      else setDetailFailed(true);
    } catch { if (sequence === detailSequence.current) setDetailFailed(true); }
    finally { if (sequence === detailSequence.current) setDetailPending(false); }
  }, []);

  const closeDrawer = () => {
    if (drawerBusy) return;
    if (drawerDirty && !window.confirm("Discard the unsaved review entries?")) return;
    ++detailSequence.current;
    setDrawerOpen(false); setSelectedItem(null); setDrawerDirty(false);
  };

  const handleViewItem = (item: ReviewQueueItem) => {
    returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setDrawerDirty(false);
    setSelectedItem(item);
    setDrawerOpen(true);
    void loadDetail(item.id);
  };

  const handleMutated = () => {
    setDrawerOpen(false);
    setSelectedItem(null);
    setDrawerDirty(false); setDrawerBusy(false); ++detailSequence.current;
    refresh();
  };

  // Refresh the open drawer item in-place without closing it (used after Start Review)
  const handleItemRefreshed = useCallback(() => {
    if (!selectedItem) return;
    void loadDetail(selectedItem.id);
    refresh();
  }, [selectedItem, refresh, loadDetail]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-4">
      {/* Dashboard cards */}
      {countsFailed ? <p role="status" className="text-sm text-muted-foreground">Review summary is unavailable. Refresh to retry; unavailable counts are not zero.</p> : <DmsReviewQueueDashboardCards counts={counts} />}

      {/* Filters */}
      <DmsReviewQueueFilters
        filters={filters}
        onChange={handleFilterChange}
        isLoading={isPending}
      />

      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {loadFailed ? "Review results unavailable" : `${total} item${total !== 1 ? "s" : ""} found`}
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
      {loadFailed ? <DmsLoadError subject="review items" retry={() => refresh()} pending={isPending} /> : <DmsReviewQueueTable
        items={items}
        isLoading={isPending}
        onViewItem={handleViewItem}
        canManage={canManage}
      />}

      {/* Pagination */}
      {!loadFailed && totalPages > 1 && (
        <div className="flex items-center justify-between border-t border-border pt-3">
          <p className="text-xs text-muted-foreground">
            Page {page} of {totalPages}
          </p>
          <div className="flex gap-1.5">
            <Button
              aria-label="Previous page"
              variant="outline"
              size="sm"
              disabled={page <= 1 || isPending}
              onClick={() => handlePageChange(page - 1)}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              aria-label="Next page"
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
      <Sheet open={drawerOpen} onOpenChange={(open) => { if (!open) closeDrawer(); }}>
        <SheetContent showCloseButton={false} finalFocus={returnFocus} className="data-[side=right]:w-full data-[side=right]:sm:max-w-xl gap-0" onChangeCapture={() => setDrawerDirty(true)}>
          <SheetTitle className="sr-only">Review item {selectedItem?.id}</SheetTitle>
          <SheetDescription className="sr-only">Review the source and choose an authorized action.</SheetDescription>
          {detailPending && <p role="status" className="p-3">Loading review details…</p>}
          {detailFailed && selectedItem && <DmsLoadError subject="review details" retry={() => loadDetail(selectedItem.id)} pending={detailPending} />}
          {selectedItem && <div className="flex min-h-0 flex-1 flex-col">
            <DmsReviewQueueItemDrawer
              key={selectedItem.id}
              item={selectedItem}
              canManage={canManage && !detailFailed && !detailPending}
              onClose={closeDrawer}
              onBusyChange={setDrawerBusy}
              onMutated={handleMutated}
              onItemRefreshed={handleItemRefreshed}
            />
          </div>}
        </SheetContent>
      </Sheet>
    </div>
  );
}
