"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { UomConversionWithUnits } from "../types";
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
  ArrowRight,
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
import { ConversionFormDialog } from "./conversion-form-dialog";
import {
  toggleUomConversionStatus,
  deleteUomConversion,
  toggleUomConversionLock,
} from "../actions";
import { toast } from "sonner";
import { format } from "date-fns";

type ConversionsTableProps = {
  conversions: UomConversionWithUnits[];
  authContext: AuthContext;
  onRefresh?: () => void;
};

export function ConversionsTable({ conversions, authContext, onRefresh }: ConversionsTableProps) {
  const router = useRouter();
  const [selected, setSelected] = useState<UomConversionWithUnits | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<"add" | "edit" | "view">("add");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<UomConversionWithUnits | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleRefresh = () => {
    if (onRefresh) onRefresh();
    else router.refresh();
  };

  const handleAdd = () => {
    setSelected(null);
    setFormMode("add");
    setIsFormOpen(true);
  };

  const handleView = (item: UomConversionWithUnits) => {
    setSelected(item);
    setFormMode("view");
    setIsFormOpen(true);
  };

  const handleEdit = (item: UomConversionWithUnits) => {
    setSelected(item);
    setFormMode("edit");
    setIsFormOpen(true);
  };

  const handleToggleActive = async (item: UomConversionWithUnits) => {
    const result = await toggleUomConversionStatus({ id: item.id, is_active: !item.is_active });
    if (result.success) {
      toast.success(`Conversion ${item.is_active ? "deactivated" : "activated"} successfully`);
      handleRefresh();
    } else {
      toast.error(result.error ?? "Failed to toggle conversion status");
    }
  };

  const handleToggleLock = async (item: UomConversionWithUnits) => {
    const result = await toggleUomConversionLock(item.id, !item.is_locked);
    if (result.success) {
      toast.success(`Conversion ${item.is_locked ? "unlocked" : "locked"} successfully`);
      handleRefresh();
    } else {
      toast.error(result.error ?? "Failed to toggle conversion lock");
    }
  };

  const handleDeleteClick = (item: UomConversionWithUnits) => {
    setItemToDelete(item);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!itemToDelete) return;
    setIsDeleting(true);
    const result = await deleteUomConversion(itemToDelete.id);
    setIsDeleting(false);
    setDeleteDialogOpen(false);

    if (result.success) {
      toast.success("Conversion deleted successfully");
      setItemToDelete(null);
      handleRefresh();
    } else {
      toast.error(result.error ?? "Failed to delete conversion");
    }
  };

  const canManage = authContext.permissionCodes?.includes("master_data.uom.manage") ?? false;
  const isSystemAdmin = authContext.roleCodes?.includes("system_admin") ?? false;

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
      <ERPDataTable<UomConversionWithUnits>
        tableId="uom_conversions_table"
        columns={columns}
        data={conversions}
        searchPlaceholder="Search conversions..."
        toolbarSlot={
          canManage ? (
            <Button onClick={handleAdd} size="sm">
              <Plus className="mr-2 h-4 w-4" />
              Add Conversion
            </Button>
          ) : undefined
        }
      />

      <ConversionFormDialog
        open={isFormOpen}
        onOpenChange={setIsFormOpen}
        mode={formMode}
        conversion={selected}
        onSuccess={handleRefresh}
      />

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete UOM Conversion</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this conversion? This action cannot be undone.
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
