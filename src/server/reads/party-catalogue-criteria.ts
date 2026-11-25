import "server-only";
import { createTable, getCoreRowModel, getFilteredRowModel, getSortedRowModel, type ColumnDef } from "@tanstack/react-table";
import {
  partyCatalogueColumns,
  partyCatalogueSortDirections,
  type PartyCatalogueColumn,
  type PartyCatalogueCriteria,
  type PartyCatalogueRow,
} from "@/features/master-data/parties/party-catalogue";

/** Apply the same global-search eligibility, auto-sort and stable tie order as the former local worklist. */
export function matchPartyCatalogue(rows: PartyCatalogueRow[], criteria: PartyCatalogueCriteria) {
  const columns: ColumnDef<PartyCatalogueRow>[] = (Object.keys(partyCatalogueColumns) as PartyCatalogueColumn[]).map(id => ({
    accessorKey: id,
    filterFn: (row, field, value: string) => {
      const actual = row.getValue<string | null | undefined>(field);
      return actual != null && actual.toLocaleLowerCase(criteria.locale).includes(value.toLocaleLowerCase(criteria.locale));
    },
  }));
  const table = createTable({
    data: rows,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    autoResetPageIndex: false,
    state: { globalFilter: criteria.search, columnFilters: criteria.filters, sorting: criteria.sorting },
    renderFallbackValue: null,
    onStateChange: () => undefined,
  });
  return {
    rows: table.getSortedRowModel().rows.map(row => row.original),
    sortAscendingFirst: partyCatalogueSortDirections(table.getFilteredRowModel().rows[0]?.original),
  };
}
