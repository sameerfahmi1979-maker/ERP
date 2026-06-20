/**
 * TanStack Query cache invalidation utilities for ERP master-data.
 * Phase 002F.3E.3B.6B — Global Lookup Cache and Hook Standard
 *
 * Call these from server-action success handlers (e.g. after creating a new
 * country, currency, or lookup value) so all cached comboboxes refresh.
 *
 * Usage example — inside a client-side onSuccess callback:
 *   import { useQueryClient } from "@tanstack/react-query";
 *   import { invalidateLookupCategory } from "@/lib/query/invalidation";
 *   const qc = useQueryClient();
 *   invalidateLookupCategory(qc, "CUSTOMER_TYPES");
 */

import type { QueryClient } from "@tanstack/react-query";

// ── Lookup values ─────────────────────────────────────────────────────────────

/** Invalidate a single lookup category cache (all variant keys for that code). */
export function invalidateLookupCategory(
  queryClient: QueryClient,
  categoryCode: string
): void {
  queryClient.invalidateQueries({
    queryKey: ["lookup", "values", categoryCode.toUpperCase()],
  });
  // Also clear batch entries so any batch query that included this category refetches
  queryClient.invalidateQueries({ queryKey: ["lookup", "batch"] });
}

/** Invalidate all lookup value caches. */
export function invalidateAllLookups(queryClient: QueryClient): void {
  queryClient.invalidateQueries({ queryKey: ["lookup"] });
}

// ── Geography ─────────────────────────────────────────────────────────────────

export function invalidateCountries(queryClient: QueryClient): void {
  queryClient.invalidateQueries({ queryKey: ["master", "countries"] });
}

export function invalidateEmirates(queryClient: QueryClient): void {
  queryClient.invalidateQueries({ queryKey: ["master", "emirates"] });
}

export function invalidateCities(queryClient: QueryClient): void {
  queryClient.invalidateQueries({ queryKey: ["master", "cities"] });
}

export function invalidateAreas(queryClient: QueryClient): void {
  queryClient.invalidateQueries({ queryKey: ["master", "areas"] });
}

export function invalidatePorts(queryClient: QueryClient): void {
  queryClient.invalidateQueries({ queryKey: ["master", "ports"] });
}

/** Invalidate all geography tables (countries → emirates → cities → areas → ports). */
export function invalidateGeography(queryClient: QueryClient): void {
  queryClient.invalidateQueries({ queryKey: ["master", "countries"] });
  queryClient.invalidateQueries({ queryKey: ["master", "emirates"] });
  queryClient.invalidateQueries({ queryKey: ["master", "cities"] });
  queryClient.invalidateQueries({ queryKey: ["master", "areas"] });
  queryClient.invalidateQueries({ queryKey: ["master", "ports"] });
}

// ── Finance basics ────────────────────────────────────────────────────────────

export function invalidateCurrencies(queryClient: QueryClient): void {
  queryClient.invalidateQueries({ queryKey: ["master", "currencies"] });
}

export function invalidateBanks(queryClient: QueryClient): void {
  queryClient.invalidateQueries({ queryKey: ["master", "banks"] });
}

export function invalidatePaymentTerms(queryClient: QueryClient): void {
  queryClient.invalidateQueries({ queryKey: ["master", "payment_terms"] });
}

export function invalidateTaxTypes(queryClient: QueryClient): void {
  queryClient.invalidateQueries({ queryKey: ["master", "tax_types"] });
}

/** Invalidate all finance basics caches. */
export function invalidateFinanceBasics(queryClient: QueryClient): void {
  queryClient.invalidateQueries({ queryKey: ["master", "currencies"] });
  queryClient.invalidateQueries({ queryKey: ["master", "banks"] });
  queryClient.invalidateQueries({ queryKey: ["master", "payment_terms"] });
  queryClient.invalidateQueries({ queryKey: ["master", "tax_types"] });
}

// ── Unit of measure ───────────────────────────────────────────────────────────

/** Invalidate UOM categories and unit lists. */
export function invalidateUom(queryClient: QueryClient): void {
  queryClient.invalidateQueries({ queryKey: ["master", "uom_categories"] });
  queryClient.invalidateQueries({ queryKey: ["master", "units_of_measure"] });
}

// ── Organisation structure ────────────────────────────────────────────────────

/** Invalidate owner companies and branches. */
export function invalidateOrganizations(queryClient: QueryClient): void {
  queryClient.invalidateQueries({ queryKey: ["master", "owner_companies"] });
  queryClient.invalidateQueries({ queryKey: ["master", "branches"] });
}

// ── Cost / profit centres ─────────────────────────────────────────────────────

export function invalidateCostCenters(queryClient: QueryClient): void {
  queryClient.invalidateQueries({ queryKey: ["master", "cost_centers"] });
}

export function invalidateProfitCenters(queryClient: QueryClient): void {
  queryClient.invalidateQueries({ queryKey: ["master", "profit_centers"] });
}

// ── Child tables (Phase 3B.6G.1) ──────────────────────────────────────────────
// Targeted invalidation: a child mutation must refresh ONLY its own
// ["child", <table>, <parentId>] entry — never parent or master caches.

/** Invalidate one child table for one parent record. */
export function invalidateChildTable(
  queryClient: QueryClient,
  tableName: string,
  parentId: number | string | null | undefined
): void {
  queryClient.invalidateQueries({
    queryKey: ["child", tableName, parentId ?? null],
  });
}

/** Invalidate every cached child table (e.g. on logout / role switch). */
export function invalidateAllChildTables(queryClient: QueryClient): void {
  queryClient.invalidateQueries({ queryKey: ["child"] });
}

/**
 * Factory producing an entity-specific child invalidator (3B.6G.4).
 * Future modules generate their helpers in one line:
 *   export const invalidateVendorContacts = createChildInvalidator("vendor_contacts");
 */
export function createChildInvalidator(
  tableName: string
): (queryClient: QueryClient, parentId: number | string) => void {
  return (queryClient, parentId) =>
    invalidateChildTable(queryClient, tableName, parentId);
}

// Customer child helpers (reference implementation — consumed since 3B.6G.3)

export const invalidateCustomerContacts = createChildInvalidator("customer_contacts");
export const invalidateCustomerAddresses = createChildInvalidator("customer_addresses");
export const invalidateCustomerBankDetails = createChildInvalidator("customer_bank_details");
export const invalidateCustomerDocuments = createChildInvalidator("customer_documents");

