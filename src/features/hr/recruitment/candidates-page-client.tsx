"use client";
import { QueryReadBoundary } from "@/components/erp/query-read-boundary";

import { ConfiguredRow, EditColumns, EditFilters, useListColumns, type ListColumn } from "@/components/erp/table/list-controls";
import { usePersistentUiState } from "@/hooks/use-persistent-ui-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useRealtimeSync } from "@/hooks/realtime/use-realtime-sync";
import { invalidateHrCandidates } from "@/lib/query/invalidation";
import { queryKeys } from "@/lib/query/query-keys";
import type { AuthContext } from "@/lib/rbac/check";
import { listCandidates } from "@/server/actions/hr/recruitment";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Plus, Users } from "lucide-react";
import Link from "next/link";

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

const CANDIDATE_COLUMNS: ListColumn[] = [
  {id:"code",label:"Code",width:140,visible:true,required:true},
  {id:"name",label:"Candidate",width:240,visible:true,required:true},
  {id:"status",label:"Status",width:130,visible:true},
  {id:"stage",label:"Pipeline stage",width:150,visible:true},
  {id:"mobile",label:"Mobile",width:150,visible:true},
  {id:"email",label:"Email",width:220,visible:true},
  {id:"source",label:"Source",width:150,visible:false},
  {id:"requisition",label:"Requisition",width:240,visible:true}
];

export function CandidatesPageClient({ authContext }: Props) {
  const canManage = authContext.permissionCodes.includes("hr.recruitment.manage") || authContext.roleCodes.includes("system_admin");
  const queryClient = useQueryClient();
  const [search, setSearch] = usePersistentUiState("candidates:search","");
  const [statusFilter, setStatusFilter] = usePersistentUiState<string | null>("candidates:status",null);
  const [pipelineFilter, setPipelineFilter] = usePersistentUiState<string | null>("candidates:stage",null);
  const [page, setPage] = usePersistentUiState("candidates:page",1);

  const columnState = useListColumns("hr-candidates", CANDIDATE_COLUMNS);
  const uiRead1 = useQuery({
    queryKey: queryKeys.recruitment.candidates({ search, status: statusFilter, pipelineStage: pipelineFilter, page }),
    queryFn: () => listCandidates({ search: search || undefined, status: statusFilter ?? undefined, pipelineStage: pipelineFilter ?? undefined, page }),
    staleTime: 30_000,
  });
  const { data: res, isLoading, isError, refetch } = uiRead1;

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
    <QueryReadBoundary queries={[uiRead1]}><div className="p-0 max-w-full mx-auto space-y-4">
      <div className="flex flex-wrap gap-2 items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Candidates</h1>
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

      <div className="flex gap-2 flex-wrap items-center">
        <Input aria-label="Search candidates" placeholder="Search by name, code, email, phone..." value={search} onChange={e=>{setSearch(e.target.value);setPage(1);}} className="max-w-sm" />
        <EditColumns columns={columnState.columns} defaults={CANDIDATE_COLUMNS} onApply={columnState.setColumns} />
        <EditFilters scopeLabel="Search and filters query all permitted candidates." definitions={[
          {id:"status",label:"Status",type:"select",options:STATUS_OPTIONS},
          {id:"stage",label:"Pipeline stage",type:"select",options:PIPELINE_OPTIONS}
        ]} values={{status:statusFilter ?? "",stage:pipelineFilter ?? ""}} onApply={values=>{setStatusFilter(values.status || null);setPipelineFilter(values.stage || null);setPage(1);}} />
      </div>

      {isError || (res && !res.success) ? <div role="alert" className="border border-destructive p-4">Candidates could not be loaded. Your filters are retained. <Button variant="outline" onClick={()=>void refetch()}>Retry</Button></div> : isLoading ? (
        <div className="space-y-2">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-16 rounded" />)}</div>
      ) : rows.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground text-sm">
          <Users className="h-10 w-10 mx-auto mb-2 opacity-40" />
          No candidates found.
        </div>
      ) : (
        <div role="region" aria-label="Scrollable candidates" tabIndex={0} className="overflow-x-auto border bg-card rounded-sm">
          <table aria-label="Candidates" className="w-full text-sm table-fixed" style={{minWidth:columnState.visible.reduce((sum,column)=>sum+column.width,100)}}>
            <thead><tr>{columnState.visible.map(column=><th key={column.id} className="text-left p-3 border-b bg-muted/30 font-semibold" style={{width:column.width}}>{column.label}</th>)}<th className="w-24 p-3 border-b">Actions</th></tr></thead>
            <tbody>{rows.map(row=><ConfiguredRow key={row.id} columns={columnState.columns} className="border-b hover:bg-muted/30">
              <td data-column="code" className="p-3 truncate">{row.candidate_code}</td>
              <td data-column="name" className="p-3"><Link className="text-primary underline underline-offset-2" href={`/admin/hr/recruitment/candidates/record/${row.id}`}>{row.full_name_en}</Link></td>
              <td data-column="status" className="p-3 capitalize">{row.candidate_status.replaceAll("_"," ")}</td>
              <td data-column="stage" className="p-3 capitalize">{row.pipeline_stage}</td>
              <td data-column="mobile" className="p-3 truncate">{row.mobile_number ?? "—"}</td>
              <td data-column="email" className="p-3 truncate">{row.email ?? "—"}</td>
              <td data-column="source" className="p-3">{row.source ?? "—"}</td>
              <td data-column="requisition" className="p-3">{row.requisition ? `${row.requisition.requisition_code} — ${row.requisition.requisition_title}` : "—"}</td>
              <td className="p-2"><Link aria-label={`Open ${row.candidate_code ?? "candidate"}`} className="inline-flex min-h-11 items-center gap-1 text-primary" href={`/admin/hr/recruitment/candidates/record/${row.id}`}>Open <ArrowRight className="h-4 w-4" /></Link></td>
            </ConfiguredRow>)}</tbody>
          </table>
        </div>
      )}

      {totalCount > 50 && (
        <div className="flex justify-center gap-2">
          <Button size="sm" variant="outline" disabled={page === 1} onClick={() => setPage(p => p - 1)}>Previous</Button>
          <span className="text-sm text-muted-foreground py-2">Page {page}</span>
          <Button size="sm" variant="outline" disabled={page * 50 >= totalCount} onClick={() => setPage(p => p + 1)}>Next</Button>
        </div>
      )}
    </div></QueryReadBoundary>
  );
}
