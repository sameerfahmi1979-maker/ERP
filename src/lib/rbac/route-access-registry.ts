/**
 * ERP USERS.4 â€” Route Access Registry
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
 * - requiredAllPermissions: user must have all listed codes
 * - requiredAnyGlobalPermissions: user must have at least one code from a Global System assignment
 * - requiresGlobalAdmin: only system_admin or group_admin can see/access
 * - publicToAllActive: any active authenticated user (no specific permission needed)
 * - If none set and item is not disabled: visible to all (safe fallback for unregistered routes)
 */

import { canUseApplication, isGlobalAdmin } from "./scope";
import { workQueuePermissions } from "@/lib/operations/work-queue-contract";
import type { AuthContext } from "./check";
import { getOperationalAccessPath } from "@/lib/workspace/operational-workspace-routes";
import { reportRunWorkspacePattern } from "@/lib/workspace/workspace-additional-routes";
import { PAYROLL_FINANCE_REPORT } from "@/lib/report-center/payroll-finance-contract";
import { aiDailyDashboardViewPermissions, dmsAiObservabilityViewPermissions } from "@/lib/ai/observability/access";

export type RouteAccess = {
  requiredPermission?: string;
  requiredAnyPermissions?: string[];
  requiredAllPermissions?: string[];
  requiredAnyGlobalPermissions?: readonly string[];
  requiresGlobalAdmin?: boolean;
  publicToAllActive?: boolean;
};

const employeeListPermissions = ["hr.employees.view", "hr.employee_profile.view", "hr.employees.view.self", "hr.employees.view.team"];

