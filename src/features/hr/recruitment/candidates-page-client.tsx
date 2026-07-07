"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query/query-keys";
import { listCandidates } from "@/server/actions/hr/recruitment";
import type { AuthContext } from "@/lib/rbac/check";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ERPCombobox } from "@/components/erp/combobox";
import { Plus, Users, ArrowRight, Mail, Phone } from "lucide-react";
import Link from "next/link";
import { useRealtimeSync } from "@/hooks/realtime/use-realtime-sync";
import { invalidateHrCandidates } from "@/lib/query/invalidation";

type Props = { authContext: AuthContext };

const STATUS_OPTIONS = [
  { value: "new", label: "New" },
  { value: "screening", label: "Screening" },
  { value: "shortlisted", label: "Shortlisted" },
  { value: "interview", label: "Interview" },
  { value: "selected", label: "Selected" },
  { value: "offered", label: "Offered" },
  { value: "accepted", label: "Accepted" },
  { value: "rejected", label: "Rejected" },
  { value: "withdrawn", label: "Withdrawn" },
  { value: "hired", label: "Hired" },
  { value: "blacklisted", label: "Blacklisted" },
];

const PIPELINE_OPTIONS = [
  { value: "new", label: "New" },
  { value: "screening", label: "Screening" },
  { value: "shortlisted", label: "Shortlisted" },
  { value: "interview", label: "Interview" },
  { value: "offer", label: "Offer" },
  { value: "onboarding", label: "Onboarding" },
  { value: "hired", label: "Hired" },
  { value: "closed", label: "Closed" },
];

const STATUS_COLORS: Record<string, string> = {
  new: "bg-slate-100 text-slate-700",
  screening: "bg-blue-100 text-blue-700",
  shortlisted: "bg-cyan-100 text-cyan-700",
  interview: "bg-indigo-100 text-indigo-700",
  selected: "bg-green-100 text-green-700",
  offered: "bg-emerald-100 text-emerald-700",
  accepted: "bg-green-100 text-green-700",
  rejected: "bg-red-100 text-red-700",
  withdrawn: "bg-amber-100 text-amber-700",
  hired: "bg-green-200 text-green-800",
  blacklisted: "bg-red-200 text-red-800",
};

export function CandidatesPageClient({ authContext }: Props) {
  const canManage = authContext.permissionCodes.includes("hr.recruitment.manage") || authContext.roleCodes.includes("system_admin");
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [pipelineFilter, setPipelineFilter] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  const { data: res, isLoading } = useQuery({
    queryKey: queryKeys.recruitment.candidates({ search, status: statusFilter, pipelineStage: pipelineFilter, page }),
    queryFn: () => listCandidates({ search: search || undefined, status: statusFilter ?? undefined, pipelineStage: pipelineFilter ?? undefined, page }),
    staleTime: 30_000,
  });

  // ERP REALTIME.1C — live candidates list sync.
  useRealtimeSync({
    table: "hr_candidates",
    event: "*",
    debounceMs: 400,
    onEvent: () => {
      invalidateHrCandidates(queryClient);
    },
  });

  const rows = Array.isArray(res?.data?.rows) ? res.data.rows : [];
  const totalCount = res?.data?.totalCount ?? 0;

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Candidates</h1>
          <p className="text-sm text-muted-foreground">{totalCount} total</p>
        </div>
        {canManage && (
          <Link href="/admin/hr/recruitment/candidates/record/new">
            <Button size="sm">
              <Plus className="h-4 w-4 mr-1" /> New Candidate
            </Button>
          </Link>
        )}
      </div>

      <div className="flex gap-2 flex-wrap">
        <Input placeholder="Search by name, code, email, phone..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} className="max-w-xs" />
        <ERPCombobox
          value={statusFilter}
          onValueChange={(v) => { setStatusFilter(v ? String(v) : null); setPage(1); }}
          options={[{ value: "", label: "All Statuses" }, ...STATUS_OPTIONS]}
          placeholder="Filter by status"
        />
        <ERPCombobox
          value={pipelineFilter}
          onValueChange={(v) => { setPipelineFilter(v ? String(v) : null); setPage(1); }}
          options={[{ value: "", label: "All Stages" }, ...PIPELINE_OPTIONS]}
          placeholder="Filter by stage"
        />
      </div>

      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-16 rounded" />)}</div>
      ) : rows.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground text-sm">
          <Users className="h-10 w-10 mx-auto mb-2 opacity-40" />
          No candidates found.
        </div>
      ) : (
        <div className="border rounded-lg divide-y">
          {rows.map((row) => (
            <div key={row.id} className="flex items-center gap-3 p-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  {row.candidate_code && <span className="text-xs font-mono text-muted-foreground">{row.candidate_code}</span>}
                  <span className="text-sm font-medium">{row.full_name_en}</span>
                  <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[row.candidate_status] ?? "bg-slate-100 text-slate-700"}`}>
                    {row.candidate_status.replace(/_/g, " ")}
                  </span>
                  <span className="text-xs text-muted-foreground bg-slate-100 px-2 py-0.5 rounded capitalize">{row.pipeline_stage}</span>
                </div>
                <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground flex-wrap">
                  {row.mobile_number && <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{row.mobile_number}</span>}
                  {row.email && <span className="flex items-center gap-1"><Mail className="h-3 w-3" />{row.email}</span>}
                  {row.source && <span className="capitalize">{row.source}</span>}
                  {row.requisition && <span>{row.requisition.requisition_code} — {row.requisition.requisition_title}</span>}
                </div>
              </div>
              <Link href={`/admin/hr/recruitment/candidates/record/${row.id}`}>
                <Button size="sm" variant="outline">
                  Open <ArrowRight className="h-3.5 w-3.5 ml-1" />
                </Button>
              </Link>
            </div>
          ))}
        </div>
      )}

      {totalCount > 50 && (
        <div className="flex justify-center gap-2">
          <Button size="sm" variant="outline" disabled={page === 1} onClick={() => setPage(p => p - 1)}>Previous</Button>
          <span className="text-sm text-muted-foreground py-2">Page {page}</span>
          <Button size="sm" variant="outline" disabled={rows.length < 50} onClick={() => setPage(p => p + 1)}>Next</Button>
        </div>
      )}
    </div>
  );
}
