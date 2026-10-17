"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import type { AreaZoneWithRelations } from "@/features/master-data/geography/types";
import type { AuthContext } from "@/lib/rbac/check";
import { ERPDataTable } from "@/components/erp/table/erp-data-table";
import type { ColumnDef } from "@tanstack/react-table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useLookupValues } from "@/features/master-data/lookups/hooks/use-lookup-values";
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

type AreasTableProps = {
  areas: AreaZoneWithRelations[];
  authContext: AuthContext;
  onRefresh?: () => void;
};

const BASE = "/admin/master-data/geography/areas";

export function AreasTable(props:AreasTableProps){
 return <AreasTableSession key={props.authContext.profile?.id??'none'} {...props}/>;
}
function AreasTableSession({ areas, authContext, onRefresh }: AreasTableProps) {
  const router = useRouter();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [areaToDelete, setAreaToDelete] = useState<AreaZoneWithRelations | null>(null);
  const lifecycle=useGeographyLifecycle('areas_zones',()=>{setDeleteDialogOpen(false);setAreaToDelete(null);if(onRefresh)onRefresh();else router.refresh();});
  const isDeleting=lifecycle.busy;

  // Fetch area type lookups
  const { values: areaTypes } = useLookupValues({ categoryCode: "AREA_TYPES" });
  
  // Create lookup map for fast access
  const areaTypeMap = useMemo(() => {
    const map = new Map<string, string>();
    areaTypes.forEach(type => {
      map.set(type.value_code, type.value_label_en);
    });
    return map;
  }, [areaTypes]);


  const handleAdd = () => router.push(`${BASE}/record/new`);
  const handleView = (area: AreaZoneWithRelations) => router.push(`${BASE}/record/${area.id}`);
  const handleEdit = (area: AreaZoneWithRelations) => router.push(`${BASE}/record/${area.id}?mode=edit`);

  const handleToggleActive=(area:AreaZoneWithRelations)=>lifecycle.change(area,'active');
  const handleToggleLock=(area:AreaZoneWithRelations)=>lifecycle.change(area,'lock');
  const handleDeleteClick=(area:AreaZoneWithRelations)=>{setAreaToDelete(area);setDeleteDialogOpen(true);};
  const handleDeleteConfirm=()=>areaToDelete?lifecycle.change(areaToDelete,'retire'):Promise.resolve(false);

  const columns: ColumnDef<AreaZoneWithRelations>[] = [
    {
      accessorKey: "area_code",
      accessorFn: (row) => `${row.name_en} ${row.area_code}`,
      header: "Area",
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
            {row.original.area_code}
          </span>
        </div>
      ),
      meta: {
        exportable: true,
        exportHeader: "Area Code",
        exportValue: (row: AreaZoneWithRelations) => row.area_code,
      },
    },
    {
      id: "city",
      header: "City",
      cell: ({ row }) => {
        const city = row.original.city;
        return (
          <span className="text-sm">
            {city?.name_en || "—"}
          </span>
        );
      },
      meta: {
        exportable: true,
        exportHeader: "City",
        exportValue: (row: AreaZoneWithRelations) => row.city?.name_en || "",
      },
    },
    {
      id: "emirate",
      header: "Region / Emirate",
      cell: ({ row }) => {
        const emirate = row.original.emirate;
        return (
          <span className="text-sm">
            {emirate?.name_en || "—"}
          </span>
        );
      },
      meta: {
        exportable: true,
        exportHeader: "Region / Emirate",
        exportValue: (row: AreaZoneWithRelations) => row.emirate?.name_en || "",
      },
    },
    {
      id: "area_type",
      header: "Area Type",
      cell: ({ row }) => {
        const areaTypeCode = row.original.area_type_code;
        const areaTypeName = areaTypeCode ? areaTypeMap.get(areaTypeCode) : null;
        return (
          <span className="text-sm">{areaTypeName || areaTypeCode || "—"}</span>
        );
      },
      meta: {
        exportable: true,
        exportHeader: "Area Type",
        exportValue: (row: AreaZoneWithRelations) => {
          const code = row.area_type_code;
          return code ? (areaTypeMap.get(code) || code) : "";
        },
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
        exportValue: (row: AreaZoneWithRelations) => row.is_active ? "Active" : "Inactive",
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
        exportValue: (row: AreaZoneWithRelations) => row.updated_at,
      },
    },
    {
      id: "actions",
      header: "Actions",
      cell: ({ row }) => {
        const area = row.original;
        return (
          <GeographyActionsCell disabled={lifecycle.busy||lifecycle.unconfirmed||lifecycle.refreshError}
            row={area}
            authContext={authContext}
            onView={() => handleView(area)}
            onEdit={() => handleEdit(area)}
            onToggleActive={() => handleToggleActive(area)}
            onToggleLock={() => handleToggleLock(area)}
            onDelete={() => handleDeleteClick(area)}
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
      <ERPDataTable<AreaZoneWithRelations> presentation="worklist"
        tableId="areas_table"
        columns={columns}
        data={areas}
        enableSorting={true}
        enableColumnResizing={true}
        enableRowSelection={true}
        enableColumnVisibility={true}
        enablePreferences={true}
        searchPlaceholder="Search areas by code or name..."
        enableGlobalFilter={true}
        initialPageSize={25}
        exportConfig={{
          title: "Areas & Zones Master Data",
          subtitle: `${areas.length} area${areas.length !== 1 ? "s" : ""} configured`,
          filename: "areas-zones-master-data",
          orientation: "landscape",
        }}
        toolbarSlot={
          <Button disabled={lifecycle.busy||lifecycle.unconfirmed||lifecycle.refreshError||!hasGlobalPermission(authContext,'master_data.geography.manage')} onClick={handleAdd} size="sm" className="gap-2">
            <Plus className="h-4 w-4" />
            Add Area
          </Button>
        }
      />

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Retire Area</AlertDialogTitle>
            <AlertDialogDescription>
              <span className="space-y-2 block">
                <span className="block">
                  Are you sure you want to retire{" "}
                  <strong>{areaToDelete?.name_en}</strong> ({areaToDelete?.area_code})?
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
