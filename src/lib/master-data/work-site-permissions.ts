import type { AuthContext } from "@/lib/rbac/check";
import { hasPermissionInScope } from "@/lib/rbac/scope";

export function canManageWorkSite(ctx: AuthContext, site: { owner_company_id: number; branch_id: number | null }) {
  return hasPermissionInScope(ctx, "common_md.work_sites.manage", site.owner_company_id, site.branch_id)
    || hasPermissionInScope(ctx, "common_md.manage", site.owner_company_id, site.branch_id);
}
