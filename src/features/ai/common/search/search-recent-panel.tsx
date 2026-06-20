"use client";

import { Clock, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTransition } from "react";
import { clearRecentSearchesAction } from "@/server/actions/ai/common/search";
import type { ErpRecentSearch } from "@/lib/ai/common/search/types";

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
    <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between px-4 py-2 border-b border-slate-100">
        <div className="flex items-center gap-1.5 text-xs font-medium text-slate-600">
          <Clock className="h-3.5 w-3.5" />
          Recent searches
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 text-xs text-slate-500 hover:text-red-600 gap-1"
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
              className="flex w-full items-center gap-2 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 transition-colors text-left"
              onClick={() => onSelect(item.searchText)}
            >
              <Clock className="h-3.5 w-3.5 text-slate-400 flex-shrink-0" />
              <span className="flex-1 truncate">{item.searchText}</span>
              {item.resultCount > 0 && (
                <span className="text-xs text-slate-400">{item.resultCount} results</span>
              )}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
