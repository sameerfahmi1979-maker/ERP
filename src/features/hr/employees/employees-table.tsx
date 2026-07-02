"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useWorkspace } from "@/hooks/use-workspace";
import { useWorkspaceTableState } from "@/hooks/use-workspace-table-state";
import type { AuthContext } from "@/lib/rbac/check";
import type { EmployeeListRow, EmployeeListParams } from "@/server/actions/hr/employees";
import { listEmployees, archiveEmployee } from "@/server/actions/hr/employees";
import { listDepartments } from "@/server/actions/common-master-data/departments";
import { listDesignations } from "@/server/actions/common-master-data/designations";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ERPCombobox } from "@/components/erp/combobox";
import type { ERPComboboxOption } from "@/components/erp/combobox";
import { SortColHeader } from "@/components/erp/table/sort-col-header";
import { TablePagination } from "@/components/erp/table/table-pagination";
import { useResizableColumns } from "@/components/erp/table/use-resizable-columns";
import { useOwnerCompaniesQuery } from "@/hooks/lookups/use-org-queries";
import { useCountriesQuery } from "@/hooks/lookups/use-geography-queries";
import {
  EmployeeStatusBadge,
  EMPLOYEE_STATUS_FILTER_VALUES,
} from "./employee-status-badge";
import { toast } from "sonner";
import {
  Plus,
  Search,
  ExternalLink,
  Edit,
  Archive,
  Users,
  RefreshCw,
  Columns3,
  X,
  Loader2,
} from "lucide-react";
import type { SortDir } from "@/hooks/use-sort-paginate";

type EmpColKey =
  | "code"
  | "name"
  | "nationality"
  | "department"
  | "designation"
  | "status"
  | "company";

const DEFAULT_EMP_COL_WIDTHS: Record<EmpColKey, number> = {
  code: 120,
  name: 220,
  nationality: 120,
  department: 140,
  designation: 140,
  status: 100,
  company: 100,
};

type EmployeeFilters = {
  status: string | null;
  companyId: number | null;
  departmentId: number | null;
  designationId: number | null;
  nationalityId: number | null;
};

const EMPTY_FILTERS: EmployeeFilters = {
  status: null,
  companyId: null,
  departmentId: null,
  designationId: null,
  nationalityId: null,
};

type Props = {
  initialRows: EmployeeListRow[];
  initialTotal: number;
  authContext: AuthContext;
};

function parseFilters(raw: Record<string, unknown>): EmployeeFilters {
  return {
    status: typeof raw.status === "string" ? raw.status : null,
    companyId: typeof raw.companyId === "number" ? raw.companyId : null,
    departmentId: typeof raw.departmentId === "number" ? raw.departmentId : null,
    designationId: typeof raw.designationId === "number" ? raw.designationId : null,
    nationalityId: typeof raw.nationalityId === "number" ? raw.nationalityId : null,
  };
}

function statusFilterLabel(s: string): string {
  return s.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());
}