export const ROUTE_ACCESS_REGISTRY: Record<string, RouteAccess> = {
  // â”€â”€ Overview â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  "/dashboard":                                   { requiredPermission: "dashboard.view" },
  "/notifications":                               { publicToAllActive: true },
  "/ai-agent-center":                             { requiredAnyPermissions: ["dms.documents.view", "dms.admin"] },
  "/modules/inventory":                          { requiredAnyPermissions: ["supply.setup", "supply.stock", "supply.approve", "supply.request", "supply.value"] },
  "/modules/procurement":                        { requiredAnyPermissions: ["supply.purchase", "supply.purchase.approve"] },
  "/modules/fleet/fuel":                         { requiredAnyPermissions: ["supply.fuel", "supply.approve"] },
  "/modules/workshop/job-work":                  { requiredAnyPermissions: ["workshop.labour.record", "workshop.labour.approve", "workshop.labour.cost", "workshop.jobs.manage", "workshop.jobs.release", "workshop.outside.manage", "workshop.finance.intake", "supply.purchase.approve"] },
  "/modules/workshop":                           { requiredAnyPermissions: ["fleet.inspections.report", "workshop.assess", "workshop.jobs.manage", "workshop.jobs.release", "fleet.maintenance.manage"] },
  "/modules/fleet":                              { requiredPermission: "fleet.assets.view" },
  "/admin/operations/work-queues":              { requiredAnyPermissions: [...workQueuePermissions] },
  "/modules/fleet/operations":                   { requiredPermission: "fleet.operations.view" },
  "/modules/fleet/time":                         { requiredAnyPermissions: ["fleet.operations.view", "fleet.time.enter", "fleet.time.verify", "fleet.time.host"] },
  "/modules/fleet/fines":                        { requiredAnyPermissions: ["fleet.fines.view", "fleet.fines.record", "fleet.fines.match", "fleet.fines.verify", "fleet.incidents.manage", "workshop.recoveries.intake"] },
  "/modules/fleet/allowances":                   { requiredAnyPermissions: ["fleet.operations.view", "fleet.allowance.submit", "fleet.allowance.approve", "hr.payroll.trip_allowance.review"] },
  "/modules/fleet/allowance-rates":               { requiredAnyPermissions: ["fleet.allowance.rates.prepare", "fleet.allowance.rates.approve"] },

  // â”€â”€ Human Resource â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  "/admin/hr/dashboard":                          { requiredAnyPermissions: ["hr.dashboard.view", "hr.employees.view"] },
  "/admin/hr/search":                             { requiredAnyPermissions: ["hr.search.use", "hr.admin"] },
  "/admin/hr/document-browser":                   { requiredPermission: "hr.employees.view", requiredAnyPermissions: ["dms.documents.view", "dms.admin"] },
  "/admin/hr/employees":                          { requiredAnyPermissions: employeeListPermissions },
  "/admin/hr/employees/record/new":               { requiredPermission: "hr.employees.create", requiredAnyPermissions: employeeListPermissions },
  "/admin/hr/actions/pro":                        { requiredPermission: "hr.actions.view" },
  "/admin/hr/actions/disciplinary":               { requiredAllPermissions: ["hr.actions.view", "hr.confidential.view"] },
  "/admin/hr/actions/approvals":                  { requiredPermission: "hr.actions.view" },
  "/admin/hr/actions/final-settlement":           { requiredPermission: "hr.exit.settlement.view" },
  "/admin/hr/actions/eos":                        { requiredAnyPermissions: ["hr.actions.view", "hr.eos.view"] },
  "/admin/hr/time/attendance":                    { requiredPermission: "hr.attendance.view" },
  "/admin/hr/time/leave":                         { requiredPermission: "hr.leave.view" },
  "/admin/hr/time/shifts":                        { requiredPermission: "hr.attendance.view" },
  "/admin/hr/recruitment/requisitions":           { requiredAnyPermissions: ["hr.recruitment.view", "hr.recruitment.manage"] },
  "/admin/hr/recruitment/candidates":             { requiredAnyPermissions: ["hr.recruitment.view", "hr.recruitment.manage"] },
  "/admin/hr/recruitment/interviews":             { requiredAnyPermissions: ["hr.recruitment.view", "hr.recruitment.manage"] },
  "/admin/hr/recruitment/offers":                 { requiredAnyPermissions: ["hr.recruitment.view", "hr.recruitment.manage"] },
  "/admin/hr/recruitment/onboarding":             { requiredAnyPermissions: ["hr.recruitment.view", "hr.recruitment.manage"] },
  "/admin/hr/payroll/salaries":                   { requiredAnyPermissions: ["hr.payroll.view", "hr.payroll.manage", "hr.admin"] },
  "/admin/hr/payroll/wps":                        { requiredAnyPermissions: ["hr.payroll.view", "hr.payroll.manage", "hr.admin"] },
  "/admin/hr/payroll/runs":                       { requiredAnyPermissions: ["hr.payroll.run.manage", "hr.payroll.run.policy"] },
  "/admin/hr/payroll/approvals":                  { requiredAnyPermissions: ["hr.payroll.run.submit", "hr.payroll.run.approve"] },
  "/admin/hr/payroll/settlement":                  { requiredAnyPermissions: ["hr.payroll.wps.issue", "hr.payroll.payment.reconcile"] },
  "/admin/hr/payroll/payslips":                    { requiredPermission: "hr.payroll.payslip.view" },
  "/admin/hr/payroll/workshop":                   { requiredAllPermissions: ["hr.payroll.workshop.review", "hr.payroll.view"] },
  "/admin/hr/payroll/fleet-time":                 { requiredPermission: "hr.payroll.fleet_time.review" },
  "/admin/hr/payroll/trip-allowances":            { requiredPermission: "hr.payroll.trip_allowance.review" },
  "/admin/hr/operations/workshop-labour":         { requiredAllPermissions: ["hr.workshop.labour.review", "hr.attendance.view"] },
  "/admin/hr/operations/workshop-referrals":     { requiredPermission: "hr.workshop.referrals.view" },
  "/admin/hr/operations/recoveries":             { requiredAnyPermissions: ["hr.recovery.review", "hr.recovery.policy", "hr.recovery.accounts"] },
  "/admin/hr/operations/assignments":             { requiredPermission: "hr.assignments.view" },
  "/admin/hr/operations/readiness":               { requiredPermission: "hr.assignments.view" },
  "/admin/hr/operations/blocks":                  { requiredPermission: "hr.assignments.view" },
  "/admin/hr/settings":                           { requiredAnyPermissions: ["hr.settings.view", "hr.settings.manage", "hr.admin"] },

  // â”€â”€ Documents (DMS) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  "/dms":                                         { requiredAnyPermissions: ["dms.documents.view", "dms.admin"] },
  "/dms/documents":                               { requiredAnyPermissions: ["dms.documents.view", "dms.admin"] },
  "/dms/approvals":                               { requiredAnyPermissions: ["dms.approvals.view", "dms.approvals.act", "dms.approvals.admin", "dms.approvals.history.view", "dms.documents.approve", "dms.admin"] },
  "/dms/inbox":                                   { requiredAnyPermissions: ["dms.documents.upload", "dms.documents.view", "dms.admin"] },
  "/dms/inbox/batches":                           { requiredAnyPermissions: ["dms.documents.upload", "dms.documents.view", "dms.admin"] },
  "/dms/archive":                                 { requiredAnyPermissions: ["dms.documents.view", "dms.admin"] },
  "/dms/review-queue":                            { requiredAnyPermissions: ["dms.review_queue.view", "dms.review_queue.manage", "dms.documents.review_ai", "dms.admin"] },
  "/dms/expiring":                                { requiredAnyPermissions: ["dms.expiry.view", "dms.documents.view", "dms.admin"] },
  "/dms/notifications":                           { requiredAnyPermissions: ["dms.notifications.view", "dms.notifications.manage", "dms.admin"] },
  "/admin/dms":                                   { requiredAnyPermissions: ["dms.documents.view", "dms.admin"] },
  "/admin/dms/browser":                           { requiredAnyPermissions: ["dms.documents.view", "dms.admin"] },
  "/admin/dms/notification-settings":            { requiredAnyGlobalPermissions: ["dms.admin", "dms.notifications.manage", "dms.notifications.settings.manage"] },
  "/admin/dms/approval-workflows":               { requiredAnyPermissions: ["dms.approvals.admin", "dms.admin"] },
  "/admin/dms/categories":                        { requiredAnyPermissions: ["dms.documents.view", "dms.admin"] },
  "/admin/dms/document-types":                    { requiredAnyPermissions: ["dms.documents.view", "dms.admin"] },
  "/admin/dms/metadata-definitions":              { requiredAnyPermissions: ["dms.admin"] },
  "/admin/dms/tags":                              { requiredAnyPermissions: ["dms.documents.view", "dms.admin"] },
  "/admin/dms/retention-policies":                { requiredAnyPermissions: ["dms.admin"] },
  "/admin/dms/intelligence":                      { requiredAnyPermissions: ["dms.admin"] },
  "/admin/dms/ai-observability":                  { requiredAnyGlobalPermissions: dmsAiObservabilityViewPermissions },

  // â”€â”€ Reports â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  "/admin/reports":                               { requiredAnyPermissions: ["reports.view", "reports.manage"] },
  "/dev/auth-debug":                              { requiresGlobalAdmin: true },
  "/admin/reports/templates":                     { requiredAnyPermissions: ["reports.view", "reports.manage"] },
  "/admin/reports/public-links":                  { requiredAnyPermissions: ["reports.view", "reports.publish", "reports.verify.admin", "reports.manage"] },
  "/admin/reports/templates/governance":          { requiredAnyPermissions: ["reports.view", "reports.manage", "reports.template.approve"] },
  "/admin/reports/history":                       { requiredAnyPermissions: ["reports.view", "reports.history.view"] },
  "/admin/reports/schedules":                     { requiredAnyPermissions: ["reports.schedule.view", "reports.schedule.manage"] },
  "/admin/reports/template-studio":               { requiredAnyPermissions: ["reports.manage"] },
  "/admin/reports/output-ops":                    { requiredAnyPermissions: ["outputs.ops.view"] },

  // â”€â”€ Master Data â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
  "/admin/master-data/parties":                   { requiredAnyGlobalPermissions: ["master_data.parties.view", "master_data.party_master.view"] },
  "/admin/master-data/parties/customers":         { requiredAnyGlobalPermissions: ["master_data.parties.view", "master_data.party_master.view"] },
  "/admin/master-data/parties/vendors":           { requiredAnyGlobalPermissions: ["master_data.parties.view", "master_data.party_master.view"] },
  "/admin/master-data/parties/subcontractors":    { requiredAnyGlobalPermissions: ["master_data.parties.view", "master_data.party_master.view"] },
  "/admin/master-data/parties/consultants":       { requiredAnyGlobalPermissions: ["master_data.parties.view", "master_data.party_master.view"] },
  "/admin/master-data/parties/recruitment-agencies": { requiredAnyGlobalPermissions: ["master_data.parties.view", "master_data.party_master.view"] },
  "/admin/master-data/parties/government-authorities": { requiredAnyGlobalPermissions: ["master_data.parties.view", "master_data.party_master.view"] },
  "/admin/master-data/parties/insurance-companies": { requiredAnyGlobalPermissions: ["master_data.parties.view", "master_data.party_master.view"] },
  "/admin/master-data/parties/license-issuers":   { requiredAnyGlobalPermissions: ["master_data.parties.view", "master_data.party_master.view"] },
  "/admin/master-data/parties/types":             { requiredAnyGlobalPermissions: ["master_data.parties.view", "master_data.parties.manage_types"] },
  "/admin/master-data/parties/service-categories": { requiredAnyGlobalPermissions: ["master_data.parties.view", "master_data.parties.manage_services"] },
  "/admin/master-data/parties/relationship-types": { requiredAnyGlobalPermissions: ["master_data.parties.view", "master_data.parties.manage_relationships"] },
  "/admin/master-data/finance-basics/currencies": { requiredAnyPermissions: ["master_data.finance_basics.view", "master_data.finance_basics.manage"] },
  "/admin/master-data/finance-basics/payment-terms": { requiredAnyPermissions: ["master_data.finance_basics.view", "master_data.finance_basics.manage", "master_data.lookups.lock"] },
  "/admin/master-data/finance-basics/tax-types":  { requiredAnyPermissions: ["master_data.finance_basics.view", "master_data.finance_basics.manage", "master_data.lookups.lock"] },
  "/admin/master-data/finance-basics/banks":      { requiredAnyPermissions: ["master_data.finance_basics.view", "master_data.finance_basics.manage", "master_data.lookups.lock"] },
  "/admin/master-data/finance-basics/cost-centers": { requiredAnyPermissions: ["master_data.finance_basics.view", "master_data.finance_basics.manage"] },
  "/admin/master-data/finance-basics/profit-centers": { requiredAnyPermissions: ["master_data.finance_basics.view", "master_data.finance_basics.manage"] },
  "/admin/master-data/uom/categories":            { requiredAnyPermissions: ["master_data.uom.view", "master_data.uom.manage"] },
  "/admin/master-data/uom/units":                 { requiredAnyPermissions: ["master_data.uom.view", "master_data.uom.manage"] },
  "/admin/master-data/uom/conversions":           { requiredAnyPermissions: ["master_data.uom.view", "master_data.uom.manage"] },

  // â”€â”€ Administration â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  "/admin/users":                                 { requiredPermission: "users.view" },
  "/admin/organizations":                         { requiredPermission: "organizations.view" },
  "/admin/branches":                              { requiredPermission: "branches.view" },
  "/admin/roles":                                 { requiredAnyPermissions: ["roles.view", "roles.manage"] },
  "/admin/permissions":                           { requiredPermission: "permissions.view" },
  "/admin/settings/numbering":                    { requiredAnyPermissions: ["numbering.rules.view", "numbering.rules.manage"] },
  "/admin/settings/email":                        { requiredAnyGlobalPermissions: ["settings.email.view", "settings.email.manage", "settings.email.test", "settings.email.secrets.manage", "settings.email.feature_flags.manage", "settings.email.logs.view"] },
  "/admin/settings/branding":                     { requiredAnyPermissions: ["branding.app.view", "branding.app.manage", "reports.manage"] },
  "/admin/notifications":                         { requiredAnyGlobalPermissions: ["notifications.manage", "notifications.admin"] },
  "/admin/notifications/email-queue":             { requiredAnyGlobalPermissions: ["notifications.email_queue.view", "notifications.email_queue.manage", "notifications.admin"] },
  "/admin/notifications/templates":               { requiredAnyGlobalPermissions: ["notifications.templates.view", "notifications.admin"] },
  "/admin/notifications/logs":                    { requiredAnyGlobalPermissions: ["notifications.logs.view", "notifications.admin"] },
  "/admin/master-data":                           { requiredAnyPermissions: ["master_data.lookups.view", "master_data.geography.view", "master_data.parties.view"] },
  "/admin/master-data/lookups/categories":        { requiredAnyPermissions: ["master_data.lookups.view", "master_data.lookups.manage", "master_data.lookups.lock"] },
  "/admin/master-data/lookups/values":            { requiredAnyPermissions: ["master_data.lookups.view", "master_data.lookups.manage", "master_data.lookups.lock"] },
  "/admin/master-data/lookups/system":            { requiredAnyPermissions: ["master_data.lookups.view", "master_data.lookups.manage", "master_data.lookups.lock"] },
  "/admin/audit":                                 { requiredPermission: "audit.view" },
  "/admin/settings/ai":                           { requiredAnyGlobalPermissions: ["settings.ai.view", "settings.ai.manage", "settings.ai.test", "settings.ai.secrets.manage", "settings.ai.usage.view"] },
  "/admin/ai/dashboard":                          { requiredAnyGlobalPermissions: aiDailyDashboardViewPermissions },
  "/admin/ai/audit-explainer":                    { requiredAnyPermissions: ["ai.audit_explainer.use", "ai.common.admin"] },
  "/admin/ai/data-quality":                       { requiredAnyPermissions: ["ai.data_quality.view", "ai.common.view", "ai.common.admin"] },
  "/admin/ai/duplicates":                         { requiredAnyPermissions: ["ai.duplicates.view", "ai.common.view", "ai.common.admin"] },
  "/admin/ai/compliance":                         { requiredAnyPermissions: ["ai.compliance.view", "ai.common.view", "ai.common.admin"] },
  "/admin/ai/risk":                               { requiredAnyPermissions: ["ai.risk.view", "ai.common.view", "ai.common.admin"] },
  "/search":                                      { requiredAnyPermissions: ["ai.search.use", "ai.search.view", "ai.common.admin"] },
  "/assistant":                                   { requiredAnyPermissions: ["ai.assistant.use", "ai.assistant.view", "ai.common.admin"] },
};

