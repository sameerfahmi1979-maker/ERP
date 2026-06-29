"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { Lock, ExternalLink, ShieldAlert } from "lucide-react";
import { getRolePermissionsAction, type PermissionGroupRow } from "@/server/actions/roles";
import { assignPermissionToRole, removePermissionFromRole } from "@/server/actions/permissions";

type Props = {
  roleId: number;
  isSystemRole: boolean;
  canManage: boolean;
  isGlobalAdmin: boolean;
};

export function RolePermissionsSection({ roleId, isSystemRole, canManage, isGlobalAdmin }: Props) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [groups, setGroups] = useState<PermissionGroupRow[]>([]);
  const [toggling, setToggling] = useState<number | null>(null);

  const canEdit = canManage && (!isSystemRole || isGlobalAdmin);

  const load = useCallback(async () => {
    setIsLoading(true);
    const result = await getRolePermissionsAction(roleId);
    if (result.success && result.data) {
      setGroups(result.data.groups);
    }
    setIsLoading(false);
  }, [roleId]);

  useEffect(() => { load(); }, [load]);

  const handleToggle = async (permId: number, currentlyAssigned: boolean) => {
    if (!canEdit) return;
    setToggling(permId);
    try {
      const result = currentlyAssigned
        ? await removePermissionFromRole(roleId, permId)
        : await assignPermissionToRole(roleId, permId);

      if (result.success) {
        toast.success(currentlyAssigned ? "Permission removed" : "Permission assigned");
        router.refresh();
        // Update local state immediately
        setGroups((prev) =>
          prev.map((g) => ({
            ...g,
            permissions: g.permissions.map((p) =>
              p.id === permId ? { ...p, assigned: !currentlyAssigned } : p
            ),
          }))
        );
      } else {
        toast.error(result.error ?? "Failed to update permission");
      }
    } catch {
      toast.error("An unexpected error occurred");
    } finally {
      setToggling(null);
    }
  };

  const totalAssigned = groups.reduce((n, g) => n + g.permissions.filter((p) => p.assigned).length, 0);
  const totalPerms = groups.reduce((n, g) => n + g.permissions.length, 0);

  if (isLoading) {
    return (
      <div className="space-y-3 p-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span>{totalAssigned} / {totalPerms} permissions assigned</span>
        </div>
        <a
          href="/admin/permissions"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <ExternalLink className="h-3 w-3" />
          Full Permissions Matrix
        </a>
      </div>

      {/* System role warning */}
      {isSystemRole && (
        <div className={`flex items-start gap-2 rounded-lg border px-3 py-2.5 text-sm ${
          isGlobalAdmin
            ? "border-amber-200 bg-amber-50 text-amber-800"
            : "border-border bg-muted/30 text-muted-foreground"
        }`}>
          {isGlobalAdmin ? (
            <ShieldAlert className="h-4 w-4 shrink-0 mt-0.5 text-amber-600" />
          ) : (
            <Lock className="h-4 w-4 shrink-0 mt-0.5" />
          )}
          <span>
            {isGlobalAdmin
              ? "This is a system role. You have global admin access to edit permissions — proceed with caution."
              : "This is a system role. Only global administrators can modify its permissions."}
          </span>
        </div>
      )}

      {/* Permission groups */}
      <div className="space-y-4">
        {groups.map((group) => {
          const assignedCount = group.permissions.filter((p) => p.assigned).length;
          return (
            <div key={group.module_code} className="rounded-lg border">
              <div className="flex items-center justify-between px-4 py-2.5 border-b bg-muted/20">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold capitalize">
                    {group.module_code.replace(/_/g, " ")}
                  </span>
                  <Badge variant="outline" className="text-xs">
                    {assignedCount}/{group.permissions.length}
                  </Badge>
                </div>
              </div>
              <div className="divide-y">
                {group.permissions.map((perm) => (
                  <div
                    key={perm.id}
                    className={`flex items-center gap-3 px-4 py-2.5 ${
                      !perm.is_active ? "opacity-50" : ""
                    }`}
                  >
                    <Checkbox
                      id={`perm-${perm.id}`}
                      checked={perm.assigned}
                      disabled={!canEdit || toggling === perm.id || !perm.is_active}
                      onCheckedChange={() => handleToggle(perm.id, perm.assigned)}
                      className="shrink-0"
                    />
                    <label
                      htmlFor={`perm-${perm.id}`}
                      className={`flex-1 cursor-pointer ${!canEdit ? "cursor-default" : ""}`}
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">{perm.permission_name}</span>
                        {!perm.is_active && (
                          <Badge variant="outline" className="text-xs text-muted-foreground">Inactive</Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs font-mono text-muted-foreground">{perm.permission_code}</span>
                        {perm.description && (
                          <span className="text-xs text-muted-foreground">— {perm.description}</span>
                        )}
                      </div>
                    </label>
                    <Badge variant="outline" className="text-[10px] shrink-0">
                      {perm.action_code}
                    </Badge>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {groups.length === 0 && (
        <div className="flex flex-col items-center gap-2 py-12 text-muted-foreground">
          <Lock className="h-8 w-8 opacity-30" />
          <p className="text-sm">No permissions found</p>
        </div>
      )}
    </div>
  );
}
