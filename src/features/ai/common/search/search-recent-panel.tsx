"use client";

import { Button } from "@/components/ui/button";
import type { ErpRecentSearch } from "@/lib/ai/common/search/types";
import { clearRecentSearchesAction } from "@/server/actions/ai/common/search";
import { Clock, Trash2 } from "lucide-react";
import { useTransition } from "react";

interface SearchRecentPanelProps {
  recent: ErpRecentSearch[];
  onSelect: (text: string) => void;
  onClear: () => void;
}

export function SearchRecentPanel({ recent, onSelect, onClear }: SearchRecentPanelProps) {
  const [isPending, startTransition] = useTransition();

  function handleClear() {
    startTransition(async () => {
      await clearRecentSearchesAction();
      onClear();
    });
  }

  if (recent.length === 0) return null;

  return (
    <div className="rounded-lg border border-border bg-card shadow-sm">
      <div className="flex items-center justify-between px-4 py-2 border-b border-border">
        <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <Clock className="h-3.5 w-3.5" />
          Recent searches
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 text-xs text-muted-foreground hover:text-red-600 gap-1 dark:hover:text-red-300"
          onClick={handleClear}
          disabled={isPending}
        >
          <Trash2 className="h-3 w-3" />
          Clear all
        </Button>
      </div>
      <ul className="divide-y divide-slate-100">
        {recent.slice(0, 10).map((item) => (
          <li key={item.id}>
            <button
              className="flex w-full items-center gap-2 px-4 py-2 text-sm text-foreground hover:bg-muted transition-colors text-left"
              onClick={() => onSelect(item.searchText)}
            >
              <Clock className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
              <span className="flex-1 truncate">{item.searchText}</span>
              {item.resultCount > 0 && (
                <span className="text-xs text-muted-foreground">{item.resultCount} results</span>
              )}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
