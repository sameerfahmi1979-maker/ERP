"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { queryKeys } from "@/lib/query/query-keys";
import { listGlobalShiftAssignments, type ShiftAssignmentRow } from "@/server/actions/hr/time";
import type { AuthContext } from "@/lib/rbac/check";

type Props = {
  initialRows: ShiftAssignmentRow[];
  initialCount: number;
  authContext: AuthContext;
};

function fmtDate(d: string | null | undefined): string {
  if (!d) return "—";
  try { return format(new Date(d), "dd MMM yyyy"); } catch { return d; }
}

export function HrShiftsPageClient({ initialRows, initialCount, authContext: _authContext }: Props) {
  const [page, setPage] = useState(1);
  const pageSize = 50;

  const params = { page, page_size: pageSize };

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.hr.time.globalShiftAssignments(params),
    queryFn: async () => {
      const r = await listGlobalShiftAssignments(params);
      return r.success && r.data ? r.data : { data: initialRows, count: initialCount };
    },
    initialData: { data: initialRows, count: initialCount },
    staleTime: 30_000,
  });

  const rows = data?.data ?? [];
  const totalCount = data?.count ?? 0;
  const totalPages = Math.ceil(totalCount / pageSize);

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">{totalCount} assignments</p>

      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
      ) : rows.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground text-sm">No shift assignments found.</div>
      ) : (
        <div className="border rounded-md divide-y">
          <div className="px-4 py-2 grid grid-cols-12 text-xs font-medium text-muted-foreground bg-muted/30">
            <span className="col-span-2">Employee</span>
            <span className="col-span-3">Shift</span>
            <span className="col-span-3">Calendar</span>
            <span className="col-span-2">Effective From</span>
            <span className="col-span-1">OT</span>
            <span className="col-span-1 text-right">Link</span>
          </div>
          {rows.map((row) => (
            <div key={row.id} className="px-4 py-2.5 grid grid-cols-12 items-center text-sm gap-2">
              <span className="col-span-2 text-xs text-muted-foreground">EMP-{row.employee_id}</span>
              <span className="col-span-3 font-medium">{row.work_shift?.shift_name ?? "—"}</span>
              <span className="col-span-3 text-xs text-muted-foreground">{row.work_calendar?.calendar_name ?? "—"}</span>
              <span className="col-span-2 text-xs">{fmtDate(row.effective_from)}</span>
              <span className="col-span-1">
                {row.overtime_eligible ? <Badge variant="secondary" className="text-xs">OT</Badge> : null}
              </span>
              <div className="col-span-1 flex justify-end">
                <Link href={`/admin/hr/employees/record/${row.employee_id}?section=time`}>
                  <Button size="sm" variant="ghost" className="h-7 px-2">
                    <ExternalLink className="h-3.5 w-3.5" />
                  </Button>
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex gap-2 justify-end">
          <Button size="sm" variant="outline" disabled={page === 1} onClick={() => setPage(p => p - 1)}>Prev</Button>
          <span className="text-sm text-muted-foreground self-center">Page {page} / {totalPages}</span>
          <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Next</Button>
        </div>
      )}
    </div>
  );
}
