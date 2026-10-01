"use client";
import { ERPDataTable } from "@/components/erp/table/erp-data-table";
import type { ColumnDef } from "@tanstack/react-table";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";


import { Skeleton } from "@/components/ui/skeleton";
import { Lock, Shield, AlertTriangle } from "lucide-react";
import type { AuthContext } from "@/lib/rbac/check";
import { getUserEffectiveAccess, type EffectivePermissionRow } from "@/server/actions/users/effective-access";
import { permissionModuleGroup, permissionModuleLabel, permissionScopeLabel } from "@/lib/rbac/permission-taxonomy";

function canViewEffectiveAccess(ctx: AuthContext): boolean {
  return (
    ctx.roleCodes.includes("system_admin") ||
    ctx.roleCodes.includes("group_admin") ||
    ctx.permissionCodes.includes("users.view") ||
    ctx.permissionCodes.includes("permissions.view") ||
    ctx.permissionCodes.includes("audit.view")
  );
}

type Props = {
  userProfileId: number;
  authContext: AuthContext;
};
const EMPTY_PERMISSIONS: EffectivePermissionRow[] = [];

export function UserEffectiveAccessSection({ userProfileId, authContext }: Props) {

  const allowed = canViewEffectiveAccess(authContext);
  const { data, isPending: loading, error: queryError } = useQuery({
    queryKey: ["user-effective-access", authContext.profile?.id, userProfileId],
    enabled: allowed,
    queryFn: async () => {
      const result = await getUserEffectiveAccess(userProfileId);
      if (!result.success || !result.data) throw new Error(result.error ?? "Failed to load effective access");
      return result;
    },
    gcTime: 0,
    retry: false,
    refetchOnWindowFocus: false,
  });
  const permissions = allowed ? data?.data ?? EMPTY_PERMISSIONS : EMPTY_PERMISSIONS;
  const error = queryError?.message;

  const isGlobalAdmin = data?.subject?.globalAdmin === true;

  const uniqueRoles = useMemo(
    () => [...new Set(permissions.map((p) => p.source_role_code))],
    [permissions],
  );

  const moduleCount = new Set(permissions.map(p=>permissionModuleGroup(p.module_code ?? "other"))).size;
  const totalCount = permissions.length;

  const columns: ColumnDef<EffectivePermissionRow>[] = [
{id:"permission",header:"Permission",size:300,accessorFn:p=>[p.permission_name,p.permission_code].filter(Boolean).join(" "),cell:({row})=><div><p className="font-medium">{row.original.permission_name ?? row.original.permission_code}</p><p className="text-xs text-muted-foreground">{row.original.permission_code}</p></div>},
{id:"module",header:"Module",accessorFn:p=>permissionModuleLabel(p.module_code ?? "other")},
{id:"role",header:"Source role",accessorFn:p=>p.source_role_name ?? p.source_role_code},
{id:"scope",header:"Scope",accessorFn:permissionScopeLabel}];

  if (!allowed) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
        <Lock className="h-4 w-4 shrink-0" />
        <span>Viewing effective access requires users.view, permissions.view, or audit.view.</span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {data?.subject && (!data.subject.active || data.subject.requiredChange) && <p role="status" className="text-sm text-warning">This account is restricted. Its assigned roles do not currently authorize application access.</p>}
      {/* Global admin banner */}
      {isGlobalAdmin && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800 px-3 py-2.5 text-sm text-amber-800 dark:text-amber-300">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-amber-600" />
          <span>
            This user has <strong>Global Administrator</strong> access and can override permission
            checks. Effective permissions shown are from assigned roles.
          </span>
        </div>
      )}

      {/* Summary strip */}
      {!loading && !error && (
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <Shield className="h-4 w-4 shrink-0" />
          <span>
            <strong className="text-foreground">{totalCount}</strong> permissions across{" "}
            <strong className="text-foreground">{moduleCount}</strong> modules from{" "}
            <strong className="text-foreground">{uniqueRoles.length}</strong> role
            {uniqueRoles.length !== 1 ? "s" : ""}
          </span>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ))}
        </div>
      )}

      {/* Error */}
      {error && (
        <div role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          Effective access could not be loaded. Reload this section to try again.
        </div>
      )}

      {!loading && !error && <ERPDataTable tableId={`user.access:${userProfileId}`} resultsLabel="Effective access" data={permissions} columns={columns} enableRowSelection={false}/>}
    </div>
  );
}