// Party Master child helpers
export const invalidatePartyContacts = createChildInvalidator("party_contacts");
export const invalidatePartyAddresses = createChildInvalidator("party_addresses");
export const invalidatePartyBankDetails = createChildInvalidator("party_bank_details");
export const invalidatePartyLicenses = createChildInvalidator("party_licenses");
export const invalidatePartyTaxRegistrations = createChildInvalidator("party_tax_registrations");
export const invalidatePartyDocuments = createChildInvalidator("party_documents");
export const invalidatePartyNotes = createChildInvalidator("party_notes");
export const invalidatePartyServiceCategories = createChildInvalidator("party_service_categories");

// ── DMS Admin ──────────────────────────────────────────────────────────────────

export function invalidateDmsAdminOverview(queryClient: QueryClient): void {
  queryClient.invalidateQueries({ queryKey: ["dms", "admin", "overview"] });
}

export function invalidateDmsCategories(queryClient: QueryClient): void {
  queryClient.invalidateQueries({ queryKey: ["dms", "admin", "categories"] });
  queryClient.invalidateQueries({ queryKey: ["dms", "admin", "overview"] });
}

export function invalidateDmsDocumentTypes(queryClient: QueryClient): void {
  queryClient.invalidateQueries({ queryKey: ["dms", "admin", "document-types"] });
  queryClient.invalidateQueries({ queryKey: ["dms", "admin", "overview"] });
}

export function invalidateDmsMetadataDefinitions(queryClient: QueryClient): void {
  queryClient.invalidateQueries({ queryKey: ["dms", "admin", "metadata-definitions"] });
}

export function invalidateDmsTags(queryClient: QueryClient): void {
  queryClient.invalidateQueries({ queryKey: ["dms", "admin", "tags"] });
  queryClient.invalidateQueries({ queryKey: ["dms", "admin", "overview"] });
}

export function invalidateDmsRetentionPolicies(queryClient: QueryClient): void {
  queryClient.invalidateQueries({ queryKey: ["dms", "admin", "retention-policies"] });
  queryClient.invalidateQueries({ queryKey: ["dms", "admin", "overview"] });
}

export function invalidateAllDmsAdmin(queryClient: QueryClient): void {
  queryClient.invalidateQueries({ queryKey: ["dms", "admin"] });
}

// ── DMS Documents (DMS.4) ─────────────────────────────────────────────────────

export function invalidateDmsDocuments(queryClient: QueryClient): void {
  queryClient.invalidateQueries({ queryKey: ["dms", "documents"] });
}

export function invalidateDmsDocument(queryClient: QueryClient, id: number): void {
  queryClient.invalidateQueries({ queryKey: ["dms", "documents", id] });
}

export function invalidateDmsDocumentRecord(queryClient: QueryClient, id: number): void {
  queryClient.invalidateQueries({ queryKey: ["dms", "documents", id] });
  queryClient.invalidateQueries({ queryKey: ["dms", "documents"] });
}

// ── DMS.5 — Upload Inbox + File Storage ──────────────────────────────────────

export function invalidateDmsUploadSessions(queryClient: QueryClient): void {
  queryClient.invalidateQueries({ queryKey: ["dms", "upload-sessions"] });
}

export function invalidateDmsDocumentFiles(queryClient: QueryClient, documentId: number): void {
  queryClient.invalidateQueries({ queryKey: ["dms", "documents", documentId, "files"] });
}

export function invalidateDmsDocumentVersions(queryClient: QueryClient, documentId: number): void {
  queryClient.invalidateQueries({ queryKey: ["dms", "documents", documentId, "versions"] });
}

export function invalidateDmsDocumentFileStorage(queryClient: QueryClient, documentId: number): void {
  queryClient.invalidateQueries({ queryKey: ["dms", "documents", documentId, "files"] });
  queryClient.invalidateQueries({ queryKey: ["dms", "documents", documentId, "versions"] });
  queryClient.invalidateQueries({ queryKey: ["dms", "documents", documentId] });
  queryClient.invalidateQueries({ queryKey: ["dms", "documents"] });
}

// ── DMS.6 — Entity document links ─────────────────────────────────────────────

export function invalidateDmsEntityDocuments(
  queryClient: QueryClient,
  entityType: string,
  entityId: number
): void {
  queryClient.invalidateQueries({ queryKey: ["dms", "entity-documents", entityType, entityId] });
  queryClient.invalidateQueries({ queryKey: ["dms", "entity-document-compliance", entityType, entityId] });
  queryClient.invalidateQueries({ queryKey: ["dms", "attachable-documents", entityType, entityId] });
}

export function invalidatePartyDmsDocuments(
  queryClient: QueryClient,
  partyId: number
): void {
  queryClient.invalidateQueries({ queryKey: ["dms", "entity-documents", "party", partyId] });
  queryClient.invalidateQueries({ queryKey: ["party", "dms-documents", partyId] });
}

export function invalidateDmsAvailableForLink(queryClient: QueryClient): void {
  queryClient.invalidateQueries({ queryKey: ["dms", "available-for-link"] });
}

// ── DMS.8 — Expiry, Renewals, Notifications ───────────────────────────────────

export function invalidateDmsExpiry(queryClient: QueryClient): void {
  queryClient.invalidateQueries({ queryKey: ["dms", "expiry"] });
}

export function invalidateDmsDocumentExpiry(queryClient: QueryClient, documentId: number): void {
  queryClient.invalidateQueries({ queryKey: ["dms", "expiry", "reminders", "doc", documentId] });
  queryClient.invalidateQueries({ queryKey: ["dms", "expiry", "stats"] });
  queryClient.invalidateQueries({ queryKey: ["dms", "documents", documentId] });
}

export function invalidateDmsRenewals(queryClient: QueryClient): void {
  queryClient.invalidateQueries({ queryKey: ["dms", "renewals"] });
}

export function invalidateDmsDocumentRenewals(queryClient: QueryClient, documentId: number): void {
  queryClient.invalidateQueries({ queryKey: ["dms", "renewals", "doc", documentId] });
  queryClient.invalidateQueries({ queryKey: ["dms", "renewals"] });
}

export function invalidateDmsNotifications(queryClient: QueryClient): void {
  queryClient.invalidateQueries({ queryKey: ["dms", "notifications"] });
}

