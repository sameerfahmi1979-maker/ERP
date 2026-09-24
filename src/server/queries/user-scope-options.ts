import "server-only";
import { getAuthContext } from "@/lib/rbac/check";
import { createAdminClient } from "@/lib/supabase/admin";
import { userScopeOptionFilter, type UserCompanyOption, type UserBranchOption } from "@/lib/users/scope-options";

/** User administration needs labels, not access to entire organization records. */
export async function listUserScopeOptions(): Promise<{ companies: UserCompanyOption[]; branches: UserBranchOption[] }> {
  const scope = userScopeOptionFilter(await getAuthContext());
  if (!scope.global && !scope.companyIds.length) return { companies: [], branches: [] };
  const admin = createAdminClient();
  let companies = admin.from("owner_companies").select("id,legal_name_en,company_code").order("id").limit(1001);
  let branches = admin.from("branches").select("id,owner_company_id,branch_name_en,branch_code").order("id").limit(1001);
  if (!scope.global) {
    companies = companies.in("id", scope.companyIds);
    const clauses: string[] = [];
    if (scope.branchCompanies.length) clauses.push(`owner_company_id.in.(${scope.branchCompanies.join(",")})`);
    if (scope.branchIds.length) clauses.push(`id.in.(${scope.branchIds.join(",")})`);
    // IDs come only from live, active server-resolved assignments, never request text.
    branches = clauses.length ? branches.or(clauses.join(",")) : branches.eq("id", -1);
  }
  const [c, b] = await Promise.all([companies, branches]);
  if (c.error || b.error || (c.data?.length ?? 0) > 1000 || (b.data?.length ?? 0) > 1000) {
    throw new Error("Unable to load complete user scope options");
  }
  return { companies: c.data ?? [], branches: b.data ?? [] };
}
