"use client";

import Link from "next/link";
import { formatDistanceToNow, format, parseISO, differenceInDays } from "date-fns";
import { cn } from "@/lib/utils";
import { Inbox, AlertTriangle, RefreshCw, ArrowRight, FileText, CheckCircle2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type {
  DmsInboxPendingRow,
  DmsExpiringRow,
  DmsRenewalRow,
} from "@/server/actions/dms/dashboard";

function PanelShell({
  accent,
  icon,
  title,
  count,
  href,
  children,
}: {
  accent: "amber" | "red" | "blue";
  icon: React.ReactNode;
  title: string;
  count: number;
  href: string;
  children: React.ReactNode;
}) {
  const topBar = {
    amber: "bg-amber-500",
    red: "bg-red-500",
    blue: "bg-blue-500",
  }[accent];
  const badgeCls = {
    amber: "bg-amber-50 text-amber-700 border-amber-200",
    red: "bg-red-50 text-red-700 border-red-200",
    blue: "bg-blue-50 text-blue-700 border-blue-200",
  }[accent];

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-xl border bg-card shadow-sm">
      <span className={cn("block h-1 w-full", topBar)} />
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <div className="flex items-center gap-2 text-sm font-semibold">
          {icon}
          {title}
          {count > 0 && (
            <Badge variant="outline" className={cn("text-[10px] font-semibold px-1.5", badgeCls)}>
              {count}
            </Badge>
          )}
        </div>
        <Link
          href={href}
          className="text-xs text-muted-foreground hover:text-primary transition-colors flex items-center gap-1"
        >
          View all <ArrowRight className="h-3 w-3" />
        </Link>
      </div>
      <div className="flex-1 divide-y divide-border overflow-y-auto">{children}</div>
    </div>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-1.5 py-8 text-center">
      <CheckCircle2 className="h-5 w-5 text-emerald-500/70" />
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

// ── Inbox Panel ────────────────────────────────────────────────────────────────

type InboxPanelProps = { items: DmsInboxPendingRow[] };

export function DmsInboxPanel({ items }: InboxPanelProps) {
  return (
    <PanelShell
      accent="amber"
      icon={<Inbox className="h-4 w-4 text-amber-500" />}
      title="Inbox Needs Processing"
      count={items.length}
      href="/dms/inbox"
    >
      {items.length === 0 ? (
        <EmptyState label="Inbox is clear — nothing pending" />
      ) : (
        items.map((item) => (
          <Link
            key={item.id}
            href={`/dms/inbox`}
            className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/40 transition-colors"
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
    </PanelShell>
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
    <PanelShell
      accent="red"
      icon={<AlertTriangle className="h-4 w-4 text-red-500" />}
      title="Expiring This Week"
      count={items.length}
      href="/dms/expiring"
    >
      {items.length === 0 ? (
        <EmptyState label="Nothing expiring this week" />
      ) : (
        items.map((item) => (
          <Link
            key={item.id}
            href={`/dms/documents/record/${item.id}`}
            className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/40 transition-colors"
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
    </PanelShell>
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
    <PanelShell
      accent="blue"
      icon={<RefreshCw className="h-4 w-4 text-blue-500" />}
      title="Active Renewals"
      count={items.length}
      href="/dms/renewals"
    >
      {items.length === 0 ? (
        <EmptyState label="No active renewals in progress" />
      ) : (
        items.map((item) => (
          <div key={item.id} className="flex items-center gap-3 px-4 py-2.5">
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
    </PanelShell>
  );
}
