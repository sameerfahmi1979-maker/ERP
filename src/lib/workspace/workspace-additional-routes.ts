import type { WorkspaceRouteConfig } from "./workspace-route-registry";
import { operationalWorkspaceRoutes } from "./operational-workspace-routes";

export const reportRunWorkspacePattern = /^\/admin\/reports\/run\/([A-Za-z0-9_-]{1,100})$/;

/** Implemented screen metadata only. This registry never grants route access. */
const lists: [string, string][] = [
  ["/admin/ai/audit-explainer", "Audit explanations"], ["/admin/ai/compliance", "Compliance findings"],
  ["/admin/ai/dashboard", "AI daily dashboard"], ["/admin/ai/data-quality", "Data quality"],
  ["/admin/ai/duplicates", "Duplicate candidates"], ["/admin/ai/risk", "Risk scores"],
  ["/admin/common-master-data", "Common master data"],
  ["/admin/dms/approval-workflows", "DMS approval workflows"], ["/admin/dms/intelligence", "Document intelligence"],
  ["/admin/dms/notification-settings", "DMS notification settings"],
  ["/admin/hr", "Human resources"], ["/admin/hr/actions", "HR actions"],
  ["/admin/hr/operations", "HR operations"], ["/admin/hr/payroll", "Payroll"],
  ["/admin/hr/recruitment", "Recruitment"], ["/admin/hr/time", "Time and attendance"],
  ["/admin/hr/actions/final-settlement", "Final Settlement"], ["/admin/hr/operations/recoveries", "Fines and Recovery"],
  ["/admin/hr/operations/workshop-labour", "Workshop Time Review"], ["/admin/hr/operations/workshop-referrals", "Workshop Referrals"],
  ["/admin/hr/payroll/approvals", "Payroll Approvals"], ["/admin/hr/payroll/fleet-time", "Fleet Overtime"],
  ["/admin/hr/payroll/payslips", "Payslips"], ["/admin/hr/payroll/runs", "Payroll Runs"],
  ["/admin/hr/payroll/settlement", "WPS & Payments"], ["/admin/hr/payroll/trip-allowances", "Trip Allowances"],
  ["/admin/hr/payroll/workshop", "Workshop Overtime"], ["/admin/operations/work-queues", "Work Queues"],
  ["/admin/master-data/parties/banks", "Banks"],
  ["/admin/reports", "Report center"], ["/admin/reports/history", "Report history"],
  ["/admin/reports/schedules", "Report schedules"], ["/admin/reports/templates", "Report templates"],
  ["/admin/settings/ai", "AI settings"], ["/admin/settings/email", "Email settings"],
  ["/assistant", "ERP assistant"], ["/dms/approvals", "Document approvals"],
  ["/dms/expiring", "Expiring documents"], ["/dms/notifications", "DMS notifications"],
  ["/dms/renewals", "Document renewals"], ["/search", "ERP search"],
  ["/access-denied", "Access denied"], ["/no-access", "No business access"], ["/start", "Start"],
];
const settings: [string, string][] = [
  ["access-card-types", "Access card types"], ["approval-workflows", "HR approval workflows"],
  ["employee-categories", "Employee categories"], ["employment-types", "Employment types"],
  ["grades", "Grades"], ["identity-document-types", "Identity document types"],
  ["leave-types", "Leave types"], ["medical-record-types", "Medical record types"],
  ["mohre-establishments", "MOHRE establishments"], ["payroll-groups", "Payroll groups"],
  ["pro-process-types", "PRO process types"], ["readiness-rule-templates", "Readiness rule templates"],
  ["relationship-types", "Relationship types"], ["role-requirement-matrix", "Role requirements"],
  ["salary-component-types", "Salary component types"], ["site-requirement-matrix", "Site requirements"],
  ["training-categories", "Training categories"], ["training-types", "Training types"],
];
const records: [string, string, string][] = [
  ["/admin/common-master-data/approval-roles", "Approval roles", "Approval role"],
  ["/admin/common-master-data/designations", "Designations", "Designation"],
  ["/admin/common-master-data/dms-required-documents", "Required documents", "Required document"],
  ["/admin/common-master-data/work-calendars", "Work calendars", "Work calendar"],
  ["/admin/common-master-data/work-sites", "Work sites", "Work site"],
  ["/admin/master-data/customers", "Customers", "Customer"],
];
export const additionalWorkspaceRoutes: WorkspaceRouteConfig[] = [
  ...operationalWorkspaceRoutes,
  { route: "/admin/reports/run/[reportCode]", title: "Run Report", tabKind: "utility", moduleCode: "REPORTS", pattern: reportRunWorkspacePattern },
  ...[...lists, ...settings.map(([slug, title]): [string, string] => [`/admin/hr/settings/${slug}`, title])]
    .map(([route, title]): WorkspaceRouteConfig => ({ route, title, icon: "List", tabKind: "list", singleton: true, closable: true })),
  ...records.flatMap(([route, title, singular]): WorkspaceRouteConfig[] => [
    { route, title, icon: "List", tabKind: "list", singleton: true, closable: true },
    { route: `${route}/record/new`, title: `New ${singular.toLowerCase()}`, tabKind: "record", singleton: false, closable: true, entityType: singular.toLowerCase().replaceAll(" ", "_") },
    { route: `${route}/record/`, title: `${singular} record`, tabKind: "record", singleton: false, closable: true, entityType: singular.toLowerCase().replaceAll(" ", "_"), pattern: new RegExp(`^${route}/record/[0-9]+$`) },
  ]),
];
