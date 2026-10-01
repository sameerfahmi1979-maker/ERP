"use client";
import { ERPDataTable } from "@/components/erp/table/erp-data-table";
import { loadedListValue } from "@/components/erp/table/loaded-list-view";
import { QueryReadBoundary } from "@/components/erp/query-read-boundary";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { queryKeys } from "@/lib/query/query-keys";
import { listGlobalSalaryProfiles } from "@/server/actions/hr/payroll";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, DollarSign, Link as LinkIcon, Search } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

type Props = {
  initialData: {
    data: Array<{
      employee_id: number;
      employee_code: string;
      full_name_en: string;
      payroll_status: string | null;
      payroll_group_name: string | null;
      gross_salary: number | null;
      currency: string | null;
    }>;
    count: number;
  };
};

const PAGE_SIZE = 50;

const STATUS_VARIANT: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  active: "default",
  hold: "secondary",
  inactive: "outline",
  not_configured: "outline",
};

export function HrSalariesPageClient({ initialData }: Props) {
  const [page, setPage] = useState(1);
  const [payrollStatus, setPayrollStatus] = useState("");
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");

  const uiRead1 = useQuery({
    queryKey: queryKeys.hr.payroll.globalSalaryProfiles({ page, page_size: PAGE_SIZE, payroll_status: payrollStatus || undefined }),
    queryFn: () => listGlobalSalaryProfiles({ page, page_size: PAGE_SIZE, payroll_status: payrollStatus || undefined }),
    initialData: page === 1 && !payrollStatus ? { success: true, data: initialData } : undefined,
    placeholderData: (prev) => prev,
  });
  const { data: queryData, isLoading } = uiRead1;

  const rows = queryData?.data?.data ?? [];
  const total = queryData?.data?.count ?? 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  // Client-side name filter
  const filtered = search
    ? rows.filter(r =>
        r.full_name_en.toLowerCase().includes(search.toLowerCase()) ||
        r.employee_code.toLowerCase().includes(search.toLowerCase())
      )
    : rows;

  return (
    <QueryReadBoundary queries={[uiRead1]}><div className="container mx-auto py-6 space-y-4">
      <div className="flex flex-wrap gap-2 items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <DollarSign className="h-6 w-6 text-primary" />
            Salary Profiles
          </h1>
          <p className="text-muted-foreground mt-1">Employee payroll profiles and gross salary overview.</p>
        </div>
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
        <select aria-label="Payroll status"
          className="border rounded px-2 py-1.5 text-sm"
          value={payrollStatus}
          onChange={e => { setPayrollStatus(e.target.value); setPage(1); }}
        >
          <option value="">All Statuses</option>
          <option value="active">Active</option>
          <option value="hold">On Hold</option>
          <option value="inactive">Inactive</option>
          <option value="not_configured">Not Configured</option>
        </select>
        {search && (
          <Button variant="ghost" size="sm" onClick={() => { setSearch(""); setSearchInput(""); }}>
            Clear
          </Button>
        )}
      </div>

      {/* Table */}
      <div className="rounded-xl border overflow-hidden">
        {/* UI04 explicit table: loaded authorized rows only */}<ERPDataTable isLoading={isLoading} tableId="hr.payroll.salaries.hr-salaries-page-client" data={filtered} columns={[{id:"full_name_en",header:"Employee",accessorFn:row=>loadedListValue(row,"full_name_en"),enableHiding:false,size:240,cell:({row:{original:row}})=><><div className="font-medium">{row.full_name_en}</div><div className="text-xs text-muted-foreground">{row.employee_code}</div></>},{id:"payroll_group_name",header:"Payroll Group",accessorFn:row=>loadedListValue(row,"payroll_group_name"),enableHiding:true,size:160,cell:({row:{original:row}})=><>{row.payroll_group_name ?? <span className="text-muted-foreground">—</span>}</>},{id:"payroll_status",header:"Status",accessorFn:row=>loadedListValue(row,"payroll_status"),enableHiding:true,size:160,cell:({row:{original:row}})=><>{row.payroll_status ? (
                      <Badge variant={STATUS_VARIANT[row.payroll_status] ?? "outline"} className="capitalize">
                        {row.payroll_status}
                      </Badge>
                    ) : (
                      <Badge variant="outline">Not Configured</Badge>
                    )}</>},{id:"gross_salary",header:"Gross Salary",accessorFn:row=>loadedListValue(row,"gross_salary"),enableHiding:true,size:160,cell:({row:{original:row}})=><>{row.gross_salary !== null
                      ? row.gross_salary.toLocaleString("en-AE", { minimumFractionDigits: 2 })
                      : <span className="text-muted-foreground">***</span>}</>},{id:"currency",header:"Currency",accessorFn:row=>loadedListValue(row,"currency"),enableHiding:true,size:160,cell:({row:{original:row}})=><>{row.currency ?? "—"}</>},{id:"actions",header:"Actions",enableHiding:true,size:200,enableSorting:false,meta:{exportable:false},cell:({row:{original:row}})=><><Link href={`/admin/hr/employees/record/${row.employee_id}?section=payroll`}>
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
