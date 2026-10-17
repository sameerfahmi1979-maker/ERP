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
import {Plus,Shield,ArrowRight} from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {UomActionsCell,useUomLifecycle,UomLifecycleNotice} from "./uom-lifecycle";
import {hasGlobalPermission} from "@/lib/rbac/scope";
import type { UomConversionWithUnits } from "../types";

type ConversionsTableProps = {
  conversions: UomConversionWithUnits[];
  authContext: AuthContext;
  onRefresh?: () => void;
};

const BASE = "/admin/master-data/uom/conversions";

export function ConversionsTable(props:ConversionsTableProps){
 return <ConversionsTableSession key={props.authContext.profile?.id??'none'} {...props}/>;
}
function ConversionsTableSession({conversions,authContext,onRefresh}:ConversionsTableProps){
 const router=useRouter();
 const [deleteDialogOpen,setDeleteDialogOpen]=useState(false),[itemToDelete,setItemToDelete]=useState<UomConversionWithUnits|null>(null);
 const lifecycle=useUomLifecycle('uom_conversions',()=>{setDeleteDialogOpen(false);setItemToDelete(null);if(onRefresh)onRefresh();else router.refresh();});
 const isDeleting=lifecycle.busy,canManage=hasGlobalPermission(authContext,'master_data.uom.manage');
 const handleAdd=()=>router.push(`${BASE}/record/new`);
 const handleView=(item:UomConversionWithUnits)=>router.push(`${BASE}/record/${item.id}`);
 const handleEdit=(item:UomConversionWithUnits)=>router.push(`${BASE}/record/${item.id}?mode=edit`);
  const columns: ColumnDef<UomConversionWithUnits>[] = [
    {
      accessorKey: "from_unit",
      header: "From Unit",
      cell: ({ row }) => {
        const unit = row.original.from_unit;
        return unit ? `${unit.unit_code} (${unit.unit_name_en})` : "—";
      },
    },
    {
      id: "arrow",
      header: "",
      cell: () => (
        <div className="flex justify-center">
          <ArrowRight className="h-4 w-4 text-muted-foreground" />
        </div>
      ),
    },
    {
      accessorKey: "to_unit",
      header: "To Unit",
      cell: ({ row }) => {
        const unit = row.original.to_unit;
        return unit ? `${unit.unit_code} (${unit.unit_name_en})` : "—";
      },
    },
    {
      accessorKey: "conversion_factor",
      header: "Factor",
      cell: ({ row }) => row.original.conversion_factor.toString(),
    },
    {
      accessorKey: "is_bidirectional",
      header: "Bidirectional",
      cell: ({ row }) => (
        <Badge variant={row.original.is_bidirectional ? "default" : "outline"}>
          {row.original.is_bidirectional ? "Yes" : "No"}
        </Badge>
      ),
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
      accessorKey: "is_system",
      header: "System",
      cell: ({ row }) =>
        row.original.is_system ? (
          <Badge variant="outline" className="text-xs">
            <Shield className="mr-1 h-3 w-3" />
            System
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
      <ERPDataTable<UomConversionWithUnits> presentation="worklist"
        tableId="uom_conversions_table"
        columns={columns}
        data={conversions}
        searchPlaceholder="Search conversions..."
        toolbarSlot={
          canManage ? (
            <Button disabled={lifecycle.busy||lifecycle.unconfirmed||lifecycle.refreshError} onClick={handleAdd} size="sm">
              <Plus className="mr-2 h-4 w-4" />
              Add Conversion
            </Button>
          ) : undefined
        }
      />

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Retire UOM Conversion</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to retire this conversion? The record, references and audit history will be retained. Active dependencies must be resolved first.
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
