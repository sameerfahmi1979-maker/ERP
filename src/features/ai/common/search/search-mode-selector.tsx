"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ErpSearchMode } from "@/lib/ai/common/search/types";

interface SearchModeOption {
  value: ErpSearchMode;
  label: string;
  description: string;
  requiresAiSearch?: boolean;
  requiresSemantic?: boolean;
}

const MODES: SearchModeOption[] = [
  {
    value: "quick_keyword",
    label: "Keyword",
    description: "Fast name/title search",
  },
  {
    value: "safe_fts",
    label: "Content",
    description: "Full-text search including document content",
  },
  {
    value: "semantic_documents",
    label: "Semantic",
    description: "AI similarity search across documents",
    requiresSemantic: true,
  },
  {
    value: "ai_intent",
    label: "AI Intent",
    description: "Natural-language query with AI filters",
    requiresAiSearch: true,
  },
  {
    value: "hybrid",
    label: "Hybrid",
    description: "Keyword + semantic + AI intent combined",
    requiresAiSearch: true,
  },
];

interface SearchModeSelectorProps {
  value: ErpSearchMode;
  onChange: (mode: ErpSearchMode) => void;
  aiSearchEnabled: boolean;
  semanticEnabled: boolean;
  className?: string;
}

export function SearchModeSelector({
  value,
  onChange,
  aiSearchEnabled,
  semanticEnabled,
  className,
}: SearchModeSelectorProps) {
  return (
    <div className={cn("flex flex-wrap gap-1", className)}>
      {MODES.map((mode) => {
        const disabled =
          (mode.requiresAiSearch && !aiSearchEnabled) ||
          (mode.requiresSemantic && !semanticEnabled);

        return (
          <Button
            key={mode.value}
            variant={value === mode.value ? "default" : "outline"}
            size="sm"
            className={cn(
              "h-7 text-xs",
              disabled && "opacity-50 cursor-not-allowed"
            )}
            onClick={() => !disabled && onChange(mode.value)}
            disabled={disabled}
            title={disabled ? "Feature disabled" : mode.description}
          >
            {mode.label}
            {disabled && (
              <span className="ml-1 text-[10px] opacity-60">(off)</span>
            )}
          </Button>
        );
      })}
    </div>
  );
}
