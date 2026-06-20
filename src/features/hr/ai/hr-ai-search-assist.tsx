"use client";

/**
 * HR.12 — HR AI Search Assist Widget
 *
 * Natural-language HR search assist. Converts user query into proposed
 * structured filters. User must click "Apply Filters" — no auto-search.
 */

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Brain, Search, Sparkles, Info } from "lucide-react";
import { toast } from "sonner";
import { generateHrSearchSuggestion } from "@/server/actions/hr/ai/hr-ai-search";
import type { HrAiSearchSuggestion } from "@/lib/hr/ai/types";

interface Props {
  canUse: boolean;
  onApplyFilters?: (suggestion: HrAiSearchSuggestion) => void;
}

const TARGET_LABELS: Record<string, string> = {
  employees: "Employees",
  candidates: "Candidates",
  compliance: "Compliance",
  time: "Time & Attendance",
  payroll: "Payroll",
  operations: "Operations",
  actions: "HR Actions",
  onboarding: "Onboarding",
};

export function HrAiSearchAssist({ canUse, onApplyFilters }: Props) {
  const [query, setQuery] = useState("");
  const [suggestion, setSuggestion] = useState<HrAiSearchSuggestion | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [featureDisabled, setFeatureDisabled] = useState(false);

  const handleSearch = async () => {
    if (!query.trim()) return;
    setIsLoading(true);
    setError(null);
    setSuggestion(null);
    try {
      const res = await generateHrSearchSuggestion(query.trim());
      if (res.success) {
        setSuggestion(res.data);
      } else {
        if (res.featureDisabled) {
          setFeatureDisabled(true);
          setError("HR AI search assist is not enabled. Enable it in Settings → AI Settings (ERP_AI_HR_SEARCH_ASSIST).");
        } else {
          setError(res.error);
        }
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleApply = () => {
    if (!suggestion || !onApplyFilters) return;
    onApplyFilters(suggestion);
    toast.success("AI search filters applied — review and run search.");
  };

  if (!canUse) return null;

  return (
    <div className="rounded-lg border border-violet-200 bg-violet-50/40 p-3 space-y-2">
      <div className="flex items-center gap-1.5">
        <Sparkles className="h-3.5 w-3.5 text-violet-500" />
        <span className="text-xs font-medium text-violet-700">AI Search Assist</span>
        <span className="text-[10px] text-violet-500">(Beta)</span>
      </div>

      <div className="flex gap-2">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") handleSearch(); }}
          placeholder='e.g. "employees with expired documents in Operations"'
          className="h-8 text-xs bg-white"
          maxLength={400}
        />
        <Button
          size="sm"
          variant="outline"
          onClick={handleSearch}
          disabled={isLoading || !query.trim() || featureDisabled}
          className="h-8 gap-1 shrink-0 border-violet-300 text-violet-700 hover:bg-violet-100"
        >
          <Brain className="h-3.5 w-3.5" />
          {isLoading ? "…" : "Ask AI"}
        </Button>
      </div>

      {error && !isLoading && (
        <Alert variant="default" className="py-1.5 bg-white border-red-200">
          <AlertDescription className="text-[10px] text-red-600">{error}</AlertDescription>
        </Alert>
      )}

      {suggestion && !isLoading && (
        <div className="space-y-1.5 bg-white rounded border border-violet-200 p-2.5">
          <div className="flex items-center gap-1.5 flex-wrap">
            <Badge variant="secondary" className="text-[9px] bg-violet-100 text-violet-700">
              {TARGET_LABELS[suggestion.targetArea] ?? suggestion.targetArea}
            </Badge>
            <span className="text-[10px] text-muted-foreground">
              {Math.round(suggestion.confidence * 100)}% confidence
            </span>
          </div>

          <p className="text-xs font-medium text-foreground">{suggestion.interpretedIntent}</p>

          {Object.keys(suggestion.proposedFilters).length > 0 && (
            <div className="flex flex-wrap gap-1">
              {Object.entries(suggestion.proposedFilters).map(([k, v]) => (
                <Badge key={k} variant="outline" className="text-[9px]">
                  {k}: {String(v)}
                </Badge>
              ))}
            </div>
          )}

          {suggestion.warning && (
            <p className="text-[10px] text-amber-600 flex items-center gap-1">
              <Info className="h-3 w-3" /> {suggestion.warning}
            </p>
          )}

          {onApplyFilters && (
            <Button
              size="sm"
              variant="default"
              onClick={handleApply}
              className="h-7 text-xs gap-1 bg-violet-600 hover:bg-violet-700 text-white"
            >
              <Search className="h-3 w-3" />
              Apply Filters & Search
            </Button>
          )}

          <p className="text-[10px] text-muted-foreground italic">
            AI proposed these filters. Review them before running the search.
          </p>
        </div>
      )}
    </div>
  );
}
