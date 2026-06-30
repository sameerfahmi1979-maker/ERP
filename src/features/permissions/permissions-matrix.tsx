"use client";

import { useState, useCallback } from "react";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";

import type { Permission, Role } from "@/types/database";
import { assignPermissionToRole, removePermissionFromRole } from "@/server/actions/permissions";
import { toast } from "sonner";

type RolePermission = { role_id: number; permission_id: number };

type PermissionsMatrixProps = {
  permissions: Permission[];
  roles: Role[];
  rolePermissions: RolePermission[];
  canManage: boolean;
};

export function PermissionsMatrix({
  permissions,
  roles,
  rolePermissions: initialRolePermissions,
  canManage,
}: PermissionsMatrixProps) {
  // Optimistic local state for role permissions
  const [localPermissions, setLocalPermissions] = useState<RolePermission[]>(initialRolePermissions);
  const [loading, setLoading] = useState<string | null>(null);



  // Group permissions by module
  const groupedPermissions = permissions.reduce(
    (acc, perm) => {
      if (!acc[perm.module_code]) acc[perm.module_code] = [];
      acc[perm.module_code].push(perm);
      return acc;
    },
    {} as Record<string, Permission[]>,
  );

  const hasPermission = useCallback(
    (roleId: number, permissionId: number) =>
      localPermissions.some((rp) => rp.role_id === roleId && rp.permission_id === permissionId),
    [localPermissions],
  );

  const handleToggle = async (roleId: number, permissionId: number, currentValue: boolean) => {
    if (!canManage) return;
    const key = `${roleId}-${permissionId}`;
    setLoading(key);

    // Optimistic update
    if (currentValue) {
      setLocalPermissions((prev) =>
        prev.filter((rp) => !(rp.role_id === roleId && rp.permission_id === permissionId)),
      );
    } else {
      setLocalPermissions((prev) => [...prev, { role_id: roleId, permission_id: permissionId }]);
    }

    try {
      const result = currentValue
        ? await removePermissionFromRole(roleId, permissionId)
        : await assignPermissionToRole(roleId, permissionId);

      if (result.success) {
        toast.success(currentValue ? "Permission removed" : "Permission assigned");
      } else {
        // Revert on error
        if (currentValue) {
          setLocalPermissions((prev) => [...prev, { role_id: roleId, permission_id: permissionId }]);
        } else {
          setLocalPermissions((prev) =>
            prev.filter((rp) => !(rp.role_id === roleId && rp.permission_id === permissionId)),
          );
        }
        toast.error(result.error || "Failed to update permission");
      }
    } catch {
      // Revert on exception
      if (currentValue) {
        setLocalPermissions((prev) => [...prev, { role_id: roleId, permission_id: permissionId }]);
      } else {
        setLocalPermissions((prev) =>
          prev.filter((rp) => !(rp.role_id === roleId && rp.permission_id === permissionId)),
        );
      }
      toast.error("An unexpected error occurred");
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="space-y-6">


      {Object.entries(groupedPermissions).map(([module, perms]) => (
        <Card key={module} className="p-6">
          <div className="mb-4">
            <h3 className="text-lg font-semibold capitalize">{module.replace(/_/g, " ")}</h3>
            <p className="text-sm text-muted-foreground">{perms.length} permissions</p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b">
                  <th className="text-left p-3 font-medium text-sm">Permission</th>
                  {roles.map((role) => (
                    <th key={role.id} className="p-3 text-center">
                      <div className="flex flex-col items-center gap-1">
                        <span className="text-xs font-medium">{role.role_name}</span>
                        <Badge variant="outline" className="text-[10px]">
                          {role.is_system_role ? "System" : "Custom"}
                        </Badge>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {perms.map((perm) => (
                  <tr key={perm.id} className="border-b hover:bg-muted/50">
                    <td className="p-3">
                      <div>
                        <p className="font-medium text-sm">{perm.permission_name}</p>
                        <p className="text-xs text-muted-foreground">{perm.permission_code}</p>
                      </div>
                    </td>
                    {roles.map((role) => {
                      const checked = hasPermission(role.id, perm.id);
                      const key = `${role.id}-${perm.id}`;
                      const isLoading = loading === key;

                      return (
                        <td key={role.id} className="p-3 text-center">
                          <Checkbox
                            checked={checked}
                            disabled={!canManage || isLoading}
                            onCheckedChange={() => handleToggle(role.id, perm.id, checked)}
                            aria-label={`${checked ? "Remove" : "Assign"} ${perm.permission_name} for ${role.role_name}`}
                          />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ))}
    </div>
  );
}
