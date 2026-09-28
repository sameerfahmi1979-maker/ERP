/** Display-only grouping. Never rewrites permission codes, grants or assignment scopes. */
export function permissionModuleGroup(moduleCode: string): string {
  const normalized = moduleCode.trim().toLowerCase().replace(/[\s.-]+/g, "_");
  if (/^(hr|human_resources?)(_|$)/.test(normalized)) return "hr";
  return normalized || "other";
}

const LABELS: Record<string, string> = {
  hr: "Human Resources", users: "Users", roles: "Roles", permissions: "Permissions",
  dms: "Document Management", audit: "Audit & Logs", finance: "Finance", inventory: "Inventory",
  purchasing: "Purchasing", sales: "Sales", master_data: "Master Data", settings: "Settings",
  notifications: "Notifications", reports: "Reports", system: "System", other: "Other",
};
export function permissionModuleLabel(moduleCode: string): string {
  const group = permissionModuleGroup(moduleCode);
  return LABELS[group] ?? group.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

/** Label the assignment tuple without presenting a company ID as a branch. */
export function permissionScopeLabel(scope: { scope_type: string; owner_company_id: number | null; branch_id: number | null }): string {
  if (scope.scope_type === "global") return "Global";
  const company = scope.owner_company_id === null ? "Company not specified" : `Company ${scope.owner_company_id}`;
  return scope.branch_id === null ? company : `${company} / branch ${scope.branch_id}`;
}
