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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Eye,
  Pencil,
  Power,
  Trash2,
  MoreHorizontal,
  Plus,
  Lock,
  Unlock,
  Shield,
} from "lucide-react";
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
import { toggleAreaZoneStatus, deleteAreaZone, toggleAreaZoneLock } from "@/features/master-data/geography/actions";
import { toast } from "sonner";
import { format } from "date-fns";

type AreasTableProps = {
  areas: AreaZoneWithRelations[];
  authContext: AuthContext;
  onRefresh?: () => void;
};

const BASE = "/admin/master-data/geography/areas";

export function AreasTable({ areas, authContext, onRefresh }: AreasTableProps) {
  const router = useRouter();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [areaToDelete, setAreaToDelete] = useState<AreaZoneWithRelations | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

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

  const handleRefresh = () => {
    if (onRefresh) { onRefresh(); } else { router.refresh(); }
  };

  const handleAdd = () => router.push(`${BASE}/record/new`);
  const handleView = (area: AreaZoneWithRelations) => router.push(`${BASE}/record/${area.id}`);
  const handleEdit = (area: AreaZoneWithRelations) => router.push(`${BASE}/record/${area.id}?mode=edit`);

  const handleToggleActive = async (area: AreaZoneWithRelations) => {
    const result = await toggleAreaZoneStatus({
      id: area.id,
      is_active: !area.is_active,
    });
    if (result.success) {
      toast.success(`Area ${area.is_active ? "deactivated" : "activated"} successfully`);
      handleRefresh();
    } else {
      toast.error(result.error ?? "Failed to toggle area status");
    }
  };

  const handleToggleLock = async (area: AreaZoneWithRelations) => {
    const result = await toggleAreaZoneLock(area.id, !area.is_locked);
    if (result.success) {
      toast.success(`Area ${area.is_locked ? "unlocked" : "locked"} successfully`);
      handleRefresh();
    } else {
      toast.error(result.error ?? "Failed to toggle area lock");
    }
  };

  const handleDeleteClick = (area: AreaZoneWithRelations) => {
    setAreaToDelete(area);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!areaToDelete) return;

    setIsDeleting(true);
    const result = await deleteAreaZone(areaToDelete.id);
    setIsDeleting(false);

    if (result.success) {
      toast.success("Area deleted successfully");
      setDeleteDialogOpen(false);
      setAreaToDelete(null);
      handleRefresh();
    } else {
      toast.error(result.error ?? "Failed to delete area");
    }
  };

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
          <AreaActionsCell
            area={area}
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
      <ERPDataTable<AreaZoneWithRelations>
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
          <Button onClick={handleAdd} size="sm" className="gap-2">
            <Plus className="h-4 w-4" />
            Add Area
          </Button>
        }
      />

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Area</AlertDialogTitle>
            <AlertDialogDescription>
              <span className="space-y-2 block">
                <span className="block">
                  Are you sure you want to permanently delete{" "}
                  <strong>{areaToDelete?.name_en}</strong> ({areaToDelete?.area_code})?
                </span>
                <span className="block text-destructive font-semibold">
                  This action cannot be undone. All related data (branches, sites, etc.) must be removed first.
                </span>
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? "Deleting..." : "Delete Permanently"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function AreaActionsCell({
  area,
  authContext,
  onView,
  onEdit,
  onToggleActive,
  onToggleLock,
  onDelete,
}: {
  area: AreaZoneWithRelations;
  authContext: AuthContext;
  onView: () => void;
  onEdit: () => void;
  onToggleActive: () => void;
  onToggleLock: () => void;
  onDelete: () => void;
}) {
  const isSystemAdmin = authContext.roleCodes.includes("system_admin");
  const hasManagePermission = authContext.permissionCodes.includes("master_data.geography.manage");
  const hasLockPermission = authContext.permissionCodes.includes("master_data.lookups.lock");

  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="ghost" size="icon" className="h-8 w-8" />}>
        <MoreHorizontal className="h-4 w-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuGroup>
          <DropdownMenuItem onClick={onView}>
            <Eye className="h-4 w-4 mr-2" />
            View Details
          </DropdownMenuItem>
          {hasManagePermission && (
            <DropdownMenuItem
              onClick={onEdit}
              disabled={area.is_locked && !isSystemAdmin}
            >
              <Pencil className="h-4 w-4 mr-2" />
              Edit
            </DropdownMenuItem>
          )}
        </DropdownMenuGroup>
        {hasManagePermission && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem
                onClick={onToggleActive}
                disabled={area.is_locked && !isSystemAdmin}
              >
                <Power className="h-4 w-4 mr-2" />
                {area.is_active ? "Deactivate" : "Activate"}
              </DropdownMenuItem>
              {(isSystemAdmin || hasLockPermission) && (
                <DropdownMenuItem onClick={onToggleLock}>
                  {area.is_locked ? (
                    <>
                      <Unlock className="h-4 w-4 mr-2" />
                      Unlock
                    </>
                  ) : (
                    <>
                      <Lock className="h-4 w-4 mr-2" />
                      Lock
                    </>
                  )}
                </DropdownMenuItem>
              )}
            </DropdownMenuGroup>
          </>
        )}
        {isSystemAdmin && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem
                onClick={onDelete}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Delete Permanently
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