// ── DMS.10 — AI Analysis ─────────────────────────────────────────────────────

export function invalidateDmsAiAnalysis(queryClient: QueryClient, documentId: number): void {
  queryClient.invalidateQueries({ queryKey: ["dms", "documents", documentId, "ai-status"] });
  queryClient.invalidateQueries({ queryKey: ["dms", "documents", documentId, "ai-results"] });
  queryClient.invalidateQueries({ queryKey: ["dms", "documents", documentId, "record"] });
}

// ── DMS.9 — OCR Pipeline ─────────────────────────────────────────────────────

export function invalidateDmsOcr(queryClient: QueryClient, documentId: number): void {
  queryClient.invalidateQueries({ queryKey: ["dms", "documents", documentId, "ocr-status"] });
  queryClient.invalidateQueries({ queryKey: ["dms", "documents", documentId, "ocr-text"] });
  queryClient.invalidateQueries({ queryKey: ["dms", "ocr-jobs"] });
}

export function invalidateDmsFileOcr(queryClient: QueryClient, fileId: number): void {
  queryClient.invalidateQueries({ queryKey: ["dms", "files", fileId, "ocr-text"] });
}

// ── COMMON MD.1 — Common Master Data ─────────────────────────────────────────

export function invalidateCommonMdDepartments(queryClient: QueryClient): void {
  queryClient.invalidateQueries({ queryKey: ["common_md", "departments"] });
}

export function invalidateCommonMdDesignations(queryClient: QueryClient): void {
  queryClient.invalidateQueries({ queryKey: ["common_md", "designations"] });
}

export function invalidateCommonMdWorkSites(queryClient: QueryClient): void {
  queryClient.invalidateQueries({ queryKey: ["common_md", "work_sites"] });
}

export function invalidateCommonMdWorkCalendars(queryClient: QueryClient, calendarId?: number): void {
  queryClient.invalidateQueries({ queryKey: ["common_md", "work_calendars"] });
  if (calendarId) {
    queryClient.invalidateQueries({ queryKey: ["common_md", "work_shifts", calendarId] });
  }
}

export function invalidateCommonMdApprovalRoles(queryClient: QueryClient): void {
  queryClient.invalidateQueries({ queryKey: ["common_md", "approval_roles"] });
}

export function invalidateCommonMdDmsRequiredDocumentRules(queryClient: QueryClient): void {
  queryClient.invalidateQueries({ queryKey: ["common_md", "dms_required_document_rules"] });
}

export function invalidateCommonMdCompanySignatories(queryClient: QueryClient, companyId: number): void {
  queryClient.invalidateQueries({ queryKey: ["common_md", "company_signatories", companyId] });
}

// ── NOTIFICATIONS.1 — Global Notifications ────────────────────────────────────

export function invalidateMyNotifications(queryClient: QueryClient): void {
  queryClient.invalidateQueries({ queryKey: ["notifications", "my"] });
  queryClient.invalidateQueries({ queryKey: ["notifications", "unread-count"] });
}

export function invalidateUnreadNotifications(queryClient: QueryClient): void {
  queryClient.invalidateQueries({ queryKey: ["notifications", "unread-count"] });
}

export function invalidateEmailQueue(queryClient: QueryClient): void {
  queryClient.invalidateQueries({ queryKey: ["notifications", "email-queue"] });
}

export function invalidateNotificationTemplates(queryClient: QueryClient): void {
  queryClient.invalidateQueries({ queryKey: ["notifications", "templates"] });
}

export function invalidateNotificationLogs(queryClient: QueryClient): void {
  queryClient.invalidateQueries({ queryKey: ["notifications", "delivery-logs"] });
}

// ── Common AI Field Suggestions (COMMON AI.1B) ────────────────────────────────

/**
 * Invalidate AI field suggestions for a specific entity.
 * Call after generate, accept, reject, apply, or supersede.
 */
export function invalidateAiFieldSuggestions(
  queryClient: QueryClient,
  entityType: string,
  entityId: number
): void {
  queryClient.invalidateQueries({
    queryKey: ["ai", "field-suggestions", entityType, entityId],
  });
}

/** Invalidate AI record status cache for a specific entity. */
export function invalidateAiRecordStatus(
  queryClient: QueryClient,
  entityType: string,
  entityId: number
): void {
  queryClient.invalidateQueries({
    queryKey: ["ai", "record-status", entityType, entityId],
  });
}

/** Invalidate all Common AI caches for an entity (suggestions + status). */
export function invalidateAllAiEntityCaches(
  queryClient: QueryClient,
  entityType: string,
  entityId: number
): void {
  invalidateAiFieldSuggestions(queryClient, entityType, entityId);
  invalidateAiRecordStatus(queryClient, entityType, entityId);
}

// ── Common AI Duplicate Detection (COMMON AI.3) ───────────────────────────────

export function invalidateDuplicateCandidates(queryClient: QueryClient): void {
  queryClient.invalidateQueries({ queryKey: ["ai", "duplicate-candidates"] });
  queryClient.invalidateQueries({ queryKey: ["ai", "duplicate-counts"] });
  queryClient.invalidateQueries({ queryKey: ["ai", "duplicate-doc-count"] });
}

export function invalidateDuplicateCandidateDetail(
  queryClient: QueryClient,
  candidateId: number
): void {
  queryClient.invalidateQueries({
    queryKey: ["ai", "duplicate-candidate", candidateId],
  });
}

export function invalidateDuplicateCandidateCounts(
  queryClient: QueryClient,
  entityType: string,
  entityId: number
): void {
  queryClient.invalidateQueries({
    queryKey: ["ai", "duplicate-counts", entityType, entityId],
  });
}

// ── Common AI Compliance Checker (COMMON AI.4) ────────────────────────────────

export function invalidateComplianceFindings(queryClient: QueryClient): void {
  queryClient.invalidateQueries({ queryKey: ["ai", "compliance-findings"] });
  queryClient.invalidateQueries({ queryKey: ["ai", "compliance-counts"] });
  queryClient.invalidateQueries({ queryKey: ["ai", "compliance-doc-count"] });
  queryClient.invalidateQueries({ queryKey: ["dms", "entity-document-compliance"] });
}

export function invalidateComplianceFindingDetail(
  queryClient: QueryClient,
  findingId: number
): void {
  queryClient.invalidateQueries({
    queryKey: ["ai", "compliance-finding", findingId],
  });
}

