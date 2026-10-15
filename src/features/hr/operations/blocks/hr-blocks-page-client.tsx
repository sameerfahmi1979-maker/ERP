"use client";
import {Badge} from "@/components/ui/badge";
import {Button} from "@/components/ui/button";
import {AlertOctagon} from "lucide-react";
import Link from "next/link";
import {getBlockStatusBadge} from "@/lib/hr/operations/status";
import {formatTimeInquiryDate} from "@/lib/hr/time/date-utils";
import {HrOperationsReadList, type HrOperationsReadProps} from "../hr-operations-read-list";
// Preserve the management capability contract; the original inquiry had no
// management action and does not acquire a new release operation here.
export function HrBlocksPageClient(props: HrOperationsReadProps & {canManage: boolean}) {
  return <div className="p-6 max-w-7xl mx-auto space-y-6">
    <div><h1 className="text-2xl font-bold tracking-tight flex items-center gap-2"><AlertOctagon className="h-6 w-6" />Operational Blocks</h1><p className="text-muted-foreground mt-1">All employee operational blocks</p></div>
    <HrOperationsReadList {...props} kind="blocks" renderRecord={row => {
      if (!("block_status" in row)) return null;
      const badge = getBlockStatusBadge(row.block_status), employee = row.employee;
      return <div className="flex flex-wrap items-center justify-between gap-3 py-2">
        <div className="min-w-0"><Badge variant={badge.variant}>{badge.label}</Badge><p className="text-sm font-medium">{employee?.full_name_en ?? "—"}<span className="text-muted-foreground ml-2 text-xs">{employee?.employee_code ?? ""}</span></p><p className="text-xs text-muted-foreground">{row.block_type.replaceAll("_", " ")} · {row.block_reason.slice(0, 80)}</p></div>
        <div className="flex flex-wrap gap-3 items-center"><span className="text-xs text-muted-foreground">{formatTimeInquiryDate(row.created_at)}</span>{employee && <Link prefetch={false} href={"/admin/hr/employees/record/" + employee.id}><Button size="sm" variant="ghost">View Employee</Button></Link>}</div>
      </div>;
    }} />
  </div>;
}
