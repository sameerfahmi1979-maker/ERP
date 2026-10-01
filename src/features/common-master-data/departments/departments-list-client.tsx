"use client";

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
import { Badge } from "@/components/ui/badge";
import { ERPDataTable } from "@/components/erp/table/erp-data-table";
import type { ColumnDef } from "@tanstack/react-table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { DepartmentRow } from "@/server/actions/common-master-data/departments";
import { softDeleteDepartment, updateDepartment } from "@/server/actions/common-master-data/departments";
import { MoreHorizontal, Pencil, Power, PowerOff, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

interface Props {
  departments: DepartmentRow[];
  canManage: boolean;
}

export function DepartmentsListClient({ departments: initial, canManage }: Props) {
  const router = useRouter();
  const [departments, setDepartments] = useState(initial);
  const [snapshot, setSnapshot] = useState(initial);
  if (snapshot !== initial) { setSnapshot(initial); setDepartments(initial); }
  const [pendingId, setPendingId] = useState<number | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DepartmentRow | null>(null);

  const handleToggleActive = async (dept: DepartmentRow) => {
    setPendingId(dept.id);
    try {
      const result = await updateDepartment({ id: dept.id, is_active: !dept.is_active }, {operationId:crypto.randomUUID(),revision:String(dept.workspace_revision)});
      if (result.success) {
        setDepartments((prev) =>
          prev.map((d) => (d.id === dept.id ? { ...d, is_active: !d.is_active } : d))
        );
        toast.success(dept.is_active ? "Department deactivated" : "Department activated");
        router.refresh();
      } else {
        toast.error(result.error ?? "Failed to update");
      }
    } finally {
      setPendingId(null);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setPendingId(deleteTarget.id);
    try {
      const result = await softDeleteDepartment(deleteTarget.id);
      if (result.success) {
        setDepartments((prev) => prev.filter((d) => d.id !== deleteTarget.id));
        toast.success("Department deleted");
        router.refresh();
      } else {
        toast.error(result.error ?? "Failed to delete");
      }
    } finally {
      setPendingId(null);
      setDeleteTarget(null);
    }
  };

  const columns: ColumnDef<DepartmentRow, unknown>[] = [
    {accessorKey:"department_code",header:"Code",size:140},
    {accessorKey:"department_name_en",header:"Department",size:280,enableHiding:false,cell:({row})=><Link className="text-primary underline underline-offset-2" href={`/admin/common-master-data/departments/record/${row.original.id}`}>{row.original.department_name_en}</Link>},
    {id:"company",header:"Company",size:240,accessorFn:row=>row.owner_company?.legal_name_en ?? ""},
    {id:"status",header:"Status",size:130,accessorFn:row=>row.is_active ? "Active":"Inactive",cell:({row})=><Badge variant={row.original.is_active ? "outline":"secondary"}>{row.original.is_active ? "Active":"Inactive"}</Badge>},
    {id:"actions",header:"Actions",size:100,enableSorting:false,enableHiding:false,cell:({row})=>{ const d = row.original; return (canManage ? (
              <DropdownMenu>
                <DropdownMenuTrigger
                  disabled={pendingId === d.id}
                  aria-label={`Actions for ${d.department_code}`}
                  className="h-11 w-11 sm:h-8 sm:w-8 inline-flex items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50 transition-colors shrink-0"
                >
                  <MoreHorizontal className="h-4 w-4" />
                  <span className="sr-only">Actions</span>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-40">
                  <DropdownMenuItem onClick={() => router.push(`/admin/common-master-data/departments/record/${d.id}?mode=edit`)}>
                    <Pencil className="mr-2 h-3.5 w-3.5" />
                    Edit
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => handleToggleActive(d)}
                    disabled={pendingId === d.id}
                  >
                    {d.is_active ? (
                      <>
                        <PowerOff className="mr-2 h-3.5 w-3.5 text-amber-600" />
                        <span className="text-amber-700">Deactivate</span>
                      </>
                    ) : (
                      <>
                        <Power className="mr-2 h-3.5 w-3.5 text-emerald-600" />
                        <span className="text-emerald-700">Activate</span>
                      </>
                    )}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => setDeleteTarget(d)}
                    disabled={pendingId === d.id}
                    className="text-destructive focus:text-destructive"
                  >
                    <Trash2 className="mr-2 h-3.5 w-3.5" />
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <Link
                href={`/admin/common-master-data/departments/record/${d.id}`}
                aria-label={`Open ${d.department_code}`}
                className="text-xs text-muted-foreground shrink-0"
              >
                →
              </Link>
            )); }}
  ];

  return (
    <>
      <ERPDataTable tableId="departments" data={departments} columns={columns} enableRowSelection={false} searchPlaceholder="Search departments" />

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Department</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <strong>{deleteTarget?.department_name_en}</strong>?
              This action cannot be undone and may affect employees assigned to this department.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
