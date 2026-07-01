"use client";

import { useMemo, useState } from "react";
import { formatDistanceToNow, parseISO, isPast } from "date-fns";
import type { ReviewQueueItem } from "@/server/actions/dms/review-queue";
import { Button } from "@/components/ui/button";
import { Eye, AlertTriangle, Clock, ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react";
import type { SortDir } from "@/hooks/use-sort-paginate";

// ── Badge helpers ─────────────────────────────────────────────────────────────

function PriorityBadge({ priority }: { priority: string }) {
  const map: Record<string, string> = {
    urgent: "bg-red-100 text-red-700 border border-red-200",
    high:   "bg-orange-100 text-orange-700 border border-orange-200",
    normal: "bg-sky-100 text-sky-700 border border-sky-200",
    low:    "bg-slate-100 text-slate-500 border border-slate-200",
  };
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${map[priority] ?? map.normal}`}>
      {priority === "urgent" && <AlertTriangle className="h-2.5 w-2.5" />}
      {priority}
    </span>
  );
}

function ReviewTypeBadge({ reviewType }: { reviewType: string }) {
  const labels: Record<string, string> = {
    intake_classification_review:  "Intake Class.",
    intake_metadata_review:        "Intake Meta.",
    ai_analysis_metadata_review:   "AI Analysis",
    ocr_failure_review:            "OCR Failure",
    semantic_index_review:         "Semantic",
    ai_job_failure_review:         "Job Failure",
    metadata_definition_suggestions_review: "AI Metadata Suggest.",
  };
  return (
    <span className="inline-flex rounded-md bg-violet-50 border border-violet-200 px-2 py-0.5 text-[10px] font-medium text-violet-700">
      {labels[reviewType] ?? reviewType}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    open:       "bg-emerald-50 text-emerald-700 border-emerald-200",
    assigned:   "bg-sky-50 text-sky-700 border-sky-200",
    in_review:  "bg-amber-50 text-amber-700 border-amber-200",
    resolved:   "bg-slate-100 text-slate-500 border-slate-200",
    dismissed:  "bg-slate-100 text-slate-400 border-slate-200",
    superseded: "bg-slate-100 text-slate-400 border-slate-200",
  };
  const labels: Record<string, string> = {
    open:       "Open",
    assigned:   "Assigned",
    in_review:  "In Review",
    resolved:   "Resolved",
    dismissed:  "Dismissed",
    superseded: "Superseded",
  };
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide border ${map[status] ?? map.open}`}>
      {labels[status] ?? status}
    </span>
  );
}

// ── Sort header ───────────────────────────────────────────────────────────────

type SortKey = "id" | "priority" | "reviewType" | "confidence" | "status" | "queuedAt" | "dueAt";

function RQSortHeader({
  field, label, sortKey, sortDir, onSort, className,
}: {
  field: SortKey;
  label: string;
  sortKey: SortKey | null;
  sortDir: SortDir;
  onSort: (k: SortKey) => void;
  className?: string;
}) {
  const active = sortKey === field;
  return (
    <th
      onClick={() => onSort(field)}
      className={`px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500 cursor-pointer select-none hover:text-slate-800 transition-colors ${className ?? ""}`}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {active ? (
          sortDir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
        ) : (
          <ArrowUpDown className="h-3 w-3 opacity-35" />
        )}
      </span>
    </th>
  );
}

// ── Table ─────────────────────────────────────────────────────────────────────

interface Props {
  items:       ReviewQueueItem[];
  isLoading:   boolean;
  onViewItem:  (item: ReviewQueueItem) => void;
  canManage:   boolean;
}

const PRIORITY_ORDER: Record<string, number> = { urgent: 0, high: 1, normal: 2, low: 3 };

