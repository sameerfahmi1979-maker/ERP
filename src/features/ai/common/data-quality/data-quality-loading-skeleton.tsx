'use client';

import { Skeleton } from '@/components/ui/skeleton';

export function DataQualityLoadingSkeleton() {
  return (
    <div className="space-y-6 p-6">
      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-20 rounded-lg" />
        ))}
      </div>
      {/* Scan card */}
      <Skeleton className="h-24 rounded-lg" />
      {/* Filters */}
      <Skeleton className="h-32 rounded-lg" />
      {/* Table */}
      <Skeleton className="h-64 rounded-lg" />
    </div>
  );
}
