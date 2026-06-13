"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { Customer } from "@/features/master-data/customers/types";
import type { AuthContext } from "@/lib/rbac/check";
import { ERPDataTable } from "@/components/erp/table/erp-data-table";
import type { ColumnDef } from "@tanstack/react-table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, MoreVertical, Eye, Edit, Power, Lock, Unlock, Trash2 } from "lucide-react";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CustomerFormDrawer } from "./customer-form-drawer";
import {
  deactivateCustomer,
  reactivateCustomer,
  lockCustomer,
  unlockCustomer,
  deleteCustomer,
} from "@/server/actions/master-data/customers";
import { toast } from "sonner";
import { format } from "date-fns";
import { useCustomerFormPrefetch } from "@/features/master-data/customers/hooks/use-customer-form-prefetch";

type CustomersTableProps = {
  customers: Customer[];
  authContext: AuthContext;
  onRefresh?: () => void;
};

export function CustomersTable({ customers, authContext, onRefresh }: CustomersTableProps) {
  const router = useRouter();
  const [selected, setSelected] = useState<Customer | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<"add" | "edit" | "view">("add");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<Customer | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // 3B.6G.2 — warm Customer form lookup/master caches on page mount so the
  // drawer's comboboxes are ready before the user clicks Add/Edit.
  const prefetchCustomerForm = useCustomerFormPrefetch();
  useEffect(() => {
    prefetchCustomerForm();
  }, [prefetchCustomerForm]);

  // Fire-and-forget prefetch + open drawer immediately (never blocks open).
  // Covers cold/stale cache when the user clicks straight after navigation.
  const openDrawer = (item: Customer | null, mode: "add" | "edit" | "view") => {
    prefetchCustomerForm();
    setSelected(item);
    setFormMode(mode);
    setIsFormOpen(true);
  };

  const handleRefresh = () => {
    if (onRefresh) onRefresh();
    else router.refresh();
  };

  const canManage = authContext.permissionCodes?.includes("master_data.party_master.manage");
  const isSystemAdmin = authContext.permissionCodes?.includes("system_admin");

  const columns: ColumnDef<Customer>[] = [
    {
      accessorKey: "customer_code",
      header: "Code",
      cell: ({ row }) => (
        <span className="font-mono text-sm font-medium">{row.original.customer_code}</span>
      ),
      meta: { exportable: true },
    },
    {
      accessorKey: "customer_name_en",
      header: "Customer Name",
      cell: ({ row }) => (
        <div className="flex flex-col">
          <span className="font-medium">{row.original.customer_name_en}</span>
          {row.original.customer_name_ar && (
            <span className="text-xs text-muted-foreground">{row.original.customer_name_ar}</span>
          )}
        </div>
      ),
      meta: { exportable: true },
    },
    {
      accessorKey: "customer_type_code",
      header: "Type",
      cell: ({ row }) => (
        <span className="text-sm">{row.original.customer_type_code || "—"}</span>
      ),
      meta: { exportable: true },
    },
    {
      accessorKey: "trn",
      header: "TRN",
      cell: ({ row }) => (
        <span className="text-sm font-mono">{row.original.trn || "—"}</span>
      ),
      meta: { exportable: true },
    },
    {
      accessorKey: "primary_email",
      header: "Email",
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">{row.original.primary_email || "—"}</span>
      ),
      meta: { exportable: true },
    },
    {
      accessorKey: "primary_mobile",
      header: "Mobile",
      cell: ({ row }) => (
        <span className="text-sm">{row.original.primary_mobile || "—"}</span>
      ),
      meta: { exportable: true },
    },
    {
      accessorKey: "icv_status_code",
      header: "ICV Status",
      cell: ({ row }) => (
        <span className="text-xs">{row.original.icv_status_code || "—"}</span>
      ),
      meta: { exportable: true },
    },
    {
      accessorKey: "is_active",
      header: "Status",
      cell: ({ row }) => (
        <Badge variant={row.original.is_active ? "default" : "secondary"} className="text-xs">
          {row.original.is_active ? "Active" : "Inactive"}
        </Badge>
      ),
      meta: { exportable: true, exportValue: (row) => (row.is_active ? "Active" : "Inactive") },
    },
    {
      accessorKey: "updated_at",
      header: "Updated",
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground">
          {format(new Date(row.original.updated_at), "yyyy-MM-dd")}
        </span>
      ),
      meta: { exportable: true },
    },
    {
      id: "actions",
      header: "Actions",
      cell: ({ row }) => {
        const item = row.original;
        return (
          <DropdownMenu>
            <DropdownMenuTrigger className="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-accent hover:text-accent-foreground p-0">
              <MoreVertical className="h-4 w-4" />
              <span className="sr-only">Open menu</span>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => openDrawer(item, "view")}>
                <Eye className="mr-2 h-4 w-4" />
                View
              </DropdownMenuItem>
              {canManage && !item.is_locked && (
                <DropdownMenuItem onClick={() => openDrawer(item, "edit")}>
                  <Edit className="mr-2 h-4 w-4" />
                  Edit
                </DropdownMenuItem>
              )}
              {canManage && !item.is_locked && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={async () => {
                      const result = item.is_active
                        ? await deactivateCustomer(item.id)
                        : await reactivateCustomer(item.id);
                      if (result.success) {
                        toast.success(`Customer ${item.is_active ? "deactivated" : "reactivated"}`);
                        handleRefresh();
                      } else {
                        toast.error(result.error ?? "Failed to toggle status");
                      }
                    }}
                  >
                    <Power className="mr-2 h-4 w-4" />
                    {item.is_active ? "Deactivate" : "Reactivate"}
                  </DropdownMenuItem>
                </>
              )}
              {isSystemAdmin && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={async () => {
                      const result = item.is_locked
                        ? await unlockCustomer(item.id)
                        : await lockCustomer(item.id);
                      if (result.success) {
                        toast.success(`Customer ${item.is_locked ? "unlocked" : "locked"}`);
                        handleRefresh();
                      } else {
                        toast.error(result.error ?? "Failed to toggle lock");
                      }
                    }}
                  >
                    {item.is_locked ? <Unlock className="mr-2 h-4 w-4" /> : <Lock className="mr-2 h-4 w-4" />}
                    {item.is_locked ? "Unlock" : "Lock"}
                  </DropdownMenuItem>
                  {!item.is_system && (
                    <DropdownMenuItem
                      onClick={() => { setItemToDelete(item); setDeleteDialogOpen(true); }}
                      className="text-destructive focus:text-destructive"
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Delete
                    </DropdownMenuItem>
                  )}
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
      meta: { exportable: false },
    },
  ];

  return (
    <>
      <ERPDataTable<Customer>
        tableId="customers_table"
        columns={columns}
        data={customers}
        enableSorting
        enableColumnResizing
        enableRowSelection
        enableColumnVisibility
        enablePreferences
        searchPlaceholder="Search customers by code, name, email..."
        enableGlobalFilter
        initialPageSize={25}
        exportConfig={{
          title: "Customers Master Data",
          subtitle: `${customers.length} customer${customers.length !== 1 ? "s" : ""} registered`,
          filename: "customers-master-data",
          orientation: "landscape",
        }}
        toolbarSlot={
          canManage ? (
            <Button onClick={() => openDrawer(null, "add")} size="sm" className="gap-2">
              <Plus className="h-4 w-4" />
              Add Customer
            </Button>
          ) : null
        }
      />

      <CustomerFormDrawer
        customer={selected}
        mode={formMode}
        open={isFormOpen}
        onOpenChange={(open) => { setIsFormOpen(open); if (!open) handleRefresh(); }}
        authContext={authContext}
      />

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Customer</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to permanently delete{" "}
              <strong>{itemToDelete?.customer_name_en}</strong> ({itemToDelete?.customer_code})?
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (!itemToDelete) return;
                setIsDeleting(true);
                const result = await deleteCustomer(itemToDelete.id);
                setIsDeleting(false);
                if (result.success) {
                  toast.success("Customer deleted");
                  setDeleteDialogOpen(false);
                  setItemToDelete(null);
                  handleRefresh();
                } else {
                  toast.error(result.error ?? "Failed to delete");
                }
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
