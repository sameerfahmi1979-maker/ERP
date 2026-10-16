"use client";

import { useMemo, useState } from "react";
import { ConfiguredRow, EditColumns, useListColumns, type ListColumn } from "@/components/erp/table/list-controls";
import { Input } from "@/components/ui/input";
import { usePersistentUiState } from "@/hooks/use-persistent-ui-state";
import { formatDistanceToNow, parseISO, isPast } from "date-fns";
import type { ReviewQueueItem } from "@/server/actions/dms/review-queue";
import { Button } from "@/components/ui/button";
import { Eye, AlertTriangle, Clock, ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react";
import type { SortDir } from "@/hooks/use-sort-paginate";

// ── Badge helpers ─────────────────────────────────────────────────────────────

function PriorityBadge({ priority }: { priority: string }) {
  const map: Record<string, string> = {
    urgent: "bg-red-100 text-red-700 border border-red-200 dark:bg-red-950 dark:text-red-200 dark:border-red-800",
    high:   "bg-orange-100 text-orange-700 border border-orange-200 dark:bg-orange-950 dark:text-orange-200 dark:border-orange-800",
    normal: "bg-sky-100 text-sky-700 border border-sky-200 dark:bg-sky-950 dark:text-sky-200 dark:border-sky-800",
    low:    "bg-muted text-muted-foreground border border-border",
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
    <span className="inline-flex rounded-md bg-violet-50 border border-violet-200 px-2 py-0.5 text-[10px] font-medium text-violet-700 dark:bg-violet-950 dark:border-violet-800 dark:text-violet-200">
      {labels[reviewType] ?? reviewType}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    open:       "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-200 dark:border-emerald-800",
    assigned:   "bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950 dark:text-sky-200 dark:border-sky-800",
    in_review:  "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-200 dark:border-amber-800",
    resolved:   "bg-muted text-muted-foreground border-border",
    dismissed:  "bg-muted text-muted-foreground border-border",
    superseded: "bg-muted text-muted-foreground border-border",
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
      aria-sort={active?(sortDir==="asc"?"ascending":"descending"):"none"}
      className={`px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground cursor-pointer select-none hover:text-foreground transition-colors ${className ?? ""}`}
    >
      <button type="button" onClick={() => onSort(field)} className="inline-flex items-center gap-1 focus-visible:outline-2 focus-visible:outline-primary">
        {label}
        {active ? (
          sortDir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
        ) : (
          <ArrowUpDown className="h-3 w-3 opacity-35" />
        )}
      </button>
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

const COLUMNS:ListColumn[]=[
  {
    "id": "id",
    "label": "ID",
    "width": 80,
    "visible": true,
    "required": true
  },
  {
    "id": "type",
    "label": "Priority / type",
    "width": 200,
    "visible": true,
    "required": false
  },
  {
    "id": "source",
    "label": "Source",
    "width": 220,
    "visible": true,
    "required": false
  },
  {
    "id": "reason",
    "label": "Reason",
    "width": 240,
    "visible": true,
    "required": false
  },
  {
    "id": "confidence",
    "label": "Confidence",
    "width": 110,
    "visible": true,
    "required": false
  },
  {
    "id": "status",
    "label": "Status",
    "width": 140,
    "visible": true,
    "required": false
  },
  {
    "id": "age",
    "label": "Age / due",
    "width": 170,
    "visible": true,
    "required": false
  },
  {
    "id": "actions",
    "label": "Actions",
    "width": 100,
    "visible": true,
    "required": false
  }
];

export function DmsReviewQueueTable({ items, isLoading, onViewItem }: Props) {
  const {columns,visible,setColumns}=useListColumns("dms:review-queue:v1",COLUMNS);
  const [search,setSearch]=usePersistentUiState("dms:review-queue:page-search","");
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("asc"); }
  };

  const sorted = useMemo(() => {
    const matches = items.filter(item => [String(item.id), item.reviewType, item.priority, item.reasonMessage ?? "", item.document?.document_no ?? "", item.document?.title ?? "", item.uploadSession?.session_code ?? ""].join(" ").toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));
    if (!sortKey) return matches;
    return [...matches].sort((a, b) => {
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
  }, [items, sortKey, sortDir, search]);
  if (isLoading) {
    return (
      <div className="rounded-lg border border-border bg-card p-8 text-center text-sm text-muted-foreground">
        Loading review queue…
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-card p-12 text-center">
        <div className="mx-auto mb-3 h-12 w-12 rounded-full bg-muted flex items-center justify-center">
          <Eye className="h-6 w-6 text-muted-foreground" />
        </div>
        <p className="text-sm font-medium text-muted-foreground">No review items found.</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Items appear here when AI workflows flag conditions requiring human review.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 p-3"><Input aria-label="Search current review page" placeholder="Search current page…" value={search} onChange={e=>setSearch(e.target.value)} className="sm:max-w-xs"/><EditColumns columns={columns} defaults={COLUMNS} onApply={setColumns}/><p className="w-full text-xs text-muted-foreground">{sorted.length} of {items.length} loaded items match. Keyword search and column sorting apply to this page only; use Edit filters for server-wide criteria.</p></div>
      <div role="region" aria-label="Review queue table" tabIndex={0} className="overflow-x-auto">
        <table className="w-full table-fixed text-sm" style={{minWidth:visible.reduce((sum,column)=>sum+column.width,0)}}><colgroup>{visible.map(column=><col key={column.id} style={{width:column.width}}/>)}</colgroup>
          <thead>
            <ConfiguredRow columns={columns} className="border-b border-border bg-muted text-left">
              <RQSortHeader data-column="id" field="id" label="#" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="w-8" />
              <th data-column="type" className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <span className="inline-flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => toggleSort("priority")}
                    className={`inline-flex items-center gap-1 cursor-pointer select-none hover:text-foreground transition-colors ${sortKey === "priority" ? "text-foreground" : ""}`}
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
                    className={`inline-flex items-center gap-1 cursor-pointer select-none hover:text-foreground transition-colors ${sortKey === "reviewType" ? "text-foreground" : ""}`}
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
              <th data-column="source" className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Source</th>
              <th data-column="reason" className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Reason</th>
              <RQSortHeader data-column="confidence" field="confidence" label="Conf." sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
              <RQSortHeader data-column="status" field="status" label="Status" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
              <RQSortHeader data-column="age" field="queuedAt" label="Age / Due" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
              <th data-column="actions" className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground w-16">Actions</th>
            </ConfiguredRow>
          </thead>
          <tbody>{sorted.length===0&&<tr><td colSpan={visible.length} className="p-4 text-center">No items on this page match your search.</td></tr>}
            {sorted.map((item) => {
              const isOverdue = item.dueAt && isPast(parseISO(item.dueAt));
              return (
                <ConfiguredRow columns={columns} key={item.id} className="border-b border-border hover:bg-muted/60 transition-colors">
                  <td data-column="id" className="px-4 py-3 text-xs text-muted-foreground font-mono">
                    {item.id}
                  </td>
                  <td data-column="type" className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      <PriorityBadge priority={item.priority} />
                      <ReviewTypeBadge reviewType={item.reviewType} />
                    </div>
                  </td>
                  <td data-column="source" className="px-4 py-3 text-xs text-muted-foreground max-w-[160px] truncate">
                    {item.document?.document_no
                      ? <span className="font-mono">{item.document.document_no}</span>
                      : item.uploadSession?.session_code
                      ? <span className="font-mono text-violet-600 dark:text-violet-300">{item.uploadSession.session_code}</span>
                      : item.reviewType === "metadata_definition_suggestions_review"
                      ? <span className="font-mono text-purple-600 dark:text-purple-300">
                          {String(item.payloadJson?.document_type_code ?? item.sourceId ?? "—")}
                        </span>
                      : <span className="text-muted-foreground">—</span>
                    }
                    {item.document?.title && (
                      <div className="text-muted-foreground truncate max-w-[140px]">{item.document.title}</div>
                    )}
                    {item.reviewType === "metadata_definition_suggestions_review" && Boolean(item.payloadJson?.document_type_name) && (
                      <div className="text-muted-foreground truncate max-w-[140px]">
                        {String(item.payloadJson?.document_type_name)}
                      </div>
                    )}
                  </td>
                  <td data-column="reason" className="px-4 py-3 text-xs text-muted-foreground max-w-[200px]">
                    <div className="truncate">
                      {item.reasonMessage
                        ? item.reasonMessage.slice(0, 80) + (item.reasonMessage.length > 80 ? "…" : "")
                        : item.reasonCode ?? "—"}
                    </div>
                    {item.fieldCode && (
                      <span className="inline-block mt-0.5 rounded bg-muted px-1 text-[10px] font-mono text-muted-foreground">
                        {item.fieldCode}
                      </span>
                    )}
                  </td>
                  <td data-column="confidence" className="px-4 py-3 text-xs tabular-nums text-muted-foreground">
                    {item.confidence != null
                      ? `${(item.confidence * 100).toFixed(0)}%`
                      : "—"}
                  </td>
                  <td data-column="status" className="px-4 py-3">
                    <StatusBadge status={item.status} />
                    {item.assignedUser?.full_name && (
                      <div className="mt-0.5 text-[10px] text-muted-foreground truncate max-w-[80px]">
                        {item.assignedUser.full_name}
                      </div>
                    )}
                  </td>
                  <td data-column="age" className="px-4 py-3 text-xs text-muted-foreground">
                    <div>
                      {formatDistanceToNow(parseISO(item.queuedAt), { addSuffix: true })}
                    </div>
                    {item.dueAt && (
                      <div className={`flex items-center gap-0.5 ${isOverdue ? "text-red-600 font-medium dark:text-red-300" : "text-muted-foreground"}`}>
                        <Clock className="h-2.5 w-2.5" />
                        {isOverdue ? "Overdue" : formatDistanceToNow(parseISO(item.dueAt), { addSuffix: true })}
                      </div>
                    )}
                  </td>
                  <td data-column="actions" className="px-4 py-3">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs"
                      aria-label={`View review item ${item.id}`} onClick={() => onViewItem(item)}
                    >
                      <Eye className="h-3.5 w-3.5" />
                    </Button>
                  </td>
                </ConfiguredRow>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
