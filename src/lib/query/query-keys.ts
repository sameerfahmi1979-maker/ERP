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
