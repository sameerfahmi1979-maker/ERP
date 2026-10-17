"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ProfitCenterWithRelations } from "@/features/master-data/finance-basics/types";
import type { AuthContext } from "@/lib/rbac/check";
import { ERPDataTable } from "@/components/erp/table/erp-data-table";
import type { ColumnDef } from "@tanstack/react-table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {FinanceCenterActionsCell,useFinanceCenterLifecycle,FinanceCenterLifecycleNotice} from "./finance-center-lifecycle";
import {hasGlobalPermission} from "@/lib/rbac/scope";

import { format } from "date-fns";

type ProfitCentersTableProps = {
  profitCenters: ProfitCenterWithRelations[];
  authContext: AuthContext;
  onRefresh?: () => void;
};

const BASE = "/admin/master-data/finance-basics/profit-centers";

export function ProfitCentersTable(props:ProfitCentersTableProps){
 return <ProfitCentersTableSession key={props.authContext.profile?.id??'none'} {...props}/>;
}
function ProfitCentersTableSession({profitCenters,authContext,onRefresh}:ProfitCentersTableProps){
 const router=useRouter();
 const [deleteDialogOpen,setDeleteDialogOpen]=useState(false),[itemToDelete,setItemToDelete]=useState<ProfitCenterWithRelations|null>(null);
 const lifecycle=useFinanceCenterLifecycle('profit_centers',()=>{setDeleteDialogOpen(false);setItemToDelete(null);if(onRefresh)onRefresh();else router.refresh();});
 const isDeleting=lifecycle.busy;
  const handleAdd = () => router.push(`${BASE}/record/new`);
  const handleView = (item: ProfitCenterWithRelations) => router.push(`${BASE}/record/${item.id}`);
  const handleEdit = (item: ProfitCenterWithRelations) => router.push(`${BASE}/record/${item.id}?mode=edit`);

  const columns: ColumnDef<ProfitCenterWithRelations>[] = [
    {
      accessorKey: "profit_center_code",
      accessorFn: (row) => `${row.profit_center_name_en} ${row.profit_center_code}`,
      header: "Profit Center",
      cell: ({ row }) => (
        <div className="flex flex-col">
          <span className="font-medium">{row.original.profit_center_name_en}</span>
          <span className="text-xs text-muted-foreground">{row.original.profit_center_code}</span>
        </div>
      ),
      meta: { exportable: true, exportHeader: "Code", exportValue: (row) => row.profit_center_code },
    },
    {
      accessorKey: "profit_center_type_code",
      header: "Type",
      cell: ({ row }) => (
        <Badge variant="outline" className="text-xs">
          {row.original.profit_center_type_code || "—"}
        </Badge>
      ),
      meta: { exportable: true, exportHeader: "Type", exportValue: (row) => row.profit_center_type_code || "" },
    },
    {
      accessorKey: "owner_company_id",
      header: "Company",
      cell: ({ row }) => (
        <span className="text-sm">{row.original.owner_company_id==null?"Global":row.original.owner_company?.legal_name_en??"Company unavailable"}</span>
      ),
      meta: { exportable: true, exportHeader: "Company", exportValue: (row) => row.owner_company_id==null?"Global":row.owner_company?.legal_name_en??"Company unavailable" },
    },
    {
      accessorKey: "branch_id",
      header: "Branch",
      cell: ({ row }) => (
        <span className="text-sm">{row.original.branch_id==null?"All branches":row.original.branch?.branch_name_en??"Branch unavailable"}</span>
      ),
      meta: { exportable: true, exportHeader: "Branch", exportValue: (row) => row.branch_id==null?"All branches":row.branch?.branch_name_en??"Branch unavailable" },
    },
    {
      accessorKey: "is_active",
      header: "Status",
      cell: ({ row }) => (
        <Badge variant={row.original.is_active ? "default" : "secondary"} className="text-xs">
          {row.original.is_active ? "Active" : "Inactive"}
        </Badge>
      ),
      meta: { exportable: true, exportHeader: "Status", exportValue: (row) => (row.is_active ? "Active" : "Inactive") },
    },
    {
      accessorKey: "updated_at",
      header: "Updated",
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground">
          {format(new Date(row.original.updated_at), "yyyy-MM-dd HH:mm")}
        </span>
      ),
      meta: { exportable: true, exportHeader: "Updated At", exportValue: (row) => row.updated_at },
    },
    {
      id: "actions",
      header: "Actions",
      cell: ({ row }) => {
        const item = row.original;
        return (
          <FinanceCenterActionsCell disabled={lifecycle.busy||lifecycle.unconfirmed||lifecycle.refreshError}
            row={item}
            authContext={authContext}
            onView={() => handleView(item)}
            onEdit={() => handleEdit(item)}
            onToggleActive={()=>void lifecycle.change(item,'active')}
            onToggleLock={()=>void lifecycle.change(item,'lock')}
            onDelete={() => { setItemToDelete(item); setDeleteDialogOpen(true); }}
          />
        );
      },
      meta: { exportable: false },
    },
  ];

  return (
    <>
      {!deleteDialogOpen&&<FinanceCenterLifecycleNotice state={lifecycle}/>}
      <ERPDataTable<ProfitCenterWithRelations> presentation="worklist"
        tableId="profit_centers_table"
        columns={columns}
        data={profitCenters}
        enableSorting
        enableColumnResizing
        enableRowSelection
        enableColumnVisibility
        enablePreferences
        searchPlaceholder="Search profit centers by code or name..."
        enableGlobalFilter
        initialPageSize={25}
        exportConfig={{
          title: "Profit Centers Master Data",
          subtitle: `${profitCenters.length} profit center${profitCenters.length !== 1 ? "s" : ""} configured`,
          filename: "profit-centers-master-data",
          orientation: "landscape",
        }}
        toolbarSlot={
          <Button disabled={lifecycle.busy||lifecycle.unconfirmed||lifecycle.refreshError||!hasGlobalPermission(authContext,'master_data.finance_basics.manage')} onClick={handleAdd} size="sm" className="gap-2">
            <Plus className="h-4 w-4" />
            Add Profit Center
          </Button>
        }
      />

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Retire Profit Center</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to retire{" "}
              <strong>{itemToDelete?.profit_center_name_en}</strong> ({itemToDelete?.profit_center_code})? The record, references and audit history will be retained. Active dependencies must be resolved first.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <FinanceCenterLifecycleNotice state={lifecycle}/>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting||lifecycle.unconfirmed}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={e=>{e.preventDefault();if(itemToDelete)void lifecycle.change(itemToDelete,'retire');}}
              disabled={isDeleting||lifecycle.unconfirmed}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? "Retiring..." : "Retire; keep history"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
