"use client";

/**
 * DMS.BROWSER.1 — Smart search bar with:
 * - Debounced input
 * - Recent searches for the current account and scope
 * - Loading / AI-searching indicators
 * - Clear button
 */

import { useEffect, useRef, useState, useCallback } from "react";
import { Search, X, Clock, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

const HISTORY_KEY = "dms-browser-search-history-v1";
const MAX_HISTORY = 10;
const DEBOUNCE_MS = 300;

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
  const searchCallback = useRef(onSearch);
  useEffect(() => { searchCallback.current = onSearch; }, [onSearch]);

  // Discard the legacy unscoped history without ever reading its entries.
  useEffect(() => {
    try { localStorage.removeItem(HISTORY_KEY); } catch { /* Storage may be unavailable. */ }
  }, []);

  const cancelDebounce = useCallback(() => {
    if (debounceRef.current !== null) clearTimeout(debounceRef.current);
    debounceRef.current = null;
  }, []);
  useEffect(() => cancelDebounce, [cancelDebounce]);

  const handleFocus = () => {
    setFocused(true);
  };

  const rememberQuery = useCallback((query: string) => {
    const term = query.trim();
    if (term && term.length <= 200) {
      setHistory(previous => [term, ...previous.filter(entry => entry !== term)].slice(0, MAX_HISTORY));
    }
  }, []);

  const commitQuery = useCallback(
    (q: string) => {
      cancelDebounce();
      rememberQuery(q);
      setFocused(false);
      searchCallback.current(q);
    },
    [cancelDebounce, rememberQuery]
  );

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const q = e.target.value;
    setValue(q);

    cancelDebounce();
    debounceRef.current = setTimeout(() => {
      debounceRef.current = null;
      searchCallback.current(q);
      rememberQuery(q);
    }, DEBOUNCE_MS);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.nativeEvent.isComposing) return;
    if (e.key === "Enter") {
      commitQuery(value);
    }
    if (e.key === "Escape") {
      setFocused(false);
      inputRef.current?.blur();
    }
  };

  const handleClear = () => {
    setValue("");
    commitQuery("");
    inputRef.current?.focus();
  };

  const handleHistorySelect = (q: string) => {
    setValue(q);
    commitQuery(q);
  };

  const handleHistoryRemove = (q: string) => {
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
    <div data-search-bar className="relative px-3 pt-3 pb-1 shrink-0"
      onKeyDown={event => {
        if (event.key === "Escape" && event.target !== inputRef.current) {
          inputRef.current?.focus();
          setFocused(false);
        }
      }}
      onBlur={event => {
        if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false);
      }}>
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
          aria-label="Search documents"
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
        <div className="absolute top-[calc(100%-4px)] left-3 right-3 z-50 max-h-56 overflow-y-auto rounded-md border border-border bg-popover shadow-md">
          <p className="px-3 py-1 text-[10px] text-muted-foreground font-medium uppercase tracking-wide border-b border-border/40">
            Recent searches
          </p>
          {history.map((q) => (
            <div key={q} className="flex items-center gap-2 px-3 text-sm hover:bg-muted">
              <button type="button" onClick={() => handleHistorySelect(q)}
                className="flex min-w-0 flex-1 items-center gap-2 py-1.5 text-left">
                <Clock aria-hidden className="h-3 w-3 shrink-0 text-muted-foreground" />
                <span className="truncate">{q}</span>
              </button>
              <button
                type="button"
                onClick={() => handleHistoryRemove(q)}
                className="text-muted-foreground hover:text-destructive transition-colors shrink-0"
                aria-label={`Remove ${q} from history`}
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
