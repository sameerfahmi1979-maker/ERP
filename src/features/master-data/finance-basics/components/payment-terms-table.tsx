"use client";

import { useRouter } from "next/navigation";
import type { PaymentTerm } from "@/features/master-data/finance-basics/types";
import type { AuthContext } from "@/lib/rbac/check";
import { ERPDataTable } from "@/components/erp/table/erp-data-table";
import type { ColumnDef } from "@tanstack/react-table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus } from "lucide-react";
import {FinanceReferenceRowActions} from './finance-reference-row-actions';
import {financeReferencePermissions} from '@/lib/master-data/finance-reference-contract';
import { format } from "date-fns";

type PaymentTermsTableProps = {
  paymentTerms: PaymentTerm[];
  authContext: AuthContext;
  onRefresh?: () => void;
  readGeneration?: string;
};

const BASE = "/admin/master-data/finance-basics/payment-terms";

export function PaymentTermsTable({ paymentTerms, authContext, onRefresh, readGeneration }: PaymentTermsTableProps) {
  const router = useRouter();
  const handleAdd = () => router.push(`${BASE}/record/new`);
  const handleView = (item: PaymentTerm) => router.push(`${BASE}/record/${item.id}`);
  const handleEdit = (item: PaymentTerm) => router.push(`${BASE}/record/${item.id}?mode=edit`);

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
      id: "actions",header:"Actions",
      cell:({row})=><FinanceReferenceRowActions entity="payment_terms" row={row.original} authContext={authContext} onView={()=>handleView(row.original)} onEdit={()=>handleEdit(row.original)} onRefresh={onRefresh} readGeneration={readGeneration}/>,
      meta:{exportable:false},
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
        toolbarSlot={financeReferencePermissions(authContext).manage ?
          <Button onClick={handleAdd} size="sm" className="gap-2">
            <Plus className="h-4 w-4" />
            Add Payment Term
          </Button> : null
        }
      />

</>
  );
}
