"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { LookupCategoryWithStats } from "@/features/master-data/lookups/types";
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
  MoreHorizontal,
  Plus,
} from "lucide-react";
import { toggleLookupCategoryStatus, toggleLookupCategoryLock } from "@/server/actions/master-data/lookups";
import { toast } from "sonner";
import { format } from "date-fns";

type CategoriesTableProps = {
  categories: LookupCategoryWithStats[];
  onRefresh?: () => void;
};

const BASE = "/admin/master-data/lookups/categories";

export function CategoriesTable({ categories, onRefresh }: CategoriesTableProps) {
  const router = useRouter();

  const handleRefresh = () => {
    if (onRefresh) { onRefresh(); } else { router.refresh(); }
  };

  const handleAdd = () => router.push(`${BASE}/record/new`);
  const handleView = (category: LookupCategoryWithStats) => router.push(`${BASE}/record/${category.id}`);
  const handleEdit = (category: LookupCategoryWithStats) => router.push(`${BASE}/record/${category.id}?mode=edit`);

  const handleToggleActive = async (category: LookupCategoryWithStats) => {
    const result = await toggleLookupCategoryStatus(category.id, !category.is_active);
    if (result.success) {
      toast.success(`Category ${category.is_active ? "deactivated" : "activated"} successfully`);
      handleRefresh();
    } else {
      toast.error(result.error ?? "Failed to toggle category status");
    }
  };

  const handleToggleLock = async (category: LookupCategoryWithStats) => {
    const result = await toggleLookupCategoryLock(category.id, !category.is_locked);
    if (result.success) {
      toast.success(`Category ${category.is_locked ? "unlocked" : "locked"} successfully`);
      handleRefresh();
    } else {
      toast.error(result.error ?? "Failed to toggle category lock");
    }
  };

  const columns: ColumnDef<LookupCategoryWithStats>[] = [
    {
      accessorKey: "category_code",
      header: "Category Code",
      cell: ({ row }) => (
        <div className="flex flex-col">
          <span className="font-medium">{row.original.category_name_en}</span>
          <span className="text-xs text-muted-foreground">{row.original.category_code}</span>
        </div>
      ),
      meta: {
        exportable: true,
        exportHeader: "Category Code",
        exportValue: (row) => row.category_code,
      },
    },
    {
      accessorKey: "category_scope",
      header: "Scope",
      cell: ({ row }) => (
        <Badge variant="outline" className="text-xs">
          {row.original.category_scope}
        </Badge>
      ),
      meta: {
        exportable: true,
        exportHeader: "Scope",
        exportValue: (row) => row.category_scope,
      },
    },
    {
      accessorKey: "module_code",
      header: "Module",
      cell: ({ row }) => (
        <span className="text-sm">
          {row.original.module_code || <span className="text-muted-foreground italic">Global</span>}
        </span>
      ),
      meta: {
        exportable: true,
        exportHeader: "Module",
        exportValue: (row) => row.module_code || "Global",
      },
    },
    {
      id: "total_values",
      header: "Total Values",
      cell: ({ row }) => {
        const category = row.original;
        const total = category.total_values || 0;
        const active = category.active_values || 0;
        const inactive = category.inactive_values || 0;
        return (
          <div className="flex flex-col">
            <span className="font-semibold text-sm">{total}</span>
            <span className="text-xs text-muted-foreground">
              {active} active, {inactive} inactive
            </span>
          </div>
        );
      },
      meta: {
        exportable: true,
        exportHeader: "Total Values",
        exportValue: (row) => row.total_values || 0,
      },
    },
    {
      id: "flags",
      header: "Flags",
      cell: ({ row }) => {
        const category = row.original;
        return (
          <div className="flex gap-1 flex-wrap">
            {category.is_system && (
              <Badge variant="secondary" className="text-xs">
                System
              </Badge>
            )}
            {category.supports_hierarchy && (
              <Badge variant="outline" className="text-xs">
                Hierarchy
              </Badge>
            )}
            {category.supports_color && (
              <Badge variant="outline" className="text-xs">
                Color
              </Badge>
            )}
            {category.supports_icon && (
              <Badge variant="outline" className="text-xs">
                Icon
              </Badge>
            )}
          </div>
        );
      },
      meta: {
        exportable: true,
        exportHeader: "System",
        exportValue: (row) => row.is_system ? "Yes" : "No",
      },
    },
    {
      accessorKey: "is_active",
      header: "Status",
      cell: ({ row }) => {
        const isActive = row.original.is_active;
        const isLocked = row.original.is_locked;
        return (
          <div className="flex gap-1">
            <Badge variant={isActive ? "default" : "secondary"} className="text-xs">
              {isActive ? "Active" : "Inactive"}
            </Badge>
            {isLocked && (
              <Badge variant="destructive" className="text-xs">
                <Lock className="h-3 w-3" />
              </Badge>
            )}
          </div>
        );
      },
      meta: {
        exportable: true,
        exportHeader: "Status",
        exportValue: (row) => (row.is_active ? "Active" : "Inactive") + (row.is_locked ? " (Locked)" : ""),
      },
    },
    {
      accessorKey: "updated_at",
      header: "Updated At",
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
        const category = row.original;
        return (
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="ghost" size="icon" className="h-8 w-8" />}>
              <MoreHorizontal className="h-4 w-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuGroup>
                <DropdownMenuItem onClick={() => handleView(category)}>
                  <Eye className="h-4 w-4 mr-2" />
                  View Details
                </DropdownMenuItem>
                <DropdownMenuItem 
                  onClick={() => handleEdit(category)}
                  disabled={category.is_locked}
                >
                  <Pencil className="h-4 w-4 mr-2" />
                  Edit
                </DropdownMenuItem>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuItem 
                  onClick={() => handleToggleActive(category)}
                  disabled={category.is_locked}
                >
                  <Power className="h-4 w-4 mr-2" />
                  {category.is_active ? "Deactivate" : "Activate"}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleToggleLock(category)}>
                  {category.is_locked ? (
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
      <ERPDataTable<LookupCategoryWithStats>
        tableId="lookup_categories_table"
        columns={columns}
        data={categories}
        enableSorting={true}
        enableColumnResizing={true}
        enableRowSelection={true}
        enableColumnVisibility={true}
        enablePreferences={true}
        searchPlaceholder="Search categories by code, name, or module..."
        enableGlobalFilter={true}
        initialPageSize={25}
        exportConfig={{
          title: "Lookup Categories",
          subtitle: `${categories.length} categor${categories.length !== 1 ? "ies" : "y"} configured`,
          filename: "lookup-categories",
          orientation: "landscape",
        }}
        toolbarSlot={
          <Button onClick={handleAdd} size="sm" className="gap-2">
            <Plus className="h-4 w-4" />
            Add Category
          </Button>
        }
      />

    </>
  );
}
