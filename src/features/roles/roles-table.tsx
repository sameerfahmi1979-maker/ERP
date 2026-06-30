"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  Search,
  X,
} from "lucide-react";
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
import { cn } from "@/lib/utils";

const BASE = "/admin/roles";

type QuickFilter = "all" | "system" | "custom" | "active" | "inactive" | "assignable";

const QUICK_FILTER_LABELS: Record<QuickFilter, string> = {
  all: "All",
  system: "System",
  custom: "Custom",
  active: "Active",
  inactive: "Inactive",
  assignable: "Assignable",
};

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
  const [search, setSearch] = useState("");
  const [quickFilter, setQuickFilter] = useState<QuickFilter>("all");

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

  // Filter logic
  const filtered = useMemo(() => {
    let rows = data;
    // Quick filter
    if (quickFilter === "system") rows = rows.filter((r) => r.is_system_role);
    else if (quickFilter === "custom") rows = rows.filter((r) => !r.is_system_role);
    else if (quickFilter === "active") rows = rows.filter((r) => r.is_active);
    else if (quickFilter === "inactive") rows = rows.filter((r) => !r.is_active);
    else if (quickFilter === "assignable") rows = rows.filter((r) => r.is_assignable !== false);
    // Search
    if (search.trim()) {
      const q = search.toLowerCase();
      rows = rows.filter(
        (r) =>
          r.role_name.toLowerCase().includes(q) ||
          r.role_code.toLowerCase().includes(q) ||
          (r.display_name ?? "").toLowerCase().includes(q) ||
          (r.role_category ?? "").toLowerCase().includes(q),
      );
    }
    return rows;
  }, [data, quickFilter, search]);

  const hasFilters = search.trim() || quickFilter !== "all";

  return (
    <>
      {/* Toolbar */}
      <div className="flex flex-col gap-3 p-4 border-b border-border/40">
        {/* Quick filter chips */}
        <div className="flex flex-wrap items-center gap-1.5">
          {(Object.keys(QUICK_FILTER_LABELS) as QuickFilter[]).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setQuickFilter(f)}
              className={cn(
                "inline-flex items-center rounded-full px-3 py-1 text-xs font-medium border transition-colors",
                quickFilter === f
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background text-muted-foreground border-border hover:bg-accent hover:text-accent-foreground",
              )}
            >
              {QUICK_FILTER_LABELS[f]}
            </button>
          ))}
          {hasFilters && (
            <button
              type="button"
              onClick={() => { setSearch(""); setQuickFilter("all"); }}
              className="inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs text-muted-foreground border border-dashed border-border hover:border-foreground hover:text-foreground transition-colors"
              aria-label="Clear all filters"
            >
              <X className="h-3 w-3" />
              Clear
            </button>
          )}
        </div>

        {/* Search */}
        <div className="relative max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search roles..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-9 text-sm"
          />
        </div>

        <p className="text-xs text-muted-foreground">
          {filtered.length} of {data.length} role{data.length !== 1 ? "s" : ""}
        </p>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
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
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-12 text-muted-foreground text-sm">
                  {hasFilters ? "No roles match your filters." : "No roles found."}
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((role) => (
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
                      <DropdownMenuTrigger
                        className="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-accent hover:text-accent-foreground"
                        aria-label="Open role actions"
                      >
                        <span className="sr-only">Open menu</span>
                        <MoreHorizontal className="h-4 w-4" />
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
