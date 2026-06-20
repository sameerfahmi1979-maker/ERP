"use client";

import { useState, useCallback, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useWorkspace } from "@/hooks/use-workspace";
import type { AuthContext } from "@/lib/rbac/check";
import type { EmployeeListRow, EmployeeListParams } from "@/server/actions/hr/employees";
import { listEmployees, archiveEmployee } from "@/server/actions/hr/employees";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
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
import { toast } from "sonner";
import {
  Plus, MoreVertical, Eye, Edit, Archive, Search, ChevronLeft, ChevronRight,
  Users,
} from "lucide-react";
import { format } from "date-fns";

const STATUS_VARIANT: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  active: "default",
  probation: "secondary",
  on_leave: "secondary",
  inactive: "outline",
  suspended: "destructive",
  terminated: "destructive",
  archived: "outline",
};

const STATUS_LABEL: Record<string, string> = {
  active: "Active",
  probation: "Probation",
  on_leave: "On Leave",
  inactive: "Inactive",
  suspended: "Suspended",
  terminated: "Terminated",
  archived: "Archived",
};

type Props = {
  initialRows: EmployeeListRow[];
  initialTotal: number;
  authContext: AuthContext;
};

const PAGE_SIZE = 50;

export function EmployeesTable({ initialRows, initialTotal, authContext }: Props) {
  const router = useRouter();
  const { openTab } = useWorkspace();
  const [isPending, startTransition] = useTransition();

  const [rows, setRows] = useState<EmployeeListRow[]>(initialRows);
  const [totalCount, setTotalCount] = useState(initialTotal);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [archiveTarget, setArchiveTarget] = useState<EmployeeListRow | null>(null);

  const canCreate = authContext.permissionCodes?.includes("hr.employees.create")
    || authContext.roleCodes?.includes("system_admin");
  const canUpdate = authContext.permissionCodes?.includes("hr.employees.update")
    || authContext.roleCodes?.includes("system_admin");
  const canArchive = authContext.permissionCodes?.includes("hr.employees.archive")
    || authContext.roleCodes?.includes("system_admin");

  const fetchPage = useCallback(
    (p: number, q: string) => {
      startTransition(async () => {
        const params: Partial<EmployeeListParams> = {
          page: p,
          pageSize: PAGE_SIZE,
          search: q || undefined,
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

  const handleSearch = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setPage(1);
    fetchPage(1, search);
  };

  const handlePageChange = (newPage: number) => {
    setPage(newPage);
    fetchPage(newPage, search);
  };

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
      fetchPage(page, search);
    } else {
      toast.error(result.error ?? "Failed to archive employee");
    }
    setArchiveTarget(null);
  };

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  return (
    <div className="flex flex-col gap-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3">
        <form onSubmit={handleSearch} className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by code, name, mobile..."
              className="pl-8 w-72"
            />
          </div>
          <Button type="submit" variant="outline" size="sm" disabled={isPending}>
            Search
          </Button>
        </form>
        {canCreate && (
          <Button onClick={openAdd} size="sm">
            <Plus className="h-4 w-4 mr-1" />
            Add Employee
          </Button>
        )}
      </div>

      {/* Table */}
      <div className="rounded-md border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Employee Code</TableHead>
              <TableHead>Full Name</TableHead>
              <TableHead>Known Name</TableHead>
              <TableHead>Nationality</TableHead>
              <TableHead>Department</TableHead>
              <TableHead>Designation</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Company</TableHead>
              <TableHead>Branch</TableHead>
              <TableHead>Work Site</TableHead>
              <TableHead>Joining Date</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={12} className="text-center py-12">
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <Users className="h-8 w-8 opacity-40" />
                    <p className="text-sm">
                      {search ? `No employees found matching "${search}"` : "No employees found"}
                    </p>
                    {canCreate && !search && (
                      <Button size="sm" variant="outline" onClick={openAdd}>
                        <Plus className="h-4 w-4 mr-1" />
                        Add First Employee
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              rows.map((emp) => (
                <TableRow
                  key={emp.id}
                  className="cursor-pointer hover:bg-muted/40"
                  onClick={() => openView(emp)}
                >
                  <TableCell className="font-mono text-sm font-medium">
                    {emp.employee_code}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="font-medium text-sm">{emp.full_name_en}</span>
                      {emp.full_name_ar && (
                        <span className="text-xs text-muted-foreground" dir="rtl">
                          {emp.full_name_ar}
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {emp.known_name ?? "—"}
                  </TableCell>
                  <TableCell className="text-sm">
                    {emp.nationality?.name_en ?? "—"}
                  </TableCell>
                  <TableCell className="text-sm">
                    {emp.department?.department_name_en ?? "—"}
                  </TableCell>
                  <TableCell className="text-sm">
                    {emp.designation?.designation_name_en ?? "—"}
                  </TableCell>
                  <TableCell>
                    <Badge variant={STATUS_VARIANT[emp.employee_status] ?? "outline"}>
                      {STATUS_LABEL[emp.employee_status] ?? emp.employee_status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm">
                    {emp.owner_company?.company_code ?? "—"}
                  </TableCell>
                  <TableCell className="text-sm">
                    {emp.branch?.branch_code ?? "—"}
                  </TableCell>
                  <TableCell className="text-sm">
                    {emp.primary_work_site?.site_name ?? "—"}
                  </TableCell>
                  <TableCell className="text-sm">
                    {emp.joining_date
                      ? format(new Date(emp.joining_date), "dd MMM yyyy")
                      : "—"}
                  </TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <DropdownMenu>
                      <DropdownMenuTrigger className="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-accent hover:text-accent-foreground">
                        <span className="sr-only">Open menu</span>
                        <MoreVertical className="h-4 w-4" />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => openView(emp)}>
                          <Eye className="h-4 w-4 mr-2" />
                          View
                        </DropdownMenuItem>
                        {canUpdate && (
                          <DropdownMenuItem onClick={() => openEdit(emp)}>
                            <Edit className="h-4 w-4 mr-2" />
                            Edit
                          </DropdownMenuItem>
                        )}
                        {canArchive && (
                          <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onClick={() => setArchiveTarget(emp)}
                            >
                              <Archive className="h-4 w-4 mr-2" />
                              Archive
                            </DropdownMenuItem>
                          </>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>
          {totalCount === 0
            ? "No results"
            : `Showing ${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, totalCount)} of ${totalCount} employees`}
        </span>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => handlePageChange(page - 1)}
            disabled={page <= 1 || isPending}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span>
            Page {page} of {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handlePageChange(page + 1)}
            disabled={page >= totalPages || isPending}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Archive confirmation */}
      <AlertDialog open={!!archiveTarget} onOpenChange={(o) => !o && setArchiveTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archive Employee?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to archive{" "}
              <strong>{archiveTarget?.employee_code} — {archiveTarget?.full_name_en}</strong>?
              This will set their status to archived and soft-delete the record.
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
