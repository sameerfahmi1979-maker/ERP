import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { createTable, getCoreRowModel, getFilteredRowModel, getSortedRowModel } from "@tanstack/react-table";
import { z } from "zod";
import { getAdminConfig } from "@/lib/config/server-features";
import type { ResolveBrandingOutput } from "./branding-resolver";
import type { ReportDataResult, ReportRegistryEntry, ReportScreenPage, ReportScreenPageQuery } from "./types";

const columnId = z.string().min(1).max(100);

export const screenPageSchema = z.object({
  pageIndex: z.number().int().min(0).max(20_000),
  pageSize: z.number().refine(size => [10, 25, 50, 100].includes(size)),
  sorting: z.array(z.object({id: columnId, desc: z.boolean()})).max(100),
  globalFilter: z.string().max(500),
  columnFilters: z.array(z.object({id: columnId, value: z.string().max(500)})).max(100),
  columns: z.array(columnId).max(100).optional(),
  receipt: z.string().regex(/^[1-9]\d{0,15}\.[A-Za-z0-9_-]{43}$/).optional(),
});

function sign(context: string, input: unknown) {
  return createHmac("sha256", getAdminConfig().serviceKey)
    .update(context).update("\0").update(JSON.stringify(input)).digest("base64url");
}

export function analyticalBrandingVersion(registry: ReportRegistryEntry, branding: ResolveBrandingOutput, canSign: boolean) {
  const {resolvedTemplate: template, resolvedBrandingProfile: profile} = branding;
  return sign("erp-analytical-branding-v1", [
    registry.id, registry.report_code, registry.updated_at,
    template?.id, template?.version_no, template?.workspace_revision, template?.updated_at,
    profile?.id, profile?.owner_company_id, profile?.workspace_revision, profile?.updated_at,
    canSign,
  ]);
}

export function screenRunId(receipt: string) {
  return z.number().int().positive().parse(Number(receipt.split(".")[0]));
}

export function screenPageReceipt(runId: number, identity: object) {
  return `${runId}.${sign("erp-report-screen-v1", [runId, identity])}`;
}

export function matchesScreenPageReceipt(expected: string, current: string) {
  const left = Buffer.from(expected), right = Buffer.from(current);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function pageAnalyticalRows(data: ReportDataResult, query: ReportScreenPageQuery, receipt: string) {
  const selected = query.columns ? new Set(query.columns) : null;
  const columns = selected ? data.columns.filter(id => selected.has(id)) : data.columns;
  const columnIds = new Set(columns);
  const sourceOrder = !query.sorting.length && !query.columnFilters.length && !query.globalFilter;
  const table = createTable<Record<string, unknown>>({
    // TanStack reads the first filtered row to determine a column's initial
    // sort direction. A source-order preview pages the verified rows directly.
    data: sourceOrder ? data.rows.slice(0, 1) : data.rows,
    columns: columns.map(id => ({
      id, accessorFn: row => row[id],
      filterFn: (row, key, value: string) => {
        const actual = row.getValue(key);
        if (actual == null || typeof actual === "object") return false;
        if (typeof actual === "boolean") return String(actual) === value;
        if (typeof actual === "number") return actual === Number(value);
        return String(actual).toLocaleLowerCase().includes(value.toLocaleLowerCase());
      },
    })),
    state: {
      sorting: query.sorting.filter(({id}) => columnIds.has(id)),
      columnFilters: query.columnFilters.filter(({id, value}) => columnIds.has(id) && value !== ""),
      globalFilter: query.globalFilter,
    },
    autoResetPageIndex: false,
    onStateChange: () => undefined,
    renderFallbackValue: null,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });
  const matching = sourceOrder ? null : table.getSortedRowModel().rows;
  const totalCount = matching?.length ?? data.rows.length;
  const {pageSize} = query;
  const pageIndex = Math.min(query.pageIndex, Math.max(0, Math.ceil(totalCount / pageSize) - 1));
  const offset = pageIndex * pageSize;
  const filters: ReportScreenPage["filters"] = [];
  for (const id of data.columns) {
    const sample = data.rows.find(row => row[id] != null)?.[id];
    if (sample != null && typeof sample === "object") continue;
    if (typeof sample === "boolean") {
      filters.push({id, type: "select", options: [
        {value: "true", label: id === "is_active" ? "Active" : "Yes"},
        {value: "false", label: id === "is_active" ? "Inactive" : "No"},
      ]});
    } else {
      filters.push({id, type: typeof sample === "number" ? "number" : "text"});
    }
  }
  const screenPage: ReportScreenPage = {
    pageIndex, pageSize, totalCount, filters, receipt,
    sortDescFirst: table.getAllLeafColumns().filter(column => column.getAutoSortDir() === "desc").map(column => column.id),
  };
  const rows = matching
    ? matching.slice(offset, offset + pageSize).map(row => row.original)
    : data.rows.slice(offset, offset + pageSize);
  return { data: {...data, rows}, screenPage };
}
