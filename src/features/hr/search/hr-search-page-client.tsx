"use client";

import { useState, useCallback, useTransition } from "react";
import { useQuery } from "@tanstack/react-query";
import { RefreshCw, SearchX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { searchHr } from "@/server/actions/hr/search";
import type { HrSearchCategory, HrSearchInput, HrSearchOutput } from "@/lib/hr/search/types";
import { HR_SEARCH_CATEGORY_ORDER } from "@/lib/hr/search/types";
import { HrSearchBar } from "./hr-search-bar";
import { HrSearchFilters } from "./hr-search-filters";
import { HrSearchResultGroup } from "./hr-search-result-group";
import { HrSearchEmptyState } from "./hr-search-empty-state";
import { HrAiSearchAssist } from "@/features/hr/ai/hr-ai-search-assist";
import type { HrAiSearchSuggestion } from "@/lib/hr/ai/types";

export type HrSearchPermissions = {
  canEmployees: boolean;
  canRecruitment: boolean;
  canCompliance: boolean;
  canTime: boolean;
  canPayroll: boolean;
  canOperations: boolean;
  canActions: boolean;
  canAiUse?: boolean;
};

type Props = {
  permissions: HrSearchPermissions;
};

function getAvailableCategories(p: HrSearchPermissions): HrSearchCategory[] {
  const cats: HrSearchCategory[] = [];
  if (p.canEmployees) cats.push("employees");
  if (p.canRecruitment) cats.push("candidates", "onboarding");
  if (p.canCompliance) cats.push("compliance");
  if (p.canTime) cats.push("time");
  if (p.canPayroll) cats.push("payroll");
  if (p.canOperations) cats.push("operations");
  if (p.canActions) cats.push("actions");
  return cats;
}

export function HrSearchPageClient({ permissions }: Props) {
  const [queryText, setQueryText] = useState("");
  const [committedInput, setCommittedInput] = useState<HrSearchInput | null>(null);
  const [filters, setFilters] = useState<HrSearchInput>({});
  const [, startTransition] = useTransition();

  const availableCategories = getAvailableCategories(permissions);

  const { data, isFetching, refetch } = useQuery<HrSearchOutput>({
    queryKey: ["hr", "search", "results", committedInput],
    queryFn: () => searchHr(committedInput!),
    enabled: committedInput !== null,
    staleTime: 30_000,
  });

  const handleSearch = useCallback(() => {
    startTransition(() => {
      setCommittedInput({
        query: queryText,
        ...filters,
        limit: 100,
        offset: 0,
      });
    });
  }, [queryText, filters]);

  const handleFilterChange = (updated: Partial<HrSearchInput>) => {
    setFilters((prev) => ({ ...prev, ...updated }));
  };

  const handleClearAll = () => {
    setQueryText("");
    setFilters({});
    setCommittedInput(null);
  };

  const hasSearched = committedInput !== null;
  const hasResults = (data?.results.length ?? 0) > 0;
  const hasFilters = !!(filters.status || filters.dateFrom || filters.dateTo || (filters.categories?.length ?? 0) > 0);

  const groupedResults = (() => {
    if (!data) return [];
    const groups: Record<string, { category: HrSearchCategory; count: number; results: typeof data.results }> = {};
    for (const r of data.results) {
      if (!groups[r.category]) {
        groups[r.category] = { category: r.category, count: 0, results: [] };
      }
      groups[r.category].results.push(r);
      groups[r.category].count++;
    }
    return HR_SEARCH_CATEGORY_ORDER
      .filter((cat) => groups[cat])
      .map((cat) => groups[cat]);
  })();

  const handleAiSearchApply = (s: HrAiSearchSuggestion) => {
    const pf = s.proposedFilters;

    // Use the AI's proposed search text (name/code/keyword) — NOT interpretedIntent
    const searchText = String(pf.search ?? pf.query ?? pf.name ?? pf.keyword ?? "").trim();

    const newFilters: Partial<HrSearchInput> = {};
    if (s.targetArea) newFilters.categories = [s.targetArea];
    if (pf.status)    newFilters.status = String(pf.status);
    if (pf.dateFrom)  newFilters.dateFrom = String(pf.dateFrom);
    if (pf.dateTo)    newFilters.dateTo = String(pf.dateTo);
    if (pf.branchId && Number(pf.branchId))       newFilters.branchId       = Number(pf.branchId);
    if (pf.departmentId && Number(pf.departmentId)) newFilters.departmentId = Number(pf.departmentId);
    if (pf.designationId && Number(pf.designationId)) newFilters.designationId = Number(pf.designationId);
    if (pf.workSiteId && Number(pf.workSiteId))   newFilters.workSiteId     = Number(pf.workSiteId);
    if (pf.ownerCompanyId && Number(pf.ownerCompanyId)) newFilters.ownerCompanyId = Number(pf.ownerCompanyId);

    const merged = { ...filters, ...newFilters };
    setQueryText(searchText);
    setFilters(merged);
    startTransition(() => {
      setCommittedInput({ query: searchText, ...merged, limit: 100, offset: 0 });
    });
  };

  return (
    <div className="flex flex-col gap-6">
      {/* AI Search Assist */}
      {permissions.canAiUse && (
        <HrAiSearchAssist
          canUse={permissions.canAiUse}
          onApplyFilters={handleAiSearchApply}
        />
      )}

      {/* Search bar */}
      <div className="bg-card border rounded-xl p-5 shadow-sm space-y-4">
        <HrSearchBar
          value={queryText}
          onChange={setQueryText}
          onSearch={handleSearch}
          isSearching={isFetching}
        />
        <HrSearchFilters
          filters={filters}
          onChange={handleFilterChange}
          availableCategories={availableCategories}
        />

        {hasSearched && (
          <div className="flex items-center gap-2 pt-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 text-xs gap-1.5 text-muted-foreground"
              onClick={handleClearAll}
            >
              <SearchX className="h-3.5 w-3.5" />
              Clear Search
            </Button>
            {hasResults && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 text-xs gap-1.5 text-muted-foreground"
                onClick={() => refetch()}
                disabled={isFetching}
              >
                <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />
                Refresh
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Results summary */}
      {hasSearched && data && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            {hasResults ? (
              <>
                <span className="font-medium text-foreground">{data.totalCount}</span>{" "}
                result{data.totalCount !== 1 ? "s" : ""} found
                {data.query ? <> for <span className="font-medium text-foreground">&quot;{data.query}&quot;</span></> : ""}
              </>
            ) : (
              "No results"
            )}
          </p>
          {hasResults && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              {Object.entries(data.groupCounts).map(([cat, count]) => (
                <span key={cat} className="bg-muted px-2 py-0.5 rounded-full">
                  {cat}: {count}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Loading skeleton */}
      {isFetching && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="border rounded-lg overflow-hidden">
              <div className="flex items-center gap-3 px-4 py-3 bg-muted/40">
                <Skeleton className="w-7 h-7 rounded-md" />
                <Skeleton className="h-4 flex-1 max-w-32" />
                <Skeleton className="h-4 w-16" />
              </div>
              <div className="p-3 space-y-2">
                {[1, 2].map((j) => (
                  <div key={j} className="flex gap-3 p-3 border rounded-lg">
                    <Skeleton className="w-8 h-8 rounded-md shrink-0" />
                    <div className="flex-1 space-y-1.5">
                      <Skeleton className="h-4 w-48" />
                      <Skeleton className="h-3 w-32" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Results */}
      {!isFetching && hasSearched && !hasResults && (
        <HrSearchEmptyState query={data?.query} hasFilters={hasFilters} />
      )}

      {!isFetching && hasResults && (
        <div className="space-y-3">
          {groupedResults.map((group, idx) => (
            <HrSearchResultGroup
              key={group.category}
              category={group.category}
              results={group.results}
              count={group.count}
              defaultExpanded={idx < 3}
            />
          ))}
        </div>
      )}

      {/* Initial empty state (before first search) */}
      {!hasSearched && !isFetching && (
        <HrSearchEmptyState />
      )}
    </div>
  );
}
