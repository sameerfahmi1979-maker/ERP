"use client";

import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query/query-keys";
import { listGlobalProProcesses } from "@/server/actions/hr/actions";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Globe } from "lucide-react";
import type { AuthContext } from "@/lib/rbac/check";

type Props = { authContext: AuthContext };

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-slate-100 text-slate-600",
  requested: "bg-blue-100 text-blue-700",
  in_progress: "bg-amber-100 text-amber-700",
  waiting_for_document: "bg-orange-100 text-orange-700",
  submitted: "bg-indigo-100 text-indigo-700",
  approved: "bg-emerald-100 text-emerald-700",
  rejected: "bg-red-100 text-red-700",
  cancelled: "bg-slate-100 text-slate-500",
  completed: "bg-green-100 text-green-700",
};

export function HrProProcessesPageClient({ authContext }: Props) {
  const { data: items = [], isLoading } = useQuery({
    queryKey: queryKeys.hr.actions.globalProProcesses(),
    queryFn: () => listGlobalProProcesses(),
  });

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-4">
      <div className="flex items-center gap-3">
        <Globe className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-2xl font-bold tracking-tight">PRO Processes</h1>
          <p className="text-muted-foreground text-sm">All employee PRO, government, and visa processes.</p>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
      ) : items.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">No PRO processes found.</div>
      ) : (
        <div className="rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left p-3 font-medium">Process</th>
                <th className="text-left p-3 font-medium">Status</th>
                <th className="text-left p-3 font-medium">Priority</th>
                <th className="text-left p-3 font-medium">Request Date</th>
                <th className="text-left p-3 font-medium">Target Date</th>
              </tr>
            </thead>
            <tbody>
              {items.map(item => (
                <tr key={item.id} className="border-t hover:bg-muted/30 transition-colors">
                  <td className="p-3 font-medium">{item.process_title}</td>
                  <td className="p-3">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[item.process_status] ?? "bg-slate-100 text-slate-600"}`}>
                      {item.process_status.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}
                    </span>
                  </td>
                  <td className="p-3 capitalize">{item.priority}</td>
                  <td className="p-3 text-muted-foreground">{item.request_date}</td>
                  <td className="p-3 text-muted-foreground">{item.target_date ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
