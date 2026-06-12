"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { TaxType } from "@/features/master-data/finance-basics/types";
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
import { TaxTypeFormDialog } from "./tax-type-form-dialog";
import { FinanceBasicsActionsCell } from "./currencies-table";
import {
  toggleTaxTypeStatus,
  deleteTaxType,
  toggleTaxTypeLock,
} from "@/features/master-data/finance-basics/actions";
import { toast } from "sonner";
import { format } from "date-fns";

type TaxTypesTableProps = {
  taxTypes: TaxType[];
  authContext: AuthContext;
  onRefresh?: () => void;
};

export function TaxTypesTable({ taxTypes, authContext, onRefresh }: TaxTypesTableProps) {
  const router = useRouter();
  const [selected, setSelected] = useState<TaxType | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<"add" | "edit" | "view">("add");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<TaxType | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleRefresh = () => {
    if (onRefresh) onRefresh();
    else router.refresh();
  };

  const columns: ColumnDef<TaxType>[] = [
    {
      accessorKey: "tax_code",
      accessorFn: (row) => `${row.tax_name_en} ${row.tax_code}`,
      header: "Tax Type",
      cell: ({ row }) => (
        <div className="flex flex-col">
          <span className="font-medium">{row.original.tax_name_en}</span>
          <span className="text-xs text-muted-foreground">{row.original.tax_code}</span>
        </div>
      ),
      meta: { exportable: true, exportHeader: "Tax Code", exportValue: (row) => row.tax_code },
    },
    {
      accessorKey: "tax_rate",
      header: "Rate",
      cell: ({ row }) => <span className="text-sm">{row.original.tax_rate}%</span>,
      meta: { exportable: true, exportHeader: "Tax Rate", exportValue: (row) => String(row.tax_rate) },
    },
    {
      accessorKey: "tax_treatment_code",
      header: "Treatment",
      cell: ({ row }) => <Badge variant="outline" className="text-xs">{row.original.tax_treatment_code}</Badge>,
      meta: { exportable: true, exportHeader: "Treatment", exportValue: (row) => row.tax_treatment_code },
    },
    {
      id: "flags",
      header: "Flags",
      cell: ({ row }) => (
        <div className="flex gap-1 flex-wrap">
          {row.original.is_vat && <Badge variant="outline" className="text-xs">VAT</Badge>}
          {row.original.is_reverse_charge && <Badge variant="outline" className="text-xs">RCM</Badge>}
        </div>
      ),
      meta: { exportable: false },
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
              const result = await toggleTaxTypeStatus({ id: item.id, is_active: !item.is_active });
              if (result.success) { toast.success(`Tax type ${item.is_active ? "deactivated" : "activated"}`); handleRefresh(); }
              else toast.error(result.error ?? "Failed to toggle status");
            }}
            onToggleLock={async () => {
              const result = await toggleTaxTypeLock(item.id, !item.is_locked);
              if (result.success) { toast.success(`Tax type ${item.is_locked ? "unlocked" : "locked"}`); handleRefresh(); }
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
      <ERPDataTable<TaxType>
        tableId="tax_types_table"
        columns={columns}
        data={taxTypes}
        enableSorting
        enableColumnResizing
        enableRowSelection
        enableColumnVisibility
        enablePreferences
        searchPlaceholder="Search tax types by code or name..."
        enableGlobalFilter
        initialPageSize={25}
        exportConfig={{
          title: "Tax Types Master Data",
          subtitle: `${taxTypes.length} tax type${taxTypes.length !== 1 ? "s" : ""} configured`,
          filename: "tax-types-master-data",
          orientation: "landscape",
        }}
        toolbarSlot={
          <Button onClick={() => { setSelected(null); setFormMode("add"); setIsFormOpen(true); }} size="sm" className="gap-2">
            <Plus className="h-4 w-4" />
            Add Tax Type
          </Button>
        }
      />

      <TaxTypeFormDialog
        taxType={selected}
        mode={formMode}
        open={isFormOpen}
        onOpenChange={(open) => { setIsFormOpen(open); if (!open) handleRefresh(); }}
      />

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Tax Type</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to permanently delete{" "}
              <strong>{itemToDelete?.tax_name_en}</strong> ({itemToDelete?.tax_code})?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (!itemToDelete) return;
                setIsDeleting(true);
                const result = await deleteTaxType(itemToDelete.id);
                setIsDeleting(false);
                if (result.success) {
                  toast.success("Tax type deleted");
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
