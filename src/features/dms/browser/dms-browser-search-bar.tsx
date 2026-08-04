"use client";

/**
 * DMS.BROWSER.1 — Smart search bar with:
 * - Debounced input
 * - Search history dropdown (localStorage, last 10)
 * - Loading / AI-searching indicators
 * - Clear button
 */

import { useEffect, useRef, useState, useCallback } from "react";
import { Search, X, Clock, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

const HISTORY_KEY = "dms-browser-search-history-v1";
const MAX_HISTORY = 10;
const DEBOUNCE_MS = 300;

function loadHistory(): string[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) ?? "[]") as string[];
  } catch {
    return [];
  }
}

function saveToHistory(query: string) {
  if (!query.trim()) return;
  const existing = loadHistory().filter((q) => q !== query.trim());
  const updated = [query.trim(), ...existing].slice(0, MAX_HISTORY);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(updated));
}

function removeFromHistory(query: string) {
  const updated = loadHistory().filter((q) => q !== query);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(updated));
}

interface DmsBrowserSearchBarProps {
  onSearch: (query: string) => void;
  isLoading: boolean;
  isAiSearching: boolean;
}

export function DmsBrowserSearchBar({ onSearch, isLoading, isAiSearching }: DmsBrowserSearchBarProps) {
  const [value, setValue] = useState("");
  const [focused, setFocused] = useState(false);
  const [history, setHistory] = useState<string[]>([]);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Load history on focus
  const handleFocus = () => {
    setHistory(loadHistory());
    setFocused(true);
  };

  const commitQuery = useCallback(
    (q: string) => {
      if (q.trim()) saveToHistory(q);
      setFocused(false);
      onSearch(q);
    },
    [onSearch]
  );

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const q = e.target.value;
    setValue(q);

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      onSearch(q);
      if (q.trim()) saveToHistory(q);
    }, DEBOUNCE_MS);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      commitQuery(value);
    }
    if (e.key === "Escape") {
      setFocused(false);
      inputRef.current?.blur();
    }
  };

  const handleClear = () => {
    setValue("");
    onSearch("");
    setFocused(false);
    inputRef.current?.focus();
  };

  const handleHistorySelect = (q: string) => {
    setValue(q);
    commitQuery(q);
  };

  const handleHistoryRemove = (q: string, e: React.MouseEvent) => {
    e.stopPropagation();
    removeFromHistory(q);
    setHistory((prev) => prev.filter((h) => h !== q));
  };

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (inputRef.current && !inputRef.current.closest("[data-search-bar]")?.contains(e.target as Node)) {
        setFocused(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const showHistory = focused && value.trim() === "" && history.length > 0;

  return (
    <div data-search-bar className="relative px-3 pt-3 pb-1 shrink-0">
      <div className="relative flex items-center">
        {/* Leading icon / spinner */}
        <div className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none">
          {isLoading || isAiSearching ? (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          ) : (
            <Search className="h-4 w-4 text-muted-foreground" />
          )}
        </div>

        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onFocus={handleFocus}
          onBlur={() => setTimeout(() => setFocused(false), 150)}
          placeholder="Search by name, document number, type, or content…"
          className={cn(
            "w-full h-9 pl-9 pr-8 rounded-md border border-border bg-background",
            "text-sm placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-ring",
            "transition-shadow"
          )}
          autoComplete="off"
          spellCheck={false}
        />

        {/* AI / Content indicator badge */}
        {isAiSearching && (
          <span className="absolute right-9 top-1/2 -translate-y-1/2 text-[9px] font-semibold text-violet-600 dark:text-violet-400 uppercase tracking-wide">
            AI
          </span>
        )}

        {/* Clear button */}
        {value && (
          <button
            type="button"
            onClick={handleClear}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Clear search"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Search history dropdown */}
      {showHistory && (
        <div className="absolute top-[calc(100%-4px)] left-3 right-3 z-50 rounded-md border border-border bg-popover shadow-md overflow-hidden">
          <p className="px-3 py-1 text-[10px] text-muted-foreground font-medium uppercase tracking-wide border-b border-border/40">
            Recent searches
          </p>
          {history.map((q) => (
            <div
              key={q}
              role="button"
              tabIndex={0}
              onClick={() => handleHistorySelect(q)}
              onKeyDown={(e) => e.key === "Enter" && handleHistorySelect(q)}
              className="flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-muted cursor-pointer"
            >
              <Clock className="h-3 w-3 shrink-0 text-muted-foreground" />
              <span className="flex-1 truncate">{q}</span>
              <button
                type="button"
                onClick={(e) => handleHistoryRemove(q, e)}
                className="text-muted-foreground hover:text-destructive transition-colors shrink-0"
                aria-label="Remove from history"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