export function EmployeesTable({ initialRows, initialTotal, authContext }: Props) {
  const router = useRouter();
  const { openTab } = useWorkspace();
  const [isPending, startTransition] = useTransition();

  const {
    search,
    setSearch,
    filters: rawFilters,
    setFilters,
    pagination,
    setPagination,
    columnVisibility,
    setColumnVisibility,
  } = useWorkspaceTableState({
    key: "employees-table",
    scope: "route",
    identifier: "/admin/hr/employees",
    initialPagination: { pageIndex: 0, pageSize: 25 },
    initialColumnVisibility: { nationality: false },
  });

  const filters = useMemo(
    () => parseFilters(rawFilters),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      rawFilters.status,
      rawFilters.companyId,
      rawFilters.departmentId,
      rawFilters.designationId,
      rawFilters.nationalityId,
    ]
  );

  const [rows, setRows] = useState<EmployeeListRow[]>(initialRows);
  const [totalCount, setTotalCount] = useState(initialTotal);
  const [archiveTarget, setArchiveTarget] = useState<EmployeeListRow | null>(null);
  const [sortKey, setSortKey] = useState<string | null>("employee_code");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const page = pagination.pageIndex + 1;
  const pageSize = pagination.pageSize;

  const canCreate =
    authContext.permissionCodes?.includes("hr.employees.create") ||
    authContext.roleCodes?.includes("system_admin");
  const canUpdate =
    authContext.permissionCodes?.includes("hr.employees.update") ||
    authContext.roleCodes?.includes("system_admin");
  const canArchive =
    authContext.permissionCodes?.includes("hr.employees.archive") ||
    authContext.roleCodes?.includes("system_admin");

  const showNationality = columnVisibility.nationality !== false;

  const { options: companyOptions } = useOwnerCompaniesQuery();
  const { options: countryOptions } = useCountriesQuery();

  const { data: departmentOptions = [], isLoading: loadingDepartments } = useQuery({
    queryKey: ["hr", "employees", "filter-departments", filters.companyId],
    queryFn: async () => {
      const result = await listDepartments({
        is_active: true,
        owner_company_id: filters.companyId ?? undefined,
      });
      if (!result.success) throw new Error(result.error);
      return (result.data ?? []).map(
        (d): ERPComboboxOption => ({
          value: d.id,
          label: d.department_name_en,
          code: d.department_code,
        })
      );
    },
    staleTime: 60_000,
  });

  const { data: designationOptions = [], isLoading: loadingDesignations } = useQuery({
    queryKey: ["hr", "employees", "filter-designations", filters.companyId, filters.departmentId],
    queryFn: async () => {
      const result = await listDesignations({
        is_active: true,
        owner_company_id: filters.companyId ?? undefined,
        department_id: filters.departmentId ?? undefined,
      });
      if (!result.success) throw new Error(result.error);
      return (result.data ?? []).map(
        (d): ERPComboboxOption => ({
          value: d.id,
          label: d.designation_name_en,
          code: d.designation_code,
        })
      );
    },
    staleTime: 60_000,
  });

  const statusOptions: ERPComboboxOption[] = useMemo(
    () => EMPLOYEE_STATUS_FILTER_VALUES.map((s) => ({ value: s, label: statusFilterLabel(s) })),
    []
  );

  const fetchEmployees = useCallback(
    (p: number, ps: number, q: string, f: EmployeeFilters) => {
      startTransition(async () => {
        const params: Partial<EmployeeListParams> = {
          page: p,
          pageSize: ps,
          search: q.trim() || undefined,
          employeeStatus: f.status ?? undefined,
          ownerCompanyId: f.companyId ?? undefined,
          departmentId: f.departmentId ?? undefined,
          designationId: f.designationId ?? undefined,
          nationalityId: f.nationalityId ?? undefined,
        };
        const result = await listEmployees(params);
        if (result.success && result.data) {
          setRows(result.data.rows);
          setTotalCount(result.data.totalCount);
        } else {
          toast.error(result.error ?? "Failed to load employees");
        }
      });
    },
    []
  );

  // Debounced server search + filter refetch
  useEffect(() => {
    const timer = setTimeout(() => {
      fetchEmployees(page, pageSize, search, filters);
    }, 350);
    return () => clearTimeout(timer);
  }, [search, filters, page, pageSize, fetchEmployees]);

  const setFilter = useCallback(
    (patch: Partial<EmployeeFilters>) => {
      setFilters((prev) => {
        const current = parseFilters(prev);
        const next = { ...current, ...patch };
        if (patch.companyId !== undefined && patch.companyId !== current.companyId) {
          next.departmentId = null;
          next.designationId = null;
        }
        if (patch.departmentId !== undefined && patch.departmentId !== current.departmentId) {
          next.designationId = null;
        }
        return next as Record<string, unknown>;
      });
      setPagination((prev) => ({ ...prev, pageIndex: 0 }));
    },
    [setFilters, setPagination]
  );

  const clearAllFilters = () => {
    setFilters(EMPTY_FILTERS as unknown as Record<string, unknown>);
    setPagination((prev) => ({ ...prev, pageIndex: 0 }));
  };

  const toggleSort = (field: string) => {
    if (sortKey === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(field);
      setSortDir("asc");
    }
  };

  const sortedRows = useMemo(() => {
    if (!sortKey) return rows;
    const dir = sortDir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      let av: string | number = "";
      let bv: string | number = "";
      switch (sortKey) {
        case "employee_code":
          av = a.employee_code;
          bv = b.employee_code;
          break;
        case "full_name_en":
          av = a.full_name_en;
          bv = b.full_name_en;
          break;
        case "nationality":
          av = a.nationality?.name_en ?? "";
          bv = b.nationality?.name_en ?? "";
          break;
        case "department":
          av = a.department?.department_name_en ?? "";
          bv = b.department?.department_name_en ?? "";
          break;
        case "designation":
          av = a.designation?.designation_name_en ?? "";
          bv = b.designation?.designation_name_en ?? "";
          break;
        case "employee_status":
          av = a.employee_status;
          bv = b.employee_status;
          break;
        case "company":
          av = a.owner_company?.company_code ?? "";
          bv = b.owner_company?.company_code ?? "";
          break;
        default:
          return 0;
      }
      return String(av).localeCompare(String(bv)) * dir;
    });
  }, [rows, sortKey, sortDir]);

  const { widths: colWidths, startResize } = useResizableColumns<EmpColKey>(
    DEFAULT_EMP_COL_WIDTHS,
    { minWidth: 60, storageKey: "hr-employees-table-col-widths-v1" }
  );

  const activeFilterChips = useMemo(() => {
    const chips: { key: string; label: string; onRemove: () => void }[] = [];
    if (filters.status) {
      chips.push({
        key: "status",
        label: `Status: ${statusFilterLabel(filters.status)}`,
        onRemove: () => setFilter({ status: null }),
      });
    }
    if (filters.companyId != null) {
      const opt = companyOptions.find((o) => o.value === filters.companyId);
      chips.push({
        key: "company",
        label: `Company: ${opt?.label ?? filters.companyId}`,
        onRemove: () => setFilter({ companyId: null, departmentId: null, designationId: null }),
      });
    }
    if (filters.departmentId != null) {
      const opt = departmentOptions.find((o) => o.value === filters.departmentId);
      chips.push({
        key: "department",
        label: `Department: ${opt?.label ?? filters.departmentId}`,
        onRemove: () => setFilter({ departmentId: null, designationId: null }),
      });
    }
    if (filters.designationId != null) {
      const opt = designationOptions.find((o) => o.value === filters.designationId);
      chips.push({
        key: "designation",
        label: `Designation: ${opt?.label ?? filters.designationId}`,
        onRemove: () => setFilter({ designationId: null }),
      });
    }
    if (filters.nationalityId != null) {
      const opt = countryOptions.find((o) => o.value === filters.nationalityId);
      chips.push({
        key: "nationality",
        label: `Nationality: ${opt?.label ?? filters.nationalityId}`,
        onRemove: () => setFilter({ nationalityId: null }),
      });
    }
    return chips;
  }, [filters, companyOptions, departmentOptions, designationOptions, countryOptions, setFilter]);

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  const openAdd = () => {
    openTab({
      route: "/admin/hr/employees/record/new",
      title: "New Employee",
      tabKind: "record",
      entityType: "employee",
      formMode: "add",
      closable: true,
    });
  };

  const openView = (emp: EmployeeListRow) => {
    openTab({
      route: `/admin/hr/employees/record/${emp.id}?mode=view`,
      title: `${emp.employee_code} — ${emp.full_name_en}`,
      subtitle: emp.employee_code,
      tabKind: "record",
      entityType: "employee",
      entityId: emp.id,
      formMode: "view",
      closable: true,
    });
  };

  const openEdit = (emp: EmployeeListRow) => {
    openTab({
      route: `/admin/hr/employees/record/${emp.id}?mode=edit`,
      title: `${emp.employee_code} — ${emp.full_name_en}`,
      subtitle: emp.employee_code,
      tabKind: "record",
      entityType: "employee",
      entityId: emp.id,
      formMode: "edit",
      closable: true,
    });
  };

  const handleConfirmArchive = async () => {
    if (!archiveTarget) return;
    const result = await archiveEmployee(archiveTarget.id, "Archived from list");
    if (result.success) {
      toast.success(`Employee ${archiveTarget.employee_code} archived`);
      fetchEmployees(page, pageSize, search, filters);
    } else {
      toast.error(result.error ?? "Failed to archive employee");
    }
    setArchiveTarget(null);
  };

  const colSpan =
    6 + (showNationality ? 1 : 0) + 1; /* data cols + actions */

  return (
    <div className="space-y-4">
      {/* Row 1: Search + actions */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search by code, name, mobile..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPagination((prev) => ({ ...prev, pageIndex: 0 }));
            }}
            className="pl-8 h-8 text-sm"
          />
        </div>

        <div className="ml-auto flex items-center gap-2 shrink-0">
          <DropdownMenu>
            <DropdownMenuTrigger className="inline-flex h-8 items-center gap-1.5 rounded-md border border-input bg-background px-2.5 text-xs font-medium hover:bg-accent hover:text-accent-foreground">
              <Columns3 className="h-3.5 w-3.5" />
              Columns
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuLabel className="text-xs">Show columns</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuCheckboxItem
                checked={showNationality}
                onCheckedChange={(checked) =>
                  setColumnVisibility({ ...columnVisibility, nationality: !!checked })
                }
              >
                Nationality
              </DropdownMenuCheckboxItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Button
            variant="outline"
            size="sm"
            onClick={() => router.refresh()}
            disabled={isPending}
            title="Refresh"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isPending ? "animate-spin" : ""}`} />
          </Button>

          {canCreate && (
            <Button size="sm" onClick={openAdd} className="gap-1.5">
              <Plus className="h-3.5 w-3.5" />
              Add Employee
            </Button>
          )}
        </div>
      </div>

      {/* Row 2: Labeled searchable filters */}
      <div className="rounded-lg border border-border bg-muted/10 p-3">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <div>
            <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Status
            </label>
            <ERPCombobox
              value={filters.status}
              onValueChange={(v) => setFilter({ status: v == null ? null : String(v) })}
              options={statusOptions}
              placeholder="All Statuses"
              searchPlaceholder="Search statuses..."
              allowClear
              triggerClassName="h-8 text-xs"
            />
          </div>

          <div>
            <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Company
            </label>
            <ERPCombobox
              value={filters.companyId}
              onValueChange={(v) =>
                setFilter({
                  companyId: v == null ? null : Number(v),
                  departmentId: null,
                  designationId: null,
                })
              }
              options={companyOptions}
              placeholder="All Companies"
              searchPlaceholder="Search companies..."
              allowClear
              triggerClassName="h-8 text-xs"
            />
          </div>

          <div>
            <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Department
            </label>
            <ERPCombobox
              value={filters.departmentId}
              onValueChange={(v) =>
                setFilter({
                  departmentId: v == null ? null : Number(v),
                  designationId: null,
                })
              }
              options={departmentOptions}
              placeholder="All Departments"
              searchPlaceholder="Search departments..."
              loading={loadingDepartments}
              allowClear
              triggerClassName="h-8 text-xs"
            />
          </div>

          <div>
            <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Designation
            </label>
            <ERPCombobox
              value={filters.designationId}
              onValueChange={(v) => setFilter({ designationId: v == null ? null : Number(v) })}
              options={designationOptions}
              placeholder="All Designations"
              searchPlaceholder="Search designations..."
              loading={loadingDesignations}
              allowClear
              triggerClassName="h-8 text-xs"
            />
          </div>

          <div>
            <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Nationality
            </label>
            <ERPCombobox
              value={filters.nationalityId}
              onValueChange={(v) => setFilter({ nationalityId: v == null ? null : Number(v) })}
              options={countryOptions}
              placeholder="All Nationalities"
              searchPlaceholder="Search nationalities..."
              allowClear
              triggerClassName="h-8 text-xs"
            />
          </div>
        </div>

        {activeFilterChips.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-border/60 pt-3">
            {activeFilterChips.map((chip) => (
              <Badge
                key={chip.key}
                variant="secondary"
                className="gap-1 pr-1 text-[11px] font-normal"
              >
                {chip.label}
                <button
                  type="button"
                  onClick={chip.onRemove}
                  className="ml-0.5 rounded-full p-0.5 hover:bg-muted-foreground/20"
                  aria-label={`Remove ${chip.label} filter`}
                >
                  <X className="h-2.5 w-2.5" />
                </button>
              </Badge>
            ))}
            <button
              type="button"
              onClick={clearAllFilters}
              className="text-[11px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
            >
              Clear all
            </button>
          </div>
        )}
      </div>

      {/* Table */}
      <div className="rounded-md border border-border overflow-x-auto relative">
        {isPending && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/50">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        )}

        <table className="w-full text-xs table-fixed">
          <thead>
            <tr className="border-b border-border bg-muted/30">
              <SortColHeader
                field="employee_code"
                sortKey={sortKey}
                sortDir={sortDir}
                onSort={toggleSort}
                className="px-3 py-2 text-muted-foreground font-medium"
                width={colWidths.code}
                onResizeStart={(e) => startResize("code", e)}
              >
                Employee Code
              </SortColHeader>
              <SortColHeader
                field="full_name_en"
                sortKey={sortKey}
                sortDir={sortDir}
                onSort={toggleSort}
                className="px-3 py-2 text-muted-foreground font-medium"
                width={colWidths.name}
                onResizeStart={(e) => startResize("name", e)}
              >
                Full Name
              </SortColHeader>
              {showNationality && (
                <SortColHeader
                  field="nationality"
                  sortKey={sortKey}
                  sortDir={sortDir}
                  onSort={toggleSort}
                  className="px-3 py-2 text-muted-foreground font-medium"
                  width={colWidths.nationality}
                  onResizeStart={(e) => startResize("nationality", e)}
                >
                  Nationality
                </SortColHeader>
              )}
              <SortColHeader
                field="department"
                sortKey={sortKey}
                sortDir={sortDir}
                onSort={toggleSort}
                className="px-3 py-2 text-muted-foreground font-medium"
                width={colWidths.department}
                onResizeStart={(e) => startResize("department", e)}
              >
                Department
              </SortColHeader>
              <SortColHeader
                field="designation"
                sortKey={sortKey}
                sortDir={sortDir}
                onSort={toggleSort}
                className="px-3 py-2 text-muted-foreground font-medium"
                width={colWidths.designation}
                onResizeStart={(e) => startResize("designation", e)}
              >
                Designation
              </SortColHeader>
              <SortColHeader
                field="employee_status"
                sortKey={sortKey}
                sortDir={sortDir}
                onSort={toggleSort}
                className="px-3 py-2 text-muted-foreground font-medium"
                width={colWidths.status}
                onResizeStart={(e) => startResize("status", e)}
              >
                Status
              </SortColHeader>
              <SortColHeader
                field="company"
                sortKey={sortKey}
                sortDir={sortDir}
                onSort={toggleSort}
                className="px-3 py-2 text-muted-foreground font-medium"
                width={colWidths.company}
                onResizeStart={(e) => startResize("company", e)}
              >
                Company
              </SortColHeader>
              <th className="px-3 py-2" style={{ width: 104 }} />
            </tr>
          </thead>
          <tbody>
            {sortedRows.length === 0 ? (
              <tr>
                <td colSpan={colSpan} className="text-center py-10 text-muted-foreground">
                  <div className="flex flex-col items-center gap-2">
                    <Users className="h-8 w-8 opacity-30" />
                    <p className="text-sm">
                      {search || activeFilterChips.length > 0
                        ? "No employees found matching your search or filters"
                        : "No employees found"}
                    </p>
                    {canCreate && !search && activeFilterChips.length === 0 && (
                      <Button size="sm" variant="outline" onClick={openAdd} className="mt-1 gap-1.5">
                        <Plus className="h-3.5 w-3.5" />
                        Add first employee
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            ) : (
              sortedRows.map((emp) => (
                <tr
                  key={emp.id}
                  className="border-b border-border hover:bg-muted/20 transition-colors"
                >
                  <td className="px-3 py-2 font-mono font-medium text-primary overflow-hidden">
                    <button
                      type="button"
                      onClick={() => openView(emp)}
                      className="hover:underline truncate block max-w-full"
                    >
                      {emp.employee_code}
                    </button>
                  </td>
                  <td className="px-3 py-2 overflow-hidden">
                    <div className="min-w-0">
                      <span className="truncate block font-medium">{emp.full_name_en}</span>
                      {emp.full_name_ar && (
                        <span className="truncate block text-muted-foreground mt-0.5" dir="auto">
                          {emp.full_name_ar}
                        </span>
                      )}
                    </div>
                  </td>
                  {showNationality && (
                    <td className="px-3 py-2 text-muted-foreground truncate">
                      {emp.nationality?.name_en ?? "—"}
                    </td>
                  )}
                  <td className="px-3 py-2 text-muted-foreground truncate">
                    {emp.department?.department_name_en ?? "—"}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground truncate">
                    {emp.designation?.designation_name_en ?? "—"}
                  </td>
                  <td className="px-3 py-2">
                    <EmployeeStatusBadge status={emp.employee_status} />
                  </td>
                  <td className="px-3 py-2 text-muted-foreground truncate">
                    {emp.owner_company?.company_code ?? "—"}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1 justify-end">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-6 w-6"
                        onClick={() => openView(emp)}
                        title="View"
                      >
                        <ExternalLink className="h-3 w-3" />
                      </Button>
                      {canUpdate && (
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-6 w-6"
                          onClick={() => openEdit(emp)}
                          title="Edit"
                        >
                          <Edit className="h-3 w-3" />
                        </Button>
                      )}
                      {canArchive && (
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-6 w-6 text-destructive hover:text-destructive"
                          onClick={() => setArchiveTarget(emp)}
                          title="Archive"
                        >
                          <Archive className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        <TablePagination
          page={page}
          totalPages={totalPages}
          onPage={(p) => setPagination((prev) => ({ ...prev, pageIndex: p - 1 }))}
          pageSize={pageSize}
          onPageSize={(s) => {
            setPagination({ pageIndex: 0, pageSize: s });
          }}
          total={totalCount}
        />
      </div>

      <div className="text-xs text-muted-foreground">
        {totalCount === 0
          ? "No results"
          : `Showing ${Math.min((page - 1) * pageSize + 1, totalCount)}–${Math.min(page * pageSize, totalCount)} of ${totalCount} employees`}
      </div>

      <AlertDialog open={!!archiveTarget} onOpenChange={(o) => !o && setArchiveTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archive Employee?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to archive{" "}
              <strong>
                {archiveTarget?.employee_code} — {archiveTarget?.full_name_en}
              </strong>
              ? This will set their status to archived and soft-delete the record.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleConfirmArchive}
            >
              Archive
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
