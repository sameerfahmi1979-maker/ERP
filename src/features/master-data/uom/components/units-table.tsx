"use client";

import { ERPDataTable } from "@/components/erp/table/erp-data-table";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { AuthContext } from "@/lib/rbac/check";
import type { ColumnDef } from "@tanstack/react-table";
import {Plus,Lock,Shield,Star} from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {UomActionsCell,useUomLifecycle,UomLifecycleNotice} from "./uom-lifecycle";
import {hasGlobalPermission} from "@/lib/rbac/scope";
import type { UnitOfMeasureWithCategory } from "../types";

type UnitsTableProps = {
  units: UnitOfMeasureWithCategory[];
  authContext: AuthContext;
  onRefresh?: () => void;
};

const BASE = "/admin/master-data/uom/units";

export function UnitsTable(props:UnitsTableProps){
 return <UnitsTableSession key={props.authContext.profile?.id??'none'} {...props}/>;
}
function UnitsTableSession({units,authContext,onRefresh}:UnitsTableProps){
 const router=useRouter();
 const [deleteDialogOpen,setDeleteDialogOpen]=useState(false),[itemToDelete,setItemToDelete]=useState<UnitOfMeasureWithCategory|null>(null);
 const lifecycle=useUomLifecycle('units_of_measure',()=>{setDeleteDialogOpen(false);setItemToDelete(null);if(onRefresh)onRefresh();else router.refresh();});
 const isDeleting=lifecycle.busy,canManage=hasGlobalPermission(authContext,'master_data.uom.manage');
 const handleAdd=()=>router.push(`${BASE}/record/new`);
 const handleView=(item:UnitOfMeasureWithCategory)=>router.push(`${BASE}/record/${item.id}`);
 const handleEdit=(item:UnitOfMeasureWithCategory)=>router.push(`${BASE}/record/${item.id}?mode=edit`);
  const columns: ColumnDef<UnitOfMeasureWithCategory>[] = [
    {
      accessorKey: "unit_code",
      header: "Code",
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <span className="font-mono font-medium">{row.original.unit_code}</span>
          {row.original.is_base_unit && (
            <Badge variant="outline" className="text-xs text-amber-600">
              <Star className="mr-1 h-3 w-3" />
              Base
            </Badge>
          )}
          {row.original.is_system && (
            <Badge variant="outline" className="text-xs">
              <Shield className="mr-1 h-3 w-3" />
              System
            </Badge>
          )}
        </div>
      ),
    },
    {
      accessorKey: "unit_name_en",
      header: "Name (EN)",
    },
    {
      accessorKey: "symbol",
      header: "Symbol",
      cell: ({ row }) => row.original.symbol || "—",
    },
    {
      accessorKey: "category.category_name_en",
      header: "Category",
      cell: ({ row }) => row.original.category?.category_name_en || "—",
    },
    {
      accessorKey: "conversion_factor_to_base",
      header: "Factor",
      cell: ({ row }) => row.original.conversion_factor_to_base.toFixed(row.original.decimal_places),
    },
    {
      accessorKey: "is_active",
      header: "Status",
      cell: ({ row }) => (
        <Badge variant={row.original.is_active ? "default" : "secondary"}>
          {row.original.is_active ? "Active" : "Inactive"}
        </Badge>
      ),
    },
    {
      accessorKey: "is_locked",
      header: "Lock",
      cell: ({ row }) =>
        row.original.is_locked ? (
          <Badge variant="outline" className="text-orange-600">
            <Lock className="mr-1 h-3 w-3" />
            Locked
          </Badge>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      id: "actions",
      header: "Actions",
      cell:({row})=><UomActionsCell row={row.original} authContext={authContext} disabled={lifecycle.busy||lifecycle.unconfirmed||lifecycle.refreshError}
       onView={()=>handleView(row.original)} onEdit={()=>handleEdit(row.original)}
       onToggleActive={()=>void lifecycle.change(row.original,'active')} onToggleLock={()=>void lifecycle.change(row.original,'lock')}
       onDelete={()=>{setItemToDelete(row.original);setDeleteDialogOpen(true);}}/>,
      meta:{exportable:false},
    },
  ];

  return (
    <>
      {!deleteDialogOpen&&<UomLifecycleNotice state={lifecycle}/>}
      <ERPDataTable<UnitOfMeasureWithCategory> presentation="worklist"
        tableId="units_of_measure_table"
        columns={columns}
        data={units}
        searchPlaceholder="Search units..."
        toolbarSlot={
          canManage ? (
            <Button disabled={lifecycle.busy||lifecycle.unconfirmed||lifecycle.refreshError} onClick={handleAdd} size="sm">
              <Plus className="mr-2 h-4 w-4" />
              Add Unit
            </Button>
          ) : undefined
        }
      />

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Retire Unit of Measure</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to retire &quot;{itemToDelete?.unit_name_en}&quot;? The record, references and audit history will be retained. Active dependencies must be resolved first.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <UomLifecycleNotice state={lifecycle}/>
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
