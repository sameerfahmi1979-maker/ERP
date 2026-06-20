"use client";

import Link from "next/link";
import type { DashboardSection } from "@/lib/ai/common/dashboard/types";
import { DashboardKpiCardComponent } from "./dashboard-kpi-card";
import { DashboardAlertList } from "./dashboard-alert-list";
import { DashboardPermissionEmpty } from "./dashboard-permission-empty";
import { ExternalLink } from "lucide-react";

interface Props {
  section: DashboardSection;
}

export function DashboardSectionCard({ section }: Props) {
  if (!section.hasPermission) {
    return (
      <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800">
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">{section.title}</h3>
        </div>
        <div className="p-5">
          <DashboardPermissionEmpty />
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">{section.title}</h3>
        {section.link && (
          <Link
            href={section.link.path}
            className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 transition-colors"
          >
            {section.link.label}
            <ExternalLink className="h-3 w-3" />
          </Link>
        )}
      </div>
      <div className="p-5 space-y-5">
        {section.kpis.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {section.kpis.map((kpi, i) => (
              <DashboardKpiCardComponent key={i} card={kpi} />
            ))}
          </div>
        )}
        {section.alerts.length > 0 && (
          <div>
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-2 uppercase tracking-wide">
              Top Items
            </p>
            <DashboardAlertList alerts={section.alerts} />
          </div>
        )}
        {section.kpis.length === 0 && section.alerts.length === 0 && (
          <p className="text-sm text-slate-500 dark:text-slate-400 italic">No data available.</p>
        )}
      </div>
    </div>
  );
}