const reportRunAccess: RouteAccess = { requiredAnyPermissions: ["reports.view", "reports.run"] };
const payrollFinanceAccess: RouteAccess = { requiredAllPermissions: ["reports.view", "reports.run", "hr.payroll.finance.reconcile"] };

function findRouteAccess(pathname: string): RouteAccess | undefined {
  const exact = ROUTE_ACCESS_REGISTRY[pathname];
  if (exact) return exact;

  const operationalPath = getOperationalAccessPath(pathname);
  if (operationalPath) return ROUTE_ACCESS_REGISTRY[operationalPath];

  const reportCode = reportRunWorkspacePattern.exec(pathname)?.[1];
  if (reportCode) return reportCode.toUpperCase() === PAYROLL_FINANCE_REPORT ? payrollFinanceAccess : reportRunAccess;
  return undefined;
}

/** Navigation admission only. Page and data guards still resolve the exact record and assigned scope. */
export function canAccessRoute(
  path: string,
  permissionCodes: string[],
  isGlobalAdmin: boolean,
  globalPermissionCodes: string[] = [],
): boolean {
  const access = findRouteAccess(path.split(/[?#]/)[0]);
  if (!access || access.publicToAllActive || isGlobalAdmin) return true;
  if (access.requiresGlobalAdmin) return false;
  return (!access.requiredPermission || permissionCodes.includes(access.requiredPermission))
    && (!access.requiredAllPermissions || access.requiredAllPermissions.every(code => permissionCodes.includes(code)))
    && (!access.requiredAnyPermissions || access.requiredAnyPermissions.some(code => permissionCodes.includes(code)))
    && (!access.requiredAnyGlobalPermissions || access.requiredAnyGlobalPermissions.some(code => globalPermissionCodes.includes(code)));
}

export function canOpenHrDocumentBrowser(ctx: AuthContext): boolean {
  return canUseApplication(ctx) && canAccessRoute("/admin/hr/document-browser", ctx.permissionCodes, isGlobalAdmin(ctx));
}

/** Priority-ordered list of routes to try for post-login redirect */
const FIRST_ROUTE_PRIORITY = [
  "/dashboard",
  "/admin/hr/dashboard",
  "/admin/hr/employees",
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
  isGlobalAdmin: boolean,
  globalPermissionCodes: string[] = [],
): string {
  for (const route of FIRST_ROUTE_PRIORITY) {
    if (canAccessRoute(route, permissionCodes, isGlobalAdmin, globalPermissionCodes)) return route;
  }
  return "/no-access";
}
