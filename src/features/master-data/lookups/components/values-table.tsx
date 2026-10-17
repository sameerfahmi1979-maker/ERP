"use client";

import { ERPDataTable } from "@/components/erp/table/erp-data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { LookupCategory, LookupValueWithCategory } from "@/features/master-data/lookups/types";
import type { ColumnDef } from "@tanstack/react-table";
import { format } from "date-fns";
import {Lock,Plus,Star} from "lucide-react";
import { useRouter } from "next/navigation";
import {LookupRowActions} from './lookup-row-actions';
import {lookupValueSearch,lookupValueCategorySearch,lookupCodeSorting,lookupCategorySorting} from '../list-search';

type ValuesTableProps = {
  values: LookupValueWithCategory[];
  categories: LookupCategory[];
  onRefresh?: () => void;
  readGeneration?:string;
  canManage: boolean;
  canLock: boolean;
};

const BASE = "/admin/master-data/lookups/values";

export function ValuesTable({ values, onRefresh, canManage, canLock, readGeneration }: ValuesTableProps) {
  const router = useRouter();

  const handleRefresh = () => {
    if (onRefresh) { onRefresh(); } else { router.refresh(); }
  };

  const handleAdd = () => router.push(`${BASE}/record/new`);
  const handleView = (value: LookupValueWithCategory) => router.push(`${BASE}/record/${value.id}`);
  const handleEdit = (value: LookupValueWithCategory) => router.push(`${BASE}/record/${value.id}?mode=edit`);

  const columns: ColumnDef<LookupValueWithCategory>[] = [
    {
      id: "value_code",
      accessorFn: lookupValueSearch,
      sortingFn: lookupCodeSorting<LookupValueWithCategory>(row=>row.value_code),
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
      id: "category",
      accessorFn: lookupValueCategorySearch,
      sortingFn: lookupCategorySorting,
      sortDescFirst: true,
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
        const value=row.original;
        return <LookupRowActions readGeneration={readGeneration} kind="value" id={value.id} revision={value.workspace_revision} active={value.is_active} locked={value.is_locked}
          isDefault={value.is_default} categoryId={value.category_id} categoryRevision={value.category?.workspace_revision} categoryLocked={value.category?.is_locked} categoryActive={value.category?.is_active}
          canManage={canManage} canLock={canLock} onView={()=>handleView(value)} onEdit={()=>handleEdit(value)} onRefresh={handleRefresh}/>;
      },
      meta: {
        exportable: false,
      },
    },
  ];

  return (
    <>
      <ERPDataTable<LookupValueWithCategory> presentation="worklist"
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
          canManage ? <Button onClick={handleAdd} size="sm" className="gap-2">
            <Plus className="h-4 w-4" />
            Add Value
          </Button> : null
        }
      />

    </>
  );
}
