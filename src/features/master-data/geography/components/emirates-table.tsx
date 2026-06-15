"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Emirate } from "@/features/master-data/geography/types";
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
import { toggleEmirateStatus, deleteEmirate, toggleEmirateLock } from "@/features/master-data/geography/actions";
import { toast } from "sonner";
import { format } from "date-fns";

type EmiratesTableProps = {
  emirates: Emirate[];
  authContext: AuthContext;
  onRefresh?: () => void;
};

const BASE = "/admin/master-data/geography/emirates";

export function EmiratesTable({ emirates, authContext, onRefresh }: EmiratesTableProps) {
  const router = useRouter();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [emirateToDelete, setEmirateToDelete] = useState<Emirate | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleRefresh = () => {
    if (onRefresh) { onRefresh(); } else { router.refresh(); }
  };

  const handleAdd = () => router.push(`${BASE}/record/new`);
  const handleView = (emirate: Emirate) => router.push(`${BASE}/record/${emirate.id}`);
  const handleEdit = (emirate: Emirate) => router.push(`${BASE}/record/${emirate.id}?mode=edit`);

  const handleToggleActive = async (emirate: Emirate) => {
    const result = await toggleEmirateStatus({
      id: emirate.id,
      is_active: !emirate.is_active,
    });
    if (result.success) {
      toast.success(`Emirate ${emirate.is_active ? "deactivated" : "activated"} successfully`);
      handleRefresh();
    } else {
      toast.error(result.error ?? "Failed to toggle emirate status");
    }
  };

  const handleToggleLock = async (emirate: Emirate) => {
    const result = await toggleEmirateLock(emirate.id, !emirate.is_locked);
    if (result.success) {
      toast.success(`Emirate ${emirate.is_locked ? "unlocked" : "locked"} successfully`);
      handleRefresh();
    } else {
      toast.error(result.error ?? "Failed to toggle emirate lock");
    }
  };

  const handleDeleteClick = (emirate: Emirate) => {
    setEmirateToDelete(emirate);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!emirateToDelete) return;

    setIsDeleting(true);
    const result = await deleteEmirate(emirateToDelete.id);
    setIsDeleting(false);

    if (result.success) {
      toast.success("Emirate deleted successfully");
      setDeleteDialogOpen(false);
      setEmirateToDelete(null);
      handleRefresh();
    } else {
      toast.error(result.error ?? "Failed to delete emirate");
    }
  };


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
          <EmirateActionsCell
            emirate={emirate}
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
          <Button onClick={handleAdd} size="sm" className="gap-2">
            <Plus className="h-4 w-4" />
            Add Emirate
          </Button>
        }
      />

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Emirate</AlertDialogTitle>
            <AlertDialogDescription>
              <span className="space-y-2 block">
                <span className="block">
                  Are you sure you want to permanently delete{" "}
                  <strong>{emirateToDelete?.name_en}</strong> ({emirateToDelete?.emirate_code})?
                </span>
                <span className="block text-destructive font-semibold">
                  This action cannot be undone. All related data (cities, ports, areas) must be removed first.
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

function EmirateActionsCell({
  emirate,
  authContext,
  onView,
  onEdit,
  onToggleActive,
  onToggleLock,
  onDelete,
}: {
  emirate: Emirate;
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
              disabled={emirate.is_locked && !isSystemAdmin}
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
                disabled={emirate.is_locked && !isSystemAdmin}
              >
                <Power className="h-4 w-4 mr-2" />
                {emirate.is_active ? "Deactivate" : "Activate"}
              </DropdownMenuItem>
              {(isSystemAdmin || hasLockPermission) && (
                <DropdownMenuItem onClick={onToggleLock}>
                  {emirate.is_locked ? (
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
