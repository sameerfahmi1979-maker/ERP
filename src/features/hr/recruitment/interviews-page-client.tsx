"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query/query-keys";
import { listGlobalInterviews } from "@/server/actions/hr/recruitment";
import type { AuthContext } from "@/lib/rbac/check";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { ERPCombobox } from "@/components/erp/combobox";
import { Calendar, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";

type Props = { authContext: AuthContext };

const STATUS_OPTIONS = [
  { value: "scheduled", label: "Scheduled" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
  { value: "no_show", label: "No Show" },
  { value: "rescheduled", label: "Rescheduled" },
];

const STATUS_COLORS: Record<string, string> = {
  scheduled: "bg-blue-100 text-blue-700",
  completed: "bg-green-100 text-green-700",
  cancelled: "bg-red-100 text-red-700",
  no_show: "bg-amber-100 text-amber-700",
  rescheduled: "bg-purple-100 text-purple-700",
};

const RESULT_COLORS: Record<string, string> = {
  pass: "bg-green-100 text-green-700",
  hold: "bg-amber-100 text-amber-700",
  fail: "bg-red-100 text-red-700",
  pending: "bg-slate-100 text-slate-700",
};

export function InterviewsPageClient({ authContext }: Props) {
  const [statusFilter, setStatusFilter] = useState<string | null>(null);

  const { data: res, isLoading } = useQuery({
    queryKey: queryKeys.recruitment.globalInterviews({ status: statusFilter }),
    queryFn: () => listGlobalInterviews({ status: statusFilter ?? undefined, pageSize: 100 }),
    staleTime: 30_000,
  });

  const rows = Array.isArray(res?.data?.rows) ? res.data.rows : [];

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Interviews</h1>
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
        <div className="space-y-2">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-16 rounded" />)}</div>
      ) : rows.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground text-sm">
          <Calendar className="h-10 w-10 mx-auto mb-2 opacity-40" />
          No interviews found.
        </div>
      ) : (
        <div className="border rounded-lg divide-y">
          {rows.map((row) => (
            <div key={row.id} className="flex items-center gap-3 p-4">
              <Calendar className="h-4 w-4 text-slate-400 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium">{row.candidate?.full_name_en ?? "Unknown"}</span>
                  {row.candidate?.candidate_code && <span className="text-xs font-mono text-muted-foreground">{row.candidate.candidate_code}</span>}
                  <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[row.interview_status]}`}>{row.interview_status}</span>
                  {row.result && <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${RESULT_COLORS[row.result]}`}>{row.result}</span>}
                  <span className="text-xs text-muted-foreground capitalize">{row.interview_round.replace(/_/g, " ")} Round</span>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {row.interview_datetime ? new Date(row.interview_datetime).toLocaleString() : "No date set"}
                  {row.interviewer && ` · Interviewer: ${row.interviewer.full_name_en ?? row.interviewer.email}`}
                  {row.interview_location && ` · ${row.interview_location}`}
                </p>
              </div>
              {row.candidate && (
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
