"use client";

import Link from "next/link";
import type { DashboardAlertItem } from "@/lib/ai/common/dashboard/types";
import { cn } from "@/lib/utils";
import { AlertTriangle, AlertCircle, Info } from "lucide-react";

interface Props {
  alerts: DashboardAlertItem[];
}

export function DashboardAlertList({ alerts }: Props) {
  if (alerts.length === 0) {
    return <p className="text-xs text-slate-500 dark:text-slate-400 italic">No items to show.</p>;
  }

  return (
    <ul className="divide-y divide-slate-100 dark:divide-slate-800">
      {alerts.map((item) => {
        const Icon =
          item.severity === "critical"
            ? AlertCircle
            : item.severity === "warning"
            ? AlertTriangle
            : Info;

        const iconClass =
          item.severity === "critical"
            ? "text-red-500"
            : item.severity === "warning"
            ? "text-amber-500"
            : "text-blue-400";

        const inner = (
          <div className="flex items-start gap-2 py-2 px-1 hover:bg-slate-50 dark:hover:bg-slate-800/50 rounded">
            <Icon className={cn("h-4 w-4 mt-0.5 flex-shrink-0", iconClass)} />
            <div className="min-w-0">
              <p className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">
                {item.label}
              </p>
              {item.sublabel && (
                <p className="text-xs text-slate-500 dark:text-slate-400">{item.sublabel}</p>
              )}
            </div>
          </div>
        );

        return (
          <li key={item.id}>
            {item.navigationPath ? (
              <Link href={item.navigationPath} className="block">
                {inner}
              </Link>
            ) : (
              inner
            )}
          </li>
        );
      })}
    </ul>
  );
}
