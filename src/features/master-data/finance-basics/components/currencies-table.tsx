"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Currency } from "@/features/master-data/finance-basics/types";
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
import {
  toggleCurrencyStatus,
  deleteCurrency,
  toggleCurrencyLock,
} from "@/features/master-data/finance-basics/actions";
import { toast } from "sonner";
import { format } from "date-fns";

type CurrenciesTableProps = {
  currencies: Currency[];
  authContext: AuthContext;
  onRefresh?: () => void;
};

const BASE = "/admin/master-data/finance-basics/currencies";

export function CurrenciesTable({ currencies, authContext, onRefresh }: CurrenciesTableProps) {
  const router = useRouter();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<Currency | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleRefresh = () => {
    if (onRefresh) onRefresh();
    else router.refresh();
  };

  const handleAdd = () => router.push(`${BASE}/record/new`);
  const handleView = (item: Currency) => router.push(`${BASE}/record/${item.id}`);
  const handleEdit = (item: Currency) => router.push(`${BASE}/record/${item.id}?mode=edit`);

  const handleToggleActive = async (item: Currency) => {
    const result = await toggleCurrencyStatus({ id: item.id, is_active: !item.is_active });
    if (result.success) {
      toast.success(`Currency ${item.is_active ? "deactivated" : "activated"} successfully`);
      handleRefresh();
    } else {
      toast.error(result.error ?? "Failed to toggle currency status");
    }
  };

  const handleToggleLock = async (item: Currency) => {
    const result = await toggleCurrencyLock(item.id, !item.is_locked);
    if (result.success) {
      toast.success(`Currency ${item.is_locked ? "unlocked" : "locked"} successfully`);
      handleRefresh();
    } else {
      toast.error(result.error ?? "Failed to toggle currency lock");
    }
  };

  const handleDeleteClick = (item: Currency) => {
    setItemToDelete(item);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!itemToDelete) return;
    setIsDeleting(true);
    const result = await deleteCurrency(itemToDelete.id);
    setIsDeleting(false);
    if (result.success) {
      toast.success("Currency deleted successfully");
      setDeleteDialogOpen(false);
      setItemToDelete(null);
      handleRefresh();
    } else {
      toast.error(result.error ?? "Failed to delete currency");
    }
  };

  const columns: ColumnDef<Currency>[] = [
    {
      accessorKey: "currency_code",
      accessorFn: (row) => `${row.currency_name_en} ${row.currency_code} ${row.symbol || ""}`,
      header: "Currency",
      cell: ({ row }) => (
        <div className="flex flex-col">
          <div className="flex items-center gap-2">
            <span className="font-medium">{row.original.currency_name_en}</span>
            {row.original.is_system && <Shield className="h-3 w-3 text-amber-600" />}
            {row.original.is_locked && <Lock className="h-3 w-3 text-destructive" />}
          </div>
          <span className="text-xs text-muted-foreground">
            {row.original.currency_code}
            {row.original.symbol ? ` · ${row.original.symbol}` : ""}
          </span>
        </div>
      ),
      meta: { exportable: true, exportHeader: "Currency Code", exportValue: (row) => row.currency_code },
    },
    {
      accessorKey: "decimal_places",
      header: "Decimals",
      cell: ({ row }) => <span className="text-sm">{row.original.decimal_places}</span>,
      meta: { exportable: true, exportHeader: "Decimal Places", exportValue: (row) => String(row.decimal_places) },
    },
    {
      id: "base",
      header: "Base",
      cell: ({ row }) =>
        row.original.is_base_currency ? (
          <Badge variant="default" className="text-xs">Base</Badge>
        ) : (
          <span className="text-sm text-muted-foreground">—</span>
        ),
      meta: { exportable: true, exportHeader: "Base Currency", exportValue: (row) => (row.is_base_currency ? "Yes" : "No") },
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
      cell: ({ row }) => (
        <FinanceBasicsActionsCell
          item={row.original}
          authContext={authContext}
          onView={() => handleView(row.original)}
          onEdit={() => handleEdit(row.original)}
          onToggleActive={() => handleToggleActive(row.original)}
          onToggleLock={() => handleToggleLock(row.original)}
          onDelete={() => handleDeleteClick(row.original)}
        />
      ),
      meta: { exportable: false },
    },
  ];

  return (
    <>
      <ERPDataTable<Currency>
        tableId="currencies_table"
        columns={columns}
        data={currencies}
        enableSorting
        enableColumnResizing
        enableRowSelection
        enableColumnVisibility
        enablePreferences
        searchPlaceholder="Search by name, code, or symbol..."
        enableGlobalFilter
        initialPageSize={25}
        exportConfig={{
          title: "Currencies Master Data",
          subtitle: `${currencies.length} currenc${currencies.length !== 1 ? "ies" : "y"} configured`,
          filename: "currencies-master-data",
          orientation: "landscape",
        }}
        toolbarSlot={
          <Button onClick={handleAdd} size="sm" className="gap-2">
            <Plus className="h-4 w-4" />
            Add Currency
          </Button>
        }
      />

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Currency</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to permanently delete{" "}
              <strong>{itemToDelete?.currency_name_en}</strong> ({itemToDelete?.currency_code})?
              This action cannot be undone.
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

type ActionsCellProps<T extends { is_system: boolean; is_locked: boolean; is_active: boolean }> = {
  item: T;
  authContext: AuthContext;
  onView: () => void;
  onEdit: () => void;
  onToggleActive: () => void;
  onToggleLock: () => void;
  onDelete: () => void;
};

export function FinanceBasicsActionsCell<T extends { is_system: boolean; is_locked: boolean; is_active: boolean }>({
  item,
  authContext,
  onView,
  onEdit,
  onToggleActive,
  onToggleLock,
  onDelete,
}: ActionsCellProps<T>) {
  const isSystemAdmin = authContext.roleCodes.includes("system_admin");
  const hasManagePermission = authContext.permissionCodes.includes("master_data.finance_basics.manage");
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
            <DropdownMenuItem onClick={onEdit} disabled={item.is_locked && !isSystemAdmin}>
              <Pencil className="h-4 w-4 mr-2" />
              Edit
            </DropdownMenuItem>
          )}
        </DropdownMenuGroup>
        {hasManagePermission && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem onClick={onToggleActive} disabled={item.is_locked && !isSystemAdmin}>
                <Power className="h-4 w-4 mr-2" />
                {item.is_active ? "Deactivate" : "Activate"}
              </DropdownMenuItem>
              {(isSystemAdmin || hasLockPermission) && (
                <DropdownMenuItem onClick={onToggleLock}>
                  {item.is_locked ? (
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
              <DropdownMenuItem onClick={onDelete} className="text-destructive focus:text-destructive">
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
