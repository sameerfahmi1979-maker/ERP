"use client";
import Link from "next/link";
import type {ColumnDef} from "@tanstack/react-table";
import {DollarSign, Landmark, Link as LinkIcon, Search} from "lucide-react";
import {ERPDataTable} from "@/components/erp/table/erp-data-table";
import {Badge} from "@/components/ui/badge";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {getWpsReadinessLabel, getWpsReadinessBadgeVariant} from "@/lib/hr/payroll/wps-readiness";
import {PAYROLL_INQUIRY_CONFIG, type PayrollInquiryKind, type PayrollInquiryRowMap} from "@/lib/reads/hr-payroll-inquiries-schema";
import {usePayrollInquiry, usePayrollInquiryIdentity, type PayrollInquiryProps} from "@/hooks/use-hr-payroll-inquiries";

const variant = (status: string): "default" | "secondary" | "outline" => status === "active" ? "default" : status === "hold" ? "secondary" : "outline";
type Row = PayrollInquiryRowMap[PayrollInquiryKind];
function columns(kind: PayrollInquiryKind): ColumnDef<Row>[] {
  const employee: ColumnDef<Row> = {id: "full_name_en", header: "Employee", accessorKey: "full_name_en", enableHiding: false, size: 240, cell: ({row: {original: row}}) => <><div className="font-medium">{row.full_name_en}</div><div className="text-xs text-muted-foreground">{row.employee_code}</div></>};
  const salary: ColumnDef<Row>[] = [
    {id: "payroll_group_name", header: "Payroll Group", accessorFn: row => "payroll_group_name" in row ? row.payroll_group_name : null, size: 160, cell: ({row: {original: row}}) => "payroll_group_name" in row ? row.payroll_group_name ?? "Restricted or unavailable" : null},
    {id: "payroll_status", header: "Status", accessorFn: row => "payroll_status" in row ? row.payroll_status : null, size: 160, cell: ({row: {original: row}}) => "payroll_status" in row && <Badge variant={variant(row.payroll_status ?? "not_configured")} className="capitalize">{row.payroll_status?.replaceAll("_", " ") ?? "Not Configured"}</Badge>},
    {id: "gross_salary", header: "Gross Salary", accessorFn: row => "gross_salary" in row ? row.gross_salary : null, size: 160, cell: ({row: {original: row}}) => "gross_salary" in row ? row.gross_salary?.toLocaleString("en-AE", {minimumFractionDigits: 2, maximumFractionDigits: 2}) ?? "Salary unavailable" : null},
    {id: "currency", header: "Currency", accessorFn: row => "currency" in row ? row.currency : null, size: 160, cell: ({row: {original: row}}) => "currency" in row ? row.currency ?? "—" : null},
  ];
  const wps: ColumnDef<Row>[] = [
    {id: "wps_status", header: "WPS Status", accessorFn: row => "wps_status" in row ? row.wps_status : null, size: 160, cell: ({row: {original: row}}) => "wps_status" in row && <Badge variant={variant(row.wps_status ?? "not_enrolled")} className="capitalize">{row.wps_status?.replaceAll("_", " ") ?? "Not Set"}</Badge>},
    {id: "salary_payment_method", header: "Payment Method", accessorFn: row => "salary_payment_method" in row ? row.salary_payment_method : null, size: 160, cell: ({row: {original: row}}) => "salary_payment_method" in row ? row.salary_payment_method?.replaceAll("_", " ") ?? "—" : null},
    {id: "has_active_hold", header: "Payroll Hold", accessorFn: row => "has_active_hold" in row ? row.has_active_hold : null, size: 160, cell: ({row: {original: row}}) => "has_active_hold" in row && (row.has_active_hold ? <Badge variant="destructive">Active Hold</Badge> : <span className="text-muted-foreground">None</span>)},
    {id: "readiness_status", header: "Readiness", accessorFn: row => "readiness_status" in row ? row.readiness_status : null, size: 160, cell: ({row: {original: row}}) => "readiness_status" in row && <Badge variant={getWpsReadinessBadgeVariant(row.readiness_status)}>{getWpsReadinessLabel(row.readiness_status)}</Badge>},
  ];
  return [employee, ...(kind === "salary" ? salary : wps), {id: "actions", header: "Actions", size: 120, enableSorting: false, meta: {exportable: false}, cell: ({row}) => <Link prefetch={false} href={`/admin/hr/employees/record/${row.original.employee_id}?section=payroll`} aria-label={`Open employee payroll for ${row.original.full_name_en}`} className="inline-flex h-8 w-8 items-center justify-center rounded border border-transparent hover:border-border"><LinkIcon className="h-4 w-4" /></Link>}];
}
export function PayrollInquiryPageClient(props: PayrollInquiryProps & {kind: PayrollInquiryKind}) {
  const identity = usePayrollInquiryIdentity(props.kind, props.authContext);
  return <InquirySession key={`${props.kind}:${identity}`} {...props} identity={identity} />;
}
function InquirySession(props: PayrollInquiryProps & {kind: PayrollInquiryKind; identity: string}) {
  const {kind, identity} = props, read = usePayrollInquiry(kind, props, identity), cfg = PAYROLL_INQUIRY_CONFIG[kind], Icon = kind === "salary" ? DollarSign : Landmark;
  return <div className="container mx-auto space-y-4 py-6">
    <div><h1 className="flex items-center gap-2 text-2xl font-bold"><Icon className="h-6 w-6 text-primary" />{cfg.title}</h1><p className="mt-1 text-muted-foreground">{kind === "salary" ? "Employee payroll profiles and gross salary overview." : "WPS status and readiness for employees whose payroll and banking records you may both view."}</p></div>
    {read.denied ? <p role="alert">{kind === "salary" ? "Salary" : "Payroll and banking"} access could not be verified. These records are restricted for this session. Refresh after access is restored or sign in again.</p> : <>
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[200px] max-w-xs flex-1"><Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" /><Input aria-label="Search employee" className="pl-8" placeholder="Search employee..." value={read.employeeInput} onChange={e => read.setEmployeeInput(e.target.value)} onKeyDown={e => {if (e.key === "Enter") read.applyEmployeeSearch();}} /></div>
        <Button variant="outline" onClick={read.applyEmployeeSearch}>Find employee</Button>
        <select aria-label={kind === "salary" ? "Payroll status" : "WPS status"} className="rounded border px-2 py-1.5 text-sm" value={read.status} onChange={e => read.changeStatus(e.target.value)}><option value="">{kind === "salary" ? "All Statuses" : "All WPS Statuses"}</option>{cfg.statuses.map(status => <option key={status} value={status}>{status.replaceAll("_", " ")}</option>)}</select>
        {kind === "wps" && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={read.activeHoldOnly} onChange={e => read.changeActiveHoldOnly(e.target.checked)} />Active Payroll Hold Only</label>}
        {(read.employeeInput || read.employeeSearch) && <Button variant="ghost" onClick={read.clearEmployeeSearch}>Clear employee search</Button>}
      </div>
      {read.invalid && <p role="alert">Review the search, filters and page criteria. Invalid criteria were not sent.</p>}
      {read.isError && <p role="alert">Payroll records and matching total could not be completely loaded. <Button variant="outline" disabled={read.invalid || read.busy} onClick={read.refresh}>Retry loading records</Button></p>}
      <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm text-muted-foreground">{read.serverRead.totalCount === null ? "Matching total unavailable or loading" : `${read.serverRead.totalCount} matching permitted employees`}</p><Button variant="outline" disabled={read.invalid || read.busy} onClick={read.refresh}>Refresh records</Button></div>
      <ERPDataTable presentation="worklist" tableId={cfg.tableId} userProfileId={identity} columns={columns(kind)} data={read.data} enableRowSelection={false} serverRead={read.serverRead} isLoading={read.busy} pageSizeOptions={[25, 50, 100]} resultsLabel={`${cfg.title} results`} searchPlaceholder="Search all permitted records…" emptyMessage={read.isError || read.invalid ? "Records unavailable. Review the message above." : "No permitted employees match this view."} />
    </>}
  </div>;
}
