"use client";

import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query/query-keys";
import { listGlobalDisciplinaryRecords } from "@/server/actions/hr/actions";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertTriangle } from "lucide-react";
import type { AuthContext } from "@/lib/rbac/check";

type Props = { authContext: AuthContext };

const SEVERITY_COLORS: Record<string, string> = {
  low: "bg-slate-100 text-slate-600",
  medium: "bg-amber-100 text-amber-700",
  high: "bg-orange-100 text-orange-700",
  critical: "bg-red-100 text-red-700",
};

const STATUS_COLORS: Record<string, string> = {
  open: "bg-blue-100 text-blue-700",
  under_review: "bg-amber-100 text-amber-700",
  closed: "bg-slate-100 text-slate-600",
  cancelled: "bg-slate-100 text-slate-500",
};

export function HrDisciplinaryPageClient({ authContext }: Props) {
  const { data: items = [], isLoading } = useQuery({
    queryKey: queryKeys.hr.actions.globalDisciplinary(),
    queryFn: () => listGlobalDisciplinaryRecords(),
  });

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-4">
      <div className="flex items-center gap-3">
        <AlertTriangle className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Disciplinary & Warnings</h1>
          <p className="text-muted-foreground text-sm">All employee disciplinary records and warnings.</p>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
      ) : items.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">No disciplinary records found.</div>
      ) : (
        <div className="rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left p-3 font-medium">Subject</th>
                <th className="text-left p-3 font-medium">Type</th>
                <th className="text-left p-3 font-medium">Severity</th>
                <th className="text-left p-3 font-medium">Status</th>
                <th className="text-left p-3 font-medium">Record Date</th>
                <th className="text-left p-3 font-medium">Acknowledged</th>
              </tr>
            </thead>
            <tbody>
              {items.map(item => (
                <tr key={item.id} className="border-t hover:bg-muted/30 transition-colors">
                  <td className="p-3 font-medium">{item.subject}</td>
                  <td className="p-3 capitalize text-muted-foreground">{item.disciplinary_type.replace(/_/g, " ")}</td>
                  <td className="p-3">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${SEVERITY_COLORS[item.severity] ?? "bg-slate-100 text-slate-600"}`}>
                      {item.severity.charAt(0).toUpperCase() + item.severity.slice(1)}
                    </span>
                  </td>
                  <td className="p-3">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[item.status] ?? "bg-slate-100 text-slate-600"}`}>
                      {item.status.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}
                    </span>
                  </td>
                  <td className="p-3 text-muted-foreground">{item.record_date}</td>
                  <td className="p-3">{item.acknowledged_by_employee ? "Yes" : "No"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
