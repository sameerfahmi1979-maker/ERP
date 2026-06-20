"use client";

import { SearchResultCard } from "./search-result-card";
import type { ErpSearchResult, ErpSearchResultGroup } from "@/lib/ai/common/search/types";

interface SearchResultGroupProps {
  group: ErpSearchResultGroup;
  results: ErpSearchResult[];
}

export function SearchResultGroupComponent({ group, results }: SearchResultGroupProps) {
  if (results.length === 0) return null;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-semibold text-slate-700">{group.label}</h3>
        <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
          {group.count}
        </span>
      </div>
      <div className="space-y-2">
        {results.map((result) => (
          <SearchResultCard key={result.key} result={result} />
        ))}
      </div>
    </div>
  );
}
