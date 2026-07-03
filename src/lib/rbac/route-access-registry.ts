/**
 * ERP USERS.4 — Route Access Registry
 *
 * Maps sidebar-visible route paths to their required permission(s).
 * This is a UX-only registry used for:
 *   1. Permission-aware sidebar item filtering (AppSidebar)
 *   2. First-permitted-route calculation (post-login redirect)
 *
 * SECURITY NOTE: This file does NOT provide security enforcement.
 * Every protected page still independently calls hasPermission() / requirePermission().
 * Even if a user bypasses sidebar filtering via direct URL, the server-side page guard blocks them.
 *
 * Rules:
 * - requiredPermission: user must have exactly this permission code
 * - requiredAnyPermissions: user must have at least one of these codes
 * - requiresGlobalAdmin: only system_admin or group_admin can see/access
 * - publicToAllActive: any active authenticated user (no specific permission needed)
 * - If none set and item is not disabled: visible to all (safe fallback for unregistered routes)
 */

export type RouteAccess = {
  requiredPermission?: string;
  requiredAnyPermissions?: string[];
  requiresGlobalAdmin?: boolean;
  publicToAllActive?: boolean;
};

export const ROUTE_ACCESS_REGISTRY: Record<string, RouteAccess> = {
  // ── Overview ───────────────────────────────────────────────────────────────
  "/dashboard":                                   { requiredPermission: "dashboard.view" },
  "/notifications":                               { publicToAllActive: true },

  // ── Human Resource ─────────────────────────────────────────────────────────
  "/admin/hr/dashboard":                          { requiredAnyPermissions: ["hr.dashboard.view", "hr.employees.view", "hr.admin"] },
  "/admin/hr/search":                             { requiredAnyPermissions: ["hr.search.use", "hr.admin"] },
  "/admin/hr/employees":                          { requiredAnyPermissions: ["hr.employees.view", "hr.admin"] },
  "/admin/hr/actions/pro":                        { requiredAnyPermissions: ["hr.actions.view", "hr.actions.manage", "hr.admin"] },
  "/admin/hr/actions/disciplinary":               { requiredAnyPermissions: ["hr.actions.view", "hr.actions.manage", "hr.admin"] },
  "/admin/hr/actions/approvals":                  { requiredAnyPermissions: ["hr.actions.view", "hr.actions.manage", "hr.admin"] },
  "/admin/hr/actions/eos":                        { requiredAnyPermissions: ["hr.eos.view", "hr.eos.manage", "hr.admin"] },
  "/admin/hr/time/attendance":                    { requiredAnyPermissions: ["hr.attendance.view", "hr.attendance.manage", "hr.admin"] },
  "/admin/hr/time/leave":                         { requiredAnyPermissions: ["hr.leave.view", "hr.leave.manage", "hr.admin"] },
  "/admin/hr/time/shifts":                        { requiredAnyPermissions: ["hr.attendance.view", "hr.admin"] },
  "/admin/hr/recruitment/requisitions":           { requiredAnyPermissions: ["hr.recruitment.view", "hr.recruitment.manage", "hr.admin"] },
  "/admin/hr/recruitment/candidates":             { requiredAnyPermissions: ["hr.recruitment.view", "hr.recruitment.manage", "hr.admin"] },
  "/admin/hr/recruitment/interviews":             { requiredAnyPermissions: ["hr.recruitment.view", "hr.recruitment.manage", "hr.admin"] },
  "/admin/hr/recruitment/offers":                 { requiredAnyPermissions: ["hr.recruitment.view", "hr.recruitment.manage", "hr.admin"] },
  "/admin/hr/recruitment/onboarding":             { requiredAnyPermissions: ["hr.recruitment.view", "hr.recruitment.manage", "hr.admin"] },
  "/admin/hr/payroll/salaries":                   { requiredAnyPermissions: ["hr.payroll.view", "hr.payroll.manage", "hr.admin"] },
  "/admin/hr/payroll/wps":                        { requiredAnyPermissions: ["hr.payroll.view", "hr.payroll.manage", "hr.admin"] },
  "/admin/hr/operations/assignments":             { requiredAnyPermissions: ["hr.assignments.view", "hr.assignments.manage", "hr.admin"] },
  "/admin/hr/operations/readiness":               { requiredAnyPermissions: ["hr.assignments.view", "hr.admin"] },
  "/admin/hr/operations/blocks":                  { requiredAnyPermissions: ["hr.assignments.view", "hr.admin"] },
  "/admin/hr/settings":                           { requiredAnyPermissions: ["hr.settings.view", "hr.settings.manage", "hr.admin"] },

  // ── Documents (DMS) ────────────────────────────────────────────────────────
  "/dms":                                         { requiredAnyPermissions: ["dms.documents.view", "dms.admin"] },
  "/dms/documents":                               { requiredAnyPermissions: ["dms.documents.view", "dms.admin"] },
  "/dms/inbox":                                   { requiredAnyPermissions: ["dms.documents.upload", "dms.documents.view", "dms.admin"] },
  "/dms/inbox/batches":                           { requiredAnyPermissions: ["dms.documents.upload", "dms.documents.view", "dms.admin"] },
  "/dms/review-queue":                            { requiredAnyPermissions: ["dms.review_queue.view", "dms.review_queue.manage", "dms.documents.review_ai", "dms.admin"] },
  "/dms/expiring":                                { requiredAnyPermissions: ["dms.expiry.view", "dms.documents.view", "dms.admin"] },
  "/dms/notifications":                           { requiredAnyPermissions: ["dms.documents.view", "dms.admin"] },
  "/admin/dms":                                   { requiredAnyPermissions: ["dms.documents.view", "dms.admin"] },
  "/admin/dms/categories":                        { requiredAnyPermissions: ["dms.documents.view", "dms.admin"] },
  "/admin/dms/document-types":                    { requiredAnyPermissions: ["dms.documents.view", "dms.admin"] },
  "/admin/dms/metadata-definitions":              { requiredAnyPermissions: ["dms.admin"] },
  "/admin/dms/tags":                              { requiredAnyPermissions: ["dms.documents.view", "dms.admin"] },
  "/admin/dms/retention-policies":                { requiredAnyPermissions: ["dms.admin"] },
  "/admin/dms/intelligence":                      { requiredAnyPermissions: ["dms.admin"] },
  "/admin/dms/ai-observability":                  { requiredAnyPermissions: ["dms.admin"] },

  // ── Reports ────────────────────────────────────────────────────────────────
  "/admin/reports":                               { requiredAnyPermissions: ["reports.view", "reports.manage"] },
  "/admin/reports/templates":                     { requiredAnyPermissions: ["reports.manage"] },
  "/admin/reports/public-links":                  { requiredAnyPermissions: ["reports.view", "reports.publish", "reports.verify.admin", "reports.manage"] },
  "/admin/reports/templates/governance":          { requiredAnyPermissions: ["reports.view", "reports.manage", "reports.template.approve"] },
  "/admin/reports/editor":                         { requiredAnyPermissions: ["reports.manage"] },
  "/admin/reports/history":                       { requiredAnyPermissions: ["reports.view", "reports.history.view"] },
  "/admin/reports/schedules":                     { requiredAnyPermissions: ["reports.schedule.view", "reports.schedule.manage"] },

  // ── Master Data ────────────────────────────────────────────────────────────
  "/admin/common-master-data":                    { requiredAnyPermissions: ["common_md.view", "common_md.manage"] },
  "/admin/common-master-data/departments":        { requiredAnyPermissions: ["common_md.view", "common_md.departments.view"] },
  "/admin/common-master-data/designations":       { requiredAnyPermissions: ["common_md.view", "common_md.designations.view"] },
  "/admin/common-master-data/work-sites":         { requiredAnyPermissions: ["common_md.view", "common_md.work_sites.view"] },
  "/admin/common-master-data/work-calendars":     { requiredAnyPermissions: ["common_md.view", "common_md.work_calendars.view"] },
  "/admin/common-master-data/approval-roles":     { requiredAnyPermissions: ["common_md.view", "common_md.approval_roles.view"] },
  "/admin/common-master-data/dms-required-documents": { requiredAnyPermissions: ["common_md.view", "common_md.dms_required_documents.view"] },
  "/admin/master-data/geography/countries":       { requiredAnyPermissions: ["master_data.geography.view", "master_data.geography.manage"] },
  "/admin/master-data/geography/emirates":        { requiredAnyPermissions: ["master_data.geography.view", "master_data.geography.manage"] },
  "/admin/master-data/geography/cities":          { requiredAnyPermissions: ["master_data.geography.view", "master_data.geography.manage"] },
  "/admin/master-data/geography/areas":           { requiredAnyPermissions: ["master_data.geography.view", "master_data.geography.manage"] },
  "/admin/master-data/geography/ports":           { requiredAnyPermissions: ["master_data.geography.view", "master_data.geography.manage"] },
  "/admin/master-data/parties":                   { requiredAnyPermissions: ["master_data.parties.view", "master_data.party_master.view"] },
  "/admin/master-data/parties/customers":         { requiredAnyPermissions: ["master_data.parties.view", "master_data.party_master.view"] },
  "/admin/master-data/parties/vendors":           { requiredAnyPermissions: ["master_data.parties.view", "master_data.party_master.view"] },
  "/admin/master-data/parties/subcontractors":    { requiredAnyPermissions: ["master_data.parties.view", "master_data.party_master.view"] },
  "/admin/master-data/parties/consultants":       { requiredAnyPermissions: ["master_data.parties.view", "master_data.party_master.view"] },
  "/admin/master-data/parties/recruitment-agencies": { requiredAnyPermissions: ["master_data.parties.view", "master_data.party_master.view"] },
  "/admin/master-data/parties/government-authorities": { requiredAnyPermissions: ["master_data.parties.view", "master_data.party_master.view"] },
  "/admin/master-data/parties/insurance-companies": { requiredAnyPermissions: ["master_data.parties.view", "master_data.party_master.view"] },
  "/admin/master-data/parties/license-issuers":   { requiredAnyPermissions: ["master_data.parties.view", "master_data.party_master.view"] },
  "/admin/master-data/parties/types":             { requiredAnyPermissions: ["master_data.parties.view", "master_data.party_master.view"] },
  "/admin/master-data/parties/service-categories": { requiredAnyPermissions: ["master_data.parties.view", "master_data.party_master.view"] },
  "/admin/master-data/parties/relationship-types": { requiredAnyPermissions: ["master_data.parties.view", "master_data.party_master.view"] },
  "/admin/master-data/finance-basics/currencies": { requiredAnyPermissions: ["master_data.finance_basics.view", "master_data.finance_basics.manage"] },
  "/admin/master-data/finance-basics/payment-terms": { requiredAnyPermissions: ["master_data.finance_basics.view", "master_data.finance_basics.manage"] },
  "/admin/master-data/finance-basics/tax-types":  { requiredAnyPermissions: ["master_data.finance_basics.view", "master_data.finance_basics.manage"] },
  "/admin/master-data/finance-basics/banks":      { requiredAnyPermissions: ["master_data.finance_basics.view", "master_data.finance_basics.manage"] },
  "/admin/master-data/finance-basics/cost-centers": { requiredAnyPermissions: ["master_data.finance_basics.view", "master_data.finance_basics.manage"] },
  "/admin/master-data/finance-basics/profit-centers": { requiredAnyPermissions: ["master_data.finance_basics.view", "master_data.finance_basics.manage"] },
  "/admin/master-data/uom/categories":            { requiredAnyPermissions: ["master_data.uom.view", "master_data.uom.manage"] },
  "/admin/master-data/uom/units":                 { requiredAnyPermissions: ["master_data.uom.view", "master_data.uom.manage"] },
  "/admin/master-data/uom/conversions":           { requiredAnyPermissions: ["master_data.uom.view", "master_data.uom.manage"] },

  // ── Administration ─────────────────────────────────────────────────────────
  "/admin/users":                                 { requiredPermission: "users.view" },
  "/admin/organizations":                         { requiredPermission: "organizations.view" },
  "/admin/branches":                              { requiredPermission: "branches.view" },
  "/admin/roles":                                 { requiredAnyPermissions: ["roles.view", "roles.manage"] },
  "/admin/permissions":                           { requiredPermission: "permissions.view" },
  "/admin/settings/numbering":                    { requiredAnyPermissions: ["numbering.rules.view", "numbering.rules.manage"] },
  "/admin/settings/email":                        { requiredAnyPermissions: ["settings.email.view", "settings.email.manage"] },
  "/admin/settings/branding":                     { requiredAnyPermissions: ["branding.app.view", "branding.app.manage", "reports.manage"] },
  "/admin/notifications":                         { requiredAnyPermissions: ["notifications.manage", "notifications.admin"] },
  "/admin/notifications/email-queue":             { requiredAnyPermissions: ["notifications.email_queue.view", "notifications.email_queue.manage"] },
  "/admin/notifications/templates":               { requiredAnyPermissions: ["notifications.templates.view", "notifications.templates.manage"] },
  "/admin/notifications/logs":                    { requiredAnyPermissions: ["notifications.logs.view", "notifications.manage"] },
  "/admin/master-data":                           { requiredAnyPermissions: ["master_data.lookups.view", "master_data.geography.view", "master_data.parties.view"] },
  "/admin/master-data/lookups/categories":        { requiredAnyPermissions: ["master_data.lookups.view", "master_data.lookups.manage"] },
  "/admin/master-data/lookups/values":            { requiredAnyPermissions: ["master_data.lookups.view", "master_data.lookups.manage"] },
  "/admin/master-data/lookups/system":            { requiredAnyPermissions: ["master_data.lookups.view", "master_data.lookups.manage"] },
  "/admin/audit":                                 { requiredPermission: "audit.view" },
  "/admin/settings/ai":                           { requiredAnyPermissions: ["settings.ai.view", "settings.ai.manage"] },
  "/admin/ai/dashboard":                          { requiredAnyPermissions: ["ai.dashboard.view", "ai.dashboard.admin", "ai.common.view", "ai.common.admin"] },
  "/admin/ai/audit-explainer":                    { requiredAnyPermissions: ["ai.audit_explainer.use", "ai.common.admin"] },
  "/admin/ai/data-quality":                       { requiredAnyPermissions: ["ai.data_quality.view", "ai.common.view", "ai.common.admin"] },
  "/admin/ai/duplicates":                         { requiredAnyPermissions: ["ai.duplicates.view", "ai.common.view", "ai.common.admin"] },
  "/admin/ai/compliance":                         { requiredAnyPermissions: ["ai.compliance.view", "ai.common.view", "ai.common.admin"] },
  "/admin/ai/risk":                               { requiredAnyPermissions: ["ai.risk.view", "ai.common.view", "ai.common.admin"] },
  "/search":                                      { requiredAnyPermissions: ["ai.search.use", "ai.search.view", "ai.common.admin"] },
  "/assistant":                                   { requiredAnyPermissions: ["ai.assistant.use", "ai.assistant.view", "ai.common.admin"] },
};

