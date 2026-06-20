"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { MapPin, Search } from "lucide-react";
import Link from "next/link";
import { queryKeys } from "@/lib/query/query-keys";
import { listGlobalEmployeeAssignments } from "@/server/actions/hr/operations";
import type { AssignmentStatus } from "@/lib/hr/operations/status";
import { getAssignmentStatusBadge } from "@/lib/hr/operations/status";

const PAGE_SIZE = 50;

export function HrAssignmentsPageClient() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("active");
  const [page, setPage] = useState(0);

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.hr.operations.globalAssignments({ status: statusFilter, page }),
    queryFn: () =>
      listGlobalEmployeeAssignments({
        status: statusFilter || undefined,
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
      }),
  });

  const result = data?.success ? data.data : { data: [], count: 0 };
  const assignments = result.data as Record<string, unknown>[];
  const count = result.count;
  const totalPages = Math.ceil(count / PAGE_SIZE);

  const filtered = search
    ? assignments.filter((a) => {
        const emp = a.employees as Record<string, unknown> | null;
        return (
          String(emp?.full_name_en ?? "").toLowerCase().includes(search.toLowerCase()) ||
          String(emp?.employee_code ?? "").toLowerCase().includes(search.toLowerCase())
        );
      })
    : assignments;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <MapPin className="h-6 w-6" />
          Employee Assignments
        </h1>
        <p className="text-muted-foreground mt-1">All employee operational assignments</p>
      </div>

      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name or code..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8"
          />
        </div>
        <div className="flex gap-2">
          {["active", "planned", "completed", ""].map((s) => (
            <Button
              key={s}
              size="sm"
              variant={statusFilter === s ? "default" : "outline"}
              onClick={() => { setStatusFilter(s); setPage(0); }}
            >
              {s || "All"}
            </Button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">No assignments found</div>
      ) : (
        <div className="rounded-lg border divide-y">
          {filtered.map((a) => {
            const emp = a.employees as Record<string, unknown> | null;
            const dept = (a.departments as Record<string, unknown> | null)?.name_en;
            const desg = (a.designations as Record<string, unknown> | null)?.name_en;
            const site = (a.work_sites as Record<string, unknown> | null)?.name_en;
                    const badge = getAssignmentStatusBadge(a.assignment_status as AssignmentStatus);
            return (
              <div key={a.id as number} className="flex items-center justify-between px-4 py-3 hover:bg-muted/30">
                <div className="flex items-center gap-4 min-w-0">
                  <Badge variant={badge.variant} className="shrink-0">{badge.label}</Badge>
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">
                      {String(emp?.full_name_en ?? "—")}
                      <span className="text-muted-foreground ml-2 text-xs">{String(emp?.employee_code ?? "")}</span>
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {[dept, desg, site].filter(Boolean).join(" · ") || "No details"}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-4 shrink-0">
                  <span className="text-xs text-muted-foreground">
                    {String(a.effective_from)} {a.effective_to ? `→ ${String(a.effective_to)}` : "→ ongoing"}
                  </span>
                  <Link href={`/admin/hr/employees/${(emp as Record<string, unknown>)?.id}`}>
                    <Button size="sm" variant="ghost">View</Button>
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            {count} total · Page {page + 1} of {totalPages}
          </p>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Previous</Button>
            <Button size="sm" variant="outline" disabled={page >= totalPages - 1} onClick={() => setPage((p) => p + 1)}>Next</Button>
          </div>
        </div>
      )}
    </div>
  );
}
