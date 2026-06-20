"use client";

import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query/query-keys";
import { listGlobalEosCases } from "@/server/actions/hr/actions";
import { Skeleton } from "@/components/ui/skeleton";
import { UserMinus } from "lucide-react";
import type { AuthContext } from "@/lib/rbac/check";

type Props = { authContext: AuthContext };

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-slate-100 text-slate-600",
  notice_served: "bg-orange-100 text-orange-700",
  clearance_in_progress: "bg-indigo-100 text-indigo-700",
  pending_final_settlement: "bg-purple-100 text-purple-700",
  closed: "bg-slate-100 text-slate-500",
  cancelled: "bg-slate-100 text-slate-400",
};

export function HrEosPageClient({ authContext }: Props) {
  const { data: items = [], isLoading } = useQuery({
    queryKey: queryKeys.hr.actions.globalEosCases(),
    queryFn: () => listGlobalEosCases(),
  });

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-4">
      <div className="flex items-center gap-3">
        <UserMinus className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-2xl font-bold tracking-tight">EOS & Clearance</h1>
          <p className="text-muted-foreground text-sm">All end-of-service cases. Financial settlement is handled by Finance.</p>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
      ) : items.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">No EOS cases found.</div>
      ) : (
        <div className="rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left p-3 font-medium">EOS Type</th>
                <th className="text-left p-3 font-medium">Status</th>
                <th className="text-left p-3 font-medium">Notice Date</th>
                <th className="text-left p-3 font-medium">Last Working Date</th>
                <th className="text-left p-3 font-medium">Settlement</th>
                <th className="text-left p-3 font-medium">Clearance</th>
              </tr>
            </thead>
            <tbody>
              {items.map(item => (
                <tr key={item.id} className="border-t hover:bg-muted/30 transition-colors">
                  <td className="p-3 font-medium capitalize">{item.eos_type.replace(/_/g, " ")}</td>
                  <td className="p-3">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[item.case_status] ?? "bg-slate-100 text-slate-600"}`}>
                      {item.case_status.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}
                    </span>
                  </td>
                  <td className="p-3 text-muted-foreground">{item.notice_date ?? "—"}</td>
                  <td className="p-3 text-muted-foreground">{item.last_working_date ?? "—"}</td>
                  <td className="p-3 text-muted-foreground capitalize">{item.final_settlement_status.replace(/_/g, " ")}</td>
                  <td className="p-3">{item.clearance_completed ? <span className="text-green-600 font-medium">Completed</span> : <span className="text-muted-foreground">Pending</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