export function DmsReviewQueueTable({ items, isLoading, onViewItem }: Props) {
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("asc"); }
  };

  const sorted = useMemo(() => {
    if (!sortKey) return items;
    return [...items].sort((a, b) => {
      let cmp = 0;
      if (sortKey === "id") cmp = a.id - b.id;
      else if (sortKey === "priority") cmp = (PRIORITY_ORDER[a.priority] ?? 99) - (PRIORITY_ORDER[b.priority] ?? 99);
      else if (sortKey === "reviewType") cmp = a.reviewType.localeCompare(b.reviewType);
      else if (sortKey === "confidence") cmp = (a.confidence ?? -1) - (b.confidence ?? -1);
      else if (sortKey === "status") cmp = a.status.localeCompare(b.status);
      else if (sortKey === "queuedAt") cmp = a.queuedAt.localeCompare(b.queuedAt);
      else if (sortKey === "dueAt") cmp = (a.dueAt ?? "").localeCompare(b.dueAt ?? "");
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [items, sortKey, sortDir]);
  if (isLoading) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
        Loading review queue…
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-12 text-center">
        <div className="mx-auto mb-3 h-12 w-12 rounded-full bg-slate-100 flex items-center justify-center">
          <Eye className="h-6 w-6 text-slate-400" />
        </div>
        <p className="text-sm font-medium text-slate-600">No review items found.</p>
        <p className="mt-1 text-xs text-slate-400">
          Items appear here when AI workflows flag conditions requiring human review.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50 text-left">
              <RQSortHeader field="id" label="#" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="w-8" />
              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <span className="inline-flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => toggleSort("priority")}
                    className={`inline-flex items-center gap-1 cursor-pointer select-none hover:text-slate-800 transition-colors ${sortKey === "priority" ? "text-slate-800" : ""}`}
                  >
                    Priority
                    {sortKey === "priority" ? (
                      sortDir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
                    ) : (
                      <ArrowUpDown className="h-3 w-3 opacity-35" />
                    )}
                  </button>
                  <span className="text-slate-300">/</span>
                  <button
                    type="button"
                    onClick={() => toggleSort("reviewType")}
                    className={`inline-flex items-center gap-1 cursor-pointer select-none hover:text-slate-800 transition-colors ${sortKey === "reviewType" ? "text-slate-800" : ""}`}
                  >
                    Type
                    {sortKey === "reviewType" ? (
                      sortDir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
                    ) : (
                      <ArrowUpDown className="h-3 w-3 opacity-35" />
                    )}
                  </button>
                </span>
              </th>
              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Source</th>
              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Reason</th>
              <RQSortHeader field="confidence" label="Conf." sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
              <RQSortHeader field="status" label="Status" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
              <RQSortHeader field="queuedAt" label="Age / Due" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500 w-16">Actions</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((item) => {
              const isOverdue = item.dueAt && isPast(parseISO(item.dueAt));
              return (
                <tr key={item.id} className="border-b border-slate-50 hover:bg-slate-50/60 transition-colors">
                  <td className="px-4 py-3 text-xs text-slate-400 font-mono">
                    {item.id}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      <PriorityBadge priority={item.priority} />
                      <ReviewTypeBadge reviewType={item.reviewType} />
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-600 max-w-[160px] truncate">
                    {item.document?.document_no
                      ? <span className="font-mono">{item.document.document_no}</span>
                      : item.uploadSession?.session_code
                      ? <span className="font-mono text-violet-600">{item.uploadSession.session_code}</span>
                      : item.reviewType === "metadata_definition_suggestions_review"
                      ? <span className="font-mono text-purple-600">
                          {String(item.payloadJson?.document_type_code ?? item.sourceId ?? "—")}
                        </span>
                      : <span className="text-slate-400">—</span>
                    }
                    {item.document?.title && (
                      <div className="text-slate-400 truncate max-w-[140px]">{item.document.title}</div>
                    )}
                    {item.reviewType === "metadata_definition_suggestions_review" && Boolean(item.payloadJson?.document_type_name) && (
                      <div className="text-slate-400 truncate max-w-[140px]">
                        {String(item.payloadJson?.document_type_name)}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-600 max-w-[200px]">
                    <div className="truncate">
                      {item.reasonMessage
                        ? item.reasonMessage.slice(0, 80) + (item.reasonMessage.length > 80 ? "…" : "")
                        : item.reasonCode ?? "—"}
                    </div>
                    {item.fieldCode && (
                      <span className="inline-block mt-0.5 rounded bg-slate-100 px-1 text-[10px] font-mono text-slate-500">
                        {item.fieldCode}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs tabular-nums text-slate-600">
                    {item.confidence != null
                      ? `${(item.confidence * 100).toFixed(0)}%`
                      : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={item.status} />
                    {item.assignedUser?.full_name && (
                      <div className="mt-0.5 text-[10px] text-slate-400 truncate max-w-[80px]">
                        {item.assignedUser.full_name}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500">
                    <div>
                      {formatDistanceToNow(parseISO(item.queuedAt), { addSuffix: true })}
                    </div>
                    {item.dueAt && (
                      <div className={`flex items-center gap-0.5 ${isOverdue ? "text-red-600 font-medium" : "text-slate-400"}`}>
                        <Clock className="h-2.5 w-2.5" />
                        {isOverdue ? "Overdue" : formatDistanceToNow(parseISO(item.dueAt), { addSuffix: true })}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs"
                      onClick={() => onViewItem(item)}
                    >
                      <Eye className="h-3.5 w-3.5" />
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
