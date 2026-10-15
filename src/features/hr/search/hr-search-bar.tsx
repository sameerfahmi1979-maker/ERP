"use client";
import { useRef, useState, useEffect } from "react";
import { Search, X, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type { AuthContext } from "@/lib/rbac/check";
import { useHrSearchSuggestions } from "@/hooks/use-hr-search-read";
import { HR_SEARCH_CATEGORY_LABELS } from "@/lib/hr/search/types";
import Link from "next/link";
import { cn } from "@/lib/utils";

type Props = {
  authContext: AuthContext;
  value: string;
  onChange: (v: string) => void;
  onSearch: () => void;
  isSearching?: boolean;
};

export function HrSearchBar({ authContext, value, onChange, onSearch, isSearching }: Props) {
  const [showSuggestions, setShowSuggestions] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const read = useHrSearchSuggestions(authContext, value, showSuggestions);
  const suggestions = read.data?.rows;

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      setShowSuggestions(false);
      onSearch();
    }
    if (e.key === "Escape") {
      setShowSuggestions(false);
    }
  };

  return (
    <div ref={containerRef} className="relative w-full">
      <div className="relative flex items-center">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <Input
          aria-label="HR search"
          ref={inputRef}
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            setShowSuggestions(e.target.value.length >= 2);
          }}
          onFocus={() => value.length >= 2 && setShowSuggestions(true)}
          onKeyDown={handleKeyDown}
          placeholder="Search employees, candidates, compliance, payroll…"
          className="pl-9 pr-24 h-11 text-base"
          autoComplete="off"
        />
        <div className="absolute right-2 flex items-center gap-1">
          {value && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0"
              aria-label="Clear search text"
              onClick={() => {
                onChange("");
                inputRef.current?.focus();
              }}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          )}
          <Button
            type="button"
            size="sm"
            className="h-7 px-3"
            onClick={() => {
              setShowSuggestions(false);
              onSearch();
            }}
            disabled={isSearching}
          >
            {isSearching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Search"}
          </Button>
        </div>
      </div>

      {showSuggestions && value.length >= 2 && !read.denied && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-popover border rounded-md shadow-md overflow-hidden">
          <p className="px-3 py-2 text-xs text-muted-foreground">Quick suggestions (up to 8). Use Search for all matching results.</p>
          {read.busy && <p role="status" className="px-3 py-2 text-sm">Loading suggestions…</p>}
          {read.invalid && <p role="alert" className="px-3 py-2 text-sm">{read.issue}</p>}
          {read.failed && <div role="alert" className="px-3 py-2 text-sm">Suggestions are unavailable. You can still use Search. <Button type="button" variant="ghost" onClick={read.retry}>Retry suggestions</Button></div>}
          {read.ready && suggestions?.length === 0 && <p className="px-3 py-2 text-sm">No quick suggestions.</p>}
          {(suggestions ?? []).map((s, i) => (
            <Link
              key={i}
              href={s.href}
              className="flex items-center gap-3 px-3 py-2.5 text-sm hover:bg-accent transition-colors"
              onClick={() => setShowSuggestions(false)}
            >
              <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">{s.label}</div>
                {s.sublabel && (
                  <div className="text-xs text-muted-foreground">{s.sublabel}</div>
                )}
              </div>
              <span className={cn("text-xs px-1.5 py-0.5 rounded-full font-medium",
                s.category === "employees" ? "bg-blue-100 text-blue-700" : "bg-purple-100 text-purple-700"
              )}>
                {HR_SEARCH_CATEGORY_LABELS[s.category]}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
