/** Shared assignment rules. Labels and role_level never confer authority. */
export const ADMINISTRATOR_POLICY_VERSION = '2026-10-25.v1';
export const ADMINISTRATOR_SCOPES = ['global', 'company', 'branch'] as const;
export type AdministratorScope = typeof ADMINISTRATOR_SCOPES[number];
export type AdministratorPermissionScope = 'global' | 'company' | 'branch' | 'held';
export function administratorScope(roleCode: string): AdministratorScope | null {
  switch (roleCode) {
    case 'system_admin': case 'group_admin': return 'global';
    case 'company_admin': return 'company';
    case 'branch_admin': return 'branch';
    default: return null;
  }
}
export function administratorRoleLabel(code: string, fallback: string): string {
  return code === 'system_admin' ? 'Global System Administrator' : fallback;
}
const validId = (id: number | null): boolean => id !== null && Number.isSafeInteger(id) && id > 0;
export function assignmentScopeError(code: string, company: number | null, branch: number | null): string | null {
  if (company !== null && !validId(company) || branch !== null && !validId(branch)) return 'Choose a valid company and branch.';
  if (branch !== null && company === null) return 'A branch requires its company.';
  switch (administratorScope(code)) {
    case 'global': return company === null && branch === null ? null : 'Global System Administrator requires Global System scope.';
    case 'company': return validId(company) && branch === null ? null : 'Company Administrator requires one company and all its branches.';
    case 'branch': return validId(company) && validId(branch) ? null : 'Branch Administrator requires a company and a specific branch.';
    default: return null;
  }
}
/** The database projects this same rule into locked role_permissions rows. */
export function inheritsAdministratorPermission(code: string, scope: AdministratorPermissionScope): boolean {
  return code === 'company_admin' && (scope === 'company' || scope === 'branch') || code === 'branch_admin' && scope === 'branch';
}
export function administratorAccessSummary(code: string): string | null {
  switch (administratorScope(code)) {
    case 'global': return 'All ERP companies and branches. Business approvals, locks and retention rules still apply.';
    case 'company': return 'All supported operations and sensitive records within this company and its branches. Global settings and other companies are excluded. Business approvals and locks still apply.';
    case 'branch': return 'All supported operations and sensitive records within this branch. Other branches, company-wide confidential records and global settings are excluded. Business approvals and locks still apply.';
    default: return null;
  }
}
