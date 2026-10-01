"use client";

import { useState, useCallback, useTransition, useRef } from "react";
import { AlertTriangle, Info } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { searchAcrossErp } from "@/server/actions/ai/common/search";
import { SearchBar } from "./search-bar";
import { SearchModeSelector } from "./search-mode-selector";
import { SearchResultGroupComponent } from "./search-result-group";
import { SearchEmptyState } from "./search-empty-state";
import { SearchLoadingSkeleton } from "./search-loading-skeleton";
import { SearchRecentPanel } from "./search-recent-panel";
import type {
  ErpSearchMode,
  ErpSearchResponse,
  ErpRecentSearch,
} from "@/lib/ai/common/search/types";

interface SearchPageClientProps {
  initialRecent: ErpRecentSearch[];
  aiSearchEnabled: boolean;
  semanticEnabled: boolean;
}

export function SearchPageClient({
  initialRecent,
  aiSearchEnabled,
  semanticEnabled,
}: SearchPageClientProps) {
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<ErpSearchMode>("quick_keyword");
  const [response, setResponse] = useState<ErpSearchResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [recent, setRecent] = useState<ErpRecentSearch[]>(initialRecent);
  const [isPending, startTransition] = useTransition();
  const latest = useRef(0);
  const changeQuery = (value:string) => { latest.current++; setQuery(value); setResponse(null); setError(null); setHasSearched(false); };
  const changeMode = (value:ErpSearchMode) => { latest.current++; setMode(value); setResponse(null); setError(null); setHasSearched(false); };

  const handleSearch = useCallback(() => {
    if (!query.trim()) return;
    setError(null);
    const request = ++latest.current;

    startTransition(async () => {
      try {
      const result = await searchAcrossErp({
        query: query.trim(),
        mode,
        limit: 15,
        includeAiSignals: true,
      });

      if (request !== latest.current) return;
      setHasSearched(true);

      if (!result.success || !result.data) {
        setError("Search could not be completed. Your search text is retained; try Search again.");
        setResponse(null);
        return;
      }

      setResponse(result.data);
      } catch { if (request === latest.current) { setError("Search could not be completed. Your search text is retained; try Search again."); setResponse(null); } }
    });
  }, [query, mode]);

  function handleRecentSelect(text: string) {
    changeQuery(text);
  }

  function handleRecentClear() {
    setRecent([]);
  }

  const groupedResults = response
    ? response.groups.map((group) => ({
        group,
        results: response.results.filter((r) => r.resultType === group.resultType),
      }))
    : [];

  const showRecent = !hasSearched && recent.length > 0;

  return (
    <div className="space-y-4">
      {/* Search bar */}
      <SearchBar
        value={query}
        onChange={changeQuery}
        onSearch={handleSearch}
        isSearching={isPending}
      />

      {/* Mode selector */}
      <div className="flex items-center gap-3">
        <span className="text-xs text-muted-foreground font-medium whitespace-nowrap">Search mode:</span>
        <SearchModeSelector
          value={mode}
          onChange={changeMode}
          aiSearchEnabled={aiSearchEnabled}
          semanticEnabled={semanticEnabled}
        />
      </div>

      {/* Feature status banners */}
      {!aiSearchEnabled && (mode === "ai_intent" || mode === "hybrid") && (
        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription>
            AI Intent mode is disabled. Results will use keyword search.
          </AlertDescription>
        </Alert>
      )}
      {!semanticEnabled && mode === "semantic_documents" && (
        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription>
            Semantic search is disabled. Results will use keyword search.
          </AlertDescription>
        </Alert>
      )}

      {/* Error */}
      {error && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Partial result warning */}
      {response?.partialResults && (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            Some sources returned partial results:{" "}
            {response.failedSources.join(", ")}.
          </AlertDescription>
        </Alert>
      )}

      {/* Loading skeleton */}
      {isPending && <SearchLoadingSkeleton />}

      {/* Recent searches */}
      {!isPending && showRecent && (
        <SearchRecentPanel
          recent={recent}
          onSelect={handleRecentSelect}
          onClear={handleRecentClear}
        />
      )}

      {/* Results */}
      {!isPending && response && (
        <div className="space-y-1">
          {response.totalCount > 0 && (
            <div className="flex items-center gap-2 pb-2">
              <p className="text-sm text-slate-600">
                {response.totalCount} result{response.totalCount !== 1 ? "s" : ""} for{" "}
                <span className="font-medium text-slate-800">&ldquo;{response.query}&rdquo;</span>
              </p>
              {response.intent && (
                <Badge variant="outline" className="text-xs">
                  AI Intent
                </Badge>
              )}
            </div>
          )}

          {groupedResults.length > 0 ? (
            <div className="space-y-6">
              {groupedResults.map(({ group, results }) => (
                <SearchResultGroupComponent
                  key={group.resultType}
                  group={group}
                  results={results}
                />
              ))}
            </div>
          ) : (
            <SearchEmptyState query={response.query} hasSearched={true} />
          )}
        </div>
      )}

      {/* Empty state (initial) */}
      {!isPending && !error && !response && !showRecent && (
        <SearchEmptyState hasSearched={hasSearched} />
      )}
    </div>
  );
}
