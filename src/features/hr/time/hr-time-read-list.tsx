"use client";
import {useEffect, useLayoutEffect, useState, type ReactNode} from "react";
import {useQueryClient} from "@tanstack/react-query";
import type {ColumnDef, ColumnFiltersState, PaginationState, SortingState, Updater} from "@tanstack/react-table";
import {ERPDataTable} from "@/components/erp/table/erp-data-table";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {usePersistentUiState} from "@/hooks/use-persistent-ui-state";
import {hrTimeReadPrefix, useHrTimeInquiryIdentity, useHrTimeRead} from "@/hooks/use-hr-time-read";
import {HR_TIME_CONFIG, hrTimeCriteriaSchema, type HrTimeField, type HrTimeKind, type HrTimePage, type HrTimeRow} from "@/lib/reads/hr-time-schema";
import {ReadError} from "@/lib/reads/client";
import {canUseApplication} from "@/lib/rbac/scope";
import type {AuthContext} from "@/lib/rbac/check";
import {formatTimeInquiryDate} from "@/lib/hr/time/date-utils";
export type HrTimeReadAdmission = {ready: boolean; criteria: string; ids: number[]};
type Props = {kind: HrTimeKind; authContext: AuthContext; initialPage?: HrTimePage; initialUpdatedAt?: number; initialReadIdentity?: string; renderRecord: (row: HrTimeRow) => ReactNode; onReadAdmission?: (admission: HrTimeReadAdmission) => void};
const resolve = <T,>(update: Updater<T>, previous: T) => typeof update === "function" ? (update as (p: T) => T)(previous) : update;
const displayDateFields = new Set(["attendance_date", "start_date", "end_date", "effective_from", "effective_to"]);
function value(row: HrTimeRow, key: string) {
  if (key === "employee_name") return "employee" in row ? row.employee?.full_name_en ?? row.employee?.full_name_ar : null;
  if (key === "leave_type_name") return "leave_type" in row ? row.leave_type?.name_en : null;
  if (key === "shift_name") return "work_shift" in row ? row.work_shift?.shift_name : null;
  if (key === "calendar_name") return "work_calendar" in row ? row.work_calendar?.calendar_name : null;
  return (row as Record<string, unknown>)[key];
}
/** Approved F05 controls now read the full native-RLS result, not one loaded page. */
export function HrTimeReadList(props: Props) {
  const identity = useHrTimeInquiryIdentity(props.kind, props.authContext);
  return <ReadSession key={`${props.kind}:${identity}`} {...props} identity={identity} />;
}
function ReadSession({kind, authContext, initialPage, initialUpdatedAt = 0, initialReadIdentity, renderRecord, identity, onReadAdmission}: Props & {identity: string}) {
  const qc = useQueryClient(), config = HR_TIME_CONFIG[kind], prefix = `hr:time:${kind}:${identity}`;
  const [pagination, setPagination] = usePersistentUiState<PaginationState>(`${prefix}:pagination`, {pageIndex: 0, pageSize: 25}), [sorting, setSorting] = usePersistentUiState<SortingState>(`${prefix}:sorting`, [{id: config.sort, desc: true}]);
  const [search, setSearch] = usePersistentUiState(`${prefix}:search`, ""), [filters, setFilters] = usePersistentUiState<ColumnFiltersState>(`${prefix}:filters`, []);
  const [status, setStatus] = usePersistentUiState(`${prefix}:status`, kind === "leave" ? "pending" : ""), [dateFrom, setDateFrom] = usePersistentUiState(`${prefix}:date-from`, ""), [dateTo, setDateTo] = usePersistentUiState(`${prefix}:date-to`, "");
  const [date, setDate] = usePersistentUiState(`${prefix}:date`, "");
  const [accessDenied, setAccessDenied] = useState(false), eligible = canUseApplication(authContext);
  const safe = hrTimeCriteriaSchema.safeParse({kind, page: pagination.pageIndex + 1, pageSize: pagination.pageSize, search, sortKey: sorting[0]?.id ?? config.sort, sortDir: sorting[0]?.desc ? "desc" : "asc", columnFilters: Object.fromEntries(filters.map(f => [f.id, String(f.value)])), ...(status ? {status} : {}), ...(date ? {date} : {}), ...(dateFrom ? {dateFrom} : {}), ...(dateTo ? {dateTo} : {})});
  const read = useHrTimeRead(eligible && !accessDenied && safe.success ? safe.data : null, authContext, accessDenied ? undefined : initialPage, initialUpdatedAt, initialReadIdentity);
  const denied = !eligible || accessDenied || read.error instanceof ReadError && [401, 403].includes(read.error.status);
  if (denied && !accessDenied) setAccessDenied(true);
  useEffect(() => {if (accessDenied) {const queryKey = [...hrTimeReadPrefix(kind), identity]; void qc.cancelQueries({queryKey}); qc.removeQueries({queryKey});}}, [accessDenied, qc, kind, identity]);
  useEffect(() => {if (read.data && !read.isBusy) {const maximum = Math.max(0, Math.ceil(read.data.totalCount / pagination.pageSize) - 1); if (pagination.pageIndex > maximum) {void qc.invalidateQueries({queryKey: hrTimeReadPrefix(kind), refetchType: "none"}); setPagination(p => ({...p, pageIndex: maximum}));}}}, [read.data, read.isBusy, pagination.pageIndex, pagination.pageSize, setPagination, kind, qc]);
  const failed = denied || !safe.success || read.isError, rows: HrTimeRow[] = !failed && !read.isBusy ? read.data?.rows ?? [] : [], totalCount = !failed && read.data ? read.data.totalCount : null;
  const admission = JSON.stringify({ready: !failed && !read.isBusy && !!read.data, criteria: JSON.stringify({kind, pagination, sorting, search, filters, status, date, dateFrom, dateTo}), ids: rows.map(row => row.id)});
  useLayoutEffect(() => {onReadAdmission?.(JSON.parse(admission));}, [admission, onReadAdmission]);
  const fields: readonly HrTimeField[] = config.fields, columns: ColumnDef<HrTimeRow>[] = fields.map(f => ({id: f.id, header: f.label, accessorFn: row => value(row, f.id), size: 150, cell: ({getValue}) => <span>{displayDateFields.has(f.id) ? formatTimeInquiryDate(getValue() as string | null) : typeof getValue() === "boolean" ? getValue() ? "Yes" : "No" : String(getValue() ?? "—")}</span>}));
  columns.push({id: "record_details", header: "Details and permitted actions", enableSorting: false, size: 480, meta: {exportable: false}, cell: ({row}) => <div className="min-w-0 whitespace-normal">{renderRecord(row.original)}</div>});
  const refresh = () => {if (!denied && safe.success) void read.refetch();};
  if (denied) return <p role="alert">Time records are unavailable for this session. Sign in again or refresh after permitted access is restored.</p>;
  return <div className="space-y-4">
    <div className="flex flex-wrap gap-3">
      {kind === "attendance" && <Input aria-label="Date" type="date" value={date} onChange={e => {setDate(e.target.value); setPagination(p => ({...p, pageIndex: 0}));}} className="w-40" />}
      {kind !== "shifts" && <select aria-label="Status" value={status} onChange={e => {setStatus(e.target.value); setPagination(p => ({...p, pageIndex: 0}));}} className="border rounded-md px-3 py-2 text-sm bg-background"><option value="">All statuses</option>{config.statuses.map(v => <option key={v} value={v}>{v}</option>)}</select>}
      <Input aria-label="From" type="date" value={dateFrom} onChange={e => {setDateFrom(e.target.value); setPagination(p => ({...p, pageIndex: 0}));}} className="w-40" />
      <Input aria-label="To" type="date" value={dateTo} onChange={e => {setDateTo(e.target.value); setPagination(p => ({...p, pageIndex: 0}));}} className="w-40" />
      {(status || date || dateFrom || dateTo || search || filters.length) ? <Button variant="ghost" onClick={() => {setStatus(""); setDate(""); setDateFrom(""); setDateTo(""); setSearch(""); setFilters([]); setPagination(p => ({...p, pageIndex: 0}));}}>Clear</Button> : null}
      <Button type="button" variant="outline" disabled={!safe.success || read.isBusy} onClick={refresh}>Refresh records</Button>
    </div>
    {!safe.success && <p role="alert">Review the dates, filters, search length and page criteria. Invalid criteria were not sent.</p>}
    {read.isError && <p role="alert">Time records could not be completely loaded. This is not an empty result. <Button type="button" variant="outline" onClick={refresh}>Retry loading records</Button></p>}
    <p className="text-xs text-muted-foreground">{totalCount === null ? "Records unavailable or loading" : `${totalCount} permitted records`}</p>
    <ERPDataTable tableId={`hr-time:${kind}:${identity}`} userProfileId={authContext.profile?.id} columns={columns} data={rows} enableRowSelection={false} isLoading={read.isBusy} resultsLabel={`${kind} results`} searchPlaceholder="Search all permitted time records…" emptyMessage="No permitted time records match this view."
      serverRead={{pagination, sorting, globalFilter: search, columnFilters: filters, totalCount,
        onPaginationChange: update => setPagination(p => {const next = resolve(update, p); return next.pageSize === p.pageSize ? next : {...next, pageIndex: 0};}),
        onSortingChange: update => {setSorting(p => resolve(update, p).slice(0, 1)); setPagination(p => ({...p, pageIndex: 0}));},
        onGlobalFilterChange: update => {setSearch(p => resolve(update, p)); setPagination(p => ({...p, pageIndex: 0}));},
        onColumnFiltersChange: update => {setFilters(p => resolve(update, p)); setPagination(p => ({...p, pageIndex: 0}));},
        filters: fields.map(f => ({...f, options: f.options ? [...f.options] : undefined})),
        // No export, bulk approval or new business operation on these inquiries.
      }} />
  </div>;
}
