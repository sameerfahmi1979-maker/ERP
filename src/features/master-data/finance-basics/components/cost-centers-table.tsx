"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { CostCenter } from "@/features/master-data/finance-basics/types";
import type { AuthContext } from "@/lib/rbac/check";
import { ERPDataTable } from "@/components/erp/table/erp-data-table";
import type { ColumnDef } from "@tanstack/react-table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus } from "lucide-react";
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
import { CostCenterFormDialog } from "./cost-center-form-dialog";
import { FinanceBasicsActionsCell } from "./currencies-table";
import {
  toggleCostCenterStatus,
  deleteCostCenter,
  toggleCostCenterLock,
} from "@/features/master-data/finance-basics/actions";
import { toast } from "sonner";
import { format } from "date-fns";

type CostCentersTableProps = {
  costCenters: CostCenter[];
  authContext: AuthContext;
  onRefresh?: () => void;
};

export function CostCentersTable({ costCenters, authContext, onRefresh }: CostCentersTableProps) {
  const router = useRouter();
  const [selected, setSelected] = useState<CostCenter | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<"add" | "edit" | "view">("add");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<CostCenter | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleRefresh = () => {
    if (onRefresh) onRefresh();
    else router.refresh();
  };

  const columns: ColumnDef<CostCenter>[] = [
    {
      accessorKey: "cost_center_code",
      accessorFn: (row) => `${row.cost_center_name_en} ${row.cost_center_code}`,
      header: "Cost Center",
      cell: ({ row }) => (
        <div className="flex flex-col">
          <span className="font-medium">{row.original.cost_center_name_en}</span>
          <span className="text-xs text-muted-foreground">{row.original.cost_center_code}</span>
        </div>
      ),
      meta: { exportable: true, exportHeader: "Code", exportValue: (row) => row.cost_center_code },
    },
    {
      accessorKey: "cost_center_type_code",
      header: "Type",
      cell: ({ row }) => (
        <Badge variant="outline" className="text-xs">
          {row.original.cost_center_type_code || "—"}
        </Badge>
      ),
      meta: { exportable: true, exportHeader: "Type", exportValue: (row) => row.cost_center_type_code || "" },
    },
    {
      accessorKey: "owner_company_id",
      header: "Company",
      cell: ({ row }) => (
        <span className="text-sm">{row.original.owner_company_id ?? "Global"}</span>
      ),
      meta: { exportable: true, exportHeader: "Company ID", exportValue: (row) => String(row.owner_company_id ?? "") },
    },
    {
      accessorKey: "branch_id",
      header: "Branch",
      cell: ({ row }) => (
        <span className="text-sm">{row.original.branch_id ?? "—"}</span>
      ),
      meta: { exportable: true, exportHeader: "Branch ID", exportValue: (row) => String(row.branch_id ?? "") },
    },
    {
      accessorKey: "is_active",
      header: "Status",
      cell: ({ row }) => (
        <Badge variant={row.original.is_active ? "default" : "secondary"} className="text-xs">
          {row.original.is_active ? "Active" : "Inactive"}
        </Badge>
      ),
      meta: { exportable: true, exportHeader: "Status", exportValue: (row) => (row.is_active ? "Active" : "Inactive") },
    },
    {
      accessorKey: "updated_at",
      header: "Updated",
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground">
          {format(new Date(row.original.updated_at), "yyyy-MM-dd HH:mm")}
        </span>
      ),
      meta: { exportable: true, exportHeader: "Updated At", exportValue: (row) => row.updated_at },
    },
    {
      id: "actions",
      header: "Actions",
      cell: ({ row }) => {
        const item = row.original;
        return (
          <FinanceBasicsActionsCell
            item={item}
            authContext={authContext}
            onView={() => { setSelected(item); setFormMode("view"); setIsFormOpen(true); }}
            onEdit={() => { setSelected(item); setFormMode("edit"); setIsFormOpen(true); }}
            onToggleActive={async () => {
              const result = await toggleCostCenterStatus({ id: item.id, is_active: !item.is_active });
              if (result.success) { toast.success(`Cost center ${item.is_active ? "deactivated" : "activated"}`); handleRefresh(); }
              else toast.error(result.error ?? "Failed to toggle status");
            }}
            onToggleLock={async () => {
              const result = await toggleCostCenterLock(item.id, !item.is_locked);
              if (result.success) { toast.success(`Cost center ${item.is_locked ? "unlocked" : "locked"}`); handleRefresh(); }
              else toast.error(result.error ?? "Failed to toggle lock");
            }}
            onDelete={() => { setItemToDelete(item); setDeleteDialogOpen(true); }}
          />
        );
      },
      meta: { exportable: false },
    },
  ];

  return (
    <>
      <ERPDataTable<CostCenter>
        tableId="cost_centers_table"
        columns={columns}
        data={costCenters}
        enableSorting
        enableColumnResizing
        enableRowSelection
        enableColumnVisibility
        enablePreferences
        searchPlaceholder="Search cost centers by code or name..."
        enableGlobalFilter
        initialPageSize={25}
        exportConfig={{
          title: "Cost Centers Master Data",
          subtitle: `${costCenters.length} cost center${costCenters.length !== 1 ? "s" : ""} configured`,
          filename: "cost-centers-master-data",
          orientation: "landscape",
        }}
        toolbarSlot={
          <Button onClick={() => { setSelected(null); setFormMode("add"); setIsFormOpen(true); }} size="sm" className="gap-2">
            <Plus className="h-4 w-4" />
            Add Cost Center
          </Button>
        }
      />

      <CostCenterFormDialog
        costCenter={selected}
        mode={formMode}
        open={isFormOpen}
        onOpenChange={(open) => { setIsFormOpen(open); if (!open) handleRefresh(); }}
      />

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Cost Center</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to permanently delete{" "}
              <strong>{itemToDelete?.cost_center_name_en}</strong> ({itemToDelete?.cost_center_code})?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (!itemToDelete) return;
                setIsDeleting(true);
                const result = await deleteCostCenter(itemToDelete.id);
                setIsDeleting(false);
                if (result.success) {
                  toast.success("Cost center deleted");
                  setDeleteDialogOpen(false);
                  setItemToDelete(null);
                  handleRefresh();
                } else toast.error(result.error ?? "Failed to delete");
              }}
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
