"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { MoreHorizontal, Pencil, PowerOff, Power, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { updateDepartment, softDeleteDepartment } from "@/server/actions/common-master-data/departments";
import type { DepartmentRow } from "@/server/actions/common-master-data/departments";

interface Props {
  departments: DepartmentRow[];
  canManage: boolean;
}

export function DepartmentsListClient({ departments: initial, canManage }: Props) {
  const router = useRouter();
  const [departments, setDepartments] = useState(initial);
  const [pendingId, setPendingId] = useState<number | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DepartmentRow | null>(null);

  const handleToggleActive = async (dept: DepartmentRow) => {
    setPendingId(dept.id);
    try {
      const result = await updateDepartment({ id: dept.id, is_active: !dept.is_active });
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

  return (
    <>
      <div className="divide-y">
        {departments.map((d) => (
          <div key={d.id} className="flex items-center justify-between px-4 py-3 hover:bg-muted/30 transition-colors">
            {/* Row content — click navigates to view */}
            <Link
              href={`/admin/common-master-data/departments/record/${d.id}`}
              className="flex-1 min-w-0 mr-3"
            >
              <div className="flex items-center gap-2 text-sm font-medium flex-wrap">
                {d.department_name_en}
                <span className="text-xs text-muted-foreground">({d.department_code})</span>
                {!d.is_active && (
                  <Badge variant="destructive" className="text-[10px]">Inactive</Badge>
                )}
              </div>
              {d.owner_company && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  {(d.owner_company as { legal_name_en: string }).legal_name_en}
                </p>
              )}
            </Link>

            {/* Actions */}
            {canManage ? (
              <DropdownMenu>
                <DropdownMenuTrigger
                  disabled={pendingId === d.id}
                  className="h-8 w-8 inline-flex items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50 transition-colors shrink-0"
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
                className="text-xs text-muted-foreground shrink-0"
              >
                →
              </Link>
            )}
          </div>
        ))}
      </div>

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
