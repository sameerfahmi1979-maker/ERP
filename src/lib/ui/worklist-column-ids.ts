/** Durable browser preferences are opt-in for source-defined worklists. */
const WORKLIST_IDS = new Set([
  "admin.audit_logs", "admin.branches", "admin.organizations", "admin.roles", "admin.users",
  "admin.party-types", "admin.service-categories", "admin.relationship-types", "parties_table",
  "admin.reports.history", "admin.reports.registry", "admin.reports.schedules",
  "admin.reports.branding-profiles", "admin.reports.templates", "reports.public-links",
  "template-governance.inReview", "template-governance.failedSecurity", "reports.output-ops:v1",
  "notifications.my", "notifications.admin", "notifications.delivery-logs", "notifications.email-queue",
  "notifications.templates", "settings.email.providers", "numbering_rules_table",
  "departments", "common.designations", "common-md.work-calendars",
  "common.approval-roles", "common.work-sites", "common.dms-required-documents",
  "banks_table", "cost_centers_table", "currencies_table", "payment_terms_table", "profit_centers_table",
  "tax_types_table", "areas_table", "cities_table", "countries_table", "emirates_table", "ports_table",
  "lookup_categories_table", "lookup_values_table", "uom_conversions_table", "units_of_measure_table",
  "uom_categories_table",
  "hr-employees", "hr.approval-workflow-steps", "hr.hr-mohre-establishments-page.HrMohreEstablishmentsPage.rows",
  "hr.payroll.salaries.hr-salaries-page-client", "hr.payroll.wps.hr-wps-page-client",
  ...["pro", "disciplinary", "approvals", "eos"].map(kind => `hr-actions:${kind}`),
  ...["assignments", "blocks", "readiness"].map(kind => `hr-operations:${kind}`),
  ...["requisitions", "candidates", "interviews", "offers", "onboarding"].map(kind => `hr-recruitment:${kind}`),
  ...["attendance", "shifts", "leave"].map(kind => `hr-time:${kind}`),
  ...[
    "hr_access_card_types", "hr_employee_categories", "hr_employment_types", "hr_grades",
    "hr_identity_document_types", "hr_medical_record_types", "hr_payroll_groups", "hr_pro_process_types",
    "hr_relationship_types", "hr_salary_component_types", "hr_training_types", "hr_training_categories",
  ].map(entity => `hr.lookup:${entity}`),
  "hr.f06.hr_leave_types", "hr.f06.hr_approval_workflows", "hr.f06.hr_role_requirement_matrix",
  "hr.f06.hr_site_requirement_matrix", "hr.f06.hr_readiness_rule_templates",
  "dms-documents", "dms:review-queue:v1", "dms:approval-queue:v1", "dms_metadata_definitions",
  "dms.notifications", "special.dms.ai-observability.ai-cost-rate-admin",
  ...[
    "archive", "batch-review", "categories", "document-types", "renewals", "retention-policies",
    "storage-inspector", "tags", "upload-batches", "upload-sessions", "workflow-admin",
    "DmsExpiringDocumentsTable", "EmailSendLogTable", "ReportDeliveryLogFullPage",
  ].map(id => `dms:${id}:v1`),
  "special.ai-feature-flags-panel", "special.ai-provider-config-list", "special.settings.ai.ai-usage-log-table",
  "special.compliance-findings-page-client", "special.duplicate-candidates-page-client",
  "special.risk-scores-page-client", "special.ai.common.data-quality.data-quality-findings-table",
]);

export const COLUMN_LAYOUT_STORAGE_PREFIX = "algt_erp_worklist_columns:v1:";

export function worklistColumnStorageKey(principalId: string | undefined, listId: string | null | undefined) {
  if (!principalId || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(principalId) ||
    !listId || !WORKLIST_IDS.has(listId)) return undefined;
  return `${COLUMN_LAYOUT_STORAGE_PREFIX}${principalId.toLowerCase()}:${listId}`;
}
