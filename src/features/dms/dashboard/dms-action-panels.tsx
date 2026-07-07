"use client";

import Link from "next/link";
import { formatDistanceToNow, format, parseISO, differenceInDays } from "date-fns";
import { cn } from "@/lib/utils";
import { Inbox, AlertTriangle, RefreshCw, ExternalLink, FileText } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type {
  DmsInboxPendingRow,
  DmsExpiringRow,
  DmsRenewalRow,
} from "@/server/actions/dms/dashboard";

// ── Inbox Panel ────────────────────────────────────────────────────────────────

type InboxPanelProps = { items: DmsInboxPendingRow[] };

export function DmsInboxPanel({ items }: InboxPanelProps) {
  return (
    <div className="rounded-xl border bg-card shadow-sm flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Inbox className="h-4 w-4 text-amber-500" />
          Inbox Needs Processing
        </div>
        <Link
          href="/dms/inbox"
          className="text-xs text-muted-foreground hover:text-primary transition-colors flex items-center gap-1"
        >
          View all <ExternalLink className="h-3 w-3" />
        </Link>
      </div>
      <div className="flex-1 divide-y divide-border">
        {items.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-6">
            No pending inbox items
          </p>
        ) : (
          items.map((item) => (
            <Link
              key={item.id}
              href={`/dms/inbox`}
              className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/30 transition-colors"
            >
              <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium truncate">{item.original_filename}</p>
                <p className="text-[11px] text-muted-foreground">
                  {formatDistanceToNow(new Date(item.created_at), { addSuffix: true })}
                </p>
              </div>
              <Badge
                variant="outline"
                className="text-[10px] bg-amber-50 text-amber-700 border-amber-200 shrink-0"
              >
                {item.intake_status === "pending" ? "Pending" : "Processing"}
              </Badge>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}

// ── Expiring Panel ─────────────────────────────────────────────────────────────

type ExpiringPanelProps = { items: DmsExpiringRow[] };

function expiryBadge(dateStr: string) {
  const days = differenceInDays(parseISO(dateStr), new Date());
  const label = days <= 0 ? "Today" : days === 1 ? "1 day" : `${days}d`;
  return (
    <Badge
      variant="outline"
      className={cn(
        "text-[10px] shrink-0",
        days <= 0
          ? "bg-red-100 text-red-700 border-red-200"
          : days <= 3
          ? "bg-orange-100 text-orange-700 border-orange-200"
          : "bg-amber-50 text-amber-700 border-amber-200"
      )}
    >
      {label}
    </Badge>
  );
}

export function DmsExpiringPanel({ items }: ExpiringPanelProps) {
  return (
    <div className="rounded-xl border bg-card shadow-sm flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <AlertTriangle className="h-4 w-4 text-red-500" />
          Expiring This Week
        </div>
        <Link
          href="/dms/expiring"
          className="text-xs text-muted-foreground hover:text-primary transition-colors flex items-center gap-1"
        >
          View all <ExternalLink className="h-3 w-3" />
        </Link>
      </div>
      <div className="flex-1 divide-y divide-border">
        {items.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-6">
            No documents expiring this week
          </p>
        ) : (
          items.map((item) => (
            <Link
              key={item.id}
              href={`/dms/documents/record/${item.id}`}
              className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/30 transition-colors"
            >
              <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium truncate">{item.title}</p>
                <p className="text-[11px] text-muted-foreground">
                  {item.document_type_name ?? item.document_no} ·{" "}
                  {format(parseISO(item.expiry_date), "dd MMM yyyy")}
                </p>
              </div>
              {expiryBadge(item.expiry_date)}
            </Link>
          ))
        )}
      </div>
    </div>
  );
}

// ── Renewals Panel ─────────────────────────────────────────────────────────────

const PRIORITY_STYLES: Record<string, string> = {
  urgent: "bg-red-100 text-red-700 border-red-200",
  high: "bg-orange-100 text-orange-700 border-orange-200",
  medium: "bg-amber-50 text-amber-700 border-amber-200",
  low: "bg-slate-100 text-slate-600 border-slate-200",
};

const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  requested: "Requested",
  in_progress: "In Progress",
  waiting_for_document: "Waiting",
};

type RenewalsPanelProps = { items: DmsRenewalRow[] };

export function DmsRenewalsPanel({ items }: RenewalsPanelProps) {
  return (
    <div className="rounded-xl border bg-card shadow-sm flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <RefreshCw className="h-4 w-4 text-blue-500" />
          Active Renewals
        </div>
        <Link
          href="/dms/renewals"
          className="text-xs text-muted-foreground hover:text-primary transition-colors flex items-center gap-1"
        >
          View all <ExternalLink className="h-3 w-3" />
        </Link>
      </div>
      <div className="flex-1 divide-y divide-border">
        {items.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-6">
            No active renewals
          </p>
        ) : (
          items.map((item) => (
            <div
              key={item.id}
              className="flex items-center gap-3 px-4 py-2.5"
            >
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium truncate">{item.document_title}</p>
                <p className="text-[11px] text-muted-foreground">
                  {item.renewal_no} · {STATUS_LABELS[item.status] ?? item.status}
                  {item.assigned_to_name ? ` · ${item.assigned_to_name}` : ""}
                </p>
              </div>
              {item.priority && (
                <Badge
                  variant="outline"
                  className={cn(
                    "text-[10px] shrink-0 capitalize",
                    PRIORITY_STYLES[item.priority] ?? "bg-slate-100 text-slate-600"
                  )}
                >
                  {item.priority}
                </Badge>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
