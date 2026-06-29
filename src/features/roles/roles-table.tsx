"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
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
import { MoreHorizontal, Pencil, CheckCircle, Ban, Trash2, Shield, Eye, Copy } from "lucide-react";
import type { Role } from "@/types/database";
import { updateRoleStatus, deleteRole } from "@/server/actions/roles";
import { CloneRoleDialog } from "@/features/roles/clone-role-dialog";
import { toast } from "sonner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

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

  const handleView = (role: Role) => router.push(`${BASE}/record/${role.id}`);
  const handleEdit = (role: Role) => router.push(`${BASE}/record/${role.id}?mode=edit`);

  const handleStatusChange = async (role: Role) => {
    const result = await updateRoleStatus(role.id, !role.is_active);
    if (result.success) {
      toast.success(`Role ${!role.is_active ? "activated" : "deactivated"}`);
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

  return (
    <>
      <div className="rounded-md border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Role</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Level</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Assignable</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-12 text-muted-foreground text-sm">
                  No roles found
                </TableCell>
              </TableRow>
            ) : (
              data.map((role) => (
                <TableRow
                  key={role.id}
                  className="cursor-pointer hover:bg-muted/40"
                  onClick={() => handleView(role)}
                >
                  <TableCell>
                    <div className="flex items-start gap-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted">
                        <Shield className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <div className="flex flex-col gap-0.5">
                        <span className="font-medium text-sm">
                          {role.display_name ?? role.role_name}
                        </span>
                        {role.display_name && (
                          <span className="text-xs text-muted-foreground">{role.role_name}</span>
                        )}
                        <span className="text-[11px] text-muted-foreground font-mono">{role.role_code}</span>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm">
                    {role.role_category ? (
                      <Badge variant="outline" className="text-xs">{role.role_category}</Badge>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-sm">
                    {role.role_level ? (
                      <span className="text-xs">{role.role_level}</span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant={role.is_system_role ? "default" : "secondary"} className="text-xs">
                      {role.is_system_role ? "System" : "Custom"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {role.is_assignable !== false ? (
                      <Badge variant="outline" className="text-xs text-emerald-600 border-emerald-300">
                        Assignable
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-xs text-muted-foreground">
                        Not assignable
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant={role.is_active ? "default" : "secondary"} className="text-xs">
                      {role.is_active ? "Active" : "Inactive"}
                    </Badge>
                  </TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <DropdownMenu>
                      <DropdownMenuTrigger className="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-accent hover:text-accent-foreground">
                        <span className="sr-only">Open menu</span>
                        <MoreHorizontal className="h-4 w-4" />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => handleView(role)}>
                          <Eye className="mr-2 h-4 w-4" />
                          View
                        </DropdownMenuItem>

                        {/* Edit: custom roles for canManage; system roles for global admin only */}
                        {(canManage && (!role.is_system_role || isGlobalAdmin)) && (
                          <DropdownMenuItem onClick={() => handleEdit(role)}>
                            <Pencil className="mr-2 h-4 w-4" />
                            Edit
                          </DropdownMenuItem>
                        )}

                        {/* Clone: available for canManage on any role */}
                        {canManage && (
                          <DropdownMenuItem onClick={() => setCloneSource(role)}>
                            <Copy className="mr-2 h-4 w-4" />
                            Clone
                          </DropdownMenuItem>
                        )}

                        {/* Status toggle: system roles need global admin, custom need canManage */}
                        {(canManage && (!role.is_system_role || isGlobalAdmin)) && (
                          <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => handleStatusChange(role)}>
                              {role.is_active ? (
                                <><Ban className="mr-2 h-4 w-4" />Deactivate</>
                              ) : (
                                <><CheckCircle className="mr-2 h-4 w-4" />Activate</>
                              )}
                            </DropdownMenuItem>
                          </>
                        )}

                        {/* Delete: custom roles only */}
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
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Clone Dialog */}
      {cloneSource && (
        <CloneRoleDialog
          sourceRole={cloneSource}
          open={!!cloneSource}
          onOpenChange={(open) => { if (!open) setCloneSource(null); }}
        />
      )}

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
