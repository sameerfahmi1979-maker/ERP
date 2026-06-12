"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { LookupValueWithCategory, LookupCategory } from "@/features/master-data/lookups/types";
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
  Lock,
  Unlock,
  Star,
  MoreHorizontal,
  Plus,
} from "lucide-react";
import { ValueFormDialog } from "./value-form-dialog";
import {
  toggleLookupValueStatus,
  toggleLookupValueLock,
  setDefaultLookupValue,
} from "@/server/actions/master-data/lookups";
import { toast } from "sonner";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

type ValuesTableProps = {
  values: LookupValueWithCategory[];
  categories: LookupCategory[];
  onRefresh?: () => void;
};

export function ValuesTable({ values, categories, onRefresh }: ValuesTableProps) {
  const router = useRouter();
  const [selectedValue, setSelectedValue] = useState<LookupValueWithCategory | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<"add" | "edit" | "view">("add");
  const [isLoading, setIsLoading] = useState(false);

  const handleRefresh = () => {
    if (onRefresh) {
      onRefresh();
    } else {
      router.refresh();
    }
  };

  const handleAdd = () => {
    setSelectedValue(null);
    setFormMode("add");
    setIsFormOpen(true);
  };

  const handleView = (value: LookupValueWithCategory) => {
    setSelectedValue(value);
    setFormMode("view");
    setIsFormOpen(true);
  };

  const handleEdit = (value: LookupValueWithCategory) => {
    setSelectedValue(value);
    setFormMode("edit");
    setIsFormOpen(true);
  };

  const handleToggleActive = async (value: LookupValueWithCategory) => {
    setIsLoading(true);
    try {
      const result = await toggleLookupValueStatus(value.id, !value.is_active);
      if (result.success) {
        toast.success(`Value ${value.is_active ? "deactivated" : "activated"} successfully`);
        handleRefresh();
      } else {
        toast.error(result.error ?? "Failed to toggle value status");
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggleLock = async (value: LookupValueWithCategory) => {
    setIsLoading(true);
    try {
      const result = await toggleLookupValueLock(value.id, !value.is_locked);
      if (result.success) {
        toast.success(`Value ${value.is_locked ? "unlocked" : "locked"} successfully`);
        handleRefresh();
      } else {
        toast.error(result.error ?? "Failed to toggle value lock");
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleSetDefault = async (value: LookupValueWithCategory) => {
    if (value.is_default) {
      toast.info("This value is already the default");
      return;
    }

    setIsLoading(true);
    try {
      const result = await setDefaultLookupValue(value.id, value.category_id);
      if (result.success) {
        toast.success(`Set "${value.value_label_en}" as default for category`);
        handleRefresh();
      } else {
        toast.error(result.error ?? "Failed to set default value");
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleFormClose = (success: boolean) => {
    setIsFormOpen(false);
    if (success) {
      handleRefresh();
    }
  };

  const columns: ColumnDef<LookupValueWithCategory>[] = [
    {
      accessorKey: "value_code",
      header: "Value",
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <div className="flex flex-col">
            <div className="flex items-center gap-1.5">
              <span className="font-medium">{row.original.value_label_en}</span>
              {row.original.is_default && (
                <Star className="h-3.5 w-3.5 text-yellow-500 fill-yellow-500" />
              )}
            </div>
            <span className="text-xs text-muted-foreground">{row.original.value_code}</span>
          </div>
        </div>
      ),
      meta: {
        exportable: true,
        exportHeader: "Value Code",
        exportValue: (row) => row.value_code,
      },
    },
    {
      accessorKey: "category",
      header: "Category",
      cell: ({ row }) => (
        <div className="flex flex-col">
          <span className="font-medium text-sm">{row.original.category?.category_name_en}</span>
          <span className="text-xs text-muted-foreground">{row.original.category?.category_code}</span>
        </div>
      ),
      meta: {
        exportable: true,
        exportHeader: "Category",
        exportValue: (row) => row.category?.category_name_en ?? "",
      },
    },
    {
      accessorKey: "parent_value",
      header: "Parent Value",
      cell: ({ row }) => {
        const parent = row.original.parent_value;
        if (!parent) return <span className="text-xs text-muted-foreground">-</span>;
        return (
          <div className="flex flex-col">
            <span className="text-sm">{parent.value_label_en}</span>
            <span className="text-xs text-muted-foreground">{parent.value_code}</span>
          </div>
        );
      },
      meta: {
        exportable: true,
        exportHeader: "Parent Value",
        exportValue: (row) => row.parent_value?.value_label_en ?? "-",
      },
    },
    {
      accessorKey: "color_hex",
      header: "Color",
      cell: ({ row }) => {
        const color = row.original.color_hex;
        if (!color) return <span className="text-xs text-muted-foreground">-</span>;
        return (
          <div className="flex items-center gap-2">
            <div
              className="h-5 w-5 rounded border border-border"
              style={{ backgroundColor: color }}
            />
            <span className="text-xs font-mono text-muted-foreground">{color}</span>
          </div>
        );
      },
      meta: {
        exportable: true,
        exportHeader: "Color",
        exportValue: (row) => row.color_hex ?? "-",
      },
    },
    {
      accessorKey: "is_default",
      header: "Default",
      cell: ({ row }) => {
        return row.original.is_default ? (
          <Badge variant="default" className="text-xs gap-1">
            <Star className="h-3 w-3 fill-current" />
            Default
          </Badge>
        ) : (
          <span className="text-xs text-muted-foreground">-</span>
        );
      },
      meta: {
        exportable: true,
        exportHeader: "Default",
        exportValue: (row) => (row.is_default ? "Yes" : "No"),
      },
    },
    {
      accessorKey: "is_system",
      header: "System",
      cell: ({ row }) => {
        return row.original.is_system ? (
          <Badge variant="secondary" className="text-xs">
            System
          </Badge>
        ) : (
          <span className="text-xs text-muted-foreground">-</span>
        );
      },
      meta: {
        exportable: true,
        exportHeader: "System",
        exportValue: (row) => (row.is_system ? "Yes" : "No"),
      },
    },
    {
      accessorKey: "is_locked",
      header: "Locked",
      cell: ({ row }) => {
        return row.original.is_locked ? (
          <Badge variant="destructive" className="text-xs gap-1">
            <Lock className="h-3 w-3" />
            Locked
          </Badge>
        ) : (
          <span className="text-xs text-muted-foreground">-</span>
        );
      },
      meta: {
        exportable: true,
        exportHeader: "Locked",
        exportValue: (row) => (row.is_locked ? "Yes" : "No"),
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
        exportValue: (row) => (row.is_active ? "Active" : "Inactive"),
      },
    },
    {
      accessorKey: "sort_order",
      header: "Sort",
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground">{row.original.sort_order}</span>
      ),
      meta: {
        exportable: true,
        exportHeader: "Sort Order",
        exportValue: (row) => row.sort_order,
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
        const value = row.original;
        const isDisabled = isLoading;

        return (
          <DropdownMenu>
            <DropdownMenuTrigger render={
              <Button variant="ghost" size="icon" className="h-8 w-8" disabled={isDisabled}>
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            }>
              <span className="sr-only">Open menu</span>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuGroup>
                <DropdownMenuItem onClick={() => handleView(value)}>
                  <Eye className="h-4 w-4 mr-2" />
                  View Details
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleEdit(value)} disabled={value.is_locked}>
                  <Pencil className="h-4 w-4 mr-2" />
                  Edit
                </DropdownMenuItem>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuItem
                  onClick={() => handleSetDefault(value)}
                  disabled={value.is_default || !value.is_active}
                >
                  <Star className="h-4 w-4 mr-2" />
                  Set as Default
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleToggleActive(value)} disabled={value.is_locked}>
                  <Power className="h-4 w-4 mr-2" />
                  {value.is_active ? "Deactivate" : "Activate"}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleToggleLock(value)}>
                  {value.is_locked ? (
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
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
      meta: {
        exportable: false,
      },
    },
  ];

  return (
    <>
      <ERPDataTable<LookupValueWithCategory>
        tableId="lookup_values_table"
        columns={columns}
        data={values}
        enableSorting={true}
        enableColumnResizing={true}
        enableRowSelection={true}
        enableColumnVisibility={true}
        enablePreferences={true}
        searchPlaceholder="Search values by code, label, or category..."
        enableGlobalFilter={true}
        initialPageSize={25}
        exportConfig={{
          title: "Lookup Values",
          subtitle: `${values.length} value${values.length !== 1 ? "s" : ""} configured`,
          filename: "lookup-values",
          orientation: "landscape",
        }}
        toolbarSlot={
          <Button onClick={handleAdd} size="sm" className="gap-2">
            <Plus className="h-4 w-4" />
            Add Value
          </Button>
        }
      />

      <ValueFormDialog
        value={selectedValue}
        categories={categories}
        mode={formMode}
        open={isFormOpen}
        onOpenChange={(open) => {
          if (!open) handleFormClose(false);
          setIsFormOpen(open);
        }}
        onSuccess={() => handleFormClose(true)}
      />
    </>
  );
}
