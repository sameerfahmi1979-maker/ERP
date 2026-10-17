"use client";
import type {ColumnDef} from "@tanstack/react-table";
import {ERPDataTable} from "@/components/erp/table/erp-data-table";
import {Button} from "@/components/ui/button";
import type {useRecruitmentInquiry} from "@/hooks/use-hr-recruitment-inquiry";
import {RECRUITMENT_INQUIRY_CONFIG, type RecruitmentInquiryKind, type RecruitmentInquiryRowMap} from "@/lib/reads/hr-recruitment-inquiries-schema";

export function RecruitmentInquiryTable<K extends RecruitmentInquiryKind>({kind, identity, read, columns}: {
  kind: K; identity: string; read: ReturnType<typeof useRecruitmentInquiry<K>>; columns: ColumnDef<RecruitmentInquiryRowMap[K]>[];
}) {
  if (read.denied) return <p role="alert">Recruitment records are unavailable for this session. Sign in again or refresh after permitted access is restored.</p>;
  const unavailable = read.invalid || read.isError, allowedSorts = new Set(RECRUITMENT_INQUIRY_CONFIG[kind].fields.map(f => f.id));
  return <div className="space-y-3">
    {read.invalid && <p role="alert">Review the search, filters and page criteria. Invalid criteria were not sent.</p>}
    {read.isError && <p role="alert">Recruitment records could not be completely loaded. <Button variant="outline" onClick={() => void read.refetch()}>Retry loading records</Button></p>}
    {read.detailError && <p role="alert">{read.detailError}</p>}
    {read.detailPending && <p role="status">Loading complete requisition…</p>}
    <div className="flex flex-wrap items-center justify-between gap-2">
      <p className="text-xs text-muted-foreground">{read.serverRead.totalCount === null ? "Records unavailable or loading" : `${read.serverRead.totalCount} permitted records`}</p>
      <Button variant="outline" disabled={read.invalid || read.busy} onClick={() => void read.refetch()}>Refresh records</Button>
    </div>
    <ERPDataTable presentation="worklist" tableId={`hr-recruitment:${kind}:${identity}`} userProfileId={identity} data={read.data}
      columns={columns.map(c => ({...c, enableSorting: c.enableSorting !== false && !!c.id && allowedSorts.has(c.id)}))}
      enableRowSelection={false} isLoading={read.busy} serverRead={read.serverRead}
      resultsLabel={`${kind} results`} searchPlaceholder="Search all permitted records…"
      emptyMessage={unavailable ? "Records unavailable. Review the message above." : "No permitted records match this view."} />
  </div>;
}
