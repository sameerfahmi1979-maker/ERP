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
  RefreshCw,
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

type StatusFilter = "all" | "active" | "inactive";
type TypeFilter = "all" | "system" | "custom";

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
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");

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

  const filtered = useMemo(() => {
    let rows = data;
    if (typeFilter === "system") rows = rows.filter((r) => r.is_system_role);
    else if (typeFilter === "custom") rows = rows.filter((r) => !r.is_system_role);
    if (statusFilter === "active") rows = rows.filter((r) => r.is_active);
    else if (statusFilter === "inactive") rows = rows.filter((r) => !r.is_active);
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
  }, [data, statusFilter, typeFilter, search]);

  const hasFilters = search.trim() || statusFilter !== "all" || typeFilter !== "all";

  const clearFilters = () => {
    setSearch("");
    setStatusFilter("all");
    setTypeFilter("all");
  };

  // Active chips
  const activeChips: { label: string; onRemove: () => void }[] = [];
  if (search.trim()) activeChips.push({ label: `Search: "${search}"`, onRemove: () => setSearch("") });
  if (statusFilter !== "all") activeChips.push({ label: `Status: ${statusFilter}`, onRemove: () => setStatusFilter("all") });
  if (typeFilter !== "all") activeChips.push({ label: `Type: ${typeFilter}`, onRemove: () => setTypeFilter("all") });

  const selectClass =
    "flex h-8 w-full rounded-md border border-input bg-background text-foreground px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring";

  return (
    <>
      {/* Row 1 — Search + refresh */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search roles by name, code, or category..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-8 text-sm"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              className="absolute right-2.5 top-2 text-muted-foreground hover:text-foreground"
              aria-label="Clear search"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <div className="ml-auto flex items-center gap-2 shrink-0">
          <Button
            variant="outline"
            size="sm"
            onClick={() => router.refresh()}
            aria-label="Refresh"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Row 2 — Labeled filter panel */}
      <div className="rounded-lg border border-border bg-muted/10 p-3">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <div>
            <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Status
            </label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
              className={selectClass}
              aria-label="Filter by status"
            >
              <option value="all">All statuses</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>

          <div>
            <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Type
            </label>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value as TypeFilter)}
              className={selectClass}
              aria-label="Filter by type"
            >
              <option value="all">All types</option>
              <option value="system">System</option>
              <option value="custom">Custom</option>
            </select>
          </div>

          <div className="flex items-end">
            <div className="text-xs text-muted-foreground pt-5">
              {filtered.length} of {data.length} role{data.length !== 1 ? "s" : ""}
            </div>
          </div>
        </div>

        {/* Active filter chips */}
        {activeChips.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-border/60 pt-3">
            {activeChips.map((chip) => (
              <Badge key={chip.label} variant="secondary" className="gap-1 pr-1 text-[11px] font-normal">
                {chip.label}
                <button
                  type="button"
                  onClick={chip.onRemove}
                  aria-label={`Remove ${chip.label} filter`}
                  className="hover:text-destructive"
                >
                  <X className="h-2.5 w-2.5" />
                </button>
              </Badge>
            ))}
            <button
              type="button"
              onClick={clearFilters}
              className="text-[11px] text-muted-foreground hover:underline"
            >
              Clear all
            </button>
          </div>
        )}
      </div>

      {/* Table */}
      <div className="rounded-md border border-border overflow-x-auto">
        <Table className="w-full text-xs">
          <TableHeader>
            <TableRow className="border-b border-border bg-muted/30 hover:bg-muted/30">
              <TableHead className="px-3 py-2 text-xs font-semibold">Role</TableHead>
              <TableHead className="px-3 py-2 text-xs font-semibold">Category</TableHead>
              <TableHead className="px-3 py-2 text-xs font-semibold">Level</TableHead>
              <TableHead className="px-3 py-2 text-xs font-semibold">Type</TableHead>
              <TableHead className="px-3 py-2 text-xs font-semibold">Assignable</TableHead>
              <TableHead className="px-3 py-2 text-xs font-semibold">Status</TableHead>
              <TableHead className="w-12 px-3 py-2" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-10 text-muted-foreground">
                  <div className="flex flex-col items-center gap-2">
                    <Shield className="h-8 w-8 opacity-30" />
                    <p className="text-sm">
                      {hasFilters ? "No roles match your filters." : "No roles found."}
                    </p>
                    {hasFilters && (
                      <Button size="sm" variant="outline" className="mt-1 gap-1.5" onClick={clearFilters}>
                        <X className="h-3.5 w-3.5" /> Clear filters
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((role) => (
                <TableRow
                  key={role.id}
                  className="border-b border-border hover:bg-muted/20 transition-colors cursor-pointer"
                  onClick={() => handleView(role)}
                >
                  <TableCell className="px-3 py-2">
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
                  </TableCell>
                  <TableCell className="px-3 py-2">
                    {role.role_category ? (
                      <Badge variant="outline" className="text-[10px] font-semibold px-1.5 py-0.5">
                        {role.role_category}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="px-3 py-2 text-xs">
                    {role.role_level ?? <span className="text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell className="px-3 py-2">
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
                  </TableCell>
                  <TableCell className="px-3 py-2">
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
                  </TableCell>
                  <TableCell className="px-3 py-2">
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
                  </TableCell>
                  <TableCell className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
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
