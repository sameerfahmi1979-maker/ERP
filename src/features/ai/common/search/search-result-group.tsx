"use client";
import { RecordCollection } from "@/components/erp/table/record-collection";

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
        {<RecordCollection id={`special.search-result-group-${group.resultType}`} rows={results} fields={[{"id":"title","path":"title","label":"Title"},{"id":"subtitle","path":"subtitle","label":"Reference"},{"id":"resultType","path":"resultType","label":"Type"}]} renderRecord={(result) => (
          <SearchResultCard key={result.key} result={result} />
        )} />}
      </div>
    </div>
  );
}
