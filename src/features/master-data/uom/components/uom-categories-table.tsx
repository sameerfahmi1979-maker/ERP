"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { UomCategory } from "../types";
import type { AuthContext } from "@/lib/rbac/check";
import { ERPDataTable } from "@/components/erp/table/erp-data-table";
import type { ColumnDef } from "@tanstack/react-table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {Plus,Lock,Shield} from "lucide-react";
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
import {UomActionsCell,useUomLifecycle,UomLifecycleNotice} from "./uom-lifecycle";
import {hasGlobalPermission} from "@/lib/rbac/scope";
import { format } from "date-fns";

type UomCategoriesTableProps = {
  categories: UomCategory[];
  authContext: AuthContext;
  onRefresh?: () => void;
};

const BASE = "/admin/master-data/uom/categories";

export function UomCategoriesTable(props:UomCategoriesTableProps){
 return <UomCategoriesTableSession key={props.authContext.profile?.id??'none'} {...props}/>;
}
function UomCategoriesTableSession({categories,authContext,onRefresh}:UomCategoriesTableProps){
 const router=useRouter();
 const [deleteDialogOpen,setDeleteDialogOpen]=useState(false),[itemToDelete,setItemToDelete]=useState<UomCategory|null>(null);
 const lifecycle=useUomLifecycle('uom_categories',()=>{setDeleteDialogOpen(false);setItemToDelete(null);if(onRefresh)onRefresh();else router.refresh();});
 const isDeleting=lifecycle.busy,canManage=hasGlobalPermission(authContext,'master_data.uom.manage');
 const handleAdd=()=>router.push(`${BASE}/record/new`);
 const handleView=(item:UomCategory)=>router.push(`${BASE}/record/${item.id}`);
 const handleEdit=(item:UomCategory)=>router.push(`${BASE}/record/${item.id}?mode=edit`);
  const columns: ColumnDef<UomCategory>[] = [
    {
      accessorKey: "category_code",
      header: "Code",
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <span className="font-mono font-medium">{row.original.category_code}</span>
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
      accessorKey: "category_name_en",
      header: "Name (EN)",
    },
    {
      accessorKey: "category_name_ar",
      header: "Name (AR)",
      cell: ({ row }) => row.original.category_name_ar || "—",
    },
    {
      accessorKey: "description_en",
      header: "Description",
      cell: ({ row }) => row.original.description_en || "—",
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
      accessorKey: "created_at",
      header: "Created",
      cell: ({ row }) => format(new Date(row.original.created_at), "yyyy-MM-dd"),
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
      <ERPDataTable<UomCategory> presentation="worklist"
        tableId="uom_categories_table"
        columns={columns}
        data={categories}
        searchPlaceholder="Search categories..."
        toolbarSlot={
          canManage ? (
            <Button disabled={lifecycle.busy||lifecycle.unconfirmed||lifecycle.refreshError} onClick={handleAdd} size="sm">
              <Plus className="mr-2 h-4 w-4" />
              Add Category
            </Button>
          ) : undefined
        }
      />

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Retire UOM Category</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to retire &quot;{itemToDelete?.category_name_en}&quot;? The record, references and audit history will be retained. Active dependencies must be resolved first.
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
