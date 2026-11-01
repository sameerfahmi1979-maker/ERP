import { validateCapabilityRegister, type AiCapability } from "./contracts";

/** Authority declarations, NOT executable tools. No later-stage adapters enabled. */
function entry(id: string, ownerModule: string, file: string, table: string, fields: string[], permission: string, sensitivity: AiCapability["sensitivity"] = "metadata", disposition: AiCapability["disposition"] = "planned"): AiCapability {
  return {
    id, ownerModule, sourceFiles: [file], sourceTables: [table],
    sourceFields: fields.map(field => ({ table, field, authority: "business_record" })),
    permissionCodes: [permission], scope: "domain_owned", sensitivity,
    supportedFilters: [], countSemantics: "not_applicable", disposition,
    deliveryStage: "AI-MOD-03", acceptanceCaseIds: ["AI-Q02", "AI-Q04"],
  };
}

export const AI_CAPABILITY_REGISTER = validateCapabilityRegister([
  { ...entry("company.metadata", "master_data", "src/server/actions/organizations.ts", "owner_companies", ["company_code", "trade_name"], "organizations.view", "metadata", "existing_partial"), scope: "record_parent", deliveryStage: "AI-MOD-02" },
  { ...entry("branch.metadata", "master_data", "src/server/actions/branches.ts", "branches", ["branch_code", "branch_name_en", "owner_company_id"], "branches.view", "metadata", "existing_partial"), scope: "company_branch", deliveryStage: "AI-MOD-02" },
  { ...entry("party.metadata", "master_data", "src/server/actions/master-data/parties.ts", "parties", ["party_code", "display_name"], "master_data.parties.view", "metadata", "existing_partial"), deliveryStage: "AI-MOD-02" },
  { ...entry("site.metadata", "master_data", "src/server/actions/common-master-data/work-sites.ts", "work_sites", ["site_code", "site_name", "owner_company_id", "branch_id"], "common_md.work_sites.view", "metadata", "existing_partial"), deliveryStage: "AI-MOD-02" },
  { ...entry("dms.metadata", "dms", "src/server/reads/dms-documents.ts", "dms_documents", ["document_no", "document_type_id", "expiry_date", "owning_company_id", "owning_branch_id", "current_version_id"], "dms.documents.view", "metadata", "existing_partial"), deliveryStage: "AI-MOD-02", supportedFilters: ["document_type_id", "owning_company_id", "owning_branch_id", "expiry_date","issue_date","status","lifecycle","subject_type","subject_id"], countSemantics: "exact_authorized" },
  {...entry("global.search","common","src/server/ai/search/global.ts","dms_documents",["document_no","title","updated_at"],"ai.search.view","metadata","existing_partial"),deliveryStage:"AI-MOD-02",supportedFilters:["domain"],countSemantics:"exact_authorized"},
  {...entry("hr.search","hr","src/server/reads/hr-search.ts","employees",["employee_code","full_name_en","owner_company_id","branch_id"],"hr.employees.view","hr","existing_partial"),deliveryStage:"AI-MOD-02",supportedFilters:["category","owner_company_id","branch_id","department_id","designation_id","status","date_from","date_to"],countSemantics:"exact_authorized"},
  entry("hr.employee", "hr", "src/server/reads/employee-overview.ts", "employees", ["employee_code", "full_name_en", "owner_company_id", "branch_id"], "hr.employees.view", "hr"),
  entry("hr.dependent", "hr", "src/server/reads/hr-document-browser.ts", "employee_dependents", ["employee_id", "dependent_name_en", "relationship_type_id"], "hr.employees.view", "hr"),
  entry("hr.identity_expiry", "hr", "src/server/reads/hr-subject-access.ts", "employee_identity_documents", ["employee_id", "document_type_id", "document_number", "expiry_date", "verification_status"], "hr.compliance.view", "hr"),
  entry("hr.access_expiry", "hr", "src/server/reads/hr-subject-access.ts", "employee_access_cards", ["employee_id", "access_type_id", "work_site_id", "card_number", "expiry_date"], "hr.compliance.view", "hr"),
  entry("hr.recruitment", "hr", "src/server/reads/hr-candidate-record.ts", "hr_candidates", ["candidate_code", "candidate_status", "joining_status"], "hr.recruitment.view", "hr"),
  entry("hr.time", "hr", "src/server/reads/hr-time-records.ts", "employee_attendance_daily_summary", ["employee_id", "attendance_date", "approval_status", "worked_minutes"], "hr.attendance.view", "hr"),
  entry("hr.payroll", "hr", "src/server/reads/hr-payroll-records.ts", "employee_payroll_profiles", ["employee_id"], "hr.payroll.view", "payroll"),
  entry("hr.operations", "hr", "src/server/reads/hr-operation-records.ts", "employees", ["primary_work_site_id", "owner_company_id", "branch_id"], "hr.assignments.view", "hr"),
  entry("hr.actions", "hr", "src/server/reads/hr-action-records.ts", "employee_eos_cases", ["employee_id"], "hr.actions.view", "hr"),
  entry("reports.status", "reports", "src/server/reads/report-history.ts", "erp_report_runs", ["run_reference", "run_status", "completed_at"], "reports.view"),
  entry("notifications.status", "notifications", "src/server/reads/notifications.ts", "erp_notifications", ["notification_code", "recipient_user_id", "status"], "notifications.view"),
  entry("email.status", "notifications", "src/server/reads/email-queue.ts", "erp_email_queue", ["id", "status"], "notifications.email_queue.view", "administration"),
  entry("audit.explanations", "administration", "src/server/reads/audit.ts", "audit_logs", ["id", "entity_name", "action"], "audit.view", "administration"),
]);

export const AI_BUSINESS_HOLDS = Object.freeze([
  "No real employee/user/manager or role mapping rollout.",
  "Stock-owner clearance remains held until verified upstream authority exists.",
  "Unapproved official wording, bank/WPS, statutory/EOS and unsupported financial actions remain held.",
  "Company/type approval applicability, assignees, quorum/delegation and notification-access mappings require explicit approved business configuration.",
  "Future modules and undeclared finance/supply/clinical fields have no active AI adapter or inherited AI-write permission.",
]);
