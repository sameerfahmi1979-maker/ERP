"use client";

import { useState, useCallback, useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
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
import { AlertTriangle, Check, Lock, Search, Shield, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { Permission, Role } from "@/types/database";
import { saveRolePermissionDraftChanges, type PermissionDraftChangeInput } from "@/server/actions/permissions";
import { PermissionExplorer } from "./permission-explorer";
import { PermissionReviewSaveDialog } from "./permission-review-save-dialog";

// ── Draft change type (exported so review dialog can use it) ──────────────────

export type PermissionDraftChange = {
  permissionId: number;
  permissionCode: string;
  permissionName: string;
  roleId: number;
  roleCode: string;
  roleName: string;
  action: "grant" | "revoke";
  originalAssigned: boolean;
  roleIsSystem: boolean;
  permissionIsSystem: boolean;
};

// ── Status helpers ────────────────────────────────────────────────────────────

type AssignmentStatus = "assigned" | "not_assigned" | "pending_grant" | "pending_revoke";

function getStatus(
  originalAssigned: boolean,
  draftChanges: Map<string, PermissionDraftChange>,
  permissionId: number,
  roleId: number,
): AssignmentStatus {
  const key = `${permissionId}:${roleId}`;
  const draft = draftChanges.get(key);
  if (draft) return draft.action === "grant" ? "pending_grant" : "pending_revoke";
  return originalAssigned ? "assigned" : "not_assigned";
}

function StatusBadge({ status }: { status: AssignmentStatus }) {
  const configs: Record<AssignmentStatus, { label: string; className: string }> = {
    assigned: { label: "Assigned", className: "bg-emerald-100 text-emerald-800 border-emerald-300" },
    not_assigned: { label: "Not Assigned", className: "bg-gray-100 text-gray-600 border-gray-300" },
    pending_grant: { label: "Pending Grant", className: "bg-blue-100 text-blue-800 border-blue-300" },
    pending_revoke: { label: "Pending Revoke", className: "bg-amber-100 text-amber-800 border-amber-300" },
  };
  const c = configs[status];
  return (
    <Badge variant="outline" className={cn("text-xs font-medium whitespace-nowrap", c.className)}>
      {c.label}
    </Badge>
  );
}

// ── Module name map (shared) ──────────────────────────────────────────────────

const MODULE_LABELS: Record<string, string> = {
  hr: "Human Resource",
  users: "Users",
  roles: "Roles",
  permissions: "Permissions",
  dms: "Document Management",
  audit: "Audit & Logs",
  finance: "Finance",
  inventory: "Inventory",
  purchasing: "Purchasing",
  sales: "Sales",
  master_data: "Master Data",
  settings: "Settings",
  notifications: "Notifications",
  reports: "Reports",
  system: "System",
};

function humanizeModule(code: string): string {
  return MODULE_LABELS[code] ?? code.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

// ── Role filter chips ─────────────────────────────────────────────────────────

type RoleFilter = "all" | "assigned" | "unassigned" | "pending";

const ROLE_FILTER_LABELS: Record<RoleFilter, string> = {
  all: "All Roles",
  assigned: "Assigned",
  unassigned: "Unassigned",
  pending: "Pending Changes",
};

// ── Stats bar ─────────────────────────────────────────────────────────────────

type StatsBarProps = {
  permissions: Permission[];
  roles: Role[];
  rolePermissions: Array<{ role_id: number; permission_id: number }>;
};

function StatsBar({ permissions, roles, rolePermissions }: StatsBarProps) {
  const modulesCount = useMemo(
    () => new Set(permissions.map((p) => p.module_code)).size,
    [permissions],
  );
  const systemPermsCount = permissions.filter((p) => p.is_system_permission).length;

  const items = [
    { label: "Total Permissions", value: permissions.length },
    { label: "Modules", value: modulesCount },
    { label: "Roles", value: roles.length },
    { label: "System Permissions", value: systemPermsCount },
  ];

  return (
    <div className="flex items-center gap-6 flex-wrap">
      {items.map((item) => (
        <div key={item.label} className="flex items-center gap-2">
          <span className="text-2xl font-bold tabular-nums">{item.value}</span>
          <span className="text-sm text-muted-foreground">{item.label}</span>
        </div>
      ))}
    </div>
  );
}

// ── Selected Permission Summary ───────────────────────────────────────────────

type PermissionSummaryCardProps = {
  permission: Permission;
};

function PermissionSummaryCard({ permission }: PermissionSummaryCardProps) {
  return (
    <div className="p-4 border-b bg-muted/30">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1 flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-base font-semibold leading-tight">
              {permission.display_name ?? permission.permission_name}
            </h3>
            {permission.is_system_permission && (
              <Badge variant="outline" className="text-[10px] border-blue-300 text-blue-700 bg-blue-50">
                <Lock className="h-2.5 w-2.5 mr-1" />
                System Permission
              </Badge>
            )}
          </div>
          <p className="text-xs font-mono text-muted-foreground">{permission.permission_code}</p>
          <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
            <span className="bg-muted px-1.5 py-0.5 rounded text-[11px]">
              {humanizeModule(permission.module_code)}
            </span>
            <span className="bg-muted px-1.5 py-0.5 rounded text-[11px]">
              {permission.action_code}
            </span>
          </div>
          {permission.description && (
            <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
              {permission.description}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Role Assignment Panel ─────────────────────────────────────────────────────

type RoleAssignmentPanelProps = {
  selectedPermission: Permission | null;
  roles: Role[];
  originalPermissions: Map<string, boolean>; // key: `${permissionId}:${roleId}`
  draftChanges: Map<string, PermissionDraftChange>;
  canManage: boolean;
  onToggle: (role: Role, permission: Permission, currentOriginalAssigned: boolean) => void;
};

function RoleAssignmentPanel({
  selectedPermission,
  roles,
  originalPermissions,
  draftChanges,
  canManage,
  onToggle,
}: RoleAssignmentPanelProps) {
  const [roleSearch, setRoleSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("all");

  const roleSearchLower = roleSearch.toLowerCase().trim();

  const filteredRoles = useMemo(() => {
    if (!selectedPermission) return [];
    return roles.filter((role) => {
      // Text search
      if (roleSearchLower) {
        const matches =
          role.role_name.toLowerCase().includes(roleSearchLower) ||
          role.role_code.toLowerCase().includes(roleSearchLower) ||
          (role.display_name ?? "").toLowerCase().includes(roleSearchLower) ||
          (role.description ?? "").toLowerCase().includes(roleSearchLower) ||
          (role.role_category ?? "").toLowerCase().includes(roleSearchLower);
        if (!matches) return false;
      }

      // Filter chip
      if (roleFilter === "all") return true;

      const key = `${selectedPermission.id}:${role.id}`;
      const originalAssigned = originalPermissions.get(key) ?? false;
      const hasDraft = draftChanges.has(key);
      const status = getStatus(originalAssigned, draftChanges, selectedPermission.id, role.id);

      if (roleFilter === "assigned") return originalAssigned || status === "pending_grant";
      if (roleFilter === "unassigned") return !originalAssigned || status === "pending_revoke";
      if (roleFilter === "pending") return hasDraft;
      return true;
    });
  }, [roles, selectedPermission, roleSearchLower, roleFilter, originalPermissions, draftChanges]);

  if (!selectedPermission) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 p-8 text-center">
        <div className="rounded-full bg-muted p-4">
          <Shield className="h-8 w-8 text-muted-foreground" />
        </div>
        <p className="text-sm text-muted-foreground max-w-xs">
          Select a permission from the left panel to review and assign roles.
        </p>
      </div>
    );
  }

  const pendingForPermission = [...draftChanges.values()].filter(
    (c) => c.permissionId === selectedPermission.id,
  );

  return (
    <div className="flex flex-col h-full">
      {/* Selected permission summary */}
      <PermissionSummaryCard permission={selectedPermission} />

      {/* Role filter bar */}
      <div className="px-4 py-3 border-b space-y-2.5">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
            <Input
              placeholder="Filter roles..."
              value={roleSearch}
              onChange={(e) => setRoleSearch(e.target.value)}
              className="pl-8 h-8 text-sm"
              aria-label="Filter roles by name"
            />
            {roleSearch && (
              <button
                type="button"
                className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground"
                onClick={() => setRoleSearch("")}
                aria-label="Clear role filter"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          {(Object.entries(ROLE_FILTER_LABELS) as [RoleFilter, string][]).map(([value, label]) => (
            <button
              key={value}
              type="button"
              className={cn(
                "px-2.5 py-1 text-xs rounded-full border transition-colors",
                roleFilter === value
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-transparent text-muted-foreground border-muted-foreground/30 hover:border-muted-foreground/60",
              )}
              onClick={() => setRoleFilter(value)}
            >
              {label}
              {value === "pending" && pendingForPermission.length > 0 && (
                <span className="ml-1 bg-primary-foreground/20 rounded-full px-1 tabular-nums">
                  {pendingForPermission.length}
                </span>
              )}
            </button>
          ))}
          {(roleFilter !== "all" || roleSearch) && (
            <button
              type="button"
              className="text-xs text-muted-foreground hover:text-foreground ml-1"
              onClick={() => { setRoleFilter("all"); setRoleSearch(""); }}
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* System permission warning */}
      {selectedPermission.is_system_permission && (
        <div className="flex items-start gap-2 px-4 py-2.5 bg-amber-50 border-b border-amber-200">
          <AlertTriangle className="h-3.5 w-3.5 text-amber-600 mt-0.5 shrink-0" />
          <p className="text-xs text-amber-800">
            This is a system permission. Changes may affect all users with the modified roles.
            System roles additionally require global admin access.
          </p>
        </div>
      )}

      {/* Role list */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {filteredRoles.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 gap-2 text-center px-4">
            <p className="text-sm text-muted-foreground">No roles match your filters.</p>
            {(roleFilter !== "all" || roleSearch) && (
              <button
                type="button"
                className="text-xs text-primary underline-offset-2 hover:underline"
                onClick={() => { setRoleFilter("all"); setRoleSearch(""); }}
              >
                Clear Role Filters
              </button>
            )}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-background z-10">
              <tr className="border-b">
                <th className="text-left px-4 py-2.5 font-medium text-xs text-muted-foreground">Role</th>
                <th className="text-left px-4 py-2.5 font-medium text-xs text-muted-foreground hidden md:table-cell">Type</th>
                <th className="text-left px-4 py-2.5 font-medium text-xs text-muted-foreground">Status</th>
                <th className="text-center px-4 py-2.5 font-medium text-xs text-muted-foreground">Assign</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filteredRoles.map((role) => {
                const key = `${selectedPermission.id}:${role.id}`;
                const originalAssigned = originalPermissions.get(key) ?? false;
                const status = getStatus(originalAssigned, draftChanges, selectedPermission.id, role.id);
                const isPendingGrant = status === "pending_grant";
                const isPendingRevoke = status === "pending_revoke";
                const isCurrentlyOn = isPendingGrant || (status === "assigned");
                const hasDraft = draftChanges.has(key);

                return (
                  <tr
                    key={role.id}
                    className={cn(
                      "hover:bg-muted/40 transition-colors",
                      hasDraft && "bg-blue-50/50",
                    )}
                  >
                    <td className="px-4 py-3">
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="font-medium text-sm">{role.display_name ?? role.role_name}</span>
                          {role.is_system_role && (
                            <Badge variant="outline" className="text-[10px] h-4 px-1 border-blue-300 text-blue-700">
                              System
                            </Badge>
                          )}
                        </div>
                        {role.description && (
                          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{role.description}</p>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      <Badge
                        variant="outline"
                        className={cn(
                          "text-[10px]",
                          role.is_system_role
                            ? "border-blue-300 text-blue-700"
                            : "border-emerald-300 text-emerald-700",
                        )}
                      >
                        {role.is_system_role ? "System" : "Custom"}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={status} />
                    </td>
                    <td className="px-4 py-3 text-center">
                      <Switch
                        checked={isCurrentlyOn}
                        disabled={!canManage}
                        onCheckedChange={() => onToggle(role, selectedPermission, originalAssigned)}
                        aria-label={
                          isCurrentlyOn
                            ? `Revoke ${selectedPermission.permission_name} permission from ${role.role_name}`
                            : `Grant ${selectedPermission.permission_name} permission to ${role.role_name}`
                        }
                        className={cn(
                          isPendingGrant && "data-[state=checked]:bg-blue-600",
                          isPendingRevoke && "data-[state=unchecked]:bg-amber-200",
                        )}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ── Pending Changes Bar ───────────────────────────────────────────────────────

type PendingBarProps = {
  draftChanges: Map<string, PermissionDraftChange>;
  onDiscard: () => void;
  onReviewSave: () => void;
};

function PendingChangesBar({ draftChanges, onDiscard, onReviewSave }: PendingBarProps) {
  const changes = [...draftChanges.values()];
  if (changes.length === 0) return null;

  const grantCount = changes.filter((c) => c.action === "grant").length;
  const revokeCount = changes.filter((c) => c.action === "revoke").length;

  return (
    <div className="sticky bottom-0 left-0 right-0 z-20 bg-card border-t shadow-[0_-4px_16px_-4px_rgba(0,0,0,0.1)]">
      <div className="flex items-center justify-between px-4 py-3 gap-4 flex-wrap">
        <div className="flex items-center gap-3 flex-wrap text-sm">
          <span className="font-semibold tabular-nums">
            {changes.length} pending change{changes.length !== 1 ? "s" : ""}
          </span>
          <Separator orientation="vertical" className="h-4 hidden sm:block" />
          {grantCount > 0 && (
            <span className="flex items-center gap-1 text-emerald-700">
              <Check className="h-3.5 w-3.5" />
              <span>{grantCount} grant{grantCount !== 1 ? "s" : ""}</span>
            </span>
          )}
          {revokeCount > 0 && (
            <span className="flex items-center gap-1 text-amber-700">
              <X className="h-3.5 w-3.5" />
              <span>{revokeCount} revoke{revokeCount !== 1 ? "s" : ""}</span>
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={onDiscard} className="gap-1.5">
            <Trash2 className="h-3.5 w-3.5" />
            Discard Changes
          </Button>
          <Button size="sm" onClick={onReviewSave} className="gap-1.5">
            <Check className="h-3.5 w-3.5" />
            Review &amp; Save
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Main Command Center ───────────────────────────────────────────────────────

type RolePermission = { role_id: number; permission_id: number };

type PermissionCommandCenterProps = {
  permissions: Permission[];
  roles: Role[];
  rolePermissions: RolePermission[];
  canManage: boolean;
};

export function PermissionCommandCenter({
  permissions,
  roles,
  rolePermissions,
  canManage,
}: PermissionCommandCenterProps) {
  const [selectedPermission, setSelectedPermission] = useState<Permission | null>(null);
  const [draftChanges, setDraftChanges] = useState<Map<string, PermissionDraftChange>>(new Map());
  const [showDiscardDialog, setShowDiscardDialog] = useState(false);
  const [showReviewDialog, setShowReviewDialog] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [failedKeys, setFailedKeys] = useState<Set<string>>(new Set());

  // Build the original assignment lookup map
  const originalPermissions = useMemo(() => {
    const map = new Map<string, boolean>();
    for (const rp of rolePermissions) {
      map.set(`${rp.permission_id}:${rp.role_id}`, true);
    }
    return map;
  }, [rolePermissions]);

  // Role lookup map
  const roleMap = useMemo(() => {
    const map = new Map<number, Role>();
    for (const r of roles) map.set(r.id, r);
    return map;
  }, [roles]);

  const handleToggle = useCallback(
    (role: Role, permission: Permission, originalAssigned: boolean) => {
      if (!canManage) return;
      const key = `${permission.id}:${role.id}`;
      setDraftChanges((prev) => {
        const next = new Map(prev);
        if (next.has(key)) {
          // User toggled back to original — remove from draft
          next.delete(key);
        } else {
          // New draft change
          const action = originalAssigned ? "revoke" : "grant";
          next.set(key, {
            permissionId: permission.id,
            permissionCode: permission.permission_code,
            permissionName: permission.display_name ?? permission.permission_name,
            roleId: role.id,
            roleCode: role.role_code,
            roleName: role.display_name ?? role.role_name,
            action,
            originalAssigned,
            roleIsSystem: role.is_system_role,
            permissionIsSystem: permission.is_system_permission,
          });
        }
        // Clear failed status if user re-toggles
        setFailedKeys((prevFailed) => {
          if (prevFailed.has(key)) {
            const next2 = new Set(prevFailed);
            next2.delete(key);
            return next2;
          }
          return prevFailed;
        });
        return next;
      });
    },
    [canManage],
  );

  const handleDiscard = useCallback(() => {
    if (draftChanges.size > 0) {
      setShowDiscardDialog(true);
    }
  }, [draftChanges.size]);

  const confirmDiscard = useCallback(() => {
    setDraftChanges(new Map());
    setFailedKeys(new Set());
    setShowDiscardDialog(false);
    toast.info("All pending changes discarded.");
  }, []);

  const handleSave = useCallback(async () => {
    if (draftChanges.size === 0) return;
    setIsSaving(true);

    const inputs: PermissionDraftChangeInput[] = [...draftChanges.values()].map((c) => ({
      permissionId: c.permissionId,
      permissionCode: c.permissionCode,
      permissionName: c.permissionName,
      roleId: c.roleId,
      roleCode: c.roleCode,
      roleName: c.roleName,
      action: c.action,
    }));

    try {
      const result = await saveRolePermissionDraftChanges(inputs);

      if (result.error && result.results.length === 0) {
        toast.error(result.error);
        return;
      }

      const failed = result.results.filter((r) => !r.success);
      const succeeded = result.results.filter((r) => r.success);

      // Remove succeeded changes from draft
      setDraftChanges((prev) => {
        const next = new Map(prev);
        for (const r of succeeded) {
          next.delete(`${r.permissionId}:${r.roleId}`);
        }
        return next;
      });

      // Track failed keys
      if (failed.length > 0) {
        setFailedKeys(new Set(failed.map((r) => `${r.permissionId}:${r.roleId}`)));
        toast.error(
          `${failed.length} change${failed.length !== 1 ? "s" : ""} could not be saved. Review the failed items and try again.`,
        );
      }

      if (succeeded.length > 0) {
        toast.success(
          `${succeeded.length} permission change${succeeded.length !== 1 ? "s" : ""} saved successfully.`,
        );
      }

      if (failed.length === 0) {
        setShowReviewDialog(false);
      }
    } catch {
      toast.error("An unexpected error occurred while saving permission changes.");
    } finally {
      setIsSaving(false);
    }
  }, [draftChanges]);

  const changesList = [...draftChanges.values()];
  const hasDraft = changesList.length > 0;

  return (
    <div className="flex flex-col gap-4">
      {/* Stats bar */}
      <StatsBar permissions={permissions} roles={roles} rolePermissions={rolePermissions} />

      {/* Not-manage view-only banner */}
      {!canManage && (
        <div className="flex items-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-4 py-2.5">
          <Lock className="h-4 w-4 text-amber-600 shrink-0" />
          <p className="text-sm text-amber-800">
            You have view-only access to this screen. Permission assignment requires the{" "}
            <span className="font-mono text-xs bg-amber-100 px-1 rounded">roles.manage</span> permission.
          </p>
        </div>
      )}

      {/* Two-panel layout */}
      <div
        className={cn(
          "flex gap-0 border rounded-lg overflow-hidden bg-card",
          "h-[calc(100vh-320px)] min-h-[500px]",
        )}
      >
        {/* LEFT — Permission Explorer */}
        <div className="w-[340px] lg:w-[380px] shrink-0 border-r flex flex-col">
          <div className="px-3 py-3 border-b bg-muted/30">
            <h2 className="text-sm font-semibold">1. Find a Permission</h2>
          </div>
          <PermissionExplorer
            permissions={permissions}
            selectedPermission={selectedPermission}
            onSelect={setSelectedPermission}
          />
        </div>

        {/* RIGHT — Role Assignment Panel */}
        <div className="flex-1 min-w-0 flex flex-col">
          <div className="px-4 py-3 border-b bg-muted/30 flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold">2. Assign to Roles</h2>
            {hasDraft && (
              <Badge className="bg-blue-100 text-blue-800 border-blue-300 text-xs">
                {changesList.length} pending
              </Badge>
            )}
          </div>
          <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
            <RoleAssignmentPanel
              selectedPermission={selectedPermission}
              roles={roles}
              originalPermissions={originalPermissions}
              draftChanges={draftChanges}
              canManage={canManage}
              onToggle={handleToggle}
            />
          </div>
        </div>
      </div>

      {/* Pending Changes sticky bar */}
      {hasDraft && (
        <PendingChangesBar
          draftChanges={draftChanges}
          onDiscard={handleDiscard}
          onReviewSave={() => setShowReviewDialog(true)}
        />
      )}

      {/* Discard confirmation dialog */}
      <AlertDialog open={showDiscardDialog} onOpenChange={setShowDiscardDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard pending permission changes?</AlertDialogTitle>
            <AlertDialogDescription>
              Your unsaved permission grants and revokes ({changesList.length} change
              {changesList.length !== 1 ? "s" : ""}) will be lost. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep Changes</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDiscard}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Discard Changes
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Review & Save dialog */}
      <PermissionReviewSaveDialog
        open={showReviewDialog}
        onOpenChange={setShowReviewDialog}
        changes={changesList}
        onConfirm={handleSave}
        isSaving={isSaving}
        failedKeys={failedKeys}
      />
    </div>
  );
}