/**
 * Returns true if the user can access the given route path.
 * Falls back to true for unknown routes (server page guard will enforce).
 */
export function canAccessRoute(
  path: string,
  permissionCodes: string[],
  isGlobalAdmin: boolean
): boolean {
  const access = ROUTE_ACCESS_REGISTRY[path];
  if (!access) return true; // unknown routes: allow (server checks)
  if (access.publicToAllActive) return true;
  if (isGlobalAdmin) return true;
  if (access.requiresGlobalAdmin) return false;
  if (access.requiredPermission) return permissionCodes.includes(access.requiredPermission);
  if (access.requiredAnyPermissions) {
    return access.requiredAnyPermissions.some((p) => permissionCodes.includes(p));
  }
  return true;
}

/** Priority-ordered list of routes to try for post-login redirect */
const FIRST_ROUTE_PRIORITY = [
  "/dashboard",
  "/admin/hr/dashboard",
  "/dms",
  "/admin/reports",
  "/admin/users",
  "/admin/master-data/parties",
  "/admin/common-master-data",
  "/notifications",
];

/**
 * Returns the first route the user is permitted to access,
 * or "/no-access" if none match.
 */
export function getFirstPermittedRoute(
  permissionCodes: string[],
  isGlobalAdmin: boolean
): string {
  for (const route of FIRST_ROUTE_PRIORITY) {
    if (canAccessRoute(route, permissionCodes, isGlobalAdmin)) return route;
  }
  return "/no-access";
}
