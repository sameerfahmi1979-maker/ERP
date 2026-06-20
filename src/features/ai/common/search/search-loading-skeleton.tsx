"use client";

import { Skeleton } from "@/components/ui/skeleton";

export function SearchLoadingSkeleton() {
  return (
    <div className="space-y-4">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex items-start gap-3 rounded-lg border border-slate-200 bg-white p-4">
          <Skeleton className="h-8 w-8 rounded-md flex-shrink-0" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-3 w-full max-w-xs" />
          </div>
          <Skeleton className="h-7 w-16 flex-shrink-0" />
        </div>
      ))}
    </div>
  );
}
