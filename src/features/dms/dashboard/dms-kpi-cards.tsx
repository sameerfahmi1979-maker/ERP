"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import {
  FileText,
  PlusCircle,
  Inbox,
  AlertTriangle,
  Bot,
  HardDrive,
  TrendingUp,
  TrendingDown,
  Minus,
} from "lucide-react";
import type { DmsDashboardStats } from "@/server/actions/dms/dashboard";

function formatStorage(bytes: number): string {
  if (bytes >= 1_073_741_824) return `${(bytes / 1_073_741_824).toFixed(1)} GB`;
  if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(1)} MB`;
  if (bytes >= 1_024) return `${(bytes / 1_024).toFixed(1)} KB`;
  return `${bytes} B`;
}

function trendPct(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return Math.round(((current - previous) / previous) * 100);
}

type KpiCard = {
  label: string;
  value: string;
  sub?: string;
  trend?: number | null;
  href: string;
  icon: React.ReactNode;
  iconBg: string;
  alertLevel?: "none" | "warn" | "danger";
};

type Props = {
  stats: DmsDashboardStats;
};

export function DmsKpiCards({ stats }: Props) {
  const trend = trendPct(stats.added_this_month, stats.added_last_month);

  const cards: KpiCard[] = [
    {
      label: "Total Documents",
      value: stats.total_documents.toLocaleString(),
      href: "/dms/documents",
      icon: <FileText className="h-5 w-5" />,
      iconBg: "bg-blue-100 text-blue-600",
      alertLevel: "none",
    },
    {
      label: "Added This Month",
      value: stats.added_this_month.toLocaleString(),
      sub: stats.added_last_month > 0 ? `${stats.added_last_month} last month` : undefined,
      trend,
      href: "/dms/documents",
      icon: <PlusCircle className="h-5 w-5" />,
      iconBg: "bg-emerald-100 text-emerald-600",
      alertLevel: "none",
    },
    {
      label: "Inbox Pending",
      value: stats.inbox_pending.toLocaleString(),
      sub: "awaiting processing",
      href: "/dms/inbox",
      icon: <Inbox className="h-5 w-5" />,
      iconBg:
        stats.inbox_pending > 20
          ? "bg-amber-100 text-amber-600"
          : "bg-slate-100 text-slate-500",
      alertLevel: stats.inbox_pending > 20 ? "warn" : "none",
    },
    {
      label: "Expiring ≤30 Days",
      value: stats.expiring_30_days.toLocaleString(),
      sub: "require attention",
      href: "/dms/expiring",
      icon: <AlertTriangle className="h-5 w-5" />,
      iconBg:
        stats.expiring_30_days > 0
          ? "bg-red-100 text-red-600"
          : "bg-slate-100 text-slate-500",
      alertLevel: stats.expiring_30_days > 5 ? "danger" : stats.expiring_30_days > 0 ? "warn" : "none",
    },
    {
      label: "Review Queue",
      value: stats.review_queue_pending.toLocaleString(),
      sub: "pending AI review",
      href: "/dms/review-queue",
      icon: <Bot className="h-5 w-5" />,
      iconBg:
        stats.review_queue_pending > 0
          ? "bg-violet-100 text-violet-600"
          : "bg-slate-100 text-slate-500",
      alertLevel: stats.review_queue_pending > 10 ? "warn" : "none",
    },
    {
      label: "Storage Used",
      value: formatStorage(stats.storage_bytes),
      href: "/admin/dms",
      icon: <HardDrive className="h-5 w-5" />,
      iconBg: "bg-teal-100 text-teal-600",
      alertLevel: "none",
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3">
      {cards.map((card) => (
        <Link
          key={card.label}
          href={card.href}
          className={cn(
            "group flex flex-col gap-3 rounded-xl border bg-card p-4 shadow-sm",
            "hover:shadow-md hover:border-primary/30 transition-all duration-200",
            card.alertLevel === "danger" && "border-red-200",
            card.alertLevel === "warn" && "border-amber-200"
          )}
        >
          <div className="flex items-center justify-between">
            <div className={cn("rounded-lg p-2", card.iconBg)}>{card.icon}</div>
            {card.trend != null && (
              <span
                className={cn(
                  "flex items-center gap-0.5 text-xs font-medium",
                  card.trend > 0 ? "text-emerald-600" : card.trend < 0 ? "text-red-500" : "text-slate-400"
                )}
              >
                {card.trend > 0 ? (
                  <TrendingUp className="h-3 w-3" />
                ) : card.trend < 0 ? (
                  <TrendingDown className="h-3 w-3" />
                ) : (
                  <Minus className="h-3 w-3" />
                )}
                {Math.abs(card.trend)}%
              </span>
            )}
          </div>
          <div>
            <p className="text-2xl font-bold tracking-tight">{card.value}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{card.label}</p>
            {card.sub && (
              <p className="text-xs text-muted-foreground/70 mt-0.5">{card.sub}</p>
            )}
          </div>
        </Link>
      ))}
    </div>
  );
}
