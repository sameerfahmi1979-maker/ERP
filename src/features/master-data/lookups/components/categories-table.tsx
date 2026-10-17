"use client";

import { ERPDataTable } from "@/components/erp/table/erp-data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { LookupCategoryWithStats } from "@/features/master-data/lookups/types";
import type { ColumnDef } from "@tanstack/react-table";
import { format } from "date-fns";
import {Lock,Plus} from "lucide-react";
import { useRouter } from "next/navigation";
import {LookupRowActions} from './lookup-row-actions';
import {lookupCategorySearch,lookupCodeSorting} from '../list-search';

type CategoriesTableProps = {
  categories: LookupCategoryWithStats[];
  onRefresh?: () => void;
  readGeneration?:string;
  canManage: boolean;
  canLock: boolean;
};

const BASE = "/admin/master-data/lookups/categories";

export function CategoriesTable({ categories, onRefresh, canManage, canLock, readGeneration }: CategoriesTableProps) {
  const router = useRouter();

  const handleRefresh = () => {
    if (onRefresh) { onRefresh(); } else { router.refresh(); }
  };

  const handleAdd = () => router.push(`${BASE}/record/new`);
  const handleView = (category: LookupCategoryWithStats) => router.push(`${BASE}/record/${category.id}`);
  const handleEdit = (category: LookupCategoryWithStats) => router.push(`${BASE}/record/${category.id}?mode=edit`);

  const columns: ColumnDef<LookupCategoryWithStats>[] = [
    {
      id: "category_code",
      accessorFn: lookupCategorySearch,
      sortingFn: lookupCodeSorting<LookupCategoryWithStats>(row=>row.category_code),
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
        const category=row.original;
        return <LookupRowActions readGeneration={readGeneration} kind="category" id={category.id} revision={category.workspace_revision} active={category.is_active} locked={category.is_locked}

          canManage={canManage} canLock={canLock} onView={()=>handleView(category)} onEdit={()=>handleEdit(category)} onRefresh={handleRefresh}/>;
      },
      meta: {
        exportable: false,
      },
    },
  ];

  return (
    <>
      <ERPDataTable<LookupCategoryWithStats> presentation="worklist"
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
          canManage ? <Button onClick={handleAdd} size="sm" className="gap-2">
            <Plus className="h-4 w-4" />
            Add Category
          </Button> : null
        }
      />

    </>
  );
}
