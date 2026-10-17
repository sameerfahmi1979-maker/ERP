"use client";
import {Badge} from "@/components/ui/badge";
import {Button} from "@/components/ui/button";
import type {AuthContext} from "@/lib/rbac/check";
import type {HrTimeShiftRow} from "@/lib/reads/hr-time-schema";
import {HrTimeReadList} from "../hr-time-read-list";
import {ExternalLink} from "lucide-react";
import Link from "next/link";
import {formatTimeInquiryDate} from "@/lib/hr/time/date-utils";
type Props = {initialRows: HrTimeShiftRow[]; initialCount: number; authContext: AuthContext; initialReadIdentity?: string; initialUpdatedAt?: number};
export function HrShiftsPageClient({initialRows, initialCount, authContext, initialReadIdentity, initialUpdatedAt}: Props) {
  return <HrTimeReadList kind="shifts" authContext={authContext} initialPage={{kind: "shifts", rows: initialRows, totalCount: initialCount, page: 1, pageSize: 25}} initialReadIdentity={initialReadIdentity} initialUpdatedAt={initialUpdatedAt} renderRecord={row => {
    if (!("effective_from" in row)) return null;
    return <div className="flex flex-wrap items-center gap-2 text-sm"><span className="text-xs text-muted-foreground">EMP-{row.employee_id}</span><span>{row.work_shift?.shift_name ?? "—"}</span><span>{row.work_calendar?.calendar_name ?? "—"}</span><span>{formatTimeInquiryDate(row.effective_from)}</span>{row.overtime_eligible && <Badge variant="secondary">OT</Badge>}
      <Link href={`/admin/hr/employees/record/${row.employee_id}?section=time`}><Button aria-label="Open record" size="sm" variant="ghost"><ExternalLink className="h-3.5 w-3.5" /></Button></Link></div>;
  }} />;
}