export function invalidateComplianceFindingCounts(
  queryClient: QueryClient,
  entityType: string,
  entityId: number
): void {
  queryClient.invalidateQueries({
    queryKey: ["ai", "compliance-counts", entityType, entityId],
  });
}

// ── Common AI Risk Scoring (COMMON AI.5) ──────────────────────────────────────

export function invalidateRiskScores(queryClient: QueryClient): void {
  queryClient.invalidateQueries({ queryKey: ["ai", "risk-scores"] });
  queryClient.invalidateQueries({ queryKey: ["ai", "risk-score-count"] });
  queryClient.invalidateQueries({ queryKey: ["ai", "risk-score-entity"] });
  queryClient.invalidateQueries({ queryKey: ["ai", "risk-score-document"] });
}

export function invalidateRiskScoreDetail(
  queryClient: QueryClient,
  scoreId: number
): void {
  queryClient.invalidateQueries({
    queryKey: ["ai", "risk-score", scoreId],
  });
}

export function invalidateRiskScoreForEntity(
  queryClient: QueryClient,
  entityType: string,
  entityId: number
): void {
  queryClient.invalidateQueries({
    queryKey: ["ai", "risk-score-entity", entityType, entityId],
  });
  queryClient.invalidateQueries({
    queryKey: ["ai", "risk-score-count", entityType, entityId],
  });
}

export function invalidateRiskScoreForDocument(
  queryClient: QueryClient,
  documentId: number
): void {
  queryClient.invalidateQueries({
    queryKey: ["ai", "risk-score-document", documentId],
  });
}

// ── DMS AI Orchestration (DMS AI ORCH.1) ──────────────────────────────────────

/** Invalidate orchestration status for a specific session. */
export function invalidateDmsOrchestrationStatus(
  queryClient: QueryClient,
  sessionCode: string
): void {
  queryClient.invalidateQueries({
    queryKey: ["dms", "orchestration-status", sessionCode],
  });
}

/** Invalidate batch orchestration status. */
export function invalidateDmsBatchOrchestration(
  queryClient: QueryClient,
  batchCode: string
): void {
  queryClient.invalidateQueries({
    queryKey: ["dms", "batch-orchestration", batchCode],
  });
}

// ── COMMON AI.2 — Document Understanding (COMMON AI.2) ────────────────────────

/** Invalidate the document understanding cache for a specific document. */
export function invalidateDmsDocumentUnderstanding(
  queryClient: QueryClient,
  documentId: number
): void {
  queryClient.invalidateQueries({
    queryKey: ["dms", "documents", documentId, "understanding"],
  });
}

// ── COMMON AI.6 — Search ─────────────────────────────────────────────────────

export function invalidateRecentSearches(queryClient: QueryClient): void {
  queryClient.invalidateQueries({ queryKey: ["ai", "recent-searches"] });
}

export function invalidateSearchSuggestions(queryClient: QueryClient): void {
  queryClient.invalidateQueries({ queryKey: ["ai", "search-suggestions"] });
}

// ── COMMON AI.7 — Assistant ───────────────────────────────────────────────────

export function invalidateAssistantSessions(queryClient: QueryClient): void {
  queryClient.invalidateQueries({ queryKey: ["ai", "assistant-sessions"] });
}

export function invalidateAssistantSession(queryClient: QueryClient, sessionId: number): void {
  queryClient.invalidateQueries({ queryKey: ["ai", "assistant-session", sessionId] });
}

export function invalidateAssistantDrafts(queryClient: QueryClient, sessionId: number): void {
  queryClient.invalidateQueries({ queryKey: ["ai", "assistant-drafts", sessionId] });
}

// ── COMMON AI.13 — Daily Dashboard ───────────────────────────────────────────

export function invalidateAiDailyDashboard(queryClient: QueryClient): void {
  queryClient.invalidateQueries({ queryKey: ["ai", "daily-dashboard"] });
}

// ── COMMON AI.14 — Audit Trail Explainer ─────────────────────────────────────

export function invalidateAuditExplainer(queryClient: QueryClient): void {
  queryClient.invalidateQueries({ queryKey: ["ai", "audit-explainer"] });
}

// ── COMMON AI.15 — Data Quality Monitor ──────────────────────────────────────

export function invalidateDataQuality(queryClient: QueryClient): void {
  queryClient.invalidateQueries({ queryKey: ["ai", "data-quality-summary"] });
  queryClient.invalidateQueries({ queryKey: ["ai", "data-quality-findings"] });
}

export function invalidateDataQualityFinding(queryClient: QueryClient, id: number): void {
  queryClient.invalidateQueries({ queryKey: ["ai", "data-quality-finding", id] });
  queryClient.invalidateQueries({ queryKey: ["ai", "data-quality-finding-events", id] });
}

// ── HR Employees (HR.2) ────────────────────────────────────────────────────────

/** Invalidate all HR employee list caches. */
export function invalidateHrEmployees(queryClient: QueryClient): void {
  queryClient.invalidateQueries({ queryKey: ["hr", "employees", "list"] });
}

/** Invalidate a single employee detail cache. */
export function invalidateHrEmployee(queryClient: QueryClient, id: number): void {
  queryClient.invalidateQueries({ queryKey: ["hr", "employees", "detail", id] });
}

/** Invalidate a single employee overview cache. */
export function invalidateHrEmployeeOverview(queryClient: QueryClient, id: number): void {
  queryClient.invalidateQueries({ queryKey: ["hr", "employees", "overview", id] });
}

/** Invalidate a single employee status history cache. */
export function invalidateHrEmployeeStatusHistory(queryClient: QueryClient, id: number): void {
  queryClient.invalidateQueries({ queryKey: ["hr", "employees", "status-history", id] });
}

// ── HR Settings (HR.1) ────────────────────────────────────────────────────────

/** Invalidate all HR settings caches. */
export function invalidateHrSettings(queryClient: QueryClient): void {
  queryClient.invalidateQueries({ queryKey: ["hr", "settings"] });
}

