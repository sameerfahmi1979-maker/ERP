"use client";

import { Search, SlidersHorizontal } from "lucide-react";

type Props = {
  query?: string;
  hasFilters?: boolean;
};

export function HrSearchEmptyState({ query, hasFilters }: Props) {
  if (!query && !hasFilters) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
          <Search className="h-7 w-7 text-muted-foreground" />
        </div>
        <h3 className="font-semibold text-lg">Search HR Records</h3>
        <p className="text-muted-foreground text-sm mt-1 max-w-sm">
          Enter a name, code, document type, or keyword to search across all HR modules you have access to.
        </p>
        <div className="mt-6 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
          <div className="bg-muted/50 rounded px-3 py-2 text-left">
            <div className="font-medium text-foreground">Employees</div>
            <div>Name, code, mobile, email</div>
          </div>
          <div className="bg-muted/50 rounded px-3 py-2 text-left">
            <div className="font-medium text-foreground">Candidates</div>
            <div>Name, code, email</div>
          </div>
          <div className="bg-muted/50 rounded px-3 py-2 text-left">
            <div className="font-medium text-foreground">Compliance</div>
            <div>Document type, training, access cards</div>
          </div>
          <div className="bg-muted/50 rounded px-3 py-2 text-left">
            <div className="font-medium text-foreground">Operations</div>
            <div>Assignments, site readiness, blocks</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center mb-4">
        {hasFilters ? (
          <SlidersHorizontal className="h-6 w-6 text-muted-foreground" />
        ) : (
          <Search className="h-6 w-6 text-muted-foreground" />
        )}
      </div>
      <h3 className="font-semibold">No results found</h3>
      {query ? (
        <p className="text-muted-foreground text-sm mt-1 max-w-sm">
          No HR records match <span className="font-medium text-foreground">&quot;{query}&quot;</span>.
          Try a different search term or adjust your filters.
        </p>
      ) : (
        <p className="text-muted-foreground text-sm mt-1 max-w-sm">
          No records match your current filters. Try adjusting or clearing them.
        </p>
      )}
    </div>
  );
}
