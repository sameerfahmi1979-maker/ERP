"use client";
import { ERPDataTable } from "@/components/erp/table/erp-data-table";
import { loadedListValue } from "@/components/erp/table/loaded-list-view";
import { QueryReadBoundary } from "@/components/erp/query-read-boundary";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query/query-keys";
import { listWpsReadiness } from "@/server/actions/hr/payroll";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  getWpsReadinessLabel,
  getWpsReadinessBadgeVariant,
} from "@/lib/hr/payroll/wps-readiness";
import { Landmark, Search, ChevronLeft, ChevronRight, Link as LinkIcon } from "lucide-react";
import Link from "next/link";

type WpsRow = {
  employee_id: number;
  employee_code: string;
  full_name_en: string;
  wps_status: string | null;
  salary_payment_method: string | null;
  has_active_hold: boolean;
  readiness_status: string;
};

type Props = {
  initialData: { data: WpsRow[]; count: number };
};

const PAGE_SIZE = 50;

const WPS_STATUS_VARIANT: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  active: "default",
  hold: "secondary",
  exempt: "outline",
  not_enrolled: "outline",
};

export function HrWpsPageClient({ initialData }: Props) {
  const [page, setPage] = useState(1);
  const [wpsStatus, setWpsStatus] = useState("");
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [onHoldOnly, setOnHoldOnly] = useState(false);

  const uiRead1 = useQuery({
    queryKey: queryKeys.hr.payroll.globalWpsReadiness({ page, page_size: PAGE_SIZE, wps_status: wpsStatus || undefined, on_hold: onHoldOnly || undefined }),
    queryFn: () => listWpsReadiness({ page, page_size: PAGE_SIZE, wps_status: wpsStatus || undefined, on_hold: onHoldOnly || undefined }),
    initialData: page === 1 && !wpsStatus && !onHoldOnly ? { success: true, data: initialData } : undefined,
    placeholderData: (prev) => prev,
  });
  const { data: queryData, isLoading } = uiRead1;

  const rows = queryData?.data?.data ?? [];
  const total = queryData?.data?.count ?? 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  const filtered = search
    ? rows.filter(r =>
        r.full_name_en.toLowerCase().includes(search.toLowerCase()) ||
        r.employee_code.toLowerCase().includes(search.toLowerCase())
      )
    : rows;

  return (
    <QueryReadBoundary queries={[uiRead1]}><div className="container mx-auto py-6 space-y-4">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Landmark className="h-6 w-6 text-primary" />
          WPS Readiness
        </h1>
        <p className="text-muted-foreground mt-1">
          Monitor WPS enrollment status and readiness across all employees.
        </p>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input aria-label="Search employee"
            className="pl-8"
            placeholder="Search employee..."
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") { setSearch(searchInput); setPage(1); } }}
          />
        </div>
        <select aria-label="WPS status"
          className="border rounded px-2 py-1.5 text-sm"
          value={wpsStatus}
          onChange={e => { setWpsStatus(e.target.value); setPage(1); }}
        >
          <option value="">All WPS Statuses</option>
          <option value="active">Active</option>
          <option value="hold">On Hold</option>
          <option value="exempt">Exempt</option>
          <option value="not_enrolled">Not Enrolled</option>
        </select>
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={onHoldOnly}
            onChange={e => { setOnHoldOnly(e.target.checked); setPage(1); }}
          />
          Active Payroll Hold Only
        </label>
        {search && (
          <Button variant="ghost" size="sm" onClick={() => { setSearch(""); setSearchInput(""); }}>
            Clear
          </Button>
        )}
      </div>

      {/* Table */}
      <div className="rounded-xl border overflow-hidden">
        {/* UI04 explicit table: loaded authorized rows only */}<ERPDataTable isLoading={isLoading} tableId="hr.payroll.wps.hr-wps-page-client" data={filtered} columns={[{id:"full_name_en",header:"Employee",accessorFn:row=>loadedListValue(row,"full_name_en"),enableHiding:false,size:240,cell:({row:{original:row}})=><><div className="font-medium">{row.full_name_en}</div><div className="text-xs text-muted-foreground">{row.employee_code}</div></>},{id:"wps_status",header:"WPS Status",accessorFn:row=>loadedListValue(row,"wps_status"),enableHiding:true,size:160,cell:({row:{original:row}})=><>{row.wps_status ? (
                      <Badge variant={WPS_STATUS_VARIANT[row.wps_status] ?? "outline"} className="capitalize">
                        {row.wps_status}
                      </Badge>
                    ) : (
                      <Badge variant="outline">Not Set</Badge>
                    )}</>},{id:"salary_payment_method",header:"Payment Method",accessorFn:row=>loadedListValue(row,"salary_payment_method"),enableHiding:true,size:160,cell:({row:{original:row}})=><>{row.salary_payment_method?.replace("_", " ") ?? "—"}</>},{id:"has_active_hold",header:"Payroll Hold",accessorFn:row=>loadedListValue(row,"has_active_hold"),enableHiding:true,size:160,cell:({row:{original:row}})=><>{row.has_active_hold ? (
                      <Badge variant="destructive" className="text-xs">Active Hold</Badge>
                    ) : (
                      <span className="text-muted-foreground text-xs">None</span>
                    )}</>},{id:"readiness_status",header:"Readiness",accessorFn:row=>loadedListValue(row,"readiness_status"),enableHiding:true,size:160,cell:({row:{original:row}})=><><Badge variant={getWpsReadinessBadgeVariant(row.readiness_status as Parameters<typeof getWpsReadinessBadgeVariant>[0])}>
                      {getWpsReadinessLabel(row.readiness_status as Parameters<typeof getWpsReadinessLabel>[0])}
                    </Badge></>},{id:"actions",header:"Actions",enableHiding:true,size:200,enableSorting:false,meta:{exportable:false},cell:({row:{original:row}})=><><Link href={`/admin/hr/employees/record/${row.employee_id}?section=payroll`}>
                      <Button aria-label="Open employee payroll" size="icon" variant="ghost" className="h-7 w-7">
                        <LinkIcon className="h-3.5 w-3.5" />
                      </Button>
                    </Link></>}]} enableRowSelection={false} initialPageSize={25} searchPlaceholder="Search loaded records…"/>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>{total} total employees</span>
          <div className="flex items-center gap-2">
            <Button aria-label="Previous page" size="icon" variant="outline" className="h-8 w-8" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span>Page {page} of {totalPages}</span>
            <Button aria-label="Next page" size="icon" variant="outline" className="h-8 w-8" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div></QueryReadBoundary>
  );
}
