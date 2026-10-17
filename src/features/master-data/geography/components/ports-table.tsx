"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import type { PortWithRelations } from "@/features/master-data/geography/types";
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

type PortsTableProps = {
  ports: PortWithRelations[];
  authContext: AuthContext;
  onRefresh?: () => void;
};

const BASE = "/admin/master-data/geography/ports";

export function PortsTable(props:PortsTableProps){
 return <PortsTableSession key={props.authContext.profile?.id??'none'} {...props}/>;
}
function PortsTableSession({ ports, authContext, onRefresh }: PortsTableProps) {
  const router = useRouter();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [portToDelete, setPortToDelete] = useState<PortWithRelations | null>(null);
  const lifecycle=useGeographyLifecycle('ports',()=>{setDeleteDialogOpen(false);setPortToDelete(null);if(onRefresh)onRefresh();else router.refresh();});
  const isDeleting=lifecycle.busy;

  // Fetch port type lookups
  const { values: portTypes } = useLookupValues({ categoryCode: "PORT_TYPES" });
  
  // Create lookup map for fast access
  const portTypeMap = useMemo(() => {
    const map = new Map<string, string>();
    portTypes.forEach(type => {
      map.set(type.value_code, type.value_label_en);
    });
    return map;
  }, [portTypes]);


  const handleAdd = () => router.push(`${BASE}/record/new`);
  const handleView = (port: PortWithRelations) => router.push(`${BASE}/record/${port.id}`);
  const handleEdit = (port: PortWithRelations) => router.push(`${BASE}/record/${port.id}?mode=edit`);

  const handleToggleActive=(port:PortWithRelations)=>lifecycle.change(port,'active');
  const handleToggleLock=(port:PortWithRelations)=>lifecycle.change(port,'lock');
  const handleDeleteClick=(port:PortWithRelations)=>{setPortToDelete(port);setDeleteDialogOpen(true);};
  const handleDeleteConfirm=()=>portToDelete?lifecycle.change(portToDelete,'retire'):Promise.resolve(false);

  const columns: ColumnDef<PortWithRelations>[] = [
    {
      accessorKey: "port_code",
      accessorFn: (row) => `${row.name_en} ${row.port_code}`,
      header: "Port",
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
            {row.original.port_code}
          </span>
        </div>
      ),
      meta: {
        exportable: true,
        exportHeader: "Port Code",
        exportValue: (row: PortWithRelations) => row.port_code,
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
        exportValue: (row: PortWithRelations) => row.emirate?.name_en || "",
      },
    },
    {
      accessorKey: "port_type_code",
      header: "Type",
      cell: ({ row }) => {
        const portTypeCode = row.original.port_type_code;
        const portTypeName = portTypeCode ? portTypeMap.get(portTypeCode) : null;
        return (
          <Badge variant="outline" className="text-xs">
            {portTypeName || portTypeCode}
          </Badge>
        );
      },
      meta: {
        exportable: true,
        exportHeader: "Port Type",
        exportValue: (row: PortWithRelations) => {
          const code = row.port_type_code;
          return code ? (portTypeMap.get(code) || code) : "";
        },
      },
    },
    {
      id: "codes",
      header: "ICAO/IATA",
      cell: ({ row }) => {
        const icao = row.original.icao_code;
        const iata = row.original.iata_code;
        return (
          <span className="text-sm font-mono">
            {icao || "—"} / {iata || "—"}
          </span>
        );
      },
      meta: {
        exportable: true,
        exportHeader: "ICAO Code",
        exportValue: (row: PortWithRelations) => row.icao_code || "",
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
        exportValue: (row: PortWithRelations) => row.is_active ? "Active" : "Inactive",
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
        exportValue: (row: PortWithRelations) => row.updated_at,
      },
    },
    {
      id: "actions",
      header: "Actions",
      cell: ({ row }) => {
        const port = row.original;
        return (
          <GeographyActionsCell disabled={lifecycle.busy||lifecycle.unconfirmed||lifecycle.refreshError}
            row={port}
            authContext={authContext}
            onView={() => handleView(port)}
            onEdit={() => handleEdit(port)}
            onToggleActive={() => handleToggleActive(port)}
            onToggleLock={() => handleToggleLock(port)}
            onDelete={() => handleDeleteClick(port)}
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
      <ERPDataTable<PortWithRelations> presentation="worklist"
        tableId="ports_table"
        columns={columns}
        data={ports}
        enableSorting={true}
        enableColumnResizing={true}
        enableRowSelection={true}
        enableColumnVisibility={true}
        enablePreferences={true}
        searchPlaceholder="Search ports by code or name..."
        enableGlobalFilter={true}
        initialPageSize={25}
        exportConfig={{
          title: "Ports Master Data",
          subtitle: `${ports.length} port${ports.length !== 1 ? "s" : ""} configured`,
          filename: "ports-master-data",
          orientation: "landscape",
        }}
        toolbarSlot={
          <Button disabled={lifecycle.busy||lifecycle.unconfirmed||lifecycle.refreshError||!hasGlobalPermission(authContext,'master_data.geography.manage')} onClick={handleAdd} size="sm" className="gap-2">
            <Plus className="h-4 w-4" />
            Add Port
          </Button>
        }
      />

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Retire Port</AlertDialogTitle>
            <AlertDialogDescription>
              <span className="space-y-2 block">
                <span className="block">
                  Are you sure you want to retire{" "}
                  <strong>{portToDelete?.name_en}</strong> ({portToDelete?.port_code})?
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
