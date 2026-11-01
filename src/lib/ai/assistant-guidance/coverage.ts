/** Capability admission, not a promise that every domain is an executable tool. */
export const ASSISTANT_DOMAIN_COVERAGE = [
  ["dms", "supported", "Shared exact search, document metadata/expiry, authorised links and approval read holds."],
  ["hr_identity", "supported", "Verified employee context and dependent relationships; no inferred family/name links."],
  ["hr_recruitment_time_operations", "existing_domain_read", "Existing HR search/record workflows; no new payroll, fitness, hiring or deployment decisions."],
  ["masters", "supported", "Verified company/branch/party/site records and reviewed form drafts."],
  ["finance_supply", "business_held", "Use owning workflows; no unregistered financial metrics, bank/WPS/statutory or stock-owner authority."],
  ["reports_official_documents", "existing_domain_read", "Existing report/letter permissions and business wording approval remain required."],
  ["notifications_email_schedules", "existing_domain_read", "Existing dashboard/navigation only; asking never sends, schedules or activates a worker."],
  ["audit_status", "existing_domain_read", "Existing audit explanation remains permissioned; no generic audit-table reader."],
  ["company_policies", "business_held_until_configured", "Only approved, version-bound DMS sources with explicit applicability; no guessed company rules."],
  ["future_modules", "unsupported", "A reviewed adapter, authority, fields, evidence and acceptance cases are required before admission."],
] as const;
