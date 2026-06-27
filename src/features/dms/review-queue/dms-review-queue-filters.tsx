"use client";

import { useState } from "react";
import type { ReviewQueueFilters } from "@/server/actions/dms/review-queue";
import { Button } from "@/components/ui/button";
import { RotateCcw, Filter } from "lucide-react";

const REVIEW_TYPES = [
  { value: "intake_classification_review",  label: "Intake Classification" },
  { value: "intake_metadata_review",        label: "Intake Metadata" },
  { value: "ai_analysis_metadata_review",   label: "AI Analysis" },
  { value: "ocr_failure_review",            label: "OCR Failure" },
  { value: "semantic_index_review",         label: "Semantic Index" },
  { value: "ai_job_failure_review",         label: "AI Job Failure" },
];

const STATUSES = [
  { value: "open",       label: "Open" },
  { value: "assigned",   label: "Assigned" },
  { value: "in_review",  label: "In Review" },
  { value: "resolved",   label: "Resolved" },
  { value: "dismissed",  label: "Dismissed" },
];

const PRIORITIES = [
  { value: "urgent", label: "Urgent" },
  { value: "high",   label: "High" },
  { value: "normal", label: "Normal" },
  { value: "low",    label: "Low" },
];

interface Props {
  filters:   ReviewQueueFilters;
  onChange:  (filters: ReviewQueueFilters) => void;
  isLoading: boolean;
}

export function DmsReviewQueueFilters({ filters, onChange, isLoading }: Props) {
  const [expanded, setExpanded] = useState(false);

  const handleReset = () => {
    onChange({});
  };

  const hasActiveFilters =
    (filters.status?.length ?? 0) > 0 ||
    (filters.reviewType?.length ?? 0) > 0 ||
    (filters.priority?.length ?? 0) > 0 ||
    filters.assignedTo !== undefined;

  return (
    <div className="rounded-lg border border-slate-200 bg-white">
      <div className="flex items-center justify-between px-4 py-3">
        <button
          type="button"
          className="flex items-center gap-2 text-sm font-medium text-slate-700 hover:text-slate-900"
          onClick={() => setExpanded(!expanded)}
        >
          <Filter className="h-4 w-4" />
          Filters
          {hasActiveFilters && (
            <span className="rounded-full bg-sky-600 px-1.5 py-0.5 text-[10px] font-bold text-white leading-none">
              ●
            </span>
          )}
        </button>
        {hasActiveFilters && (
          <Button variant="ghost" size="sm" onClick={handleReset} disabled={isLoading}>
            <RotateCcw className="h-3.5 w-3.5 mr-1" />
            Reset
          </Button>
        )}
      </div>

      {expanded && (
        <div className="border-t border-slate-100 px-4 py-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {/* Status */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">
              Status
            </label>
            <div className="flex flex-wrap gap-1.5">
              {STATUSES.map((s) => {
                const active = filters.status?.includes(s.value);
                return (
                  <button
                    key={s.value}
                    type="button"
                    onClick={() => {
                      const current = filters.status ?? [];
                      const next = active
                        ? current.filter((x) => x !== s.value)
                        : [...current, s.value];
                      onChange({ ...filters, status: next.length ? next : undefined });
                    }}
                    className={`rounded-full px-2.5 py-0.5 text-xs font-medium border transition-colors ${
                      active
                        ? "bg-sky-600 text-white border-sky-600"
                        : "border-slate-200 text-slate-600 hover:border-sky-400"
                    }`}
                  >
                    {s.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Review Type */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">
              Review Type
            </label>
            <div className="flex flex-wrap gap-1.5">
              {REVIEW_TYPES.map((r) => {
                const active = filters.reviewType?.includes(r.value);
                return (
                  <button
                    key={r.value}
                    type="button"
                    onClick={() => {
                      const current = filters.reviewType ?? [];
                      const next = active
                        ? current.filter((x) => x !== r.value)
                        : [...current, r.value];
                      onChange({ ...filters, reviewType: next.length ? next : undefined });
                    }}
                    className={`rounded-full px-2.5 py-0.5 text-xs font-medium border transition-colors ${
                      active
                        ? "bg-violet-600 text-white border-violet-600"
                        : "border-slate-200 text-slate-600 hover:border-violet-400"
                    }`}
                  >
                    {r.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Priority */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">
              Priority
            </label>
            <div className="flex flex-wrap gap-1.5">
              {PRIORITIES.map((p) => {
                const active = filters.priority?.includes(p.value);
                const colors: Record<string, string> = {
                  urgent: active ? "bg-red-600 text-white border-red-600" : "border-red-200 text-red-700 hover:border-red-400",
                  high:   active ? "bg-orange-500 text-white border-orange-500" : "border-orange-200 text-orange-700 hover:border-orange-400",
                  normal: active ? "bg-sky-600 text-white border-sky-600" : "border-slate-200 text-slate-600 hover:border-sky-400",
                  low:    active ? "bg-slate-400 text-white border-slate-400" : "border-slate-200 text-slate-500 hover:border-slate-400",
                };
                return (
                  <button
                    key={p.value}
                    type="button"
                    onClick={() => {
                      const current = filters.priority ?? [];
                      const next = active
                        ? current.filter((x) => x !== p.value)
                        : [...current, p.value];
                      onChange({ ...filters, priority: next.length ? next : undefined });
                    }}
                    className={`rounded-full px-2.5 py-0.5 text-xs font-medium border transition-colors ${colors[p.value]}`}
                  >
                    {p.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Assigned To */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">
              Assigned To
            </label>
            <div className="flex gap-1.5">
              {[
                { value: "me" as const, label: "Me" },
                { value: "unassigned" as const, label: "Unassigned" },
              ].map((opt) => {
                const active = filters.assignedTo === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => onChange({ ...filters, assignedTo: active ? undefined : opt.value })}
                    className={`rounded-full px-2.5 py-0.5 text-xs font-medium border transition-colors ${
                      active
                        ? "bg-teal-600 text-white border-teal-600"
                        : "border-slate-200 text-slate-600 hover:border-teal-400"
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
