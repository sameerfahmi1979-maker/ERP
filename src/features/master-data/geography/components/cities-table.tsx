"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { CityWithEmirate } from "@/features/master-data/geography/types";
import type { AuthContext } from "@/lib/rbac/check";
import { ERPDataTable } from "@/components/erp/table/erp-data-table";
import type { ColumnDef } from "@tanstack/react-table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import { toggleCityStatus, deleteCity, toggleCityLock } from "@/features/master-data/geography/actions";
import { toast } from "sonner";
import { format } from "date-fns";

type CitiesTableProps = {
  cities: CityWithEmirate[];
  authContext: AuthContext;
  onRefresh?: () => void;
};

const BASE = "/admin/master-data/geography/cities";

export function CitiesTable({ cities, authContext, onRefresh }: CitiesTableProps) {
  const router = useRouter();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [cityToDelete, setCityToDelete] = useState<CityWithEmirate | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleRefresh = () => {
    if (onRefresh) { onRefresh(); } else { router.refresh(); }
  };

  const handleAdd = () => router.push(`${BASE}/record/new`);
  const handleView = (city: CityWithEmirate) => router.push(`${BASE}/record/${city.id}`);
  const handleEdit = (city: CityWithEmirate) => router.push(`${BASE}/record/${city.id}?mode=edit`);

  const handleToggleActive = async (city: CityWithEmirate) => {
    const result = await toggleCityStatus({
      id: city.id,
      is_active: !city.is_active,
    });
    if (result.success) {
      toast.success(`City ${city.is_active ? "deactivated" : "activated"} successfully`);
      handleRefresh();
    } else {
      toast.error(result.error ?? "Failed to toggle city status");
    }
  };

  const handleToggleLock = async (city: CityWithEmirate) => {
    const result = await toggleCityLock(city.id, !city.is_locked);
    if (result.success) {
      toast.success(`City ${city.is_locked ? "unlocked" : "locked"} successfully`);
      handleRefresh();
    } else {
      toast.error(result.error ?? "Failed to toggle city lock");
    }
  };

  const handleDeleteClick = (city: CityWithEmirate) => {
    setCityToDelete(city);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!cityToDelete) return;

    setIsDeleting(true);
    const result = await deleteCity(cityToDelete.id);
    setIsDeleting(false);

    if (result.success) {
      toast.success("City deleted successfully");
      setDeleteDialogOpen(false);
      setCityToDelete(null);
      handleRefresh();
    } else {
      toast.error(result.error ?? "Failed to delete city");
    }
  };

  const columns: ColumnDef<CityWithEmirate>[] = [
    {
      accessorKey: "city_code",
      accessorFn: (row) => `${row.name_en} ${row.city_code}`,
      header: "City",
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
            {row.original.city_code}
          </span>
        </div>
      ),
      meta: {
        exportable: true,
        exportHeader: "City Code",
        exportValue: (row) => row.city_code,
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
        exportValue: (row) => {
          const emirate = row.emirate;
          return emirate?.name_en || "";
        },
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
        const city = row.original;
        return (
          <CityActionsCell
            city={city}
            authContext={authContext}
            onView={() => handleView(city)}
            onEdit={() => handleEdit(city)}
            onToggleActive={() => handleToggleActive(city)}
            onToggleLock={() => handleToggleLock(city)}
            onDelete={() => handleDeleteClick(city)}
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
      <ERPDataTable<CityWithEmirate>
        tableId="cities_table"
        columns={columns}
        data={cities}
        enableSorting={true}
        enableColumnResizing={true}
        enableRowSelection={true}
        enableColumnVisibility={true}
        enablePreferences={true}
        searchPlaceholder="Search cities by code or name..."
        enableGlobalFilter={true}
        initialPageSize={25}
        exportConfig={{
          title: "Cities Master Data",
          subtitle: `${cities.length} cit${cities.length !== 1 ? "ies" : "y"} configured`,
          filename: "cities-master-data",
          orientation: "landscape",
        }}
        toolbarSlot={
          <Button onClick={handleAdd} size="sm" className="gap-2">
            <Plus className="h-4 w-4" />
            Add City
          </Button>
        }
      />

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete City</AlertDialogTitle>
            <AlertDialogDescription>
              <span className="space-y-2 block">
                <span className="block">
                  Are you sure you want to permanently delete{" "}
                  <strong>{cityToDelete?.name_en}</strong> ({cityToDelete?.city_code})?
                </span>
                <span className="block text-destructive font-semibold">
                  This action cannot be undone. All related data (areas, branches) must be removed first.
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

function CityActionsCell({
  city,
  authContext,
  onView,
  onEdit,
  onToggleActive,
  onToggleLock,
  onDelete,
}: {
  city: CityWithEmirate;
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
              disabled={city.is_locked && !isSystemAdmin}
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
                disabled={city.is_locked && !isSystemAdmin}
              >
                <Power className="h-4 w-4 mr-2" />
                {city.is_active ? "Deactivate" : "Activate"}
              </DropdownMenuItem>
              {(isSystemAdmin || hasLockPermission) && (
                <DropdownMenuItem onClick={onToggleLock}>
                  {city.is_locked ? (
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
