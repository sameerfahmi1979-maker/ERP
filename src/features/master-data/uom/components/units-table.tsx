"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { UnitOfMeasureWithCategory } from "../types";
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
  Star,
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
import {
  toggleUnitOfMeasureStatus,
  deleteUnitOfMeasure,
  toggleUnitOfMeasureLock,
} from "../actions";
import { toast } from "sonner";
import { format } from "date-fns";

type UnitsTableProps = {
  units: UnitOfMeasureWithCategory[];
  authContext: AuthContext;
  onRefresh?: () => void;
};

const BASE = "/admin/master-data/uom/units";

export function UnitsTable({ units, authContext, onRefresh }: UnitsTableProps) {
  const router = useRouter();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<UnitOfMeasureWithCategory | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleRefresh = () => {
    if (onRefresh) onRefresh();
    else router.refresh();
  };

  const handleAdd = () => router.push(`${BASE}/record/new`);
  const handleView = (item: UnitOfMeasureWithCategory) => router.push(`${BASE}/record/${item.id}`);
  const handleEdit = (item: UnitOfMeasureWithCategory) => router.push(`${BASE}/record/${item.id}?mode=edit`);

  const handleToggleActive = async (item: UnitOfMeasureWithCategory) => {
    const result = await toggleUnitOfMeasureStatus({ id: item.id, is_active: !item.is_active });
    if (result.success) {
      toast.success(`Unit ${item.is_active ? "deactivated" : "activated"} successfully`);
      handleRefresh();
    } else {
      toast.error(result.error ?? "Failed to toggle unit status");
    }
  };

  const handleToggleLock = async (item: UnitOfMeasureWithCategory) => {
    const result = await toggleUnitOfMeasureLock(item.id, !item.is_locked);
    if (result.success) {
      toast.success(`Unit ${item.is_locked ? "unlocked" : "locked"} successfully`);
      handleRefresh();
    } else {
      toast.error(result.error ?? "Failed to toggle unit lock");
    }
  };

  const handleDeleteClick = (item: UnitOfMeasureWithCategory) => {
    setItemToDelete(item);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!itemToDelete) return;
    setIsDeleting(true);
    const result = await deleteUnitOfMeasure(itemToDelete.id);
    setIsDeleting(false);
    setDeleteDialogOpen(false);

    if (result.success) {
      toast.success("Unit deleted successfully");
      setItemToDelete(null);
      handleRefresh();
    } else {
      toast.error(result.error ?? "Failed to delete unit");
    }
  };

  const canManage = authContext.permissionCodes?.includes("master_data.uom.manage") ?? false;
  const isSystemAdmin = authContext.roleCodes?.includes("system_admin") ?? false;

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
      header: () => <div className="text-right">Actions</div>,
      cell: ({ row }) => {
        const item = row.original;
        const canModify = canManage && (!item.is_locked || isSystemAdmin);

        return (
          <div className="flex justify-end">
            <DropdownMenu>
              <DropdownMenuTrigger render={<Button variant="ghost" size="icon" className="h-8 w-8" />}>
                <MoreHorizontal className="h-4 w-4" />
                <span className="sr-only">Actions</span>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuGroup>
                  <DropdownMenuItem onClick={() => handleView(item)}>
                    <Eye className="mr-2 h-4 w-4" />
                    View
                  </DropdownMenuItem>
                  {canModify && (
                    <DropdownMenuItem onClick={() => handleEdit(item)}>
                      <Pencil className="mr-2 h-4 w-4" />
                      Edit
                    </DropdownMenuItem>
                  )}
                </DropdownMenuGroup>
                {canModify && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => handleToggleActive(item)}>
                      <Power className="mr-2 h-4 w-4" />
                      {item.is_active ? "Deactivate" : "Activate"}
                    </DropdownMenuItem>
                  </>
                )}
                {isSystemAdmin && (
                  <>
                    <DropdownMenuItem onClick={() => handleToggleLock(item)}>
                      {item.is_locked ? (
                        <>
                          <Unlock className="mr-2 h-4 w-4" />
                          Unlock
                        </>
                      ) : (
                        <>
                          <Lock className="mr-2 h-4 w-4" />
                          Lock
                        </>
                      )}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() => handleDeleteClick(item)}
                      className="text-destructive"
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Delete
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        );
      },
    },
  ];

  return (
    <>
      <ERPDataTable<UnitOfMeasureWithCategory>
        tableId="units_of_measure_table"
        columns={columns}
        data={units}
        searchPlaceholder="Search units..."
        toolbarSlot={
          canManage ? (
            <Button onClick={handleAdd} size="sm">
              <Plus className="mr-2 h-4 w-4" />
              Add Unit
            </Button>
          ) : undefined
        }
      />

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Unit of Measure</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &quot;{itemToDelete?.unit_name_en}&quot;? This action
              cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
