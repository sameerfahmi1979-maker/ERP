"use client";
import type {ColumnDef} from "@tanstack/react-table";
import {ERPDataTable} from "@/components/erp/table/erp-data-table";
import {Button} from "@/components/ui/button";
import {OperationStatus} from "@/components/erp/operation-status";
import type {useHrActionInquiry} from "@/hooks/use-hr-action-inquiry";
import {HR_ACTION_INQUIRY_FIELDS, type HrActionInquiryKind, type HrActionInquiryRowMap} from "@/lib/reads/hr-action-inquiries-schema";

export function HrActionInquiryTable<K extends HrActionInquiryKind>({kind, identity, read, columns}: {
  kind: K; identity: string; read: ReturnType<typeof useHrActionInquiry<K>>; columns: ColumnDef<HrActionInquiryRowMap[K]>[];
}) {
  if (read.denied) return <p role="alert">HR records are unavailable for this session. Sign in again or refresh after permitted access is restored.</p>;
  const unavailable = read.invalid || read.isError;
  const allowedSorts = new Set(HR_ACTION_INQUIRY_FIELDS[kind].map(f => f.id));
  return <div className="space-y-3">
    {read.invalid && <p role="alert">Review the search, filters and page criteria. Invalid criteria were not sent.</p>}
    {read.isError && <OperationStatus state="failed" retry={() => void read.refetch()} retryLabel="Retry loading records">HR records could not be completely loaded.</OperationStatus>}
    {read.detailError && <p role="alert">{read.detailError}</p>}
    {read.detailPending && <OperationStatus state="pending">Loading complete record…</OperationStatus>}
    <div className="flex flex-wrap items-center justify-between gap-2">
      <p className="text-xs text-muted-foreground">{read.serverRead.totalCount === null ? "Records unavailable or loading" : `${read.serverRead.totalCount} permitted records`}</p>
      <Button variant="outline" disabled={read.invalid || read.busy} onClick={() => void read.refetch()}>Refresh records</Button>
    </div>
    <ERPDataTable presentation="worklist" tableId={`hr-actions:${kind}:${identity}`} columnPreferenceId={`hr-actions:${kind}`} userProfileId={identity} data={read.data}
      columns={columns.map(c => ({...c, enableSorting: c.enableSorting !== false && !!c.id && allowedSorts.has(c.id)}))}
      enableRowSelection={false} isLoading={read.busy} serverRead={read.serverRead}
      resultsLabel={`${kind} results`} searchPlaceholder="Search all permitted records…"
      emptyMessage={unavailable ? "Records unavailable. Review the message above." : "No permitted records match this view."} />
  </div>;
}
