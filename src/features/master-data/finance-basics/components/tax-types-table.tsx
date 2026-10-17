"use client";

import { useRouter } from "next/navigation";
import type { TaxType } from "@/features/master-data/finance-basics/types";
import type { AuthContext } from "@/lib/rbac/check";
import { ERPDataTable } from "@/components/erp/table/erp-data-table";
import type { ColumnDef } from "@tanstack/react-table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus } from "lucide-react";
import {FinanceReferenceRowActions} from './finance-reference-row-actions';
import {financeReferencePermissions} from '@/lib/master-data/finance-reference-contract';
import { format } from "date-fns";

type TaxTypesTableProps = {
  taxTypes: TaxType[];
  authContext: AuthContext;
  onRefresh?: () => void;
  readGeneration?: string;
};

const BASE = "/admin/master-data/finance-basics/tax-types";

export function TaxTypesTable({ taxTypes, authContext, onRefresh, readGeneration }: TaxTypesTableProps) {
  const router = useRouter();
  const handleAdd = () => router.push(`${BASE}/record/new`);
  const handleView = (item: TaxType) => router.push(`${BASE}/record/${item.id}`);
  const handleEdit = (item: TaxType) => router.push(`${BASE}/record/${item.id}?mode=edit`);

  const columns: ColumnDef<TaxType>[] = [
    {
      accessorKey: "tax_code",
      accessorFn: (row) => `${row.tax_name_en} ${row.tax_code}`,
      header: "Tax Type",
      cell: ({ row }) => (
        <div className="flex flex-col">
          <span className="font-medium">{row.original.tax_name_en}</span>
          <span className="text-xs text-muted-foreground">{row.original.tax_code}</span>
        </div>
      ),
      meta: { exportable: true, exportHeader: "Tax Code", exportValue: (row) => row.tax_code },
    },
    {
      accessorKey: "tax_rate",
      header: "Rate",
      cell: ({ row }) => <span className="text-sm">{row.original.tax_rate}%</span>,
      meta: { exportable: true, exportHeader: "Tax Rate", exportValue: (row) => String(row.tax_rate) },
    },
    {
      accessorKey: "tax_treatment_code",
      header: "Treatment",
      cell: ({ row }) => <Badge variant="outline" className="text-xs">{row.original.tax_treatment_code}</Badge>,
      meta: { exportable: true, exportHeader: "Treatment", exportValue: (row) => row.tax_treatment_code },
    },
    {
      id: "flags",
      header: "Flags",
      cell: ({ row }) => (
        <div className="flex gap-1 flex-wrap">
          {row.original.is_vat && <Badge variant="outline" className="text-xs">VAT</Badge>}
          {row.original.is_reverse_charge && <Badge variant="outline" className="text-xs">RCM</Badge>}
        </div>
      ),
      meta: { exportable: false },
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
      cell:({row})=><FinanceReferenceRowActions entity="tax_types" row={row.original} authContext={authContext} onView={()=>handleView(row.original)} onEdit={()=>handleEdit(row.original)} onRefresh={onRefresh} readGeneration={readGeneration}/>,
      meta:{exportable:false},
    },
  ];

  return (
    <>
      <ERPDataTable<TaxType> presentation="worklist"
        tableId="tax_types_table"
        columns={columns}
        data={taxTypes}
        enableSorting
        enableColumnResizing
        enableRowSelection
        enableColumnVisibility
        enablePreferences
        searchPlaceholder="Search tax types by code or name..."
        enableGlobalFilter
        initialPageSize={25}
        exportConfig={{
          title: "Tax Types Master Data",
          subtitle: `${taxTypes.length} tax type${taxTypes.length !== 1 ? "s" : ""} configured`,
          filename: "tax-types-master-data",
          orientation: "landscape",
        }}
        toolbarSlot={financeReferencePermissions(authContext).manage ?
          <Button onClick={handleAdd} size="sm" className="gap-2">
            <Plus className="h-4 w-4" />
            Add Tax Type
          </Button> : null
        }
      />

</>
  );
}