export function invalidateHrEmployeeCategories(queryClient: QueryClient): void {
  queryClient.invalidateQueries({ queryKey: ["hr", "settings", "employee-categories"] });
}
export function invalidateHrEmploymentTypes(queryClient: QueryClient): void {
  queryClient.invalidateQueries({ queryKey: ["hr", "settings", "employment-types"] });
}
export function invalidateHrGrades(queryClient: QueryClient): void {
  queryClient.invalidateQueries({ queryKey: ["hr", "settings", "grades"] });
}
export function invalidateHrIdentityDocumentTypes(queryClient: QueryClient): void {
  queryClient.invalidateQueries({ queryKey: ["hr", "settings", "identity-document-types"] });
}
export function invalidateHrAccessCardTypes(queryClient: QueryClient): void {
  queryClient.invalidateQueries({ queryKey: ["hr", "settings", "access-card-types"] });
}
export function invalidateHrTrainingCategories(queryClient: QueryClient): void {
  queryClient.invalidateQueries({ queryKey: ["hr", "settings", "training-categories"] });
}
export function invalidateHrTrainingTypes(queryClient: QueryClient): void {
  queryClient.invalidateQueries({ queryKey: ["hr", "settings", "training-types"] });
}
export function invalidateHrMedicalRecordTypes(queryClient: QueryClient): void {
  queryClient.invalidateQueries({ queryKey: ["hr", "settings", "medical-record-types"] });
}
export function invalidateHrLeaveTypes(queryClient: QueryClient): void {
  queryClient.invalidateQueries({ queryKey: ["hr", "settings", "leave-types"] });
}
export function invalidateHrRelationshipTypes(queryClient: QueryClient): void {
  queryClient.invalidateQueries({ queryKey: ["hr", "settings", "relationship-types"] });
}
export function invalidateHrSalaryComponentTypes(queryClient: QueryClient): void {
  queryClient.invalidateQueries({ queryKey: ["hr", "settings", "salary-component-types"] });
}
export function invalidateHrPayrollGroups(queryClient: QueryClient): void {
  queryClient.invalidateQueries({ queryKey: ["hr", "settings", "payroll-groups"] });
}
export function invalidateHrMohreEstablishments(queryClient: QueryClient): void {
  queryClient.invalidateQueries({ queryKey: ["hr", "settings", "mohre-establishments"] });
}
export function invalidateHrProProcessTypes(queryClient: QueryClient): void {
  queryClient.invalidateQueries({ queryKey: ["hr", "settings", "pro-process-types"] });
}
export function invalidateHrReadinessRuleTemplates(queryClient: QueryClient): void {
  queryClient.invalidateQueries({ queryKey: ["hr", "settings", "readiness-rule-templates"] });
}
export function invalidateHrRoleRequirementMatrix(queryClient: QueryClient): void {
  queryClient.invalidateQueries({ queryKey: ["hr", "settings", "role-requirement-matrix"] });
}
export function invalidateHrSiteRequirementMatrix(queryClient: QueryClient): void {
  queryClient.invalidateQueries({ queryKey: ["hr", "settings", "site-requirement-matrix"] });
}
export function invalidateHrApprovalWorkflows(queryClient: QueryClient): void {
  queryClient.invalidateQueries({ queryKey: ["hr", "settings", "approval-workflows"] });
}

// ── HR Compliance (HR.3) ──────────────────────────────────────────────────────

/** Invalidate all compliance data for a specific employee. */
export function invalidateHrEmployeeCompliance(
  queryClient: QueryClient,
  employeeId: number
): void {
  queryClient.invalidateQueries({ queryKey: ["hr", "compliance", "identity-documents", employeeId] });
  queryClient.invalidateQueries({ queryKey: ["hr", "compliance", "medical-insurances", employeeId] });
  queryClient.invalidateQueries({ queryKey: ["hr", "compliance", "dependents", employeeId] });
  queryClient.invalidateQueries({ queryKey: ["hr", "compliance", "access-cards", employeeId] });
  queryClient.invalidateQueries({ queryKey: ["hr", "compliance", "training-certificates", employeeId] });
  queryClient.invalidateQueries({ queryKey: ["hr", "compliance", "medical-records", employeeId] });
  queryClient.invalidateQueries({ queryKey: ["hr", "compliance", "summary", employeeId] });
  queryClient.invalidateQueries({ queryKey: ["hr", "compliance", "alerts", employeeId] });
}

export function invalidateHrEmployeeComplianceSummary(
  queryClient: QueryClient,
  employeeId: number
): void {
  queryClient.invalidateQueries({ queryKey: ["hr", "compliance", "summary", employeeId] });
}

export function invalidateHrEmployeeIdentityDocuments(
  queryClient: QueryClient,
  employeeId: number
): void {
  queryClient.invalidateQueries({ queryKey: ["hr", "compliance", "identity-documents", employeeId] });
  queryClient.invalidateQueries({ queryKey: ["hr", "compliance", "summary", employeeId] });
}

export function invalidateHrEmployeeMedicalInsurances(
  queryClient: QueryClient,
  employeeId: number
): void {
  queryClient.invalidateQueries({ queryKey: ["hr", "compliance", "medical-insurances", employeeId] });
  queryClient.invalidateQueries({ queryKey: ["hr", "compliance", "summary", employeeId] });
}

export function invalidateHrEmployeeDependents(
  queryClient: QueryClient,
  employeeId: number
): void {
  queryClient.invalidateQueries({ queryKey: ["hr", "compliance", "dependents", employeeId] });
  queryClient.invalidateQueries({ queryKey: ["hr", "compliance", "summary", employeeId] });
}

export function invalidateHrEmployeeAccessCards(
  queryClient: QueryClient,
  employeeId: number
): void {
  queryClient.invalidateQueries({ queryKey: ["hr", "compliance", "access-cards", employeeId] });
  queryClient.invalidateQueries({ queryKey: ["hr", "compliance", "summary", employeeId] });
}

export function invalidateHrEmployeeTrainingCertificates(
  queryClient: QueryClient,
  employeeId: number
): void {
  queryClient.invalidateQueries({ queryKey: ["hr", "compliance", "training-certificates", employeeId] });
  queryClient.invalidateQueries({ queryKey: ["hr", "compliance", "summary", employeeId] });
}

export function invalidateHrEmployeeMedicalRecords(
  queryClient: QueryClient,
  employeeId: number
): void {
  queryClient.invalidateQueries({ queryKey: ["hr", "compliance", "medical-records", employeeId] });
  queryClient.invalidateQueries({ queryKey: ["hr", "compliance", "summary", employeeId] });
}

// ── HR Time (HR.4) ────────────────────────────────────────────────────────────

