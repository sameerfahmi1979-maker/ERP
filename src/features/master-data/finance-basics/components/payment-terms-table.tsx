"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { PaymentTerm } from "@/features/master-data/finance-basics/types";
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
import { PaymentTermFormDialog } from "./payment-term-form-dialog";
import { FinanceBasicsActionsCell } from "./currencies-table";
import {
  togglePaymentTermStatus,
  deletePaymentTerm,
  togglePaymentTermLock,
} from "@/features/master-data/finance-basics/actions";
import { toast } from "sonner";
import { format } from "date-fns";

type PaymentTermsTableProps = {
  paymentTerms: PaymentTerm[];
  authContext: AuthContext;
  onRefresh?: () => void;
};

export function PaymentTermsTable({ paymentTerms, authContext, onRefresh }: PaymentTermsTableProps) {
  const router = useRouter();
  const [selected, setSelected] = useState<PaymentTerm | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<"add" | "edit" | "view">("add");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<PaymentTerm | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleRefresh = () => {
    if (onRefresh) onRefresh();
    else router.refresh();
  };

  const columns: ColumnDef<PaymentTerm>[] = [
    {
      accessorKey: "term_code",
      accessorFn: (row) => `${row.term_name_en} ${row.term_code}`,
      header: "Payment Term",
      cell: ({ row }) => (
        <div className="flex flex-col">
          <span className="font-medium">{row.original.term_name_en}</span>
          <span className="text-xs text-muted-foreground">{row.original.term_code}</span>
        </div>
      ),
      meta: { exportable: true, exportHeader: "Term Code", exportValue: (row) => row.term_code },
    },
    {
      accessorKey: "due_days",
      header: "Due Days",
      cell: ({ row }) => <span className="text-sm">{row.original.due_days}</span>,
      meta: { exportable: true, exportHeader: "Due Days", exportValue: (row) => String(row.due_days) },
    },
    {
      accessorKey: "advance_percentage",
      header: "Advance %",
      cell: ({ row }) => <span className="text-sm">{row.original.advance_percentage}%</span>,
      meta: { exportable: true, exportHeader: "Advance %", exportValue: (row) => String(row.advance_percentage) },
    },
    {
      accessorKey: "retention_percentage",
      header: "Retention %",
      cell: ({ row }) => <span className="text-sm">{row.original.retention_percentage}%</span>,
      meta: { exportable: true, exportHeader: "Retention %", exportValue: (row) => String(row.retention_percentage) },
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
              const result = await togglePaymentTermStatus({ id: item.id, is_active: !item.is_active });
              if (result.success) { toast.success(`Payment term ${item.is_active ? "deactivated" : "activated"}`); handleRefresh(); }
              else toast.error(result.error ?? "Failed to toggle status");
            }}
            onToggleLock={async () => {
              const result = await togglePaymentTermLock(item.id, !item.is_locked);
              if (result.success) { toast.success(`Payment term ${item.is_locked ? "unlocked" : "locked"}`); handleRefresh(); }
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
      <ERPDataTable<PaymentTerm>
        tableId="payment_terms_table"
        columns={columns}
        data={paymentTerms}
        enableSorting
        enableColumnResizing
        enableRowSelection
        enableColumnVisibility
        enablePreferences
        searchPlaceholder="Search by name or code..."
        enableGlobalFilter
        initialPageSize={25}
        exportConfig={{
          title: "Payment Terms Master Data",
          subtitle: `${paymentTerms.length} term${paymentTerms.length !== 1 ? "s" : ""} configured`,
          filename: "payment-terms-master-data",
          orientation: "landscape",
        }}
        toolbarSlot={
          <Button onClick={() => { setSelected(null); setFormMode("add"); setIsFormOpen(true); }} size="sm" className="gap-2">
            <Plus className="h-4 w-4" />
            Add Payment Term
          </Button>
        }
      />

      <PaymentTermFormDialog
        paymentTerm={selected}
        mode={formMode}
        open={isFormOpen}
        onOpenChange={(open) => { setIsFormOpen(open); if (!open) handleRefresh(); }}
      />

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Payment Term</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to permanently delete{" "}
              <strong>{itemToDelete?.term_name_en}</strong> ({itemToDelete?.term_code})?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (!itemToDelete) return;
                setIsDeleting(true);
                const result = await deletePaymentTerm(itemToDelete.id);
                setIsDeleting(false);
                if (result.success) {
                  toast.success("Payment term deleted");
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
