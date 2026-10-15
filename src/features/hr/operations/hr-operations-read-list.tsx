"use client";
import {useEffect, useState, type ReactNode} from "react";
import {useQueryClient} from "@tanstack/react-query";
import type {ColumnDef, ColumnFiltersState, PaginationState, SortingState, Updater} from "@tanstack/react-table";
import {ERPDataTable} from "@/components/erp/table/erp-data-table";
import {Button} from "@/components/ui/button";
import {usePersistentUiState} from "@/hooks/use-persistent-ui-state";
import {hrOperationsReadPrefix, useHrOperationsInquiryIdentity, useHrOperationsRead} from "@/hooks/use-hr-operations-read";
import {HR_OPERATIONS_CONFIG, hrOperationsCriteriaSchema, type HrOperationsField, type HrOperationsKind, type HrOperationsPage, type HrOperationsRow} from "@/lib/reads/hr-operations-schema";
import {ReadError} from "@/lib/reads/client";
import {hasPermission} from "@/lib/rbac/scope";
import type {AuthContext} from "@/lib/rbac/check";
import {formatTimeInquiryDate} from "@/lib/hr/time/date-utils";
export type HrOperationsReadProps = {authContext: AuthContext; initialPage?: HrOperationsPage; initialUpdatedAt?: number; initialReadIdentity?: string};
type Props = HrOperationsReadProps & {kind: HrOperationsKind; renderRecord: (row: HrOperationsRow) => ReactNode};
const resolve = <T,>(update: Updater<T>, previous: T) => typeof update === "function" ? (update as (p: T) => T)(previous) : update;
function value(row: HrOperationsRow, key: string) {
  if (key === "employee_name") return row.employee?.full_name_en ?? row.employee?.full_name_ar;
  if (key === "employee_code") return row.employee?.employee_code;
  if (key === "company_name") return "company" in row ? row.company?.name_en : null;
  if (key === "department_name") return "department" in row ? row.department?.name_en : null;
  if (key === "designation_name") return "designation" in row ? row.designation?.name_en : null;
  if (key === "site_name") return "site" in row ? row.site?.name_en : null;
  return (row as Record<string, unknown>)[key];
}
/** Full authorized-result list controls, using the existing F05 table and
 * principal-owned F04 workspace memory; no business actions or export added. */
