"use client";

import { useQuery } from "@tanstack/react-query";
import { CalendarX, AlertTriangle, Clock, HelpCircle, Bell, RefreshCw, CheckCircle2 } from "lucide-react";
import { queryKeys } from "@/lib/query/query-keys";
import { getDmsExpiryDashboardStats } from "@/server/actions/dms/expiry-reminders";

interface CardProps {
  label: string;
  count: number;
  icon: React.ElementType;
  iconClass: string;
  cardClass?: string;
}

function StatCard({ label, count, icon: Icon, iconClass, cardClass }: CardProps) {
  return (
    <div className={`rounded-lg border p-4 flex items-center gap-3 ${cardClass ?? "border-border"}`}>
      <div className={`rounded-md p-2 ${iconClass}`}>
        <Icon className="h-4 w-4" />
      </div>
      <div>
        <p className="text-2xl font-bold tabular-nums">{count}</p>
        <p className="text-xs text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}

export function DmsExpirySummaryCards() {
  const { data: stats, isLoading } = useQuery({
    queryKey: queryKeys.dms.expiryDashboardStats(),
    queryFn: async () => {
      const result = await getDmsExpiryDashboardStats();
      if (!result.success) throw new Error(result.error);
      return result.data!;
    },
    staleTime: 60_000,
  });

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-3">
        {Array.from({ length: 9 }).map((_, i) => (
          <div key={i} className="rounded-lg border border-border p-4 h-20 animate-pulse bg-muted/20" />
        ))}
      </div>
    );
  }

  const s = stats ?? {
    expired: 0, expiring_7: 0, expiring_30: 0, expiring_60: 0, expiring_90: 0,
    missing_expiry: 0, pending_reminders: 0, dismissed_reminders: 0, open_renewals: 0,
  };

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-3">
      <StatCard label="Expired" count={s.expired} icon={CalendarX}
        iconClass="bg-red-100 text-red-600 dark:bg-red-950/40 dark:text-red-400"
        cardClass="border-red-200 dark:border-red-900" />
      <StatCard label="Expiring ≤7 days" count={s.expiring_7} icon={AlertTriangle}
        iconClass="bg-orange-100 text-orange-600 dark:bg-orange-950/40 dark:text-orange-400"
        cardClass="border-orange-200 dark:border-orange-900" />
      <StatCard label="Expiring ≤30 days" count={s.expiring_30} icon={AlertTriangle}
        iconClass="bg-amber-100 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400"
        cardClass="border-amber-200 dark:border-amber-900" />
      <StatCard label="Expiring ≤60 days" count={s.expiring_60} icon={Clock}
        iconClass="bg-yellow-100 text-yellow-600 dark:bg-yellow-950/40 dark:text-yellow-400" />
      <StatCard label="Expiring ≤90 days" count={s.expiring_90} icon={Clock}
        iconClass="bg-sky-100 text-sky-600 dark:bg-sky-950/40 dark:text-sky-400" />
      <StatCard label="Missing Expiry" count={s.missing_expiry} icon={HelpCircle}
        iconClass="bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400" />
      <StatCard label="Pending Reminders" count={s.pending_reminders} icon={Bell}
        iconClass="bg-purple-100 text-purple-600 dark:bg-purple-950/40 dark:text-purple-400" />
      <StatCard label="Dismissed Reminders" count={s.dismissed_reminders} icon={CheckCircle2}
        iconClass="bg-green-100 text-green-600 dark:bg-green-950/40 dark:text-green-400" />
      <StatCard label="Open Renewals" count={s.open_renewals} icon={RefreshCw}
        iconClass="bg-blue-100 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400" />
    </div>
  );
}
