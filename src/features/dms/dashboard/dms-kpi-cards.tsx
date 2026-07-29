"use client";

import Link from "next/link";
import { AreaChart, Area, ResponsiveContainer } from "recharts";
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
import type { DmsDashboardStats, DmsDocumentsByDay } from "@/server/actions/dms/dashboard";

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

type Accent = "blue" | "emerald" | "amber" | "red" | "violet" | "teal" | "slate";

const ACCENT_BAR: Record<Accent, string> = {
  blue: "bg-blue-500",
  emerald: "bg-emerald-500",
  amber: "bg-amber-500",
  red: "bg-red-500",
  violet: "bg-violet-500",
  teal: "bg-teal-500",
  slate: "bg-slate-300",
};

const ACCENT_ICON: Record<Accent, string> = {
  blue: "text-blue-600",
  emerald: "text-emerald-600",
  amber: "text-amber-600",
  red: "text-red-600",
  violet: "text-violet-600",
  teal: "text-teal-600",
  slate: "text-slate-400",
};

type KpiCard = {
  label: string;
  value: string;
  sub?: string;
  trend?: number | null;
  href: string;
  icon: React.ReactNode;
  accent: Accent;
  sparkline?: boolean;
};

type Props = {
  stats: DmsDashboardStats;
  sparklineData?: DmsDocumentsByDay[];
};

export function DmsKpiCards({ stats, sparklineData }: Props) {
  const trend = trendPct(stats.added_this_month, stats.added_last_month);

  const cards: KpiCard[] = [
    {
      label: "Total Documents",
      value: stats.total_documents.toLocaleString(),
      sub: "in the repository",
      href: "/dms/documents",
      icon: <FileText className="h-4 w-4" />,
      accent: "blue",
      sparkline: true,
    },
    {
      label: "Added This Month",
      value: stats.added_this_month.toLocaleString(),
      sub: stats.added_last_month > 0 ? `vs ${stats.added_last_month} last month` : "no prior data",
      trend,
      href: "/dms/documents",
      icon: <PlusCircle className="h-4 w-4" />,
      accent: "emerald",
    },
    {
      label: "Inbox Pending",
      value: stats.inbox_pending.toLocaleString(),
      sub: "awaiting processing",
      href: "/dms/inbox",
      icon: <Inbox className="h-4 w-4" />,
      accent: stats.inbox_pending > 20 ? "amber" : "slate",
    },
    {
      label: "Expiring ≤30 Days",
      value: stats.expiring_30_days.toLocaleString(),
      sub: "require attention",
      href: "/dms/expiring",
      icon: <AlertTriangle className="h-4 w-4" />,
      accent: stats.expiring_30_days > 5 ? "red" : stats.expiring_30_days > 0 ? "amber" : "slate",
    },
    {
      label: "Review Queue",
      value: stats.review_queue_pending.toLocaleString(),
      sub: "pending AI review",
      href: "/dms/review-queue",
      icon: <Bot className="h-4 w-4" />,
      accent: stats.review_queue_pending > 10 ? "violet" : "slate",
    },
    {
      label: "Storage Used",
      value: formatStorage(stats.storage_bytes),
      sub: "across all documents",
      href: "/admin/dms",
      icon: <HardDrive className="h-4 w-4" />,
      accent: "teal",
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3">
      {cards.map((card) => (
        <Link
          key={card.label}
          href={card.href}
          className={cn(
            "group relative flex flex-col overflow-hidden rounded-xl border bg-card shadow-sm",
            "hover:shadow-md hover:-translate-y-0.5 transition-all duration-200"
          )}
        >
          <span className={cn("absolute inset-y-0 left-0 w-1", ACCENT_BAR[card.accent])} />
          <div className="flex flex-1 flex-col gap-2.5 p-4 pl-5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                {card.label}
              </span>
              <span className={cn("shrink-0", ACCENT_ICON[card.accent])}>{card.icon}</span>
            </div>

            <div className="flex items-end justify-between gap-2">
              <p className="text-2xl font-bold tracking-tight tabular-nums leading-none">
                {card.value}
              </p>
              {card.trend != null && (
                <span
                  className={cn(
                    "mb-0.5 flex items-center gap-0.5 text-[11px] font-medium",
                    card.trend > 0
                      ? "text-emerald-600"
                      : card.trend < 0
                      ? "text-red-500"
                      : "text-slate-400"
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

            {card.sub && <p className="text-[11px] text-muted-foreground/80">{card.sub}</p>}

            {card.sparkline && sparklineData && sparklineData.length > 1 && (
              <div className="-mx-1 -mb-1 mt-auto h-8 opacity-70 group-hover:opacity-100 transition-opacity">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={sparklineData} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="kpiSparkline" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(217 91% 60%)" stopOpacity={0.35} />
                        <stop offset="95%" stopColor="hsl(217 91% 60%)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <Area
                      type="monotone"
                      dataKey="count"
                      stroke="hsl(217 91% 60%)"
                      strokeWidth={1.5}
                      fill="url(#kpiSparkline)"
                      dot={false}
                      isAnimationActive={false}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </Link>
      ))}
    </div>
  );
}
