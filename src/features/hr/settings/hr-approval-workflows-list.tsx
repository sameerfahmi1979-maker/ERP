"use client";
import { ERPDataTable } from "@/components/erp/table/erp-data-table";
import type { ColumnDef } from "@tanstack/react-table";
import type { HrApprovalWorkflowRow } from "@/server/actions/hr/settings";

const columns: ColumnDef<HrApprovalWorkflowRow>[] = [
  {accessorKey:"workflow_name_en",header:"Workflow",enableHiding:false,meta:{filter:{type:"text"}}},
  {accessorKey:"workflow_code",header:"Code",meta:{filter:{type:"text"}}},
  {accessorKey:"workflow_type",header:"Type",meta:{filter:{type:"text"}}},
  {accessorKey:"approval_step",header:"Step",meta:{filter:{type:"number"}}},
  {id:"role",accessorFn:r=>r.approval_role?.role_name??"Unassigned",header:"Approval role",meta:{filter:{type:"text"}}},
  {accessorKey:"sla_hours",header:"SLA hours",meta:{filter:{type:"number"}}},
  {accessorKey:"is_required",header:"Required",cell:({row})=>row.original.is_required?"Yes":"No"},
  {accessorKey:"is_active",header:"Status",cell:({row})=>row.original.is_active?"Active":"Inactive"},
];
export function HrApprovalWorkflowsList({rows}:{rows:HrApprovalWorkflowRow[]}){
 return <><ERPDataTable tableId="hr.approval-workflow-steps" data={rows} columns={columns} enableRowSelection={false} searchPlaceholder="Search loaded workflow steps…" emptyMessage="No workflow steps match this view."/>
 <p className="text-xs text-muted-foreground">Read-only workflow configuration. Search, columns and filters apply to the first 100 permitted steps loaded here; editing business approval chains remains in the HR workflow phase.</p></>;
}
