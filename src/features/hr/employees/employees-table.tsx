"use client";
import { QueryReadBoundary } from "@/components/erp/query-read-boundary";

import { useCallback, useEffect, useMemo, useState} from "react";
import { useQuery } from "@tanstack/react-query";
import { useWorkspace } from "@/hooks/use-workspace";
import { useWorkspaceTableState } from "@/hooks/use-workspace-table-state";
import type { AuthContext } from "@/lib/rbac/check";
import { hasPermission } from "@/lib/rbac/scope";
import type { EmployeeListRow } from "@/server/actions/hr/employees";
import { archiveEmployee } from "@/server/actions/hr/employees";
import { useServerPage } from "@/hooks/use-server-page";
import { readJson, retryAuthorizedRead } from "@/lib/reads/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import type { ERPComboboxOption } from "@/components/erp/combobox";
import { SortColHeader } from "@/components/erp/table/sort-col-header";
import { TablePagination } from "@/components/erp/table/table-pagination";
import { ConfiguredRow, EditColumns, EditFilters, useListColumns, type ListColumn } from "@/components/erp/table/list-controls";
import { useEmployeeFilterChoices } from "@/hooks/lookups/use-employee-filter-choices";

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
  Loader2,
  FileStack,
} from "lucide-react";
import { HrDocumentEmployeeCreateWizard } from "./document-create/hr-document-employee-create-wizard";
import type { SortDir } from "@/hooks/use-sort-paginate";
import { useRealtimeSync } from "@/hooks/realtime/use-realtime-sync";
import { usePersistentUiState } from "@/hooks/use-persistent-ui-state";

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

const EMP_COLUMNS: ListColumn[] = Object.entries(DEFAULT_EMP_COL_WIDTHS).map(([id, width]) => ({ id, width, label: ({code:"Employee code",name:"Full name",nationality:"Nationality",department:"Department",designation:"Designation",status:"Status",company:"Company"} as Record<string,string>)[id], visible: id !== "nationality", required: id === "code" || id === "name" }));

type EmployeeFilters = {
  status: string | null;
  companyId: number | null;
  departmentId: number | null;
  designationId: number | null;
  nationalityId: number | null;
};


