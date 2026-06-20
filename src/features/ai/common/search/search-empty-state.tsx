"use client";

import { Search } from "lucide-react";

interface SearchEmptyStateProps {
  query?: string;
  hasSearched: boolean;
}

export function SearchEmptyState({ query, hasSearched }: SearchEmptyStateProps) {
  if (!hasSearched) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-slate-100 mb-4">
          <Search className="h-7 w-7 text-slate-400" />
        </div>
        <h3 className="text-base font-semibold text-slate-700">Search across ERP</h3>
        <p className="mt-1 text-sm text-slate-500 max-w-sm">
          Search organizations, branches, parties, work sites, and documents. Use AI Intent mode for natural-language queries.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 mb-3">
        <Search className="h-5 w-5 text-slate-400" />
      </div>
      <h3 className="text-sm font-semibold text-slate-700">No results found</h3>
      {query && (
        <p className="mt-1 text-sm text-slate-500">
          No matches found for{" "}
          <span className="font-medium text-slate-700">&ldquo;{query}&rdquo;</span>.
          Try a different query or search mode.
        </p>
      )}
    </div>
  );
}
