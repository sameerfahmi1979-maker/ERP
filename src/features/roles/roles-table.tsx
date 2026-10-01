"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
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
import {
  MoreHorizontal,
  Pencil,
  CheckCircle,
  Ban,
  Trash2,
  Shield,
  Eye,
  Copy,
} from "lucide-react";
import type { Role } from "@/types/domain";
import { updateRoleStatus, deleteRole } from "@/server/actions/roles";
import { CloneRoleDialog } from "@/features/roles/clone-role-dialog";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const BASE = "/admin/roles";


type RolesTableProps = {
  data: Role[];
  canManage: boolean;
  isGlobalAdmin: boolean;
  userProfileId?: number | string;
  exportConfig?: {
    title: string;
    subtitle?: string;
    filename: string;
    generatedBy?: string;
  };
};

export function RolesTable({
  data,
  canManage,
  isGlobalAdmin,
}: RolesTableProps) {
  const router = useRouter();
  const [cloneSource, setCloneSource] = useState<Role | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Role | null>(null);
  const [statusTarget, setStatusTarget] = useState<Role | null>(null);
  const [isProcessingStatus, setIsProcessingStatus] = useState(false);

  const handleView = (role: Role) => router.push(`${BASE}/record/${role.id}`);
  const handleEdit = (role: Role) => router.push(`${BASE}/record/${role.id}?mode=edit`);

  const handleConfirmStatusChange = async () => {
    if (!statusTarget) return;
    setIsProcessingStatus(true);
    const result = await updateRoleStatus(statusTarget.id, !statusTarget.is_active);
    setIsProcessingStatus(false);
    if (result.success) {
      toast.success(`Role ${!statusTarget.is_active ? "activated" : "deactivated"}`);
      setStatusTarget(null);
      router.refresh();
    } else {
      toast.error(result.error ?? "Failed to update status");
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    const result = await deleteRole(deleteTarget.id);
    if (result.success) {
      toast.success("Role deleted");
      router.refresh();
    } else {
      toast.error(result.error ?? "Failed to delete role");
    }
    setDeleteTarget(null);
  };

  const columns: ColumnDef<Role>[] = [
    { id:"role",accessorFn:(row)=>[row.role_name,row.display_name,row.role_code].filter(Boolean).join(" "),header:"Role",size:270,enableHiding:false, cell:({row})=>{ const role=row.original; return (<button type="button" className="text-left hover:underline" onClick={()=>handleView(role)}>
                    <div className="flex items-start gap-3">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted">
                        <Shield className="h-3.5 w-3.5 text-muted-foreground" />
                      </div>
                      <div className="flex flex-col gap-0.5">
                        <span className="font-medium text-xs">
                          {role.display_name ?? role.role_name}
                        </span>
                        {role.display_name && (
                          <span className="text-[10px] text-muted-foreground">{role.role_name}</span>
                        )}
                        <span className="text-[10px] text-muted-foreground font-mono">{role.role_code}</span>
                      </div>
                    </div>
                  </button>); } },
    { accessorKey:"role_category",header:"Category", cell:({row})=>{ const role=row.original; return (<>
                    {role.role_category ? (
                      <Badge variant="outline" className="text-[10px] font-semibold px-1.5 py-0.5">
                        {role.role_category}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </>); } },
    { accessorKey:"role_level",header:"Level",meta:{filter:{type:"number"}}, cell:({row})=>{ const role=row.original; return (<>
                    {role.role_level ?? <span className="text-muted-foreground">—</span>}
                  </>); } },
    { id:"type",accessorFn:row=>row.is_system_role ? "System" : "Custom",header:"Type",meta:{filter:{type:"select",options:[{value:"System",label:"System"},{value:"Custom",label:"Custom"}]}}, cell:({row})=>{ const role=row.original; return (<>
                    <Badge
                      variant="outline"
                      className={cn(
                        "text-[10px] font-semibold px-1.5 py-0.5",
                        role.is_system_role
                          ? "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-950/30 dark:text-blue-400 dark:border-blue-800"
                          : "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-900 dark:text-slate-400 dark:border-slate-700",
                      )}
                    >
                      {role.is_system_role ? "System" : "Custom"}
                    </Badge>
                  </>); } },
    { id:"assignable",accessorFn:row=>row.is_assignable!==false,header:"Assignable", cell:({row})=>{ const role=row.original; return (<>
                    {role.is_assignable !== false ? (
                      <Badge
                        variant="outline"
                        className="text-[10px] font-semibold px-1.5 py-0.5 bg-green-100 text-green-700 border-green-200 dark:bg-green-950/30 dark:text-green-400 dark:border-green-800"
                      >
                        Assignable
                      </Badge>
                    ) : (
                      <Badge
                        variant="outline"
                        className="text-[10px] font-semibold px-1.5 py-0.5 bg-gray-100 text-gray-600 border-gray-200 dark:bg-gray-900 dark:text-gray-400 dark:border-gray-700"
                      >
                        Not assignable
                      </Badge>
                    )}
                  </>); } },
    { accessorKey:"is_active",header:"Status", cell:({row})=>{ const role=row.original; return (<>
                    <Badge
                      variant="outline"
                      className={cn(
                        "text-[10px] font-semibold px-1.5 py-0.5",
                        role.is_active
                          ? "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-950/30 dark:text-blue-400 dark:border-blue-800"
                          : "bg-gray-100 text-gray-600 border-gray-200 dark:bg-gray-900 dark:text-gray-400 dark:border-gray-700",
                      )}
                    >
                      {role.is_active ? "Active" : "Inactive"}
                    </Badge>
                  </>); } },
    { id:"actions",header:"Actions",enableSorting:false,enableHiding:false, cell:({row})=>{ const role=row.original; return (<>
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        className="inline-flex h-7 w-7 items-center justify-center rounded-md hover:bg-accent hover:text-accent-foreground"
                        aria-label="Open role actions"
                      >
                        <span className="sr-only">Open menu</span>
                        <MoreHorizontal className="h-3 w-3" />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => handleView(role)}>
                          <Eye className="mr-2 h-4 w-4" />
                          View
                        </DropdownMenuItem>

                        {(canManage && (!role.is_system_role || isGlobalAdmin)) && (
                          <DropdownMenuItem onClick={() => handleEdit(role)}>
                            <Pencil className="mr-2 h-4 w-4" />
                            Edit
                          </DropdownMenuItem>
                        )}

                        {canManage && (
                          <DropdownMenuItem onClick={() => setCloneSource(role)}>
                            <Copy className="mr-2 h-4 w-4" />
                            Clone Role
                          </DropdownMenuItem>
                        )}

                        {(canManage && (!role.is_system_role || isGlobalAdmin)) && (
                          <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => setStatusTarget(role)}>
                              {role.is_active ? (
                                <><Ban className="mr-2 h-4 w-4" />Deactivate</>
                              ) : (
                                <><CheckCircle className="mr-2 h-4 w-4" />Activate</>
                              )}
                            </DropdownMenuItem>
                          </>
                        )}

                        {canManage && !role.is_system_role && (
                          <DropdownMenuItem
                            onClick={() => setDeleteTarget(role)}
                            className="text-destructive focus:text-destructive"
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Delete
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </>); } },
  ];
  return (
    <>
      <ERPDataTable tableId="admin.roles" resultsLabel="Roles" data={data} columns={columns}
        enableRowSelection={false} searchPlaceholder="Search roles by name, code or category…" />

      {/* Clone Dialog */}
      {cloneSource && (
        <CloneRoleDialog
          sourceRole={cloneSource}
          open={!!cloneSource}
          onOpenChange={(open) => { if (!open) setCloneSource(null); }}
        />
      )}

      {/* Status change confirmation */}
      <AlertDialog
        open={!!statusTarget}
        onOpenChange={(o) => { if (!o && !isProcessingStatus) setStatusTarget(null); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {statusTarget?.is_active ? "Deactivate Role?" : "Activate Role?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {statusTarget?.is_active
                ? `Deactivate "${statusTarget.role_name}"? Users with this role will retain their assignment but the role will be hidden from new assignments.`
                : `Activate "${statusTarget?.role_name}"? The role will become available for assignments.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isProcessingStatus}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); handleConfirmStatusChange(); }}
              disabled={isProcessingStatus}
              className={statusTarget?.is_active ? "bg-amber-600 hover:bg-amber-700 text-white" : undefined}
            >
              {isProcessingStatus
                ? "Updating…"
                : statusTarget?.is_active
                  ? "Deactivate"
                  : "Activate"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Role?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <strong>{deleteTarget?.role_name}</strong>?
              This cannot be undone. Roles with existing user assignments cannot be deleted — deactivate them instead.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleConfirmDelete}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
