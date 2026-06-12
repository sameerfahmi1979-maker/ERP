"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { UomCategory } from "../types";
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
import { UomCategoryFormDialog } from "./uom-category-form-dialog";
import {
  toggleUomCategoryStatus,
  deleteUomCategory,
  toggleUomCategoryLock,
} from "../actions";
import { toast } from "sonner";
import { format } from "date-fns";

type UomCategoriesTableProps = {
  categories: UomCategory[];
  authContext: AuthContext;
  onRefresh?: () => void;
};

export function UomCategoriesTable({ categories, authContext, onRefresh }: UomCategoriesTableProps) {
  const router = useRouter();
  const [selected, setSelected] = useState<UomCategory | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<"add" | "edit" | "view">("add");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<UomCategory | null>(null);
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

  const handleView = (item: UomCategory) => {
    setSelected(item);
    setFormMode("view");
    setIsFormOpen(true);
  };

  const handleEdit = (item: UomCategory) => {
    setSelected(item);
    setFormMode("edit");
    setIsFormOpen(true);
  };

  const handleToggleActive = async (item: UomCategory) => {
    const result = await toggleUomCategoryStatus({ id: item.id, is_active: !item.is_active });
    if (result.success) {
      toast.success(`Category ${item.is_active ? "deactivated" : "activated"} successfully`);
      handleRefresh();
    } else {
      toast.error(result.error ?? "Failed to toggle category status");
    }
  };

  const handleToggleLock = async (item: UomCategory) => {
    const result = await toggleUomCategoryLock(item.id, !item.is_locked);
    if (result.success) {
      toast.success(`Category ${item.is_locked ? "unlocked" : "locked"} successfully`);
      handleRefresh();
    } else {
      toast.error(result.error ?? "Failed to toggle category lock");
    }
  };

  const handleDeleteClick = (item: UomCategory) => {
    setItemToDelete(item);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!itemToDelete) return;
    setIsDeleting(true);
    const result = await deleteUomCategory(itemToDelete.id);
    setIsDeleting(false);
    setDeleteDialogOpen(false);

    if (result.success) {
      toast.success("Category deleted successfully");
      setItemToDelete(null);
      handleRefresh();
    } else {
      toast.error(result.error ?? "Failed to delete category");
    }
  };

  const canManage = authContext.permissionCodes?.includes("master_data.uom.manage") ?? false;
  const isSystemAdmin = authContext.roleCodes?.includes("system_admin") ?? false;

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
      <ERPDataTable<UomCategory>
        tableId="uom_categories_table"
        columns={columns}
        data={categories}
        searchPlaceholder="Search categories..."
        toolbarSlot={
          canManage ? (
            <Button onClick={handleAdd} size="sm">
              <Plus className="mr-2 h-4 w-4" />
              Add Category
            </Button>
          ) : undefined
        }
      />

      <UomCategoryFormDialog
        open={isFormOpen}
        onOpenChange={setIsFormOpen}
        mode={formMode}
        category={selected}
        onSuccess={handleRefresh}
      />

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete UOM Category</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &quot;{itemToDelete?.category_name_en}&quot;? This action
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