/** Invalidate all HR time data for an employee. */
export function invalidateHrEmployeeTime(
  queryClient: QueryClient,
  employeeId: number
): void {
  queryClient.invalidateQueries({ queryKey: ["hr", "time", "attendance-punches", employeeId] });
  queryClient.invalidateQueries({ queryKey: ["hr", "time", "attendance-summary", employeeId] });
  queryClient.invalidateQueries({ queryKey: ["hr", "time", "shift-assignments", employeeId] });
  queryClient.invalidateQueries({ queryKey: ["hr", "time", "leave-requests", employeeId] });
  queryClient.invalidateQueries({ queryKey: ["hr", "time", "leave-balances", employeeId] });
  queryClient.invalidateQueries({ queryKey: ["hr", "time", "overtime-records", employeeId] });
  queryClient.invalidateQueries({ queryKey: ["hr", "time", "summary", employeeId] });
}

export function invalidateHrEmployeeAttendance(
  queryClient: QueryClient,
  employeeId: number
): void {
  queryClient.invalidateQueries({ queryKey: ["hr", "time", "attendance-punches", employeeId] });
  queryClient.invalidateQueries({ queryKey: ["hr", "time", "attendance-summary", employeeId] });
  queryClient.invalidateQueries({ queryKey: ["hr", "time", "summary", employeeId] });
}

export function invalidateHrDailyAttendance(queryClient: QueryClient): void {
  queryClient.invalidateQueries({ queryKey: ["hr", "time", "daily-attendance"] });
}

export function invalidateHrEmployeeShiftAssignments(
  queryClient: QueryClient,
  employeeId: number
): void {
  queryClient.invalidateQueries({ queryKey: ["hr", "time", "shift-assignments", employeeId] });
  queryClient.invalidateQueries({ queryKey: ["hr", "time", "global-shift-assignments"] });
  queryClient.invalidateQueries({ queryKey: ["hr", "time", "summary", employeeId] });
}

export function invalidateHrEmployeeLeave(
  queryClient: QueryClient,
  employeeId: number
): void {
  queryClient.invalidateQueries({ queryKey: ["hr", "time", "leave-requests", employeeId] });
  queryClient.invalidateQueries({ queryKey: ["hr", "time", "leave-balances", employeeId] });
  queryClient.invalidateQueries({ queryKey: ["hr", "time", "summary", employeeId] });
}

export function invalidateHrGlobalLeaveRequests(queryClient: QueryClient): void {
  queryClient.invalidateQueries({ queryKey: ["hr", "time", "global-leave-requests"] });
}

export function invalidateHrEmployeeOvertime(
  queryClient: QueryClient,
  employeeId: number
): void {
  queryClient.invalidateQueries({ queryKey: ["hr", "time", "overtime-records", employeeId] });
  queryClient.invalidateQueries({ queryKey: ["hr", "time", "summary", employeeId] });
}

// ── HR Payroll & WPS (HR.5) ──────────────────────────────────────────────────

export function invalidateHrEmployeePayroll(
  queryClient: QueryClient,
  employeeId: number
): void {
  queryClient.invalidateQueries({ queryKey: ["hr", "payroll", "profile", employeeId] });
  queryClient.invalidateQueries({ queryKey: ["hr", "payroll", "salary-components", employeeId] });
  queryClient.invalidateQueries({ queryKey: ["hr", "payroll", "holds", employeeId] });
  queryClient.invalidateQueries({ queryKey: ["hr", "payroll", "wps-profile", employeeId] });
  queryClient.invalidateQueries({ queryKey: ["hr", "payroll", "wps-readiness", employeeId] });
  queryClient.invalidateQueries({ queryKey: ["hr", "payroll", "summary", employeeId] });
}

export function invalidateHrEmployeeSalaryComponents(
  queryClient: QueryClient,
  employeeId: number
): void {
  queryClient.invalidateQueries({ queryKey: ["hr", "payroll", "salary-components", employeeId] });
  queryClient.invalidateQueries({ queryKey: ["hr", "payroll", "summary", employeeId] });
  queryClient.invalidateQueries({ queryKey: ["hr", "payroll", "wps-readiness", employeeId] });
  queryClient.invalidateQueries({ queryKey: ["hr", "payroll", "global-salary-profiles"] });
}

export function invalidateHrEmployeeSalaryRevisions(
  queryClient: QueryClient,
  employeeId: number
): void {
  queryClient.invalidateQueries({ queryKey: ["hr", "payroll", "salary-revisions", employeeId] });
}

export function invalidateHrEmployeePayrollHolds(
  queryClient: QueryClient,
  employeeId: number
): void {
  queryClient.invalidateQueries({ queryKey: ["hr", "payroll", "holds", employeeId] });
  queryClient.invalidateQueries({ queryKey: ["hr", "payroll", "wps-readiness", employeeId] });
  queryClient.invalidateQueries({ queryKey: ["hr", "payroll", "summary", employeeId] });
}

export function invalidateHrEmployeeWps(
  queryClient: QueryClient,
  employeeId: number
): void {
  queryClient.invalidateQueries({ queryKey: ["hr", "payroll", "wps-profile", employeeId] });
  queryClient.invalidateQueries({ queryKey: ["hr", "payroll", "wps-readiness", employeeId] });
  queryClient.invalidateQueries({ queryKey: ["hr", "payroll", "summary", employeeId] });
  queryClient.invalidateQueries({ queryKey: ["hr", "payroll", "global-wps-readiness"] });
}

export function invalidateHrGlobalPayroll(queryClient: QueryClient): void {
  queryClient.invalidateQueries({ queryKey: ["hr", "payroll", "global-salary-profiles"] });
}

export function invalidateHrGlobalWpsReadiness(queryClient: QueryClient): void {
  queryClient.invalidateQueries({ queryKey: ["hr", "payroll", "global-wps-readiness"] });
}

// ── HR Operations & Readiness (HR.6) ────────────────────────────────────────

