"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Bank } from "@/features/master-data/finance-basics/types";
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
import { BankFormDialog } from "./bank-form-dialog";
import { FinanceBasicsActionsCell } from "./currencies-table";
import {
  toggleBankStatus,
  deleteBank,
  toggleBankLock,
} from "@/features/master-data/finance-basics/actions";
import { toast } from "sonner";
import { format } from "date-fns";

type BanksTableProps = {
  banks: Bank[];
  authContext: AuthContext;
  onRefresh?: () => void;
};

export function BanksTable({ banks, authContext, onRefresh }: BanksTableProps) {
  const router = useRouter();
  const [selected, setSelected] = useState<Bank | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<"add" | "edit" | "view">("add");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<Bank | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleRefresh = () => {
    if (onRefresh) onRefresh();
    else router.refresh();
  };

  const columns: ColumnDef<Bank>[] = [
    {
      accessorKey: "bank_code",
      accessorFn: (row) => `${row.bank_name_en} ${row.bank_code} ${row.short_name || ""}`,
      header: "Bank",
      cell: ({ row }) => (
        <div className="flex flex-col">
          <span className="font-medium">{row.original.bank_name_en}</span>
          <span className="text-xs text-muted-foreground">
            {row.original.bank_code}
            {row.original.short_name ? ` · ${row.original.short_name}` : ""}
          </span>
        </div>
      ),
      meta: { exportable: true, exportHeader: "Bank Code", exportValue: (row) => row.bank_code },
    },
    {
      accessorKey: "bank_type_code",
      header: "Type",
      cell: ({ row }) => (
        <span className="text-sm">{row.original.bank_type_code || "—"}</span>
      ),
      meta: { exportable: true, exportHeader: "Bank Type", exportValue: (row) => row.bank_type_code || "" },
    },
    {
      accessorKey: "swift_code",
      header: "SWIFT",
      cell: ({ row }) => <span className="text-sm">{row.original.swift_code || "—"}</span>,
      meta: { exportable: true, exportHeader: "SWIFT", exportValue: (row) => row.swift_code || "" },
    },
    {
      accessorKey: "contact_email",
      header: "Contact",
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">
          {row.original.contact_email || row.original.contact_phone || "—"}
        </span>
      ),
      meta: { exportable: true, exportHeader: "Contact Email", exportValue: (row) => row.contact_email || "" },
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
              const result = await toggleBankStatus({ id: item.id, is_active: !item.is_active });
              if (result.success) { toast.success(`Bank ${item.is_active ? "deactivated" : "activated"}`); handleRefresh(); }
              else toast.error(result.error ?? "Failed to toggle status");
            }}
            onToggleLock={async () => {
              const result = await toggleBankLock(item.id, !item.is_locked);
              if (result.success) { toast.success(`Bank ${item.is_locked ? "unlocked" : "locked"}`); handleRefresh(); }
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
      <ERPDataTable<Bank>
        tableId="banks_table"
        columns={columns}
        data={banks}
        enableSorting
        enableColumnResizing
        enableRowSelection
        enableColumnVisibility
        enablePreferences
        searchPlaceholder="Search banks by code or name..."
        enableGlobalFilter
        initialPageSize={25}
        exportConfig={{
          title: "Banks Master Data",
          subtitle: `${banks.length} bank${banks.length !== 1 ? "s" : ""} configured`,
          filename: "banks-master-data",
          orientation: "landscape",
        }}
        toolbarSlot={
          <Button onClick={() => { setSelected(null); setFormMode("add"); setIsFormOpen(true); }} size="sm" className="gap-2">
            <Plus className="h-4 w-4" />
            Add Bank
          </Button>
        }
      />

      <BankFormDialog
        bank={selected}
        mode={formMode}
        open={isFormOpen}
        onOpenChange={(open) => { setIsFormOpen(open); if (!open) handleRefresh(); }}
      />

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Bank</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to permanently delete{" "}
              <strong>{itemToDelete?.bank_name_en}</strong> ({itemToDelete?.bank_code})?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (!itemToDelete) return;
                setIsDeleting(true);
                const result = await deleteBank(itemToDelete.id);
                setIsDeleting(false);
                if (result.success) {
                  toast.success("Bank deleted");
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
