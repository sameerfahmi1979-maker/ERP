"use client";

import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Lock, Shield, Search, AlertTriangle } from "lucide-react";
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
  const [search, setSearch] = useState("");
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

  // Group by module
  const filtered = useMemo(() => {
    if (!search.trim()) return permissions;
    const q = search.toLowerCase();
    return permissions.filter(
      (p) =>
        p.permission_name?.toLowerCase().includes(q) ||
        p.permission_code.toLowerCase().includes(q) ||
        p.module_code?.toLowerCase().includes(q) ||
        permissionModuleLabel(p.module_code ?? "other").toLowerCase().includes(q) ||
        p.source_role_code.toLowerCase().includes(q),
    );
  }, [permissions, search]);

  const grouped = useMemo(() => {
    const map = new Map<string, EffectivePermissionRow[]>();
    for (const p of filtered) {
      const mod = permissionModuleGroup(p.module_code ?? "other");
      if (!map.has(mod)) map.set(mod, []);
      map.get(mod)!.push(p);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [filtered]);

  const uniqueRoles = useMemo(
    () => [...new Set(permissions.map((p) => p.source_role_code))],
    [permissions],
  );

  const moduleCount = grouped.length;
  const totalCount = permissions.length;

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

      {/* Search */}
      {!loading && !error && totalCount > 0 && (
        <div className="relative max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search permissions, modules, roles..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-9 text-sm"
          />
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
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Empty */}
      {!loading && !error && permissions.length === 0 && (
        <p className="text-sm text-muted-foreground py-4">
          This user has no assigned permissions.
        </p>
      )}

      {/* Grouped permissions */}
      {!loading && !error && grouped.length > 0 && (
        <div className="space-y-4">
          {grouped.map(([moduleGroup, perms]) => (
            <div key={moduleGroup} className="rounded-md border border-border overflow-hidden">
              <div className="flex items-center justify-between px-3 py-2 bg-muted/30 border-b border-border">
                <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {permissionModuleLabel(moduleGroup)}
                </span>
                <Badge variant="outline" className="text-[10px]">
                  {perms.length}
                </Badge>
              </div>
              <div className="divide-y divide-border">
                {perms.map((p, i) => (
                  <div key={`${p.permission_code}-${p.source_role_code}-${i}`} className="flex items-center justify-between px-3 py-2 text-xs gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-foreground truncate">
                        {p.permission_name ?? p.permission_code}
                      </p>
                      <p className="text-muted-foreground font-mono text-[10px] truncate">
                        {p.permission_code}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <Badge variant="secondary" className="text-[10px]">
                        {p.source_role_name ?? p.source_role_code}
                      </Badge>
                      <Badge
                        variant="outline"
                        className="text-[10px] text-muted-foreground"
                      >
                        {permissionScopeLabel(p)}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* No search results */}
      {!loading && !error && permissions.length > 0 && filtered.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No permissions match &quot;{search}&quot;.
        </p>
      )}
    </div>
  );
}
