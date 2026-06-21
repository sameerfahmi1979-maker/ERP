/**
 * Stable TanStack Query key factories for all ERP master-data and lookup queries.
 * Phase 002F.3E.3B.6B — Global Lookup Cache and Hook Standard
 *
 * Rules:
 *  - Keys are arrays of serialisable primitives (no objects at the leaf)
 *  - Outer segments are broad (used for invalidation prefix matching)
 *  - Inner segments narrow the specific query variant
 *  - Undefined/null dependencies become null so keys remain stable
 */

export const queryKeys = {
  // ── Lookup engine ──────────────────────────────────────────────────────────
  lookup: {
    /** Active lookup values for a single category */
    values: (
      categoryCode: string,
      parentValueCode: string | null | undefined = null,
      includeInactive = false
    ) =>
      [
        "lookup",
        "values",
        categoryCode.toUpperCase(),
        parentValueCode ?? null,
        includeInactive,
      ] as const,

    /** Batch lookup: multiple categories in one round-trip */
    batch: (categoryCodes: string[], includeInactive = false) =>
      [
        "lookup",
        "batch",
        [...categoryCodes].map((c) => c.toUpperCase()).sort(),
        includeInactive,
      ] as const,
  },

  // ── Geography ──────────────────────────────────────────────────────────────
  countries: (gccOnly = false, includeInactive = false) =>
    ["master", "countries", gccOnly, includeInactive] as const,

  emirates: (countryId: number | null | undefined = null, includeInactive = false) =>
    ["master", "emirates", countryId ?? null, includeInactive] as const,

  cities: (emirateId: number | null | undefined = null, includeInactive = false) =>
    ["master", "cities", emirateId ?? null, includeInactive] as const,

  areas: (cityId: number | null | undefined = null, includeInactive = false) =>
    ["master", "areas", cityId ?? null, includeInactive] as const,

  ports: (
    emirateId: number | null | undefined = null,
    portTypeCode: string | null | undefined = null,
    includeInactive = false
  ) =>
    ["master", "ports", emirateId ?? null, portTypeCode ?? null, includeInactive] as const,

  // ── Finance basics ─────────────────────────────────────────────────────────
  currencies: (includeInactive = false) =>
    ["master", "currencies", includeInactive] as const,

  banks: (countryId: number | null | undefined = null, includeInactive = false) =>
    ["master", "banks", countryId ?? null, includeInactive] as const,

  paymentTerms: (includeInactive = false) =>
    ["master", "payment_terms", includeInactive] as const,

  taxTypes: (includeInactive = false) =>
    ["master", "tax_types", includeInactive] as const,

  // ── Unit of measure ────────────────────────────────────────────────────────
  uomCategories: (includeInactive = false) =>
    ["master", "uom_categories", includeInactive] as const,

  unitsOfMeasure: (
    categoryId: number | null | undefined = null,
    includeInactive = false
  ) => ["master", "units_of_measure", categoryId ?? null, includeInactive] as const,

  // ── Organisation structure ─────────────────────────────────────────────────
  ownerCompanies: (includeInactive = false) =>
    ["master", "owner_companies", includeInactive] as const,

  branches: (
    ownerCompanyId: number | null | undefined = null,
    includeInactive = false
  ) => ["master", "branches", ownerCompanyId ?? null, includeInactive] as const,

  // ── Finance cost/profit centres ────────────────────────────────────────────
  costCenters: (
    ownerCompanyId: number | null | undefined = null,
    includeInactive = false
  ) => ["master", "cost_centers", ownerCompanyId ?? null, includeInactive] as const,

  profitCenters: (
    ownerCompanyId: number | null | undefined = null,
    includeInactive = false
  ) => ["master", "profit_centers", ownerCompanyId ?? null, includeInactive] as const,

  // ── Child tables (Phase 3B.6G.1) ───────────────────────────────────────────
  // Convention: ["child", <child_table_name>, <parent_id>]
  // Outer "child" segment enables broad invalidation; table+parent narrows it.
  // Used by parent drawer child CRUD sections (contacts, addresses, banks, docs).
  child: {
    /** Generic child-table key. parentId null = not yet saved parent (Add mode). */
    table: (tableName: string, parentId: number | string | null | undefined) =>
      ["child", tableName, parentId ?? null] as const,

    // Customer child tables (reference implementation — 3B.6G.3 will consume)
    customerContacts: (customerId: number | null | undefined) =>
      ["child", "customer_contacts", customerId ?? null] as const,

    customerAddresses: (customerId: number | null | undefined) =>
      ["child", "customer_addresses", customerId ?? null] as const,

    customerBankDetails: (customerId: number | null | undefined) =>
      ["child", "customer_bank_details", customerId ?? null] as const,

    customerDocuments: (customerId: number | null | undefined) =>
      ["child", "customer_documents", customerId ?? null] as const,
  },

  // ── DMS Admin ─────────────────────────────────────────────────────────────
  dms: {
    adminOverview: () => ["dms", "admin", "overview"] as const,
    categories: () => ["dms", "admin", "categories"] as const,
    documentTypes: (filters?: Record<string, unknown>) =>
      filters ? (["dms", "admin", "document-types", filters] as const) : (["dms", "admin", "document-types"] as const),
    metadataDefinitions: (filters?: Record<string, unknown>) =>
      filters ? (["dms", "admin", "metadata-definitions", filters] as const) : (["dms", "admin", "metadata-definitions"] as const),
    tags: () => ["dms", "admin", "tags"] as const,
    retentionPolicies: () => ["dms", "admin", "retention-policies"] as const,

    // DMS.4 — Document repository
    documents: (filters?: Record<string, unknown>) =>
      filters ? (["dms", "documents", filters] as const) : (["dms", "documents"] as const),
    document: (id: number) => ["dms", "documents", id] as const,
    documentRecord: (id: number) => ["dms", "documents", id, "record"] as const,
    documentMetadata: (id: number) => ["dms", "documents", id, "metadata"] as const,
    documentMetadataDefs: (typeId: number) => ["dms", "metadata-defs", typeId] as const,
    documentLinks: (id: number) => ["dms", "documents", id, "links"] as const,
    documentTags: (id: number) => ["dms", "documents", id, "tags"] as const,
    documentComments: (id: number) => ["dms", "documents", id, "comments"] as const,
    documentEvents: (id: number) => ["dms", "documents", id, "events"] as const,
    newDocumentDefaults: () => ["dms", "new-document-defaults"] as const,

    // DMS.5 — Upload Inbox + File Storage
    uploadSessions: (filters?: Record<string, unknown>) =>
      filters ? (["dms", "upload-sessions", filters] as const) : (["dms", "upload-sessions"] as const),
    uploadSession: (id: number) => ["dms", "upload-sessions", id] as const,

    // DMS 13 — Multi-File Batch Upload → Draft Intake Queue
    uploadBatch: (batchCode: string) => ["dms", "upload-batch", batchCode] as const,
    uploadBatchDrafts: (batchId: number) => ["dms", "upload-batch", batchId, "drafts"] as const,
    batchUploadProgress: (batchId: number) => ["dms", "upload-batch", batchId, "progress"] as const,
    documentFiles: (documentId: number) => ["dms", "documents", documentId, "files"] as const,
    documentVersions: (documentId: number) => ["dms", "documents", documentId, "versions"] as const,

    // DMS AI ORCH.1 — Orchestration status
    orchestrationStatus: (sessionCode: string) =>
      ["dms", "orchestration-status", sessionCode] as const,
    batchOrchestration: (batchCode: string) =>
      ["dms", "batch-orchestration", batchCode] as const,

    // COMMON AI.2 — Document Understanding Center
    documentUnderstanding: (documentId: number) =>
      ["dms", "documents", documentId, "understanding"] as const,

    // DMS.6 / DMS.15 — Entity links + Party integration + Integration Readiness
    entityDocuments: (entityType: string, entityId: number) =>
      ["dms", "entity-documents", entityType, entityId] as const,
    entityDocumentCompliance: (entityType: string, entityId: number) =>
      ["dms", "entity-document-compliance", entityType, entityId] as const,
    attachableDocuments: (entityType: string, entityId: number, search?: string) =>
      ["dms", "attachable-documents", entityType, entityId, search ?? ""] as const,
    partyDmsDocuments: (partyId: number) => ["dms", "entity-documents", "party", partyId] as const,
    availableForLink: (filters?: Record<string, unknown>) =>
      filters
        ? (["dms", "available-for-link", filters] as const)
        : (["dms", "available-for-link"] as const),

    // DMS 12.1 — Content Text
    documentContent: (documentId: number) => ["dms", "documents", documentId, "content"] as const,

    // DMS 12.2 — AI Summary
    documentAiSummary: (documentId: number) => ["dms", "documents", documentId, "ai-summary"] as const,

    // DMS 12.5 — Semantic Search / Embeddings
    documentEmbedding: (documentId: number) => ["dms", "documents", documentId, "embedding"] as const,

    // DMS 12.3 — Intelligence (completeness + risk)
    documentIntelligence: (documentId: number, aspect?: "completeness" | "risk") =>
      aspect
        ? (["dms", "documents", documentId, "intelligence", aspect] as const)
        : (["dms", "documents", documentId, "intelligence"] as const),

    // DMS 12.4 — AI Search, Ask AI, Tag/Link Suggestions
    aiSearch: (questionOrHash: string) => ["dms", "ai-search", questionOrHash] as const,
    documentQa: (documentId: number) => ["dms", "documents", documentId, "qa"] as const,
    documentTagSuggestions: (documentId: number) =>
      ["dms", "documents", documentId, "tag-suggestions"] as const,
    documentLinkSuggestions: (documentId: number) =>
      ["dms", "documents", documentId, "link-suggestions"] as const,

    // DMS.10 — AI Analysis
    documentAiStatus: (documentId: number) => ["dms", "documents", documentId, "ai-status"] as const,
    documentAiResults: (documentId: number) => ["dms", "documents", documentId, "ai-results"] as const,
    aiResult: (resultId: number) => ["dms", "ai-results", resultId] as const,

    // DMS.9 — OCR Pipeline
    documentOcrStatus: (documentId: number) => ["dms", "documents", documentId, "ocr-status"] as const,
    fileOcrText: (fileId: number) => ["dms", "files", fileId, "ocr-text"] as const,
    documentOcrText: (documentId: number) => ["dms", "documents", documentId, "ocr-text"] as const,
    ocrJobs: (filters?: Record<string, unknown>) =>
      filters ? (["dms", "ocr-jobs", filters] as const) : (["dms", "ocr-jobs"] as const),

    // DMS.8 — Expiry, Renewals, Notifications
    expiryDashboardStats: () => ["dms", "expiry", "stats"] as const,
    expiringDocuments: (filters?: Record<string, unknown>) =>
      filters ? (["dms", "expiry", "documents", filters] as const) : (["dms", "expiry", "documents"] as const),
    expiryReminders: (filters?: Record<string, unknown>) =>
      filters ? (["dms", "expiry", "reminders", filters] as const) : (["dms", "expiry", "reminders"] as const),
    documentExpiryReminders: (documentId: number) => ["dms", "expiry", "reminders", "doc", documentId] as const,
    renewalRequests: (filters?: Record<string, unknown>) =>
      filters ? (["dms", "renewals", filters] as const) : (["dms", "renewals"] as const),
    documentRenewals: (documentId: number) => ["dms", "renewals", "doc", documentId] as const,
    notifications: (filters?: Record<string, unknown>) =>
      filters ? (["dms", "notifications", filters] as const) : (["dms", "notifications"] as const),
    notificationsUnreadCount: () => ["dms", "notifications", "unread-count"] as const,
  },

  // ── Party DMS Documents ───────────────────────────────────────────────────
  party: {
    dmsDocuments: (partyId: number) => ["party", "dms-documents", partyId] as const,
  },

  // ── Common Master Data (COMMON MD.1) ─────────────────────────────────────
  commonMd: {
    departments: (filters?: Record<string, unknown>) =>
      filters ? (["common_md", "departments", filters] as const) : (["common_md", "departments"] as const),
    department: (id: number) => ["common_md", "departments", id] as const,

    designations: (filters?: Record<string, unknown>) =>
      filters ? (["common_md", "designations", filters] as const) : (["common_md", "designations"] as const),
    designation: (id: number) => ["common_md", "designations", id] as const,

    workSites: (filters?: Record<string, unknown>) =>
      filters ? (["common_md", "work_sites", filters] as const) : (["common_md", "work_sites"] as const),
    workSite: (id: number) => ["common_md", "work_sites", id] as const,

    workCalendars: (filters?: Record<string, unknown>) =>
      filters ? (["common_md", "work_calendars", filters] as const) : (["common_md", "work_calendars"] as const),
    workCalendar: (id: number) => ["common_md", "work_calendars", id] as const,
    workShifts: (calendarId: number) => ["common_md", "work_shifts", calendarId] as const,

    approvalRoles: (filters?: Record<string, unknown>) =>
      filters ? (["common_md", "approval_roles", filters] as const) : (["common_md", "approval_roles"] as const),
    approvalRole: (id: number) => ["common_md", "approval_roles", id] as const,

    dmsRequiredDocumentRules: (filters?: Record<string, unknown>) =>
      filters ? (["common_md", "dms_required_document_rules", filters] as const) : (["common_md", "dms_required_document_rules"] as const),
    dmsRequiredDocumentRule: (id: number) => ["common_md", "dms_required_document_rules", id] as const,

    companySignatories: (companyId: number) => ["common_md", "company_signatories", companyId] as const,
  },

  // ── Common AI Field Suggestions (COMMON AI.1B) ────────────────────────────
  ai: {
    /** Pending + all suggestions for an entity. */
    fieldSuggestions: (
      entityType: string,
      entityId: number,
      status?: string
    ) =>
      status
        ? (["ai", "field-suggestions", entityType, entityId, status] as const)
        : (["ai", "field-suggestions", entityType, entityId] as const),

    /** AI generation status for an entity (future — Phase 1D+). */
    recordAiStatus: (entityType: string, entityId: number) =>
      ["ai", "record-status", entityType, entityId] as const,

    /** Duplicate/conflict candidates list (COMMON AI.3). */
    duplicateCandidates: (filters?: Record<string, unknown>) =>
      filters
        ? (["ai", "duplicate-candidates", filters] as const)
        : (["ai", "duplicate-candidates"] as const),

    duplicateCandidateDetail: (candidateId: number) =>
      ["ai", "duplicate-candidate", candidateId] as const,

    duplicateCandidateCounts: (entityType: string, entityId: number) =>
      ["ai", "duplicate-counts", entityType, entityId] as const,

    duplicateCandidateDocumentCount: (documentId: number) =>
      ["ai", "duplicate-doc-count", documentId] as const,

    /** Compliance findings list (COMMON AI.4). */
    complianceFindings: (filters?: Record<string, unknown>) =>
      filters
        ? (["ai", "compliance-findings", filters] as const)
        : (["ai", "compliance-findings"] as const),

    complianceFindingDetail: (findingId: number) =>
      ["ai", "compliance-finding", findingId] as const,

    complianceFindingCounts: (entityType: string, entityId: number) =>
      ["ai", "compliance-counts", entityType, entityId] as const,

    complianceFindingDocumentCount: (documentId: number) =>
      ["ai", "compliance-doc-count", documentId] as const,

    /** Risk scores list (COMMON AI.5). */
    riskScores: (filters?: Record<string, unknown>) =>
      filters
        ? (["ai", "risk-scores", filters] as const)
        : (["ai", "risk-scores"] as const),

    riskScoreDetail: (scoreId: number) => ["ai", "risk-score", scoreId] as const,

    riskScoreForEntity: (entityType: string, entityId: number) =>
      ["ai", "risk-score-entity", entityType, entityId] as const,

    riskScoreForDocument: (documentId: number) =>
      ["ai", "risk-score-document", documentId] as const,

    riskScoreCountForEntity: (entityType: string, entityId: number) =>
      ["ai", "risk-score-count", entityType, entityId] as const,

    /** Search results (COMMON AI.6). */
    search: (input?: Record<string, unknown>) =>
      input ? (["ai", "search", input] as const) : (["ai", "search"] as const),

    searchSuggestions: (query: string) =>
      ["ai", "search-suggestions", query] as const,

    recentSearches: () => ["ai", "recent-searches"] as const,

    /** Assistant sessions (COMMON AI.7). */
    assistantSessions: () => ["ai", "assistant-sessions"] as const,

    assistantSession: (sessionId: number) =>
      ["ai", "assistant-session", sessionId] as const,

    assistantDrafts: (sessionId: number) =>
      ["ai", "assistant-drafts", sessionId] as const,

    /** Daily dashboard (COMMON AI.13). */
    dailyDashboard: (scope: string) =>
      ["ai", "daily-dashboard", scope] as const,

    dailyDashboardSection: (sectionCode: string, scope: string) =>
      ["ai", "daily-dashboard-section", sectionCode, scope] as const,

    /** Audit Trail Explainer (COMMON AI.14). */
    auditExplainerOverview: (scope: string) =>
      ["ai", "audit-explainer-overview", scope] as const,

    auditTimeline: (filters?: Record<string, unknown>) =>
      filters ? (["ai", "audit-timeline", filters] as const) : (["ai", "audit-timeline"] as const),

    auditExplanation: (sourceType: string, sourceId: number) =>
      ["ai", "audit-explanation", sourceType, sourceId] as const,

    auditExplanationHistory: (filters?: Record<string, unknown>) =>
      filters
        ? (["ai", "audit-explanation-history", filters] as const)
        : (["ai", "audit-explanation-history"] as const),

    /** Data Quality Monitor (COMMON AI.15). */
    dataQualitySummary: (filters?: Record<string, unknown>) =>
      filters
        ? (["ai", "data-quality-summary", filters] as const)
        : (["ai", "data-quality-summary"] as const),

    dataQualityFindings: (filters?: Record<string, unknown>) =>
      filters
        ? (["ai", "data-quality-findings", filters] as const)
        : (["ai", "data-quality-findings"] as const),

    dataQualityFinding: (id: number) =>
      ["ai", "data-quality-finding", id] as const,

    dataQualityFindingEvents: (id: number) =>
      ["ai", "data-quality-finding-events", id] as const,
  },

  // ── HR Settings (HR.1) + HR Employees (HR.2) + HR Compliance (HR.3) + HR Time (HR.4) ──
  hr: {
    // ── HR Time (HR.4) ───────────────────────────────────────────────────
    time: {
      attendancePunches: (employeeId: number, params?: Record<string, unknown>) =>
        params
          ? (["hr", "time", "attendance-punches", employeeId, params] as const)
          : (["hr", "time", "attendance-punches", employeeId] as const),
      attendanceSummary: (employeeId: number, params?: Record<string, unknown>) =>
        params
          ? (["hr", "time", "attendance-summary", employeeId, params] as const)
          : (["hr", "time", "attendance-summary", employeeId] as const),
      dailyAttendance: (params?: Record<string, unknown>) =>
        params
          ? (["hr", "time", "daily-attendance", params] as const)
          : (["hr", "time", "daily-attendance"] as const),
      attendanceCorrections: (summaryId: number) =>
        ["hr", "time", "attendance-corrections", summaryId] as const,
      shiftAssignments: (employeeId: number) =>
        ["hr", "time", "shift-assignments", employeeId] as const,
      globalShiftAssignments: (params?: Record<string, unknown>) =>
        params
          ? (["hr", "time", "global-shift-assignments", params] as const)
          : (["hr", "time", "global-shift-assignments"] as const),
      leaveRequests: (employeeId: number, params?: Record<string, unknown>) =>
        params
          ? (["hr", "time", "leave-requests", employeeId, params] as const)
          : (["hr", "time", "leave-requests", employeeId] as const),
      globalLeaveRequests: (params?: Record<string, unknown>) =>
        params
          ? (["hr", "time", "global-leave-requests", params] as const)
          : (["hr", "time", "global-leave-requests"] as const),
      leaveBalances: (employeeId: number, year?: number) =>
        year
          ? (["hr", "time", "leave-balances", employeeId, year] as const)
          : (["hr", "time", "leave-balances", employeeId] as const),
      activeLeaveTypes: () => ["hr", "time", "active-leave-types"] as const,
      overtimeRecords: (employeeId: number, params?: Record<string, unknown>) =>
        params
          ? (["hr", "time", "overtime-records", employeeId, params] as const)
          : (["hr", "time", "overtime-records", employeeId] as const),
      summary: (employeeId: number) =>
        ["hr", "time", "summary", employeeId] as const,
    },

    // ── HR Payroll & WPS (HR.5) ──────────────────────────────────────────
    payroll: {
      profile: (employeeId: number) =>
        ["hr", "payroll", "profile", employeeId] as const,
      salaryComponents: (employeeId: number) =>
        ["hr", "payroll", "salary-components", employeeId] as const,
      salaryRevisions: (employeeId: number) =>
        ["hr", "payroll", "salary-revisions", employeeId] as const,
      holds: (employeeId: number) =>
        ["hr", "payroll", "holds", employeeId] as const,
      wpsProfile: (employeeId: number) =>
        ["hr", "payroll", "wps-profile", employeeId] as const,
      wpsReadiness: (employeeId: number) =>
        ["hr", "payroll", "wps-readiness", employeeId] as const,
      globalSalaryProfiles: (params?: Record<string, unknown>) =>
        params
          ? (["hr", "payroll", "global-salary-profiles", params] as const)
          : (["hr", "payroll", "global-salary-profiles"] as const),
      globalWpsReadiness: (params?: Record<string, unknown>) =>
        params
          ? (["hr", "payroll", "global-wps-readiness", params] as const)
          : (["hr", "payroll", "global-wps-readiness"] as const),
      summary: (employeeId: number) =>
        ["hr", "payroll", "summary", employeeId] as const,
    },

    // ── HR Actions (HR.7) ────────────────────────────────────────────────
    actions: {
      proProcesses: (employeeId: number, params?: Record<string, unknown>) =>
        params
          ? (["hr", "actions", "pro-processes", employeeId, params] as const)
          : (["hr", "actions", "pro-processes", employeeId] as const),
      globalProProcesses: (params?: Record<string, unknown>) =>
        params
          ? (["hr", "actions", "global-pro-processes", params] as const)
          : (["hr", "actions", "global-pro-processes"] as const),
      hrActions: (employeeId: number, params?: Record<string, unknown>) =>
        params
          ? (["hr", "actions", "hr-actions", employeeId, params] as const)
          : (["hr", "actions", "hr-actions", employeeId] as const),
      globalHrActions: (params?: Record<string, unknown>) =>
        params
          ? (["hr", "actions", "global-hr-actions", params] as const)
          : (["hr", "actions", "global-hr-actions"] as const),
      performance: (employeeId: number, params?: Record<string, unknown>) =>
        params
          ? (["hr", "actions", "performance", employeeId, params] as const)
          : (["hr", "actions", "performance", employeeId] as const),
      disciplinary: (employeeId: number, params?: Record<string, unknown>) =>
        params
          ? (["hr", "actions", "disciplinary", employeeId, params] as const)
          : (["hr", "actions", "disciplinary", employeeId] as const),
      globalDisciplinary: (params?: Record<string, unknown>) =>
        params
          ? (["hr", "actions", "global-disciplinary", params] as const)
          : (["hr", "actions", "global-disciplinary"] as const),
      notes: (employeeId: number, params?: Record<string, unknown>) =>
        params
          ? (["hr", "actions", "notes", employeeId, params] as const)
          : (["hr", "actions", "notes", employeeId] as const),
      approvals: (employeeId: number, params?: Record<string, unknown>) =>
        params
          ? (["hr", "actions", "approvals", employeeId, params] as const)
          : (["hr", "actions", "approvals", employeeId] as const),
      globalApprovals: (params?: Record<string, unknown>) =>
        params
          ? (["hr", "actions", "global-approvals", params] as const)
          : (["hr", "actions", "global-approvals"] as const),
      eosCases: (employeeId: number, params?: Record<string, unknown>) =>
        params
          ? (["hr", "actions", "eos-cases", employeeId, params] as const)
          : (["hr", "actions", "eos-cases", employeeId] as const),
      globalEosCases: (params?: Record<string, unknown>) =>
        params
          ? (["hr", "actions", "global-eos-cases", params] as const)
          : (["hr", "actions", "global-eos-cases"] as const),
      clearanceItems: (eosCaseId: number) =>
        ["hr", "actions", "clearance-items", eosCaseId] as const,
      summary: (employeeId: number) =>
        ["hr", "actions", "summary", employeeId] as const,
    },

    // ── HR Operations & Readiness (HR.6) ────────────────────────────────
    operations: {
      assignments: (employeeId: number, params?: Record<string, unknown>) =>
        params
          ? (["hr", "operations", "assignments", employeeId, params] as const)
          : (["hr", "operations", "assignments", employeeId] as const),
      globalAssignments: (params?: Record<string, unknown>) =>
        params
          ? (["hr", "operations", "global-assignments", params] as const)
          : (["hr", "operations", "global-assignments"] as const),
      roleRequirements: (employeeId: number, params?: Record<string, unknown>) =>
        params
          ? (["hr", "operations", "role-requirements", employeeId, params] as const)
          : (["hr", "operations", "role-requirements", employeeId] as const),
      siteReadiness: (employeeId: number) =>
        ["hr", "operations", "site-readiness", employeeId] as const,
      globalReadiness: (params?: Record<string, unknown>) =>
        params
          ? (["hr", "operations", "global-readiness", params] as const)
          : (["hr", "operations", "global-readiness"] as const),
      blocks: (employeeId: number, params?: Record<string, unknown>) =>
        params
          ? (["hr", "operations", "blocks", employeeId, params] as const)
          : (["hr", "operations", "blocks", employeeId] as const),
      globalBlocks: (params?: Record<string, unknown>) =>
        params
          ? (["hr", "operations", "global-blocks", params] as const)
          : (["hr", "operations", "global-blocks"] as const),
      assets: (employeeId: number, params?: Record<string, unknown>) =>
        params
          ? (["hr", "operations", "assets", employeeId, params] as const)
          : (["hr", "operations", "assets", employeeId] as const),
      ppe: (employeeId: number, params?: Record<string, unknown>) =>
        params
          ? (["hr", "operations", "ppe", employeeId, params] as const)
          : (["hr", "operations", "ppe", employeeId] as const),
      accommodation: (employeeId: number, params?: Record<string, unknown>) =>
        params
          ? (["hr", "operations", "accommodation", employeeId, params] as const)
          : (["hr", "operations", "accommodation", employeeId] as const),
      summary: (employeeId: number) =>
        ["hr", "operations", "summary", employeeId] as const,
      readinessSummary: (employeeId: number) =>
        ["hr", "operations", "readiness-summary", employeeId] as const,
    },

    // ── HR Compliance (HR.3) ─────────────────────────────────────────────
    compliance: {
      identityDocuments: (employeeId: number) =>
        ["hr", "compliance", "identity-documents", employeeId] as const,
      medicalInsurances: (employeeId: number) =>
        ["hr", "compliance", "medical-insurances", employeeId] as const,
      dependents: (employeeId: number) =>
        ["hr", "compliance", "dependents", employeeId] as const,
      accessCards: (employeeId: number) =>
        ["hr", "compliance", "access-cards", employeeId] as const,
      trainingCertificates: (employeeId: number) =>
        ["hr", "compliance", "training-certificates", employeeId] as const,
      medicalRecords: (employeeId: number) =>
        ["hr", "compliance", "medical-records", employeeId] as const,
      summary: (employeeId: number) =>
        ["hr", "compliance", "summary", employeeId] as const,
      alerts: (employeeId: number) =>
        ["hr", "compliance", "alerts", employeeId] as const,
    },

    // ── HR Employees (HR.2) ──────────────────────────────────────────────
    employees: {
      list: (p?: Record<string, unknown>) =>
        p ? (["hr", "employees", "list", p] as const) : (["hr", "employees", "list"] as const),
      detail: (id: number) =>
        ["hr", "employees", "detail", id] as const,
      overview: (id: number) =>
        ["hr", "employees", "overview", id] as const,
      statusHistory: (id: number) =>
        ["hr", "employees", "status-history", id] as const,
    },
    employeeCategories: (p?: Record<string, unknown>) =>
      p ? (["hr", "settings", "employee-categories", p] as const) : (["hr", "settings", "employee-categories"] as const),
    employmentTypes: (p?: Record<string, unknown>) =>
      p ? (["hr", "settings", "employment-types", p] as const) : (["hr", "settings", "employment-types"] as const),
    grades: (p?: Record<string, unknown>) =>
      p ? (["hr", "settings", "grades", p] as const) : (["hr", "settings", "grades"] as const),
    identityDocumentTypes: (p?: Record<string, unknown>) =>
      p ? (["hr", "settings", "identity-document-types", p] as const) : (["hr", "settings", "identity-document-types"] as const),
    accessCardTypes: (p?: Record<string, unknown>) =>
      p ? (["hr", "settings", "access-card-types", p] as const) : (["hr", "settings", "access-card-types"] as const),
    trainingCategories: (p?: Record<string, unknown>) =>
      p ? (["hr", "settings", "training-categories", p] as const) : (["hr", "settings", "training-categories"] as const),
    trainingTypes: (p?: Record<string, unknown>) =>
      p ? (["hr", "settings", "training-types", p] as const) : (["hr", "settings", "training-types"] as const),
    medicalRecordTypes: (p?: Record<string, unknown>) =>
      p ? (["hr", "settings", "medical-record-types", p] as const) : (["hr", "settings", "medical-record-types"] as const),
    leaveTypes: (p?: Record<string, unknown>) =>
      p ? (["hr", "settings", "leave-types", p] as const) : (["hr", "settings", "leave-types"] as const),
    relationshipTypes: (p?: Record<string, unknown>) =>
      p ? (["hr", "settings", "relationship-types", p] as const) : (["hr", "settings", "relationship-types"] as const),
    salaryComponentTypes: (p?: Record<string, unknown>) =>
      p ? (["hr", "settings", "salary-component-types", p] as const) : (["hr", "settings", "salary-component-types"] as const),
    payrollGroups: (p?: Record<string, unknown>) =>
      p ? (["hr", "settings", "payroll-groups", p] as const) : (["hr", "settings", "payroll-groups"] as const),
    mohreEstablishments: (p?: Record<string, unknown>) =>
      p ? (["hr", "settings", "mohre-establishments", p] as const) : (["hr", "settings", "mohre-establishments"] as const),
    proProcessTypes: (p?: Record<string, unknown>) =>
      p ? (["hr", "settings", "pro-process-types", p] as const) : (["hr", "settings", "pro-process-types"] as const),
    readinessRuleTemplates: (p?: Record<string, unknown>) =>
      p ? (["hr", "settings", "readiness-rule-templates", p] as const) : (["hr", "settings", "readiness-rule-templates"] as const),
    roleRequirementMatrix: (p?: Record<string, unknown>) =>
      p ? (["hr", "settings", "role-requirement-matrix", p] as const) : (["hr", "settings", "role-requirement-matrix"] as const),
    siteRequirementMatrix: (p?: Record<string, unknown>) =>
      p ? (["hr", "settings", "site-requirement-matrix", p] as const) : (["hr", "settings", "site-requirement-matrix"] as const),
    approvalWorkflows: (p?: Record<string, unknown>) =>
      p ? (["hr", "settings", "approval-workflows", p] as const) : (["hr", "settings", "approval-workflows"] as const),

    // ── HR Dashboard (HR.9) ──────────────────────────────────────────────
    dashboard: {
      summary: (p?: Record<string, unknown>) =>
        p ? (["hr", "dashboard", "summary", p] as const) : (["hr", "dashboard", "summary"] as const),
      employeeOverview: (p?: Record<string, unknown>) =>
        p ? (["hr", "dashboard", "employee-overview", p] as const) : (["hr", "dashboard", "employee-overview"] as const),
      complianceOverview: (p?: Record<string, unknown>) =>
        p ? (["hr", "dashboard", "compliance-overview", p] as const) : (["hr", "dashboard", "compliance-overview"] as const),
      timeOverview: (p?: Record<string, unknown>) =>
        p ? (["hr", "dashboard", "time-overview", p] as const) : (["hr", "dashboard", "time-overview"] as const),
      payrollOverview: (p?: Record<string, unknown>) =>
        p ? (["hr", "dashboard", "payroll-overview", p] as const) : (["hr", "dashboard", "payroll-overview"] as const),
      operationsOverview: (p?: Record<string, unknown>) =>
        p ? (["hr", "dashboard", "operations-overview", p] as const) : (["hr", "dashboard", "operations-overview"] as const),
      actionsOverview: (p?: Record<string, unknown>) =>
        p ? (["hr", "dashboard", "actions-overview", p] as const) : (["hr", "dashboard", "actions-overview"] as const),
      recruitmentOverview: (p?: Record<string, unknown>) =>
        p ? (["hr", "dashboard", "recruitment-overview", p] as const) : (["hr", "dashboard", "recruitment-overview"] as const),
      attentionItems: (p?: Record<string, unknown>) =>
        p ? (["hr", "dashboard", "attention-items", p] as const) : (["hr", "dashboard", "attention-items"] as const),
    },
  },

  // ── HR Recruitment & Onboarding (HR.8) ───────────────────────────────────
  recruitment: {
    requisitions: (p?: Record<string, unknown>) =>
      p ? (["hr", "recruitment", "requisitions", p] as const) : (["hr", "recruitment", "requisitions"] as const),
    requisition: (id: number) =>
      ["hr", "recruitment", "requisition", id] as const,
    candidates: (p?: Record<string, unknown>) =>
      p ? (["hr", "recruitment", "candidates", p] as const) : (["hr", "recruitment", "candidates"] as const),
    candidate: (id: number) =>
      ["hr", "recruitment", "candidate", id] as const,
    candidateDocuments: (candidateId: number) =>
      ["hr", "recruitment", "candidate-documents", candidateId] as const,
    candidateInterviews: (candidateId: number) =>
      ["hr", "recruitment", "candidate-interviews", candidateId] as const,
    globalInterviews: (p?: Record<string, unknown>) =>
      p ? (["hr", "recruitment", "global-interviews", p] as const) : (["hr", "recruitment", "global-interviews"] as const),
    candidateOffers: (candidateId: number) =>
      ["hr", "recruitment", "candidate-offers", candidateId] as const,
    globalOffers: (p?: Record<string, unknown>) =>
      p ? (["hr", "recruitment", "global-offers", p] as const) : (["hr", "recruitment", "global-offers"] as const),
    candidateOnboarding: (candidateId: number) =>
      ["hr", "recruitment", "candidate-onboarding", candidateId] as const,
    employeeOnboarding: (employeeId: number) =>
      ["hr", "recruitment", "employee-onboarding", employeeId] as const,
    globalOnboarding: (p?: Record<string, unknown>) =>
      p ? (["hr", "recruitment", "global-onboarding", p] as const) : (["hr", "recruitment", "global-onboarding"] as const),
    pipelineSummary: (p?: Record<string, unknown>) =>
      p ? (["hr", "recruitment", "pipeline-summary", p] as const) : (["hr", "recruitment", "pipeline-summary"] as const),
    summary: (p?: Record<string, unknown>) =>
      p ? (["hr", "recruitment", "summary", p] as const) : (["hr", "recruitment", "summary"] as const),
    employeeRecruitmentLink: (employeeId: number) =>
      ["hr", "recruitment", "employee-link", employeeId] as const,
  },

  // ── HR Search (HR.10) ────────────────────────────────────────────────────
  search: {
    results: (input?: Record<string, unknown>) =>
      input ? (["hr", "search", "results", input] as const) : (["hr", "search", "results"] as const),
    suggestions: (prefix?: string) =>
      prefix ? (["hr", "search", "suggestions", prefix] as const) : (["hr", "search", "suggestions"] as const),
    categories: () => ["hr", "search", "categories"] as const,
  },

  // ── Global Report Center (REPORT.2) ─────────────────────────────────────
  reports: {
    registry: (p?: Record<string, unknown>) =>
      p ? (["reports", "registry", p] as const) : (["reports", "registry"] as const),
    registryDetail: (reportCode: string) =>
      ["reports", "registry", "detail", reportCode] as const,
    templates: (p?: Record<string, unknown>) =>
      p ? (["reports", "templates", p] as const) : (["reports", "templates"] as const),
    brandingProfiles: (p?: Record<string, unknown>) =>
      p ? (["reports", "branding-profiles", p] as const) : (["reports", "branding-profiles"] as const),
    run: (runId: number) =>
      ["reports", "run", runId] as const,
  },

  // ── Global ERP Notifications (NOTIFICATIONS.1) ────────────────────────────
  notifications: {
    my: (filters?: Record<string, unknown>) =>
      filters ? (["notifications", "my", filters] as const) : (["notifications", "my"] as const),
    unreadCount: () => ["notifications", "unread-count"] as const,
    all: (filters?: Record<string, unknown>) =>
      filters ? (["notifications", "all", filters] as const) : (["notifications", "all"] as const),
    emailQueue: (filters?: Record<string, unknown>) =>
      filters ? (["notifications", "email-queue", filters] as const) : (["notifications", "email-queue"] as const),
    templates: (filters?: Record<string, unknown>) =>
      filters ? (["notifications", "templates", filters] as const) : (["notifications", "templates"] as const),
    deliveryLogs: (filters?: Record<string, unknown>) =>
      filters ? (["notifications", "delivery-logs", filters] as const) : (["notifications", "delivery-logs"] as const),
  },
};