export function invalidateHrEmployeeOperations(queryClient: QueryClient, employeeId: number): void {
  queryClient.invalidateQueries({ queryKey: ["hr", "operations", "assignments", employeeId] });
  queryClient.invalidateQueries({ queryKey: ["hr", "operations", "role-requirements", employeeId] });
  queryClient.invalidateQueries({ queryKey: ["hr", "operations", "site-readiness", employeeId] });
  queryClient.invalidateQueries({ queryKey: ["hr", "operations", "blocks", employeeId] });
  queryClient.invalidateQueries({ queryKey: ["hr", "operations", "assets", employeeId] });
  queryClient.invalidateQueries({ queryKey: ["hr", "operations", "ppe", employeeId] });
  queryClient.invalidateQueries({ queryKey: ["hr", "operations", "accommodation", employeeId] });
  queryClient.invalidateQueries({ queryKey: ["hr", "operations", "summary", employeeId] });
  queryClient.invalidateQueries({ queryKey: ["hr", "operations", "readiness-summary", employeeId] });
}

export function invalidateHrEmployeeAssignments(queryClient: QueryClient, employeeId: number): void {
  queryClient.invalidateQueries({ queryKey: ["hr", "operations", "assignments", employeeId] });
  queryClient.invalidateQueries({ queryKey: ["hr", "operations", "summary", employeeId] });
}

export function invalidateHrGlobalAssignments(queryClient: QueryClient): void {
  queryClient.invalidateQueries({ queryKey: ["hr", "operations", "global-assignments"] });
}

export function invalidateHrEmployeeReadiness(queryClient: QueryClient, employeeId: number): void {
  queryClient.invalidateQueries({ queryKey: ["hr", "operations", "site-readiness", employeeId] });
  queryClient.invalidateQueries({ queryKey: ["hr", "operations", "readiness-summary", employeeId] });
}

export function invalidateHrGlobalReadiness(queryClient: QueryClient): void {
  queryClient.invalidateQueries({ queryKey: ["hr", "operations", "global-readiness"] });
}

export function invalidateHrEmployeeBlocks(queryClient: QueryClient, employeeId: number): void {
  queryClient.invalidateQueries({ queryKey: ["hr", "operations", "blocks", employeeId] });
  queryClient.invalidateQueries({ queryKey: ["hr", "operations", "readiness-summary", employeeId] });
}

export function invalidateHrGlobalBlocks(queryClient: QueryClient): void {
  queryClient.invalidateQueries({ queryKey: ["hr", "operations", "global-blocks"] });
}

export function invalidateHrEmployeeAssets(queryClient: QueryClient, employeeId: number): void {
  queryClient.invalidateQueries({ queryKey: ["hr", "operations", "assets", employeeId] });
  queryClient.invalidateQueries({ queryKey: ["hr", "operations", "summary", employeeId] });
}

export function invalidateHrEmployeePpe(queryClient: QueryClient, employeeId: number): void {
  queryClient.invalidateQueries({ queryKey: ["hr", "operations", "ppe", employeeId] });
  queryClient.invalidateQueries({ queryKey: ["hr", "operations", "summary", employeeId] });
}

export function invalidateHrEmployeeAccommodation(queryClient: QueryClient, employeeId: number): void {
  queryClient.invalidateQueries({ queryKey: ["hr", "operations", "accommodation", employeeId] });
  queryClient.invalidateQueries({ queryKey: ["hr", "operations", "summary", employeeId] });
}

// ── HR Actions (HR.7) ─────────────────────────────────────────────────────────

export function invalidateHrEmployeeActions(queryClient: QueryClient, employeeId: number): void {
  queryClient.invalidateQueries({ queryKey: ["hr", "actions", "summary", employeeId] });
  queryClient.invalidateQueries({ queryKey: ["hr", "employees", "overview", employeeId] });
}

export function invalidateHrEmployeeProProcesses(queryClient: QueryClient, employeeId: number): void {
  queryClient.invalidateQueries({ queryKey: ["hr", "actions", "pro-processes", employeeId] });
  queryClient.invalidateQueries({ queryKey: ["hr", "actions", "summary", employeeId] });
}

export function invalidateHrGlobalProProcesses(queryClient: QueryClient): void {
  queryClient.invalidateQueries({ queryKey: ["hr", "actions", "global-pro-processes"] });
}

export function invalidateHrEmployeeHrActions(queryClient: QueryClient, employeeId: number): void {
  queryClient.invalidateQueries({ queryKey: ["hr", "actions", "hr-actions", employeeId] });
  queryClient.invalidateQueries({ queryKey: ["hr", "actions", "summary", employeeId] });
}

export function invalidateHrEmployeePerformance(queryClient: QueryClient, employeeId: number): void {
  queryClient.invalidateQueries({ queryKey: ["hr", "actions", "performance", employeeId] });
  queryClient.invalidateQueries({ queryKey: ["hr", "actions", "summary", employeeId] });
}

export function invalidateHrEmployeeDisciplinary(queryClient: QueryClient, employeeId: number): void {
  queryClient.invalidateQueries({ queryKey: ["hr", "actions", "disciplinary", employeeId] });
  queryClient.invalidateQueries({ queryKey: ["hr", "actions", "summary", employeeId] });
}

export function invalidateHrGlobalDisciplinary(queryClient: QueryClient): void {
  queryClient.invalidateQueries({ queryKey: ["hr", "actions", "global-disciplinary"] });
}

export function invalidateHrEmployeeNotes(queryClient: QueryClient, employeeId: number): void {
  queryClient.invalidateQueries({ queryKey: ["hr", "actions", "notes", employeeId] });
}

export function invalidateHrEmployeeApprovals(queryClient: QueryClient, employeeId: number): void {
  queryClient.invalidateQueries({ queryKey: ["hr", "actions", "approvals", employeeId] });
  queryClient.invalidateQueries({ queryKey: ["hr", "actions", "summary", employeeId] });
}

export function invalidateHrGlobalApprovals(queryClient: QueryClient): void {
  queryClient.invalidateQueries({ queryKey: ["hr", "actions", "global-approvals"] });
}

export function invalidateHrEmployeeEos(queryClient: QueryClient, employeeId: number): void {
  queryClient.invalidateQueries({ queryKey: ["hr", "actions", "eos-cases", employeeId] });
  queryClient.invalidateQueries({ queryKey: ["hr", "actions", "summary", employeeId] });
}

export function invalidateHrGlobalEos(queryClient: QueryClient): void {
  queryClient.invalidateQueries({ queryKey: ["hr", "actions", "global-eos-cases"] });
}

