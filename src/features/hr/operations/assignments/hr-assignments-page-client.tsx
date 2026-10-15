"use client";
import {Badge} from "@/components/ui/badge";
import {Button} from "@/components/ui/button";
import {MapPin} from "lucide-react";
import Link from "next/link";
import {getAssignmentStatusBadge} from "@/lib/hr/operations/status";
import {HrOperationsReadList, type HrOperationsReadProps} from "../hr-operations-read-list";
export function HrAssignmentsPageClient(props: HrOperationsReadProps) {
  return <div className="p-6 max-w-7xl mx-auto space-y-6">
    <div><h1 className="text-2xl font-bold tracking-tight flex items-center gap-2"><MapPin className="h-6 w-6" />Employee Assignments</h1><p className="text-muted-foreground mt-1">All employee operational assignments</p></div>
    <HrOperationsReadList {...props} kind="assignments" renderRecord={row => {
      if (!("assignment_status" in row)) return null;
      const badge = getAssignmentStatusBadge(row.assignment_status), employee = row.employee;
      return <div className="flex flex-wrap items-center justify-between gap-3 py-2">
        <div className="min-w-0"><Badge variant={badge.variant}>{badge.label}</Badge><p className="text-sm font-medium">{employee?.full_name_en ?? "—"}<span className="text-muted-foreground ml-2 text-xs">{employee?.employee_code ?? ""}</span></p><p className="text-xs text-muted-foreground">{[row.department?.name_en, row.designation?.name_en, row.site?.name_en].filter(Boolean).join(" · ") || "No details"}</p></div>
        <div className="flex flex-wrap gap-3 items-center"><span className="text-xs text-muted-foreground">{row.effective_from} {row.effective_to ? "→ " + row.effective_to : "→ ongoing"}</span>{employee && <Link prefetch={false} href={"/admin/hr/employees/record/" + employee.id}><Button size="sm" variant="ghost">View</Button></Link>}</div>
      </div>;
    }} />
  </div>;
}
