"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query/query-keys";
import { listGlobalOnboardingTasks } from "@/server/actions/hr/recruitment";
import type { AuthContext } from "@/lib/rbac/check";
import { Skeleton } from "@/components/ui/skeleton";
import { ERPCombobox } from "@/components/erp/combobox";
import { CheckSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";

type Props = { authContext: AuthContext };

const STATUS_OPTIONS = [
  { value: "pending", label: "Pending" },
  { value: "in_progress", label: "In Progress" },
  { value: "completed", label: "Completed" },
  { value: "blocked", label: "Blocked" },
  { value: "not_applicable", label: "Not Applicable" },
  { value: "cancelled", label: "Cancelled" },
];

const CATEGORY_OPTIONS = [
  { value: "document", label: "Document" },
  { value: "medical", label: "Medical" },
  { value: "visa", label: "Visa" },
  { value: "training", label: "Training" },
  { value: "site_access", label: "Site Access" },
  { value: "payroll", label: "Payroll" },
  { value: "it", label: "IT" },
  { value: "operations", label: "Operations" },
  { value: "hr", label: "HR" },
  { value: "other", label: "Other" },
];

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-slate-100 text-slate-700",
  in_progress: "bg-blue-100 text-blue-700",
  completed: "bg-green-100 text-green-700",
  blocked: "bg-red-100 text-red-700",
  not_applicable: "bg-gray-100 text-gray-500",
  cancelled: "bg-gray-100 text-gray-500",
};

export function GlobalOnboardingPageClient({ authContext }: Props) {
  const [statusFilter, setStatusFilter] = useState<string | null>(null);

  const { data: res, isLoading } = useQuery({
    queryKey: queryKeys.recruitment.globalOnboarding({ status: statusFilter }),
    queryFn: () => listGlobalOnboardingTasks({ status: statusFilter ?? undefined, pageSize: 100 }),
    staleTime: 30_000,
  });

  const rows = Array.isArray(res?.data?.rows) ? res.data.rows : [];

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Onboarding Tasks</h1>
          <p className="text-sm text-muted-foreground">{res?.data?.totalCount ?? 0} total</p>
        </div>
      </div>

      <div className="flex gap-2 flex-wrap">
        <ERPCombobox
          value={statusFilter}
          onValueChange={(v) => setStatusFilter(v ? String(v) : null)}
          options={[{ value: "", label: "All Statuses" }, ...STATUS_OPTIONS]}
          placeholder="Filter by status"
        />
      </div>

      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-14 rounded" />)}</div>
      ) : rows.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground text-sm">
          <CheckSquare className="h-10 w-10 mx-auto mb-2 opacity-40" />
          No onboarding tasks found.
        </div>
      ) : (
        <div className="border rounded-lg divide-y">
          {rows.map((row) => (
            <div key={row.id} className="flex items-center gap-3 p-4">
              <CheckSquare className={`h-4 w-4 flex-shrink-0 ${row.task_status === "completed" ? "text-green-500" : "text-slate-400"}`} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`text-sm font-medium ${row.task_status === "completed" ? "line-through text-muted-foreground" : ""}`}>{row.task_title}</span>
                  <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[row.task_status]}`}>{row.task_status.replace(/_/g, " ")}</span>
                  {row.task_category && <span className="text-xs text-muted-foreground capitalize">{row.task_category}</span>}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {row.candidate && `Candidate: ${row.candidate.full_name_en}`}
                  {row.due_date && ` · Due: ${row.due_date}`}
                  {row.assigned_user && ` · Assigned to: ${row.assigned_user.full_name_en ?? row.assigned_user.email}`}
                </p>
              </div>
              {row.candidate_id && (
                <Link href={`/admin/hr/recruitment/candidates/record/${row.candidate_id}`}>
                  <Button size="sm" variant="outline">View Candidate</Button>
                </Link>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
