"use client";

import { AlertTriangle } from "lucide-react";
import type { ColumnDef } from "@tanstack/react-table";
import { ERPDataTable } from "@/components/erp/table/erp-data-table";
import type { ApplyItemProposal } from "@/lib/dms/apply-to-erp/types";

interface Props {
  items: ApplyItemProposal[];
  selectedIndices: Set<number>;
  onToggle: (index: number) => void;
  disabled?: boolean;
}
type ItemRow = ApplyItemProposal & { selectionIndex: number };

/** Selection is tied to the proposal index, never the filtered/sorted row position. */
export function DmsApplyToErpItemTable({ items, selectedIndices, onToggle, disabled }: Props) {
  const columns: ColumnDef<ItemRow, unknown>[] = [
    { id: "select", header: "Select", enableHiding: false, enableSorting: false,
      meta: { exportable: false }, size: 80,
      cell: ({ row }) => <input type="checkbox" className="h-4 w-4"
        checked={selectedIndices.has(row.original.selectionIndex)}
        onChange={() => { if (!disabled) onToggle(row.original.selectionIndex); }}
        disabled={disabled} aria-label={`Select ${row.original.targetDisplayLabel}`} /> },
    { id: "field", accessorKey: "targetDisplayLabel", header: "Field", enableHiding: false,
      meta: { filter: { type: "text" } }, size: 240,
      cell: ({ row }) => <div><div className="font-medium">{row.original.targetDisplayLabel}</div>
        <div className="text-xs text-muted-foreground">{row.original.targetTable}.{row.original.targetField}</div></div> },
    { id: "current", accessorKey: "currentValueSummary", header: "Current value", size: 220,
      meta: { filter: { type: "text" } }, cell: ({ getValue }) => String(getValue() ?? "Empty") },
    { id: "proposed", accessorKey: "proposedValueSummary", header: "Proposed value", size: 220,
      meta: { filter: { type: "text" } }, cell: ({ getValue }) => String(getValue() ?? "Empty") },
    { id: "confidence", accessorKey: "confidence", header: "Confidence", size: 140,
      meta: { filter: { type: "number" } },
      cell: ({ row }) => row.original.confidence == null ? "Not available" : `${Math.round(row.original.confidence * 100)}%` },
    { id: "risk", accessorFn: row => row.conflictRisk ? "Overwrites" : "No overwrite detected",
      header: "Risk", size: 210, meta: { filter: { type: "text" } },
      cell: ({ row }) => row.original.conflictRisk
        ? <span className="inline-flex items-center gap-1"><AlertTriangle className="h-4 w-4" aria-hidden />Overwrites</span>
        : "No overwrite detected" },
  ];
  return <ERPDataTable tableId="special.apply-to-erp-proposals" columns={columns}
    data={items.map((item, selectionIndex) => ({ ...item, selectionIndex }))}
    resultsLabel="Loaded proposed field changes" emptyMessage="No apply items available."
    initialPageSize={10} />;
}
