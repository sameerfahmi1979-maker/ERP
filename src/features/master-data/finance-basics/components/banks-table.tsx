"use client";

import { useRouter } from "next/navigation";
import type { Bank } from "@/features/master-data/finance-basics/types";
import type { AuthContext } from "@/lib/rbac/check";
import { ERPDataTable } from "@/components/erp/table/erp-data-table";
import type { ColumnDef } from "@tanstack/react-table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus } from "lucide-react";
import {FinanceReferenceRowActions} from './finance-reference-row-actions';
import {financeReferencePermissions} from '@/lib/master-data/finance-reference-contract';
import { format } from "date-fns";

type BanksTableProps = {
  banks: Bank[];
  authContext: AuthContext;
  onRefresh?: () => void;
  readGeneration?: string;
};

const BASE = "/admin/master-data/finance-basics/banks";

export function BanksTable({ banks, authContext, onRefresh, readGeneration }: BanksTableProps) {
  const router = useRouter();
  const handleAdd = () => router.push(`${BASE}/record/new`);
  const handleView = (item: Bank) => router.push(`${BASE}/record/${item.id}`);
  const handleEdit = (item: Bank) => router.push(`${BASE}/record/${item.id}?mode=edit`);

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
      id: "actions",header:"Actions",
      cell:({row})=><FinanceReferenceRowActions entity="banks" row={row.original} authContext={authContext} onView={()=>handleView(row.original)} onEdit={()=>handleEdit(row.original)} onRefresh={onRefresh} readGeneration={readGeneration}/>,
      meta:{exportable:false},
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
        toolbarSlot={financeReferencePermissions(authContext).manage ?
          <Button onClick={handleAdd} size="sm" className="gap-2">
            <Plus className="h-4 w-4" />
            Add Bank
          </Button> : null
        }
      />

</>
  );
}
