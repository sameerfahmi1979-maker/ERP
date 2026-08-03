import { Skeleton } from "@/components/ui/skeleton";

/**
 * ERP GLOBAL WORKSPACE.PERF.1 (WS.2) — global loading boundary for all
 * protected routes.
 *
 * Before this file existed there was NO loading.tsx anywhere in the app, so a
 * workspace tab switch froze on the old page until the server finished
 * rendering the new one. This boundary paints instantly inside the shell
 * (sidebar + tab bar stay mounted) while the page streams in.
 *
 * Layout mirrors the standard ERP page: page header block, toolbar row, then
 * a table-like body — so most list/record screens skeleton-morph smoothly.
 */
export default function ProtectedRouteLoading() {
  return (
    <div className="p-6 space-y-4" aria-busy="true" aria-label="Loading page">
      {/* Page header */}
      <div className="space-y-2">
        <Skeleton className="h-4 w-64" />
        <Skeleton className="h-7 w-72" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>

      {/* Toolbar (search + actions) */}
      <div className="flex items-center justify-between gap-3">
        <Skeleton className="h-9 w-64" />
        <div className="flex gap-2">
          <Skeleton className="h-9 w-24" />
          <Skeleton className="h-9 w-32" />
        </div>
      </div>

      {/* Table / content body */}
      <div className="rounded-md border border-border/60 overflow-hidden">
        <Skeleton className="h-10 w-full rounded-none" />
        <div className="divide-y divide-border/40">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-4 py-3">
              <Skeleton className="h-4 w-4 rounded" />
              <Skeleton className="h-4 flex-1 max-w-[220px]" />
              <Skeleton className="h-4 w-32 hidden md:block" />
              <Skeleton className="h-4 w-24 hidden lg:block" />
              <Skeleton className="h-4 w-16 ml-auto" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