export function invalidateHrEmployeeClearance(queryClient: QueryClient, eosCaseId: number, employeeId: number): void {
  queryClient.invalidateQueries({ queryKey: ["hr", "actions", "clearance-items", eosCaseId] });
  queryClient.invalidateQueries({ queryKey: ["hr", "actions", "eos-cases", employeeId] });
}

// ── HR Recruitment & Onboarding (HR.8) ──────────────────────────────────────

export function invalidateHrRecruitment(queryClient: QueryClient): void {
  queryClient.invalidateQueries({ queryKey: ["hr", "recruitment"] });
}

export function invalidateHrRequisitions(queryClient: QueryClient): void {
  queryClient.invalidateQueries({ queryKey: ["hr", "recruitment", "requisitions"] });
  queryClient.invalidateQueries({ queryKey: ["hr", "recruitment", "summary"] });
}

export function invalidateHrRequisition(queryClient: QueryClient, id: number): void {
  queryClient.invalidateQueries({ queryKey: ["hr", "recruitment", "requisition", id] });
  queryClient.invalidateQueries({ queryKey: ["hr", "recruitment", "requisitions"] });
}

export function invalidateHrCandidates(queryClient: QueryClient): void {
  queryClient.invalidateQueries({ queryKey: ["hr", "recruitment", "candidates"] });
  queryClient.invalidateQueries({ queryKey: ["hr", "recruitment", "pipeline-summary"] });
  queryClient.invalidateQueries({ queryKey: ["hr", "recruitment", "summary"] });
}

export function invalidateHrCandidate(queryClient: QueryClient, id: number): void {
  queryClient.invalidateQueries({ queryKey: ["hr", "recruitment", "candidate", id] });
  queryClient.invalidateQueries({ queryKey: ["hr", "recruitment", "candidates"] });
  queryClient.invalidateQueries({ queryKey: ["hr", "recruitment", "pipeline-summary"] });
}

export function invalidateHrCandidateDocuments(queryClient: QueryClient, candidateId: number): void {
  queryClient.invalidateQueries({ queryKey: ["hr", "recruitment", "candidate-documents", candidateId] });
}

export function invalidateHrCandidateInterviews(queryClient: QueryClient, candidateId: number): void {
  queryClient.invalidateQueries({ queryKey: ["hr", "recruitment", "candidate-interviews", candidateId] });
  queryClient.invalidateQueries({ queryKey: ["hr", "recruitment", "global-interviews"] });
}

export function invalidateHrGlobalInterviews(queryClient: QueryClient): void {
  queryClient.invalidateQueries({ queryKey: ["hr", "recruitment", "global-interviews"] });
}

export function invalidateHrCandidateOffers(queryClient: QueryClient, candidateId: number): void {
  queryClient.invalidateQueries({ queryKey: ["hr", "recruitment", "candidate-offers", candidateId] });
  queryClient.invalidateQueries({ queryKey: ["hr", "recruitment", "global-offers"] });
}

export function invalidateHrGlobalOffers(queryClient: QueryClient): void {
  queryClient.invalidateQueries({ queryKey: ["hr", "recruitment", "global-offers"] });
}

export function invalidateHrCandidateOnboarding(queryClient: QueryClient, candidateId: number): void {
  queryClient.invalidateQueries({ queryKey: ["hr", "recruitment", "candidate-onboarding", candidateId] });
  queryClient.invalidateQueries({ queryKey: ["hr", "recruitment", "global-onboarding"] });
}

export function invalidateHrEmployeeOnboarding(queryClient: QueryClient, employeeId: number): void {
  queryClient.invalidateQueries({ queryKey: ["hr", "recruitment", "employee-onboarding", employeeId] });
  queryClient.invalidateQueries({ queryKey: ["hr", "recruitment", "global-onboarding"] });
}

export function invalidateHrGlobalOnboarding(queryClient: QueryClient): void {
  queryClient.invalidateQueries({ queryKey: ["hr", "recruitment", "global-onboarding"] });
}

export function invalidateHrEmployeeRecruitmentLink(queryClient: QueryClient, employeeId: number): void {
  queryClient.invalidateQueries({ queryKey: ["hr", "recruitment", "employee-link", employeeId] });
  queryClient.invalidateQueries({ queryKey: ["hr", "recruitment", "candidates"] });
  queryClient.invalidateQueries({ queryKey: ["hr", "recruitment", "summary"] });
}

// ── HR Dashboard (HR.9) ────────────────────────────────────────────────────

/** Invalidate all HR dashboard caches. */
export function invalidateHrDashboard(queryClient: QueryClient): void {
  queryClient.invalidateQueries({ queryKey: ["hr", "dashboard"] });
}

/** Invalidate only the top KPI summary bar. */
export function invalidateHrDashboardSummary(queryClient: QueryClient): void {
  queryClient.invalidateQueries({ queryKey: ["hr", "dashboard", "summary"] });
}

/** Invalidate only the attention items list. */
export function invalidateHrDashboardAttention(queryClient: QueryClient): void {
  queryClient.invalidateQueries({ queryKey: ["hr", "dashboard", "attention-items"] });
}

// ── HR Search (HR.10) ──────────────────────────────────────────────────────

/** Invalidate all HR search results (e.g. after any HR data change). */
export function invalidateHrSearch(queryClient: QueryClient): void {
  queryClient.invalidateQueries({ queryKey: ["hr", "search"] });
}

/** Invalidate HR search suggestions cache only. */
export function invalidateHrSearchSuggestions(queryClient: QueryClient): void {
  queryClient.invalidateQueries({ queryKey: ["hr", "search", "suggestions"] });
}

// ── Global Report Center (REPORT.2) ─────────────────────────────────────────

/** Invalidate the full report registry list. */
export function invalidateReportsRegistry(queryClient: QueryClient): void {
  queryClient.invalidateQueries({ queryKey: ["reports", "registry"] });
}

/** Invalidate report templates cache. */
export function invalidateReportTemplates(queryClient: QueryClient): void {
  queryClient.invalidateQueries({ queryKey: ["reports", "templates"] });
}

/** Invalidate report branding profiles cache. */
export function invalidateReportBrandingProfiles(queryClient: QueryClient): void {
  queryClient.invalidateQueries({ queryKey: ["reports", "branding-profiles"] });
}

/** Invalidate a specific report run cache. */
export function invalidateReportRun(
  queryClient: QueryClient,
  runId: number
): void {
  queryClient.invalidateQueries({ queryKey: ["reports", "run", runId] });
}