export function HrOperationsReadList(props: Props) {
  const identity = useHrOperationsInquiryIdentity(props.kind, props.authContext);
  return <ReadSession key={`${props.kind}:${identity}`} {...props} identity={identity} />;
}
function ReadSession({kind, authContext, initialPage, initialUpdatedAt = 0, initialReadIdentity, renderRecord, identity}: Props & {identity: string}) {
  const qc = useQueryClient(), config = HR_OPERATIONS_CONFIG[kind], prefix = `hr:operations:${kind}:${identity}`;
  const [pagination, setPagination] = usePersistentUiState<PaginationState>(`${prefix}:pagination`, {pageIndex: 0, pageSize: 25}), [sorting, setSorting] = usePersistentUiState<SortingState>(`${prefix}:sorting`, [{id: config.sort, desc: true}]);
  const [search, setSearch] = usePersistentUiState(`${prefix}:search`, ""), [filters, setFilters] = usePersistentUiState<ColumnFiltersState>(`${prefix}:filters`, []);
  const [status, setStatus] = usePersistentUiState<string>(`${prefix}:status`, config.defaultStatus), [accessDenied, setAccessDenied] = useState(false), eligible = hasPermission(authContext, "hr.assignments.view");
  const safe = hrOperationsCriteriaSchema.safeParse({kind, page: pagination.pageIndex + 1, pageSize: pagination.pageSize, search, sortKey: sorting[0]?.id ?? config.sort, sortDir: sorting[0]?.desc ? "desc" : "asc", columnFilters: Object.fromEntries(filters.map(f => [f.id, String(f.value)])), ...(status ? {status} : {})});
  const read = useHrOperationsRead(eligible && !accessDenied && safe.success ? safe.data : null, authContext, accessDenied ? undefined : initialPage, initialUpdatedAt, initialReadIdentity);
  const denied = !eligible || accessDenied || read.error instanceof ReadError && [401, 403].includes(read.error.status);
  if (denied && !accessDenied) setAccessDenied(true);
  useEffect(() => {if (accessDenied) {const queryKey = [...hrOperationsReadPrefix(kind), identity]; void qc.cancelQueries({queryKey}); qc.removeQueries({queryKey});}}, [accessDenied, qc, kind, identity]);
  useEffect(() => {if (read.data && !read.isBusy) {const maximum = Math.max(0, Math.ceil(read.data.totalCount / pagination.pageSize) - 1); if (pagination.pageIndex > maximum) {void qc.invalidateQueries({queryKey: hrOperationsReadPrefix(kind), refetchType: "none"}); setPagination(p => ({...p, pageIndex: maximum}));}}}, [read.data, read.isBusy, pagination.pageIndex, pagination.pageSize, setPagination, kind, qc]);
  const failed = denied || !safe.success || read.isError, rows: HrOperationsRow[] = !failed && !read.isBusy ? read.data?.rows ?? [] : [], totalCount = !failed && read.data ? read.data.totalCount : null;
  const fields: readonly HrOperationsField[] = config.fields, columns: ColumnDef<HrOperationsRow>[] = fields.map(f => ({id: f.id, header: f.label, accessorFn: row => value(row, f.id), size: 150, cell: ({getValue}) => <span>{f.type === "date" ? formatTimeInquiryDate(getValue() as string | null) : String(getValue() ?? "—")}</span>}));
  columns.push({id: "record_details", header: "Details and permitted actions", enableSorting: false, size: 480, meta: {exportable: false}, cell: ({row}) => <div className="min-w-0 whitespace-normal">{renderRecord(row.original)}</div>});
  const refresh = () => {if (!denied && safe.success) void read.refetch();};
  if (denied) return <p role="alert">Operational records are unavailable for this session. Sign in again or refresh after permitted access is restored.</p>;
  return <div className="space-y-4">
    <div className="flex flex-wrap gap-3">
      <select aria-label="Status" value={status} onChange={e => {setStatus(e.target.value); setPagination(p => ({...p, pageIndex: 0}));}} className="border rounded-md px-3 py-2 text-sm bg-background"><option value="">All statuses</option>{config.statuses.map(v => <option key={v} value={v}>{v.replaceAll("_", " ")}</option>)}</select>
      {(status || search || filters.length) ? <Button variant="ghost" onClick={() => {setStatus(""); setSearch(""); setFilters([]); setPagination(p => ({...p, pageIndex: 0}));}}>Clear</Button> : null}
      <Button type="button" variant="outline" disabled={!safe.success || read.isBusy} onClick={refresh}>Refresh records</Button>
    </div>
    {!safe.success && <p role="alert">Review the filters, search length and page criteria. Invalid criteria were not sent.</p>}
    {read.isError && <p role="alert">Operational records could not be completely loaded. This is not an empty result. <Button type="button" variant="outline" onClick={refresh}>Retry loading records</Button></p>}
    <p className="text-xs text-muted-foreground">{totalCount === null ? "Records unavailable or loading" : `${totalCount} permitted records`}</p>
    <ERPDataTable tableId={`hr-operations:${kind}:${identity}`} userProfileId={authContext.profile?.id} columns={columns} data={rows} enableRowSelection={false} isLoading={read.isBusy} resultsLabel={`${kind} results`} searchPlaceholder="Search all permitted operational records…" emptyMessage="No permitted operational records match this view."
      serverRead={{pagination, sorting, globalFilter: search, columnFilters: filters, totalCount,
        onPaginationChange: update => setPagination(p => {const next = resolve(update, p); return next.pageSize === p.pageSize ? next : {...next, pageIndex: 0};}),
        onSortingChange: update => {setSorting(p => resolve(update, p).slice(0, 1)); setPagination(p => ({...p, pageIndex: 0}));},
        onGlobalFilterChange: update => {setSearch(p => resolve(update, p)); setPagination(p => ({...p, pageIndex: 0}));},
        onColumnFiltersChange: update => {setFilters(p => resolve(update, p)); setPagination(p => ({...p, pageIndex: 0}));},
        filters: fields.map(f => ({...f, options: f.options ? [...f.options] : undefined})),
      }} />
  </div>;
}
