"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Emirate } from "@/features/master-data/geography/types";
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
import {hasGlobalPermission} from "@/lib/rbac/scope";
import {useGeographyLifecycle,GeographyLifecycleNotice,GeographyActionsCell} from "./geography-lifecycle";
import { format } from "date-fns";

type EmiratesTableProps = {
  emirates: Emirate[];
  authContext: AuthContext;
  onRefresh?: () => void;
};

const BASE = "/admin/master-data/geography/emirates";

export function EmiratesTable(props:EmiratesTableProps){
 return <EmiratesTableSession key={props.authContext.profile?.id??'none'} {...props}/>;
}
function EmiratesTableSession({ emirates, authContext, onRefresh }: EmiratesTableProps) {
  const router = useRouter();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [emirateToDelete, setEmirateToDelete] = useState<Emirate | null>(null);
  const lifecycle=useGeographyLifecycle('emirates',()=>{setDeleteDialogOpen(false);setEmirateToDelete(null);if(onRefresh)onRefresh();else router.refresh();});
  const isDeleting=lifecycle.busy;


  const handleAdd = () => router.push(`${BASE}/record/new`);
  const handleView = (emirate: Emirate) => router.push(`${BASE}/record/${emirate.id}`);
  const handleEdit = (emirate: Emirate) => router.push(`${BASE}/record/${emirate.id}?mode=edit`);

  const handleToggleActive=(emirate:Emirate)=>lifecycle.change(emirate,'active');
  const handleToggleLock=(emirate:Emirate)=>lifecycle.change(emirate,'lock');
  const handleDeleteClick=(emirate:Emirate)=>{setEmirateToDelete(emirate);setDeleteDialogOpen(true);};
  const handleDeleteConfirm=()=>emirateToDelete?lifecycle.change(emirateToDelete,'retire'):Promise.resolve(false);

  const columns: ColumnDef<Emirate>[] = [
    {
      accessorKey: "emirate_code",
      accessorFn: (row) => `${row.name_en} ${row.emirate_code}`,
      header: "Emirate",
      cell: ({ row }) => (
        <div className="flex flex-col">
          <div className="flex items-center gap-2">
            <span className="font-medium">{row.original.name_en}</span>
            {row.original.is_system && (
              <Shield className="h-3 w-3 text-amber-600" />
            )}
            {row.original.is_locked && (
              <Lock className="h-3 w-3 text-destructive" />
            )}
          </div>
          <span className="text-xs text-muted-foreground">
            {row.original.emirate_code}
          </span>
        </div>
      ),
      meta: {
        exportable: true,
        exportHeader: "Emirate Code",
        exportValue: (row) => row.emirate_code,
      },
    },
    {
      accessorKey: "abbreviation_en",
      header: "Abbreviation",
      cell: ({ row }) => (
        <span className="text-sm font-mono">{row.original.abbreviation_en}</span>
      ),
      meta: {
        exportable: true,
        exportHeader: "Abbreviation",
        exportValue: (row) => row.abbreviation_en,
      },
    },
    {
      accessorKey: "name_ar",
      header: "Arabic Name",
      cell: ({ row }) => (
        <span className="text-sm" dir="rtl">{row.original.name_ar || "—"}</span>
      ),
      meta: {
        exportable: true,
        exportHeader: "Arabic Name",
        exportValue: (row) => row.name_ar || "",
      },
    },
    {
      accessorKey: "is_active",
      header: "Status",
      cell: ({ row }) => {
        const isActive = row.original.is_active;
        return (
          <Badge variant={isActive ? "default" : "secondary"} className="text-xs">
            {isActive ? "Active" : "Inactive"}
          </Badge>
        );
      },
      meta: {
        exportable: true,
        exportHeader: "Status",
        exportValue: (row) => row.is_active ? "Active" : "Inactive",
      },
    },
    {
      accessorKey: "updated_at",
      header: "Updated",
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground">
          {format(new Date(row.original.updated_at), "yyyy-MM-dd HH:mm")}
        </span>
      ),
      meta: {
        exportable: true,
        exportHeader: "Updated At",
        exportValue: (row) => row.updated_at,
      },
    },
    {
      id: "actions",
      header: "Actions",
      cell: ({ row }) => {
        const emirate = row.original;
        return (
          <GeographyActionsCell disabled={lifecycle.busy||lifecycle.unconfirmed||lifecycle.refreshError}
            row={emirate}
            authContext={authContext}
            onView={() => handleView(emirate)}
            onEdit={() => handleEdit(emirate)}
            onToggleActive={() => handleToggleActive(emirate)}
            onToggleLock={() => handleToggleLock(emirate)}
            onDelete={() => handleDeleteClick(emirate)}
          />
        );
      },
      meta: {
        exportable: false,
      },
    },
  ];

  return (
    <>
      {!deleteDialogOpen&&<GeographyLifecycleNotice state={lifecycle}/>}
      <ERPDataTable<Emirate>
        tableId="emirates_table"
        columns={columns}
        data={emirates}
        enableSorting={true}
        enableColumnResizing={true}
        enableRowSelection={true}
        enableColumnVisibility={true}
        enablePreferences={true}
        searchPlaceholder="Search emirates by code or name..."
        enableGlobalFilter={true}
        initialPageSize={25}
        exportConfig={{
          title: "Emirates Master Data",
          subtitle: `${emirates.length} emirate${emirates.length !== 1 ? "s" : ""} configured`,
          filename: "emirates-master-data",
          orientation: "landscape",
        }}
        toolbarSlot={
          <Button disabled={lifecycle.busy||lifecycle.unconfirmed||lifecycle.refreshError||!hasGlobalPermission(authContext,'master_data.geography.manage')} onClick={handleAdd} size="sm" className="gap-2">
            <Plus className="h-4 w-4" />
            Add Emirate
          </Button>
        }
      />

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Retire Emirate</AlertDialogTitle>
            <AlertDialogDescription>
              <span className="space-y-2 block">
                <span className="block">
                  Are you sure you want to retire{" "}
                  <strong>{emirateToDelete?.name_en}</strong> ({emirateToDelete?.emirate_code})?
                </span>
                <span className="block text-destructive font-semibold">
                  The record, references and audit history will be retained. Active dependencies must be resolved before retirement.
                </span>
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <GeographyLifecycleNotice state={lifecycle}/>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting||lifecycle.unconfirmed}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={e=>{e.preventDefault();void handleDeleteConfirm();}}
              disabled={isDeleting||lifecycle.unconfirmed||lifecycle.refreshError}
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
