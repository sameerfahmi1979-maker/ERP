"use client";

import { Search, X, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  onSearch: () => void;
  isSearching: boolean;
  placeholder?: string;
  className?: string;
}

export function SearchBar({
  value,
  onChange,
  onSearch,
  isSearching,
  placeholder = "Search organizations, parties, branches, sites, documents…",
  className,
}: SearchBarProps) {
  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && !isSearching && value.trim().length > 0) {
      onSearch();
    }
  }

  return (
    <div className={cn("relative flex items-center gap-2", className)}>
      <div className="relative flex-1">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <Input
          aria-label="Search ERP"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="pl-9 pr-8 h-10"
          autoFocus
        />
        {value && (
          <button
            type="button"
            aria-label="Clear search"
            onClick={() => onChange("")}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-muted-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
      <Button
        aria-label={isSearching ? "Searching" : "Search"}
        onClick={onSearch}
        disabled={isSearching || value.trim().length === 0}
        className="h-10 px-4"
      >
        {isSearching ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          "Search"
        )}
      </Button>
    </div>
  );
}