type Props = {
  initialRows: EmployeeListRow[];
  initialTotal: number;
  initialUpdatedAt: number;
  authContext: AuthContext;
  documentWizardEnabled?: boolean;
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

export function EmployeesTable({ initialRows, initialTotal, initialUpdatedAt, authContext, documentWizardEnabled = false }: Props) {
  const { openTab } = useWorkspace();

  const {
    search,
    setSearch,
    filters: rawFilters,
    setFilters,
    pagination,
    setPagination,
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

  const [archiveTarget, setArchiveTarget] = useState<EmployeeListRow | null>(null);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [sortKey, setSortKey] = usePersistentUiState<string | null>("employees:sort-key", "employee_code");
  const [sortDir, setSortDir] = usePersistentUiState<SortDir>("employees:sort-direction", "asc");

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

  const columnState = useListColumns("hr-employees", EMP_COLUMNS);
  const showNationality = true; // ConfiguredRow owns visibility and ordering.
  const colWidths = Object.fromEntries(columnState.columns.map(column => [column.id, column.width])) as Record<EmpColKey, number>;

  const companyRead = useEmployeeFilterChoices("companies", {selectedId:filters.companyId??undefined});
  const countryRead = useEmployeeFilterChoices("countries", {selectedId:filters.nationalityId??undefined});
  const companyOptions = companyRead.options;
  const countryOptions = countryRead.options;
  // Lookup capabilities are separate from employee access. Do not request a
  // forbidden master-data list and then disable an otherwise permitted grid.
  const canFilterDepartments = hasPermission(authContext, "common_md.view") || hasPermission(authContext, "common_md.departments.view");
  const canFilterDesignations = hasPermission(authContext, "common_md.view") || hasPermission(authContext, "common_md.designations.view");

  const uiRead1 = useQuery({
    queryKey: ["read", "employee-filter-departments", filters.companyId, filters.departmentId],
    enabled: canFilterDepartments,
    retry: retryAuthorizedRead,
    queryFn: async ({signal}) => {
      const result=await readJson<{success:true;data:ERPComboboxOption[]}>("employee-filter-departments",{owner_company_id:filters.companyId??undefined,selectedId:filters.departmentId??undefined},signal);
      return result.data;
    },
    staleTime: 60_000,
  });
  const { data: departmentOptions = [], isLoading: loadingDepartments } = uiRead1;

  const uiRead2 = useQuery({
    queryKey: ["read", "employee-filter-designations", filters.companyId, filters.departmentId, filters.designationId],
    enabled: canFilterDesignations,
    retry: retryAuthorizedRead,
    queryFn: async ({signal}) => {
      const result=await readJson<{success:true;data:ERPComboboxOption[]}>("employee-filter-designations",{owner_company_id:filters.companyId??undefined,department_id:filters.departmentId??undefined,selectedId:filters.designationId??undefined},signal);
      return result.data;
    },
    staleTime: 60_000,
  });
  const { data: designationOptions = [], isLoading: loadingDesignations } = uiRead2;

  const statusOptions: ERPComboboxOption[] = useMemo(
    () => EMPLOYEE_STATUS_FILTER_VALUES.map((s) => ({ value: s, label: statusFilterLabel(s) })),
    []
  );

  const seed = useMemo(() => ({rows:initialRows,totalCount:initialTotal,page:1,pageSize:25}),[initialRows,initialTotal]);
  const uiReadEmployees=useServerPage<EmployeeListRow>({resource:"employees",params:{page,pageSize,search:search.trim()||undefined,employeeStatus:filters.status??undefined,ownerCompanyId:filters.companyId??undefined,departmentId:filters.departmentId??undefined,designationId:filters.designationId??undefined,nationalityId:filters.nationalityId??undefined,sortKey:sortKey??"employee_code",sortDir},seedParams:{page:1,pageSize:25,sortKey:"employee_code",sortDir:"asc"},seed,updatedAt:initialUpdatedAt});
  const rows=uiReadEmployees.data?.rows??[];
  const totalCount=uiReadEmployees.data?.totalCount??0;
  const fetching=uiReadEmployees.isBusy;
  const fetchEmployees=()=>{void uiReadEmployees.refetch();};

  // ERP REALTIME.1C — live employee list sync (Pattern C hybrid).
  // When another user creates/updates/archives an employee, re-fetch with
  // current page/search/filter state so this list updates automatically.
  useRealtimeSync({
    table: "employees",
    event: "*",
    debounceMs: 500,
    onEvent: () => {
      fetchEmployees();
    },
  });

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

  const toggleSort = (field: string) => {
    setPagination(prev=>({...prev,pageIndex:0}));
    if (sortKey === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(field);
      setSortDir("asc");
    }
  };

  const sortedRows=rows;

  const activeFilterCount = Object.values(filters).filter(value => value != null).length;

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  useEffect(()=>{
    if(!uiReadEmployees.isBusy&&!uiReadEmployees.isError&&uiReadEmployees.data&&page>totalPages)
      setPagination(prev=>({...prev,pageIndex:totalPages-1}));
  },[page,totalPages,uiReadEmployees.isBusy,uiReadEmployees.isError,uiReadEmployees.data,setPagination]);

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
      fetchEmployees();
    } else {
      toast.error(result.error ?? "Failed to archive employee");
    }
    setArchiveTarget(null);
  };

  const colSpan = columnState.visible.length + 1;

  return (
    <QueryReadBoundary queries={[uiReadEmployees, companyRead, countryRead,...(canFilterDepartments ? [uiRead1] : []), ...(canFilterDesignations ? [uiRead2] : [])]}><div className="space-y-4">
      {/* Row 1: Search + actions */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            aria-label="Search employees"
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
          <EditColumns columns={columnState.columns} defaults={EMP_COLUMNS} onApply={columnState.setColumns} />

          <Button aria-label="Refresh"
            variant="outline"
            size="sm"
            onClick={() => {void uiReadEmployees.refetch();}}
            disabled={fetching}
            title="Refresh"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${fetching ? "animate-spin" : ""}`} />
          </Button>

          {canCreate && (
            <>
              {documentWizardEnabled && (
                <Button aria-label="Create employee from existing DMS documents"
                  variant="outline"
                  size="sm"
                  onClick={() => setWizardOpen(true)}
                  className="gap-1.5"
                  title="Create employee from existing DMS documents"
                >
                  <FileStack className="h-3.5 w-3.5" />
                  Add from Documents
                </Button>
              )}
              <Button size="sm" onClick={openAdd} className="gap-1.5">
                <Plus className="h-3.5 w-3.5" />
                Add Employee
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <EditFilters scopeLabel="Search and filters query all permitted employees. Apply a changed company before choosing its department, and a changed department before its designation."
          definitions={[
            {id:"status",label:"Status",type:"select",options:statusOptions.map(o=>({value:String(o.value),label:o.label}))},
            {id:"companyId",label:"Company",type:"select",options:companyOptions.map(o=>({value:String(o.value),label:o.label}))},
            ...(canFilterDepartments ? [{id:"departmentId",label:loadingDepartments ? "Department (loading)" : "Department",type:"select" as const,options:departmentOptions.map(o=>({value:String(o.value),label:o.label}))}] : []),
            ...(canFilterDesignations ? [{id:"designationId",label:loadingDesignations ? "Designation (loading)" : "Designation",type:"select" as const,options:designationOptions.map(o=>({value:String(o.value),label:o.label}))}] : []),
            {id:"nationalityId",label:"Nationality",type:"select",options:countryOptions.map(o=>({value:String(o.value),label:o.label}))}
          ]}
          values={Object.fromEntries(Object.entries(filters).map(([key,value])=>[key,value == null ? "" : String(value)]))}
          onApply={values=>setFilter({status:values.status || null,companyId:values.companyId ? Number(values.companyId) : null,departmentId:values.departmentId ? Number(values.departmentId) : null,designationId:values.designationId ? Number(values.designationId) : null,nationalityId:values.nationalityId ? Number(values.nationalityId) : null})} />
        <span className="text-xs text-muted-foreground">Search, filters and sorting apply to all permitted employees.</span>
        {(!canFilterDepartments || !canFilterDesignations) && <span className="text-xs text-muted-foreground">Some filters are unavailable with your current permissions.</span>}
      </div>

      {/* Table */}
      <div role="region" aria-label="Scrollable employees" tabIndex={0} aria-busy={fetching} inert={fetching||undefined} className="rounded-md border border-border overflow-x-auto relative">
        {fetching && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/50">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        )}

        <table aria-label="Employees" className="w-full text-sm table-fixed" style={{minWidth: columnState.visible.reduce((sum,col)=>sum+col.width,104)}}>
          <thead>
            <ConfiguredRow columns={columnState.columns} className="border-b border-border bg-muted/30">
              <SortColHeader data-column="code"
                field="employee_code"
                sortKey={sortKey}
                sortDir={sortDir}
                onSort={toggleSort}
                className="px-3 py-2 text-muted-foreground font-medium"
                width={colWidths.code}
              >
                Employee Code
              </SortColHeader>
              <SortColHeader data-column="name"
                field="full_name_en"
                sortKey={sortKey}
                sortDir={sortDir}
                onSort={toggleSort}
                className="px-3 py-2 text-muted-foreground font-medium"
                width={colWidths.name}
              >
                Full Name
              </SortColHeader>
              {showNationality && (
                <SortColHeader data-column="nationality"
                  field="nationality"
                  sortKey={sortKey}
                  sortDir={sortDir}
                  onSort={toggleSort}
                  className="px-3 py-2 text-muted-foreground font-medium"
                  width={colWidths.nationality}
                >
                  Nationality
                </SortColHeader>
              )}
              <SortColHeader data-column="department"
                field="department"
                sortKey={sortKey}
                sortDir={sortDir}
                onSort={toggleSort}
                className="px-3 py-2 text-muted-foreground font-medium"
                width={colWidths.department}
              >
                Department
              </SortColHeader>
              <SortColHeader data-column="designation"
                field="designation"
                sortKey={sortKey}
                sortDir={sortDir}
                onSort={toggleSort}
                className="px-3 py-2 text-muted-foreground font-medium"
                width={colWidths.designation}
              >
                Designation
              </SortColHeader>
              <SortColHeader data-column="status"
                field="employee_status"
                sortKey={sortKey}
                sortDir={sortDir}
                onSort={toggleSort}
                className="px-3 py-2 text-muted-foreground font-medium"
                width={colWidths.status}
              >
                Status
              </SortColHeader>
              <SortColHeader data-column="company"
                field="company"
                sortKey={sortKey}
                sortDir={sortDir}
                onSort={toggleSort}
                className="px-3 py-2 text-muted-foreground font-medium"
                width={colWidths.company}
              >
                Company
              </SortColHeader>
              <th className="px-3 py-2" style={{ width: 104 }} />
            </ConfiguredRow>
          </thead>
          <tbody>
            {sortedRows.length === 0 ? (
              <tr>
                <td colSpan={colSpan} className="text-center py-10 text-muted-foreground">
                  <div className="flex flex-col items-center gap-2">
                    <Users className="h-8 w-8 opacity-30" />
                    <p className="text-sm">
                      {fetching ? "Loading employees…" : search || activeFilterCount > 0
                        ? "No employees found matching your search or filters"
                        : "No employees found"}
                    </p>
                    {canCreate && !search && activeFilterCount === 0 && (
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
                <ConfiguredRow columns={columnState.columns}
                  key={emp.id}
                  className="border-b border-border hover:bg-muted/20 transition-colors"
                >
                  <td data-column="code" className="px-3 py-2 font-mono font-medium text-primary overflow-hidden">
                    <button
                      type="button"
                      onClick={() => openView(emp)}
                      className="hover:underline truncate block max-w-full"
                    >
                      {emp.employee_code}
                    </button>
                  </td>
                  <td data-column="name" className="px-3 py-2 overflow-hidden">
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
                    <td data-column="nationality" className="px-3 py-2 text-muted-foreground truncate">
                      {emp.nationality?.name_en ?? "—"}
                    </td>
                  )}
                  <td data-column="department" className="px-3 py-2 text-muted-foreground truncate">
                    {emp.department?.department_name_en ?? "—"}
                  </td>
                  <td data-column="designation" className="px-3 py-2 text-muted-foreground truncate">
                    {emp.designation?.designation_name_en ?? "—"}
                  </td>
                  <td data-column="status" className="px-3 py-2">
                    <EmployeeStatusBadge status={emp.employee_status} />
                  </td>
                  <td data-column="company" className="px-3 py-2 text-muted-foreground truncate">
                    {emp.owner_company?.company_code ?? "—"}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1 justify-end">
                      <Button aria-label="View"
                        size="icon"
                        variant="ghost"
                        className="h-11 w-11 sm:h-8 sm:w-8"
                        onClick={() => openView(emp)}
                        title="View"
                      >
                        <ExternalLink className="h-3 w-3" />
                      </Button>
                      {canUpdate && (
                        <Button aria-label="Edit"
                          size="icon"
                          variant="ghost"
                          className="h-11 w-11 sm:h-8 sm:w-8"
                          onClick={() => openEdit(emp)}
                          title="Edit"
                        >
                          <Edit className="h-3 w-3" />
                        </Button>
                      )}
                      {canArchive && (
                        <Button aria-label="Archive"
                          size="icon"
                          variant="ghost"
                          className="h-11 w-11 sm:h-8 sm:w-8 text-destructive hover:text-destructive"
                          onClick={() => setArchiveTarget(emp)}
                          title="Archive"
                        >
                          <Archive className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                  </td>
                </ConfiguredRow>
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

      <HrDocumentEmployeeCreateWizard
        open={wizardOpen}
        onOpenChange={setWizardOpen}
      />
    </div></QueryReadBoundary>
  );
}
