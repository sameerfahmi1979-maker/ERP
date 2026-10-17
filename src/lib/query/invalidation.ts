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

import { notifyManager, type QueryClient } from "@tanstack/react-query";
import {COMPLIANCE_KINDS, type ComplianceKind} from "@/lib/reads/hr-compliance-records-schema";
import {TIME_RECORD_KINDS, type TimeRecordKind} from "@/lib/reads/hr-time-records-schema";
import type {HrSearchCategory} from "@/lib/hr/search/types";
import {REPORT_CRITERION_KEYS, type ReportCriterionKey} from "@/lib/reads/report-criteria-schema";

function captureRefresh(work: () => Promise<unknown>): Promise<unknown> {
  try {return Promise.resolve(work());} catch (error) {return Promise.reject(error);}
}
async function settleRefreshes(work: readonly Promise<unknown>[]): Promise<void> {
  // Observe every operation immediately and finish the whole refresh before
  // reporting failure. A committed mutation must never be replayed to retry it.
  const results = await Promise.allSettled(work);
  const failed = results.find(result => result.status === "rejected");
  if (failed?.status === "rejected") throw failed.reason;
}
type ReportCriterionRefresh = {
  fields: Set<ReportCriterionKey>; work: Promise<unknown>[]; verify: boolean;
  backgroundObserved: boolean;
  completion: Promise<void>; resolve: () => void; reject: (reason: unknown) => void;
};
const pendingReportCriterionRefresh = new WeakMap<QueryClient, ReportCriterionRefresh>();
function reportRefreshCompletion(pending: ReportCriterionRefresh, verify: boolean): Promise<void> | void {
  if (verify) return pending.completion;
  // Background invalidators have no checked workflow to receive a rejection.
  // Observe it once, without logging backend details or altering the original
  // rejecting promise used by a coalesced checked save/archive workflow.
  if (!pending.backgroundObserved) {
    pending.backgroundObserved = true;
    void pending.completion.catch(() => {console.warn("Report choices could not refresh. Reload before continuing.");});
  }
}
/** Confirmed writes retire matching choice pages and selected values, including
 * in-flight observerless requests. Only active authorized owners refetch. */
function invalidateReportCriterionReads(queryClient: QueryClient, keys: readonly ReportCriterionKey[], verify: true): Promise<void>;
function invalidateReportCriterionReads(queryClient: QueryClient, keys: readonly ReportCriterionKey[], verify?: false): void;
function invalidateReportCriterionReads(queryClient: QueryClient, keys: readonly ReportCriterionKey[], verify = false): Promise<void> | void {
  const family = (fields: ReadonlySet<ReportCriterionKey>) => ({queryKey: ["reports", "criteria"],
    predicate: (query: {queryKey: readonly unknown[]}) => fields.has(query.queryKey[4] as ReportCriterionKey)});
  const marked = captureRefresh(() => queryClient.invalidateQueries({...family(new Set(keys)), refetchType: "none"}));
  const queued = pendingReportCriterionRefresh.get(queryClient);
  if (queued) {
    for (const key of keys) queued.fields.add(key);
    queued.work.push(marked);queued.verify ||= verify;
    return reportRefreshCompletion(queued, verify);
  }
  let resolve!: () => void, reject!: (reason: unknown) => void;
  const completion = new Promise<void>((done, failed) => {resolve = done;reject = failed;});
  const pending: ReportCriterionRefresh = {fields: new Set(keys), work: [marked], verify, backgroundObserved: false, completion, resolve, reject};
  pendingReportCriterionRefresh.set(queryClient, pending);
  queueMicrotask(() => {
    pendingReportCriterionRefresh.delete(queryClient);
    const filters = family(pending.fields);
    const cancel = captureRefresh(() => queryClient.cancelQueries(filters));
    const refresh = captureRefresh(() => queryClient.invalidateQueries({...filters, refetchType: "active"}, {cancelRefetch: true, throwOnError: pending.verify}));
    void settleRefreshes([...pending.work, cancel, refresh]).then(pending.resolve, pending.reject);
  });
  return reportRefreshCompletion(pending, verify);
}

type TimeOption = "calendars" | "shifts" | "leave-types";
type TimeRefreshTarget = {kind: TimeRecordKind; employeeId: number | null} | {option: TimeOption; calendarId: number | null};
const pendingTimeRefresh = new WeakMap<QueryClient, Map<string, TimeRefreshTarget>>();
/** Confirmed writes retire all affected page/detail/option variants, including
 * observerless in-flight reads. Only active owners refetch; drafts stay intact. */
function invalidateTimeTargets(queryClient: QueryClient, targets: readonly TimeRefreshTarget[]): void {
  const family = (selected: Iterable<TimeRefreshTarget>) => ({queryKey: ["hr"],
    predicate: (query: {queryKey: readonly unknown[]}) => [...selected].some(target => {
      if ("kind" in target) return query.queryKey[1] === "time-records" && query.queryKey[3] === target.kind
        && (target.employeeId === null || query.queryKey[2] === target.employeeId);
      return query.queryKey[1] === "time-records-options" && query.queryKey[3] === target.option
        && (target.option !== "shifts" || target.calendarId === null || query.queryKey[4] === target.calendarId);
    })});
  void queryClient.invalidateQueries({...family(targets), refetchType: "none"});
  const queued = pendingTimeRefresh.get(queryClient);
  if (queued) {for (const target of targets) queued.set(JSON.stringify(target), target); return;}
  const pending = new Map(targets.map(target => [JSON.stringify(target), target]));
  pendingTimeRefresh.set(queryClient, pending);
  queueMicrotask(() => {
    pendingTimeRefresh.delete(queryClient);
    // Materialize once; a reused Map.values iterator would be exhausted after
    // checking the first query and leave later owners stale.
    const filters = family([...pending.values()]);
    void queryClient.cancelQueries(filters);
    void queryClient.invalidateQueries({...filters, refetchType: "active"}, {cancelRefetch: true});
  });
}
function invalidateTimeReads(queryClient: QueryClient, kinds: readonly TimeRecordKind[], employeeId: number | null = null): void {
  invalidateTimeTargets(queryClient, kinds.map(kind => ({kind, employeeId})));
}
function invalidateTimeOptions(queryClient: QueryClient, options: readonly TimeOption[], calendarId: number | null = null): void {
  invalidateTimeTargets(queryClient, options.map(option => ({option, calendarId})));
}
type HrSearchRefresh = {categories: Set<HrSearchCategory>; suggestions: boolean};
const pendingHrSearchRefresh = new WeakMap<QueryClient, HrSearchRefresh>();
/** Refresh dependent search caches without starting reads for inactive owners.
 * Recognizes both the existing object key and the identity-qualified read key. */
function invalidateHrSearchReads(queryClient: QueryClient, categories: readonly HrSearchCategory[], suggestions = false): void {
  const family = (target: HrSearchRefresh) => ({queryKey: ["hr", "search"], predicate: (query: {queryKey: readonly unknown[]}) => {
    if (query.queryKey[2] === "suggestions") return target.suggestions;
    if (query.queryKey[2] !== "results") return false;
    try {
      const input = typeof query.queryKey[3] === "object" && query.queryKey[3] !== null
        ? query.queryKey[3] : JSON.parse(String(query.queryKey[4]));
      const selected: unknown = (input as {categories?: unknown}).categories;
      return !Array.isArray(selected) || selected.length === 0 || selected.some(category => target.categories.has(category));
    } catch {return true;}
  }});
  const next = {categories: new Set(categories), suggestions};
  void queryClient.invalidateQueries({...family(next), refetchType: "none"});
  const queued = pendingHrSearchRefresh.get(queryClient);
  if (queued) {for (const category of categories) queued.categories.add(category); queued.suggestions ||= suggestions; return;}
  pendingHrSearchRefresh.set(queryClient, next);
  queueMicrotask(() => {
    pendingHrSearchRefresh.delete(queryClient);
    const filters = family(next);
    void queryClient.cancelQueries(filters);
    void queryClient.invalidateQueries({...filters, refetchType: "active"}, {cancelRefetch: true});
  });
}
type ComplianceRefresh = Map<number | null, Set<ComplianceKind>>;
const pendingComplianceRefresh = new WeakMap<QueryClient, ComplianceRefresh>();
/** Invalidate dependent rows and selected details together, but not drafts.
 * Null employee means a shared label changed. Only mounted owners refetch. */
function invalidateComplianceReads(queryClient: QueryClient, kinds: readonly ComplianceKind[], employeeId: number | null = null): void {
  const family = (targets: ComplianceRefresh) => ({queryKey: ["hr", "compliance-records"],
    predicate: (query: {queryKey: readonly unknown[]}) => {
      const kind = query.queryKey[3] as ComplianceKind;
      return targets.get(null)?.has(kind) === true || targets.get(query.queryKey[2] as number)?.has(kind) === true;
    }});
  void queryClient.invalidateQueries({...family(new Map([[employeeId, new Set(kinds)]])), refetchType: "none"});
  const queued = pendingComplianceRefresh.get(queryClient);
  if (queued) {
    const selected = queued.get(employeeId) ?? new Set<ComplianceKind>();
    for (const kind of kinds) selected.add(kind);
    queued.set(employeeId, selected);
    return;
  }
  const pending: ComplianceRefresh = new Map([[employeeId, new Set(kinds)]]);
  pendingComplianceRefresh.set(queryClient, pending);
  queueMicrotask(() => {
    pendingComplianceRefresh.delete(queryClient);
    const filters = family(pending);
    // Include initial and observerless details: neither may commit an old read.
    void queryClient.cancelQueries(filters);
    void queryClient.invalidateQueries({...filters, refetchType: "active"}, {cancelRefetch: true});
  });
}
/** Retire initial/disabled/observerless reads before marking the family stale. */
export function invalidateAuthorizedRead(queryClient: QueryClient, resource: string): void {
  const queryKey = ["read", resource];
  notifyManager.batch(() => {
    void queryClient.cancelQueries({ queryKey }, { revert: true });
    void queryClient.invalidateQueries({ queryKey, refetchType: "active" }, { cancelRefetch: true });
  });
}
/** Awaitable counterpart for a committed-write workflow with read-only recovery. */
function verifyAuthorizedReadRefresh(queryClient: QueryClient, resource: string): Promise<void> {
  const queryKey = ["read", resource];
  return notifyManager.batch(() => settleRefreshes([
    captureRefresh(() => queryClient.cancelQueries({queryKey}, {revert: true})),
    captureRefresh(() => queryClient.invalidateQueries({queryKey, refetchType: "active"}, {cancelRefetch: true, throwOnError: true})),
  ]));
}

// ── Lookup values ─────────────────────────────────────────────────────────────

/** Invalidate a single lookup category cache (all variant keys for that code). */
export function invalidateLookupCategory(
  queryClient: QueryClient,
  categoryCode: string
): void {
  const matches = { predicate: (q: {queryKey: readonly unknown[]}) => {
    const code = categoryCode.trim().toUpperCase();
    if(q.queryKey[0] === "authorized-lookup") return q.queryKey[1] === "values" ? q.queryKey[2] === code :
      q.queryKey[1] === "batch" && Array.isArray(q.queryKey[2]) && q.queryKey[2].includes(code);
    if(q.queryKey[0] === "read" && q.queryKey[1] === "lookup-search") {
      try { return String(JSON.parse(String(q.queryKey[2])).categoryCode).trim().toUpperCase() === code; }
      catch { return true; } // Unknown identity must revalidate, not retain an obsolete choice.
    }
    return false;
  } };
  void queryClient.cancelQueries(matches);
  void queryClient.invalidateQueries(matches);
  void queryClient.invalidateQueries({
    queryKey: ["lookup", "values", categoryCode.toUpperCase()],
  });
  // Also clear batch entries so any batch query that included this category refetches
  void queryClient.invalidateQueries({ queryKey: ["lookup", "batch"] });
}

/** Invalidate all lookup value caches. */
export function invalidateAllLookups(queryClient: QueryClient): void {
  invalidateAuthorizedRead(queryClient, "lookup-search");
  void queryClient.cancelQueries({ queryKey: ["authorized-lookup"] });
  void queryClient.invalidateQueries({ queryKey: ["authorized-lookup"] });
  void queryClient.invalidateQueries({ queryKey: ["lookup"] });
}

// ── Geography ─────────────────────────────────────────────────────────────────

export function invalidateCountries(queryClient: QueryClient): void {
  invalidateComplianceReads(queryClient, ["identity", "dependents"]);
  invalidateAuthorizedRead(queryClient, "employee-filter-countries");
  void queryClient.invalidateQueries({ queryKey: ["master", "countries"] });
}

export function invalidateEmirates(queryClient: QueryClient): void {
  invalidateComplianceReads(queryClient, ["identity"]);
  void queryClient.invalidateQueries({ queryKey: ["master", "emirates"] });
}

export function invalidateCities(queryClient: QueryClient): void {
  invalidateComplianceReads(queryClient, ["identity"]);
  void queryClient.invalidateQueries({ queryKey: ["master", "cities"] });
}

export function invalidateAreas(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: ["master", "areas"] });
}

export function invalidatePorts(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: ["master", "ports"] });
}

/** Invalidate all geography tables (countries → emirates → cities → areas → ports). */
export function invalidateGeography(queryClient: QueryClient): void {
  invalidateComplianceReads(queryClient, ["identity", "dependents"]);
  invalidateAuthorizedRead(queryClient, "employee-filter-countries");
  void queryClient.invalidateQueries({ queryKey: ["master", "countries"] });
  void queryClient.invalidateQueries({ queryKey: ["master", "emirates"] });
  void queryClient.invalidateQueries({ queryKey: ["master", "cities"] });
  void queryClient.invalidateQueries({ queryKey: ["master", "areas"] });
  void queryClient.invalidateQueries({ queryKey: ["master", "ports"] });
}

// ── Finance basics ────────────────────────────────────────────────────────────

export function invalidateCurrencies(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: ["master", "currencies"] });
}

export function invalidateBanks(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: ["master", "banks"] });
}

export function invalidatePaymentTerms(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: ["master", "payment_terms"] });
}

export function invalidateTaxTypes(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: ["master", "tax_types"] });
}

/** Invalidate all finance basics caches. */
export function invalidateFinanceBasics(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: ["master", "currencies"] });
  void queryClient.invalidateQueries({ queryKey: ["master", "banks"] });
  void queryClient.invalidateQueries({ queryKey: ["master", "payment_terms"] });
  void queryClient.invalidateQueries({ queryKey: ["master", "tax_types"] });
}

// ── Unit of measure ───────────────────────────────────────────────────────────

/** Invalidate UOM categories and unit lists. */
export function invalidateUom(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: ["master", "uom_categories"] });
  void queryClient.invalidateQueries({ queryKey: ["master", "units_of_measure"] });
}

// ── Organisation structure ────────────────────────────────────────────────────

/** Invalidate owner companies and branches. */
export function invalidateOrganizations(queryClient: QueryClient): void {
  invalidateReportCriterionReads(queryClient, REPORT_CRITERION_KEYS);
  invalidateComplianceReads(queryClient, ["identity"]);
  invalidateAuthorizedRead(queryClient, "employee-filter-companies");
  void queryClient.invalidateQueries({ queryKey: ["master", "owner_companies"] });
  void queryClient.invalidateQueries({ queryKey: ["master", "branches"] });
}

// ── Cost / profit centres ─────────────────────────────────────────────────────

export function invalidateCostCenters(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: ["master", "cost_centers"] });
}

export function invalidateProfitCenters(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: ["master", "profit_centers"] });
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
  void queryClient.invalidateQueries({
    queryKey: ["child", tableName, parentId ?? null],
  });
}

/** Invalidate every cached child table (e.g. on logout / role switch). */
export function invalidateAllChildTables(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: ["child"] });
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

export function invalidateDmsDashboard(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: ["dms", "dashboard"] });
  const queryKey = ["dms", "dashboard-read"];
  void queryClient.invalidateQueries({queryKey, refetchType: "none"});
  if (pendingDmsDashboardRefresh.has(queryClient)) return;
  pendingDmsDashboardRefresh.add(queryClient);
  queueMicrotask(() => {
    pendingDmsDashboardRefresh.delete(queryClient);
    void queryClient.cancelQueries({queryKey});
    void queryClient.invalidateQueries({queryKey, refetchType: "active"}, {cancelRefetch: true});
  });
}

export function invalidateDmsAdminOverview(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: ["dms", "admin", "overview"] });
}

export function invalidateDmsCategories(queryClient: QueryClient): void {
  invalidateDmsDashboard(queryClient);
  void queryClient.invalidateQueries({ queryKey: ["dms", "admin", "categories"] });
  void queryClient.invalidateQueries({ queryKey: ["dms", "admin", "overview"] });
}

export function invalidateDmsDocumentTypes(queryClient: QueryClient): void {
  invalidateDmsDashboard(queryClient);
  invalidateDmsApprovalReads(queryClient, null);
  invalidateEntityDocumentReads(queryClient);
  invalidateDmsBrowserReads(queryClient, ["types", "search", "files"]);
  invalidateHrDocumentBrowserReads(queryClient);
  void queryClient.invalidateQueries({ queryKey: ["dms", "admin", "document-types"] });
  void queryClient.invalidateQueries({ queryKey: ["dms", "admin", "overview"] });
}

export function invalidateDmsMetadataDefinitions(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: ["dms", "admin", "metadata-definitions"] });
}

export function invalidateDmsTags(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: ["dms", "admin", "tags"] });
  void queryClient.invalidateQueries({ queryKey: ["dms", "admin", "overview"] });
}

export function invalidateDmsRetentionPolicies(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: ["dms", "admin", "retention-policies"] });
  void queryClient.invalidateQueries({ queryKey: ["dms", "admin", "overview"] });
}

export function invalidateAllDmsAdmin(queryClient: QueryClient): void {
  invalidateDmsDashboard(queryClient);
  invalidateDmsApprovalReads(queryClient, null);
  invalidateEntityDocumentReads(queryClient);
  invalidateDmsBrowserReads(queryClient, ["types", "search", "files"]);
  invalidateHrDocumentBrowserReads(queryClient);
  void queryClient.invalidateQueries({ queryKey: ["dms", "admin"] });
}

// ── DMS Documents (DMS.4) ─────────────────────────────────────────────────────

export function invalidateDmsDocuments(queryClient: QueryClient): void {
  invalidateDmsDashboard(queryClient);
  invalidateDmsApprovalReads(queryClient, null);
  invalidateEntityDocumentReads(queryClient);
  invalidateDmsBrowserReads(queryClient, ["search", "files"]);
  invalidateHrDocumentBrowserReads(queryClient);
  invalidateAuthorizedRead(queryClient, "dms-documents");
  invalidateAuthorizedRead(queryClient, "dms-archive");
  void queryClient.invalidateQueries({ queryKey: ["dms", "documents"] });
}

export function invalidateDmsDocument(queryClient: QueryClient, id: number): void {
  invalidateDmsDashboard(queryClient);
  invalidateDmsApprovalReads(queryClient, id);
  invalidateEntityDocumentReads(queryClient);
  invalidateDmsBrowserReads(queryClient, ["search", "files"]);
  invalidateHrDocumentBrowserReads(queryClient);
  void queryClient.invalidateQueries({ queryKey: ["dms", "documents", id] });
}

export function invalidateDmsDocumentRecord(queryClient: QueryClient, id: number): void {
  invalidateAuthorizedRead(queryClient, "dms-documents");
  invalidateDmsDashboard(queryClient);
  invalidateDmsApprovalReads(queryClient, id);
  invalidateEntityDocumentReads(queryClient);
  invalidateDmsBrowserReads(queryClient, ["search", "files"]);
  invalidateHrDocumentBrowserReads(queryClient);
  void queryClient.invalidateQueries({ queryKey: ["dms", "documents", id] });
  void queryClient.invalidateQueries({ queryKey: ["dms", "documents"] });
}

// ── DMS.5 — Upload Inbox + File Storage ──────────────────────────────────────

export function invalidateDmsUploadSessions(queryClient: QueryClient): void {
  invalidateDmsDashboard(queryClient);
  void queryClient.invalidateQueries({ queryKey: ["dms", "upload-sessions"] });
}

export function invalidateDmsDocumentFiles(queryClient: QueryClient, documentId: number): void {
  invalidateDmsDashboard(queryClient);
  invalidateEntityDocumentReads(queryClient);
  invalidateDmsBrowserReads(queryClient, ["search", "files"]);
  invalidateHrDocumentBrowserReads(queryClient);
  void queryClient.invalidateQueries({ queryKey: ["dms", "documents", documentId, "files"] });
}

export function invalidateDmsDocumentVersions(queryClient: QueryClient, documentId: number): void {
  invalidateDmsDashboard(queryClient);
  invalidateEntityDocumentReads(queryClient);
  invalidateDmsBrowserReads(queryClient, ["search", "files"]);
  invalidateHrDocumentBrowserReads(queryClient);
  void queryClient.invalidateQueries({ queryKey: ["dms", "documents", documentId, "versions"] });
}

export function invalidateDmsDocumentFileStorage(queryClient: QueryClient, documentId: number): void {
  invalidateAuthorizedRead(queryClient, "dms-documents");
  invalidateDmsDashboard(queryClient);
  invalidateEntityDocumentReads(queryClient);
  invalidateDmsBrowserReads(queryClient, ["search", "files"]);
  invalidateHrDocumentBrowserReads(queryClient);
  void queryClient.invalidateQueries({ queryKey: ["dms", "documents", documentId, "files"] });
  void queryClient.invalidateQueries({ queryKey: ["dms", "documents", documentId, "versions"] });
  void queryClient.invalidateQueries({ queryKey: ["dms", "documents", documentId] });
  void queryClient.invalidateQueries({ queryKey: ["dms", "documents"] });
}

// ── DMS.6 — Entity document links ─────────────────────────────────────────────

export function invalidateDmsEntityDocuments(
  queryClient: QueryClient,
  entityType: string,
  entityId: number
): void {
  if (["employee", "employee_dependent"].includes(entityType)) invalidateHrDocumentBrowserReads(queryClient);
  invalidateEntityDocumentReads(queryClient, entityDocumentOperations, [entityType, entityId]);
  invalidateDmsBrowserReads(queryClient, ["search"]);
  void queryClient.invalidateQueries({ queryKey: ["dms", "entity-documents", entityType, entityId] });
  void queryClient.invalidateQueries({ queryKey: ["dms", "entity-document-compliance", entityType, entityId] });
  void queryClient.invalidateQueries({ queryKey: ["dms", "attachable-documents", entityType, entityId] });
}

export function invalidatePartyDmsDocuments(
  queryClient: QueryClient,
  partyId: number
): void {
  invalidateEntityDocumentReads(queryClient, entityDocumentOperations, ["party", partyId]);
  invalidateDmsBrowserReads(queryClient, ["search"]);
  void queryClient.invalidateQueries({ queryKey: ["dms", "entity-documents", "party", partyId] });
  void queryClient.invalidateQueries({ queryKey: ["party", "dms-documents", partyId] });
}

export function invalidateDmsAvailableForLink(queryClient: QueryClient): void {
  invalidateEntityDocumentReads(queryClient, ["attach", "selected"]);
  void queryClient.invalidateQueries({ queryKey: ["dms", "available-for-link"] });
}

// ── DMS.8 — Expiry, Renewals, Notifications ───────────────────────────────────

export function invalidateDmsExpiry(queryClient: QueryClient): void {
  invalidateDmsDashboard(queryClient);
  void queryClient.invalidateQueries({ queryKey: ["dms", "expiry"] });
}

export function invalidateDmsDocumentExpiry(queryClient: QueryClient, documentId: number): void {
  invalidateDmsDashboard(queryClient);
  invalidateEntityDocumentReads(queryClient);
  invalidateDmsBrowserReads(queryClient, ["search", "files"]);
  invalidateHrDocumentBrowserReads(queryClient);
  void queryClient.invalidateQueries({ queryKey: ["dms", "expiry", "reminders", "doc", documentId] });
  void queryClient.invalidateQueries({ queryKey: ["dms", "expiry", "stats"] });
  void queryClient.invalidateQueries({ queryKey: ["dms", "documents", documentId] });
}

export function invalidateDmsRenewals(queryClient: QueryClient): void {
  invalidateDmsDashboard(queryClient);
  void queryClient.invalidateQueries({ queryKey: ["dms", "renewals"] });
}

export function invalidateDmsDocumentRenewals(queryClient: QueryClient, documentId: number): void {
  invalidateDmsDashboard(queryClient);
  void queryClient.invalidateQueries({ queryKey: ["dms", "renewals", "doc", documentId] });
  void queryClient.invalidateQueries({ queryKey: ["dms", "renewals"] });
}

export function invalidateDmsNotifications(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: ["dms", "notifications"] });
}

// ── DMS.10 — AI Analysis ─────────────────────────────────────────────────────

export function invalidateDmsAiAnalysis(queryClient: QueryClient, documentId: number): void {
  invalidateDmsDashboard(queryClient);
  invalidateEntityDocumentReads(queryClient);
  void queryClient.invalidateQueries({ queryKey: ["dms", "documents", documentId, "ai-status"] });
  void queryClient.invalidateQueries({ queryKey: ["dms", "documents", documentId, "ai-results"] });
  void queryClient.invalidateQueries({ queryKey: ["dms", "documents", documentId, "record"] });
  void queryClient.invalidateQueries({ queryKey: ["dms", "documents", documentId, "ai-apply-history"] });
}

// ── DMS AI Phase 16 — Apply-to-ERP ───────────────────────────────────────────

export function invalidateDmsApplyToErp(queryClient: QueryClient, documentId: number): void {
  invalidateDmsDashboard(queryClient);
  invalidateDmsApprovalReads(queryClient, documentId);
  invalidateEntityDocumentReads(queryClient);
  invalidateDmsBrowserReads(queryClient, ["search", "files"]);
  void queryClient.invalidateQueries({ queryKey: ["dms", "apply-to-erp", "runs"] });
  void queryClient.invalidateQueries({ queryKey: ["dms", "documents", documentId, "apply-to-erp-preview"] });
  // Also invalidate the document record itself since FK/basic fields may have changed
  void queryClient.invalidateQueries({ queryKey: ["dms", "documents", documentId, "record"] });
}

export function invalidateDmsApplyToErpRun(queryClient: QueryClient, runId: number): void {
  void queryClient.invalidateQueries({ queryKey: ["dms", "apply-to-erp", "run", runId] });
}

export function invalidateDmsReviewQueueForApply(queryClient: QueryClient): void {
  invalidateDmsDashboard(queryClient);
  void queryClient.invalidateQueries({ queryKey: ["dms", "review-queue"] });
}

// ── DMS AI Phase 17 — Apply Correction ───────────────────────────────────────

/** Invalidate all correction proposals (optionally filter by documentId). */
export function invalidateDmsApplyCorrections(
  queryClient: QueryClient,
  documentId?: number
): void {
  void queryClient.invalidateQueries({ queryKey: ["dms", "apply-correction", "proposals"] });
  if (documentId != null) {
    void queryClient.invalidateQueries({
      queryKey: ["dms", "apply-correction", "proposals", { documentId }],
    });
  }
}

/** Invalidate a single correction proposal. */
export function invalidateDmsApplyCorrectionProposal(
  queryClient: QueryClient,
  proposalId: number
): void {
  void queryClient.invalidateQueries({
    queryKey: ["dms", "apply-correction", "proposal", proposalId],
  });
}

/** Invalidate correction source cache for an apply item. */
export function invalidateDmsApplyCorrectionSource(
  queryClient: QueryClient,
  applyItemId: number
): void {
  void queryClient.invalidateQueries({
    queryKey: ["dms", "apply-correction", "source", applyItemId],
  });
}

// ── DMS.9 — OCR Pipeline ─────────────────────────────────────────────────────

export function invalidateDmsOcr(queryClient: QueryClient, documentId: number): void {
  invalidateDmsDashboard(queryClient);
  invalidateDmsBrowserReads(queryClient, ["search"]);
  void queryClient.invalidateQueries({ queryKey: ["dms", "documents", documentId, "ocr-status"] });
  void queryClient.invalidateQueries({ queryKey: ["dms", "documents", documentId, "ocr-text"] });
  void queryClient.invalidateQueries({ queryKey: ["dms", "ocr-jobs"] });
  invalidateDmsDocumentUnderstanding(queryClient, documentId);
}

export function invalidateDmsFileOcr(queryClient: QueryClient, fileId: number): void {
  invalidateEntityDocumentReads(queryClient, ["attach", "selected"]);
  invalidateDmsBrowserReads(queryClient, ["search"]);
  void queryClient.invalidateQueries({ queryKey: ["dms", "files", fileId, "ocr-text"] });
}

// ── COMMON MD.1 — Common Master Data ─────────────────────────────────────────

export function invalidateCommonMdDepartments(queryClient: QueryClient): Promise<void> {
  return settleRefreshes([
    invalidateReportCriterionReads(queryClient, ["department_id", "designation_id", "employee_id"], true),
    verifyAuthorizedReadRefresh(queryClient, "employee-filter-departments"),
    verifyAuthorizedReadRefresh(queryClient, "employee-filter-designations"),
    captureRefresh(() => queryClient.invalidateQueries({queryKey: ["common_md", "departments"]}, {throwOnError: true})),
  ]);
}

export function invalidateCommonMdDesignations(queryClient: QueryClient): void {
  invalidateReportCriterionReads(queryClient, ["designation_id"]);
  invalidateAuthorizedRead(queryClient, "employee-filter-designations");
  void queryClient.invalidateQueries({ queryKey: ["common_md", "designations"] });
}

export function invalidateCommonMdWorkSites(queryClient: QueryClient): void {
  invalidateHrSearchReads(queryClient, ["operations"]);
  invalidateReportCriterionReads(queryClient, ["work_site_id"]);
  invalidateComplianceReads(queryClient, ["cards"]);
  void queryClient.invalidateQueries({ queryKey: ["common_md", "work_sites"] });
}

export function invalidateCommonMdWorkCalendars(queryClient: QueryClient, calendarId?: number): void {
  invalidateTimeReads(queryClient, ["shifts"]);
  invalidateTimeOptions(queryClient, ["calendars", "shifts"], calendarId ?? null);
  void queryClient.invalidateQueries({ queryKey: ["common_md", "work_calendars"] });
  if (calendarId) {
    void queryClient.invalidateQueries({ queryKey: ["common_md", "work_shifts", calendarId] });
  }
}

export function invalidateCommonMdApprovalRoles(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: ["common_md", "approval_roles"] });
}

export function invalidateCommonMdDmsRequiredDocumentRules(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: ["common_md", "dms_required_document_rules"] });
}

export function invalidateCommonMdCompanySignatories(queryClient: QueryClient, companyId: number): void {
  void queryClient.invalidateQueries({ queryKey: ["common_md", "company_signatories", companyId] });
}

// ── NOTIFICATIONS.1 — Global Notifications ────────────────────────────────────

export function invalidateMyNotifications(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: ["notifications", "my"] });
  void queryClient.invalidateQueries({ queryKey: ["notifications", "unread-count"] });
}

export function invalidateUnreadNotifications(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: ["notifications", "unread-count"] });
}

export function invalidateEmailQueue(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: ["notifications", "email-queue"] });
}

export function invalidateNotificationTemplates(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: ["notifications", "templates"] });
}

export function invalidateNotificationLogs(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: ["notifications", "delivery-logs"] });
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
  void queryClient.invalidateQueries({
    queryKey: ["ai", "field-suggestions", entityType, entityId],
  });
}

/** Invalidate AI record status cache for a specific entity. */
export function invalidateAiRecordStatus(
  queryClient: QueryClient,
  entityType: string,
  entityId: number
): void {
  void queryClient.invalidateQueries({
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
  void queryClient.invalidateQueries({ queryKey: ["ai", "duplicate-candidates"] });
  void queryClient.invalidateQueries({ queryKey: ["ai", "duplicate-counts"] });
  void queryClient.invalidateQueries({ queryKey: ["ai", "duplicate-doc-count"] });
}

export function invalidateDuplicateCandidateDetail(
  queryClient: QueryClient,
  candidateId: number
): void {
  void queryClient.invalidateQueries({
    queryKey: ["ai", "duplicate-candidate", candidateId],
  });
}

export function invalidateDuplicateCandidateCounts(
  queryClient: QueryClient,
  entityType: string,
  entityId: number
): void {
  void queryClient.invalidateQueries({
    queryKey: ["ai", "duplicate-counts", entityType, entityId],
  });
}

// ── Common AI Compliance Checker (COMMON AI.4) ────────────────────────────────

export function invalidateComplianceFindings(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: ["ai", "compliance-findings"] });
  void queryClient.invalidateQueries({ queryKey: ["ai", "compliance-counts"] });
  void queryClient.invalidateQueries({ queryKey: ["ai", "compliance-doc-count"] });
  void queryClient.invalidateQueries({ queryKey: ["dms", "entity-document-compliance"] });
}

export function invalidateComplianceFindingDetail(
  queryClient: QueryClient,
  findingId: number
): void {
  void queryClient.invalidateQueries({
    queryKey: ["ai", "compliance-finding", findingId],
  });
}

export function invalidateComplianceFindingCounts(
  queryClient: QueryClient,
  entityType: string,
  entityId: number
): void {
  void queryClient.invalidateQueries({
    queryKey: ["ai", "compliance-counts", entityType, entityId],
  });
}

// ── Common AI Risk Scoring (COMMON AI.5) ──────────────────────────────────────

export function invalidateRiskScores(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: ["ai", "risk-scores"] });
  void queryClient.invalidateQueries({ queryKey: ["ai", "risk-score-count"] });
  void queryClient.invalidateQueries({ queryKey: ["ai", "risk-score-entity"] });
  void queryClient.invalidateQueries({ queryKey: ["ai", "risk-score-document"] });
}

export function invalidateRiskScoreDetail(
  queryClient: QueryClient,
  scoreId: number
): void {
  void queryClient.invalidateQueries({
    queryKey: ["ai", "risk-score", scoreId],
  });
}

export function invalidateRiskScoreForEntity(
  queryClient: QueryClient,
  entityType: string,
  entityId: number
): void {
  void queryClient.invalidateQueries({
    queryKey: ["ai", "risk-score-entity", entityType, entityId],
  });
  void queryClient.invalidateQueries({
    queryKey: ["ai", "risk-score-count", entityType, entityId],
  });
}

export function invalidateRiskScoreForDocument(
  queryClient: QueryClient,
  documentId: number
): void {
  void queryClient.invalidateQueries({
    queryKey: ["ai", "risk-score-document", documentId],
  });
}

// ── DMS AI Orchestration (DMS AI ORCH.1) ──────────────────────────────────────

/** Invalidate orchestration status for a specific session. */
export function invalidateDmsOrchestrationStatus(
  queryClient: QueryClient,
  sessionCode: string
): void {
  void queryClient.invalidateQueries({
    queryKey: ["dms", "orchestration-status", sessionCode],
  });
}

/** Invalidate batch orchestration status. */
export function invalidateDmsBatchOrchestration(
  queryClient: QueryClient,
  batchCode: string
): void {
  void queryClient.invalidateQueries({
    queryKey: ["dms", "batch-orchestration", batchCode],
  });
}

// ── COMMON AI.2 — Document Understanding (COMMON AI.2) ────────────────────────

/** Invalidate the document understanding cache for a specific document. */
export function invalidateDmsDocumentUnderstanding(
  queryClient: QueryClient,
  documentId: number
): void {
  invalidateEntityDocumentReads(queryClient, ["attach", "selected"]);
  void queryClient.invalidateQueries({
    queryKey: ["dms", "documents", documentId, "understanding"],
  });
}

// ── COMMON AI.6 — Search ─────────────────────────────────────────────────────

export function invalidateRecentSearches(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: ["ai", "recent-searches"] });
}

export function invalidateSearchSuggestions(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: ["ai", "search-suggestions"] });
}

// ── COMMON AI.7 — Assistant ───────────────────────────────────────────────────

export function invalidateAssistantSessions(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: ["ai", "assistant-sessions"] });
}

export function invalidateAssistantSession(queryClient: QueryClient, sessionId: number): void {
  void queryClient.invalidateQueries({ queryKey: ["ai", "assistant-session", sessionId] });
}

export function invalidateAssistantDrafts(queryClient: QueryClient, sessionId: number): void {
  void queryClient.invalidateQueries({ queryKey: ["ai", "assistant-drafts", sessionId] });
}

// ── COMMON AI.13 — Daily Dashboard ───────────────────────────────────────────

export function invalidateAiDailyDashboard(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: ["ai", "daily-dashboard"] });
}

// ── COMMON AI.14 — Audit Trail Explainer ─────────────────────────────────────

export function invalidateAuditExplainer(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: ["ai", "audit-explainer"] });
}

// ── COMMON AI.15 — Data Quality Monitor ──────────────────────────────────────

export function invalidateDataQuality(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: ["ai", "data-quality-summary"] });
  void queryClient.invalidateQueries({ queryKey: ["ai", "data-quality-findings"] });
}

export function invalidateDataQualityFinding(queryClient: QueryClient, id: number): void {
  void queryClient.invalidateQueries({ queryKey: ["ai", "data-quality-finding", id] });
  void queryClient.invalidateQueries({ queryKey: ["ai", "data-quality-finding-events", id] });
}

// ── HR Employees (HR.2) ────────────────────────────────────────────────────────

/** Invalidate all HR employee list caches. */
export function invalidateHrEmployees(queryClient: QueryClient): void {
  invalidateHrSearchReads(queryClient, employeeSearchCategories, true);
  invalidateHrDocumentBrowserReads(queryClient);
  invalidateReportCriterionReads(queryClient, ["employee_id"]);
  invalidatePayrollInquiryReads(queryClient, "global-salary-profiles");
  invalidatePayrollInquiryReads(queryClient, "global-wps-readiness");
  invalidateAuthorizedRead(queryClient, "employees");
  void queryClient.invalidateQueries({ queryKey: ["hr", "employees", "list"] });
}

/** Invalidate a single employee detail cache. */
export function invalidateHrEmployee(queryClient: QueryClient, id: number): void {
  invalidateHrSearchReads(queryClient, employeeSearchCategories, true);
  invalidateHrDocumentBrowserReads(queryClient);
  invalidateReportCriterionReads(queryClient, ["employee_id"]);
  invalidatePayrollInquiryReads(queryClient, "global-salary-profiles");
  invalidatePayrollInquiryReads(queryClient, "global-wps-readiness");
  invalidateTimeReads(queryClient, TIME_RECORD_KINDS, id);
  invalidateComplianceReads(queryClient, COMPLIANCE_KINDS, id);
  void queryClient.invalidateQueries({ queryKey: ["hr", "employees", "detail", id] });
}

/** Invalidate a single employee overview cache. */
export function invalidateHrEmployeeOverview(queryClient: QueryClient, id: number): void {
  void queryClient.invalidateQueries({ queryKey: ["hr", "employees", "overview", id] });
}

/** Invalidate a single employee status history cache. */
export function invalidateHrEmployeeStatusHistory(queryClient: QueryClient, id: number): void {
  invalidateHrSearchReads(queryClient, employeeSearchCategories, true);
  invalidateHrDocumentBrowserReads(queryClient);
  invalidateReportCriterionReads(queryClient, ["employee_id"]);
  invalidateTimeReads(queryClient, TIME_RECORD_KINDS, id);
  invalidateComplianceReads(queryClient, COMPLIANCE_KINDS, id);
  void queryClient.invalidateQueries({ queryKey: ["hr", "employees", "status-history", id] });
}

// ── HR Settings (HR.1) ────────────────────────────────────────────────────────

/** Invalidate all HR settings caches. */
export function invalidateHrSettings(queryClient: QueryClient): void {
  invalidateHrSearchReads(queryClient, ["time"]);
  invalidateHrDocumentBrowserReads(queryClient);
  invalidateTimeReads(queryClient, ["leave", "balances"]);
  invalidateTimeOptions(queryClient, ["leave-types"]);
  invalidateComplianceReads(queryClient, COMPLIANCE_KINDS);
  void queryClient.invalidateQueries({ queryKey: ["hr", "settings"] });
}

export function invalidateHrEmployeeCategories(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: ["hr", "settings", "employee-categories"] });
}
export function invalidateHrEmploymentTypes(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: ["hr", "settings", "employment-types"] });
}
export function invalidateHrGrades(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: ["hr", "settings", "grades"] });
}
export function invalidateHrIdentityDocumentTypes(queryClient: QueryClient): void {
  invalidateHrDocumentBrowserReads(queryClient);
  invalidateComplianceReads(queryClient, ["identity"]);
  void queryClient.invalidateQueries({ queryKey: ["hr", "settings", "identity-document-types"] });
}
export function invalidateHrAccessCardTypes(queryClient: QueryClient): void {
  invalidateComplianceReads(queryClient, ["cards"]);
  void queryClient.invalidateQueries({ queryKey: ["hr", "settings", "access-card-types"] });
}
export function invalidateHrTrainingCategories(queryClient: QueryClient): void {
  invalidateComplianceReads(queryClient, ["training"]);
  void queryClient.invalidateQueries({ queryKey: ["hr", "settings", "training-categories"] });
}
export function invalidateHrTrainingTypes(queryClient: QueryClient): void {
  invalidateComplianceReads(queryClient, ["training"]);
  void queryClient.invalidateQueries({ queryKey: ["hr", "settings", "training-types"] });
}
export function invalidateHrMedicalRecordTypes(queryClient: QueryClient): void {
  invalidateComplianceReads(queryClient, ["medical"]);
  void queryClient.invalidateQueries({ queryKey: ["hr", "settings", "medical-record-types"] });
}
export function invalidateHrLeaveTypes(queryClient: QueryClient): void {
  invalidateHrSearchReads(queryClient, ["time"]);
  invalidateTimeReads(queryClient, ["leave", "balances"]);
  invalidateTimeOptions(queryClient, ["leave-types"]);
  void queryClient.invalidateQueries({ queryKey: ["hr", "settings", "leave-types"] });
  void queryClient.invalidateQueries({ queryKey: ["hr", "time", "active-leave-types"] });
}
export function invalidateHrRelationshipTypes(queryClient: QueryClient): void {
  invalidateHrDocumentBrowserReads(queryClient);
  invalidateComplianceReads(queryClient, ["dependents"]);
  void queryClient.invalidateQueries({ queryKey: ["hr", "settings", "relationship-types"] });
}
export function invalidateHrSalaryComponentTypes(queryClient: QueryClient): void {
  for (const field of ["salary-components", "gross-salary", "wps-readiness"] as const) invalidatePayrollSettingDependentRead(queryClient, ["hr", "payroll", field]);
  invalidatePayrollSettingDependentRead(queryClient, ["hr", "employees", "overview"]);
  invalidatePayrollInquiryReads(queryClient, "global-salary-profiles");
  invalidatePayrollInquiryReads(queryClient, "global-wps-readiness");
  void queryClient.invalidateQueries({ queryKey: ["hr", "settings", "salary-component-types"] });
}
export function invalidateHrPayrollGroups(queryClient: QueryClient): void {
  invalidatePayrollSettingDependentRead(queryClient, ["hr", "payroll", "profile"]);
  invalidatePayrollInquiryReads(queryClient, "global-salary-profiles");
  void queryClient.invalidateQueries({ queryKey: ["hr", "settings", "payroll-groups"] });
}
export function invalidateHrMohreEstablishments(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: ["hr", "settings", "mohre-establishments"] });
}
export function invalidateHrProProcessTypes(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: ["hr", "settings", "pro-process-types"] });
}
export function invalidateHrReadinessRuleTemplates(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: ["hr", "settings", "readiness-rule-templates"] });
}
export function invalidateHrRoleRequirementMatrix(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: ["hr", "settings", "role-requirement-matrix"] });
}
export function invalidateHrSiteRequirementMatrix(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: ["hr", "settings", "site-requirement-matrix"] });
}
export function invalidateHrApprovalWorkflows(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: ["hr", "settings", "approval-workflows"] });
}

// ── HR Compliance (HR.3) ──────────────────────────────────────────────────────

/** Invalidate all compliance data for a specific employee. */
export function invalidateHrEmployeeCompliance(
  queryClient: QueryClient,
  employeeId: number
): void {
  invalidateHrSearchReads(queryClient, ["compliance"]);
  invalidateHrDocumentBrowserReads(queryClient);
  invalidateComplianceReads(queryClient, COMPLIANCE_KINDS, employeeId);
  invalidateHrEmployeeOverview(queryClient, employeeId);
  void queryClient.invalidateQueries({ queryKey: ["hr", "compliance", "identity-documents", employeeId] });
  void queryClient.invalidateQueries({ queryKey: ["hr", "compliance", "medical-insurances", employeeId] });
  void queryClient.invalidateQueries({ queryKey: ["hr", "compliance", "dependents", employeeId] });
  void queryClient.invalidateQueries({ queryKey: ["hr", "compliance", "access-cards", employeeId] });
  void queryClient.invalidateQueries({ queryKey: ["hr", "compliance", "training-certificates", employeeId] });
  void queryClient.invalidateQueries({ queryKey: ["hr", "compliance", "medical-records", employeeId] });
  void queryClient.invalidateQueries({ queryKey: ["hr", "compliance", "summary", employeeId] });
  void queryClient.invalidateQueries({ queryKey: ["hr", "compliance", "alerts", employeeId] });
}

export function invalidateHrEmployeeComplianceSummary(
  queryClient: QueryClient,
  employeeId: number
): void {
  invalidateHrDocumentBrowserReads(queryClient);
  invalidateHrEmployeeOverview(queryClient, employeeId);
  void queryClient.invalidateQueries({ queryKey: ["hr", "compliance", "summary", employeeId] });
}

export function invalidateHrEmployeeIdentityDocuments(
  queryClient: QueryClient,
  employeeId: number
): void {
  invalidateHrDocumentBrowserReads(queryClient);
  invalidateHrSearchReads(queryClient, ["compliance"]);
  invalidateComplianceReads(queryClient, ["identity"], employeeId);
  invalidateHrEmployeeOverview(queryClient, employeeId);
  void queryClient.invalidateQueries({ queryKey: ["hr", "compliance", "identity-documents", employeeId] });
  void queryClient.invalidateQueries({ queryKey: ["hr", "compliance", "summary", employeeId] });
}

export function invalidateHrEmployeeMedicalInsurances(
  queryClient: QueryClient,
  employeeId: number
): void {
  invalidateComplianceReads(queryClient, ["insurance"], employeeId);
  invalidateHrEmployeeOverview(queryClient, employeeId);
  void queryClient.invalidateQueries({ queryKey: ["hr", "compliance", "medical-insurances", employeeId] });
  void queryClient.invalidateQueries({ queryKey: ["hr", "compliance", "summary", employeeId] });
}

export function invalidateHrEmployeeDependents(
  queryClient: QueryClient,
  employeeId: number
): void {
  invalidateHrDocumentBrowserReads(queryClient);
  invalidateComplianceReads(queryClient, ["dependents"], employeeId);
  invalidateHrEmployeeOverview(queryClient, employeeId);
  void queryClient.invalidateQueries({ queryKey: ["hr", "compliance", "dependents", employeeId] });
  void queryClient.invalidateQueries({ queryKey: ["hr", "compliance", "summary", employeeId] });
}

export function invalidateHrEmployeeAccessCards(
  queryClient: QueryClient,
  employeeId: number
): void {
  invalidateHrSearchReads(queryClient, ["compliance"]);
  invalidateComplianceReads(queryClient, ["cards"], employeeId);
  invalidateHrEmployeeOverview(queryClient, employeeId);
  void queryClient.invalidateQueries({ queryKey: ["hr", "compliance", "access-cards", employeeId] });
  void queryClient.invalidateQueries({ queryKey: ["hr", "compliance", "summary", employeeId] });
}

export function invalidateHrEmployeeTrainingCertificates(
  queryClient: QueryClient,
  employeeId: number
): void {
  invalidateHrSearchReads(queryClient, ["compliance"]);
  invalidateComplianceReads(queryClient, ["training"], employeeId);
  invalidateHrEmployeeOverview(queryClient, employeeId);
  void queryClient.invalidateQueries({ queryKey: ["hr", "compliance", "training-certificates", employeeId] });
  void queryClient.invalidateQueries({ queryKey: ["hr", "compliance", "summary", employeeId] });
}

export function invalidateHrEmployeeMedicalRecords(
  queryClient: QueryClient,
  employeeId: number
): void {
  invalidateHrSearchReads(queryClient, ["compliance"]);
  invalidateComplianceReads(queryClient, ["medical"], employeeId);
  invalidateHrEmployeeOverview(queryClient, employeeId);
  void queryClient.invalidateQueries({ queryKey: ["hr", "compliance", "medical-records", employeeId] });
  void queryClient.invalidateQueries({ queryKey: ["hr", "compliance", "summary", employeeId] });
}

// ── HR Time (HR.4) ────────────────────────────────────────────────────────────

/** Invalidate all HR time data for an employee. */
export function invalidateHrEmployeeTimeSummary(queryClient: QueryClient, employeeId: number): void {
  void queryClient.invalidateQueries({queryKey: ["hr", "time", "summary", employeeId]});
  invalidateHrEmployeeOverview(queryClient, employeeId);
}

export function invalidateHrEmployeeTime(
  queryClient: QueryClient,
  employeeId: number
): void {
  invalidateHrSearchReads(queryClient, ["time"]);
  invalidateTimeReads(queryClient, TIME_RECORD_KINDS, employeeId);
  invalidateHrEmployeeOverview(queryClient, employeeId);
  void queryClient.invalidateQueries({ queryKey: ["hr", "time", "attendance-punches", employeeId] });
  void queryClient.invalidateQueries({ queryKey: ["hr", "time", "attendance-summary", employeeId] });
  void queryClient.invalidateQueries({ queryKey: ["hr", "time", "shift-assignments", employeeId] });
  void queryClient.invalidateQueries({ queryKey: ["hr", "time", "leave-requests", employeeId] });
  void queryClient.invalidateQueries({ queryKey: ["hr", "time", "leave-balances", employeeId] });
  void queryClient.invalidateQueries({ queryKey: ["hr", "time", "overtime-records", employeeId] });
  void queryClient.invalidateQueries({ queryKey: ["hr", "time", "summary", employeeId] });
}

export function invalidateHrEmployeeAttendance(
  queryClient: QueryClient,
  employeeId: number
): void {
  invalidateTimeReads(queryClient, ["daily", "punches", "corrections"], employeeId);
  invalidateHrDailyAttendance(queryClient);
  invalidateHrEmployeeOverview(queryClient, employeeId);
  void queryClient.invalidateQueries({ queryKey: ["hr", "time", "attendance-punches", employeeId] });
  void queryClient.invalidateQueries({ queryKey: ["hr", "time", "attendance-summary", employeeId] });
  void queryClient.invalidateQueries({ queryKey: ["hr", "time", "summary", employeeId] });
}

export function invalidateHrDailyAttendance(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: ["hr", "time", "daily-attendance"] });
}

export function invalidateHrEmployeeShiftAssignments(
  queryClient: QueryClient,
  employeeId: number
): void {
  invalidateTimeReads(queryClient, ["shifts"], employeeId);
  void queryClient.invalidateQueries({queryKey: ["hr", "time", "global-shift-assignments", "counted-page"]});
  invalidateHrEmployeeOverview(queryClient, employeeId);
  void queryClient.invalidateQueries({ queryKey: ["hr", "time", "shift-assignments", employeeId] });
  void queryClient.invalidateQueries({ queryKey: ["hr", "time", "global-shift-assignments"] });
  void queryClient.invalidateQueries({ queryKey: ["hr", "time", "summary", employeeId] });
}

export function invalidateHrEmployeeLeave(
  queryClient: QueryClient,
  employeeId: number
): void {
  invalidateHrSearchReads(queryClient, ["time"]);
  invalidateTimeReads(queryClient, ["leave", "balances"], employeeId);
  invalidateHrGlobalLeaveRequests(queryClient);
  invalidateHrEmployeeOverview(queryClient, employeeId);
  void queryClient.invalidateQueries({ queryKey: ["hr", "time", "leave-requests", employeeId] });
  void queryClient.invalidateQueries({ queryKey: ["hr", "time", "leave-balances", employeeId] });
  void queryClient.invalidateQueries({ queryKey: ["hr", "time", "summary", employeeId] });
}

export function invalidateHrGlobalLeaveRequests(queryClient: QueryClient): void {
  invalidateHrSearchReads(queryClient, ["time"]);
  void queryClient.invalidateQueries({ queryKey: ["hr", "time", "global-leave-requests"] });
}

export function invalidateHrEmployeeOvertime(
  queryClient: QueryClient,
  employeeId: number
): void {
  invalidateTimeReads(queryClient, ["overtime"], employeeId);
  invalidateHrEmployeeOverview(queryClient, employeeId);
  void queryClient.invalidateQueries({ queryKey: ["hr", "time", "overtime-records", employeeId] });
  void queryClient.invalidateQueries({ queryKey: ["hr", "time", "summary", employeeId] });
}

// ── HR Payroll & WPS (HR.5) ──────────────────────────────────────────────────

type PayrollSettingDependentKey = readonly ["hr", "payroll", "profile" | "salary-components" | "gross-salary" | "wps-readiness"]
  | readonly ["hr", "employees", "overview"];
const pendingPayrollSettingRefresh = new WeakMap<QueryClient, Set<string>>();
/** A setting can change embedded labels or calculations for any employee.
 * Preserve existing caches/drafts, but retire matching pre-change requests,
 * including observerless on-demand component details. Only active observers
 * refetch; cached inactive principals stay stale without being fetched. */
function invalidatePayrollSettingDependentRead(queryClient: QueryClient, queryKey: PayrollSettingDependentKey): void {
  void queryClient.invalidateQueries({queryKey, refetchType: "none"});
  const prefix = queryKey.join(":");
  let pending = pendingPayrollSettingRefresh.get(queryClient);
  if (!pending) {pending = new Set(); pendingPayrollSettingRefresh.set(queryClient, pending);}
  if (pending.has(prefix)) return;
  pending.add(prefix);
  queueMicrotask(() => {
    pending.delete(prefix);
    if (pending.size === 0) pendingPayrollSettingRefresh.delete(queryClient);
    // Cancellation retires the retryer synchronously. Active-only cancellation
    // would miss fetchQuery detail reads; refetch is still active-only.
    void queryClient.cancelQueries({queryKey});
    void queryClient.invalidateQueries({queryKey, refetchType: "active"}, {cancelRefetch: true});
  });
}

const pendingPayrollInquiryRefresh = new WeakMap<QueryClient, Set<string>>();
/** Global payroll pages retain their principal-qualified keys. A successful
 * mutation retires active pre-mutation requests, including initial reads with
 * no data; inactive principals are only marked stale, never fetched. */
function invalidatePayrollInquiryReads(
  queryClient: QueryClient,
  prefix: "global-salary-profiles" | "global-wps-readiness",
): void {
  const queryKey = ["hr", "payroll", prefix];
  void queryClient.invalidateQueries({queryKey, refetchType: "none"});
  let pending = pendingPayrollInquiryRefresh.get(queryClient);
  if (!pending) {pending = new Set(); pendingPayrollInquiryRefresh.set(queryClient, pending);}
  if (pending.has(prefix)) return;
  pending.add(prefix);
  queueMicrotask(() => {
    pending.delete(prefix);
    if (pending.size === 0) pendingPayrollInquiryRefresh.delete(queryClient);
    // Disabled/observerless requests can still publish. Wait for cancellation
    // completion so even an already-fulfilled retryer publishes before staling.
    void queryClient.cancelQueries({queryKey}).then(() => {
      void queryClient.invalidateQueries({queryKey, refetchType: "active"}, {cancelRefetch: true});
    });
  });
}



export function invalidateHrEmployeePayroll(
  queryClient: QueryClient,
  employeeId: number
): void {
  invalidateHrSearchReads(queryClient, ["payroll"]);
  invalidatePayrollInquiryReads(queryClient, "global-salary-profiles");
  invalidatePayrollInquiryReads(queryClient, "global-wps-readiness");
  invalidateHrEmployeeOverview(queryClient, employeeId);
  void queryClient.invalidateQueries({ queryKey: ["hr", "payroll", "profile", employeeId] });
  void queryClient.invalidateQueries({ queryKey: ["hr", "payroll", "salary-components", employeeId] });
  void queryClient.invalidateQueries({ queryKey: ["hr", "payroll", "gross-salary", employeeId] });
  void queryClient.invalidateQueries({ queryKey: ["hr", "payroll", "basic-salary", employeeId] });
  void queryClient.invalidateQueries({ queryKey: ["hr", "payroll", "holds", employeeId] });
  void queryClient.invalidateQueries({ queryKey: ["hr", "payroll", "wps-profile", employeeId] });
  void queryClient.invalidateQueries({ queryKey: ["hr", "payroll", "wps-readiness", employeeId] });
  void queryClient.invalidateQueries({ queryKey: ["hr", "payroll", "summary", employeeId] });
}

export function invalidateHrEmployeeSalaryComponents(
  queryClient: QueryClient,
  employeeId: number
): void {
  invalidatePayrollInquiryReads(queryClient, "global-salary-profiles");
  invalidatePayrollInquiryReads(queryClient, "global-wps-readiness");
  invalidateHrEmployeeOverview(queryClient, employeeId);
  void queryClient.invalidateQueries({ queryKey: ["hr", "payroll", "salary-components", employeeId] });
  void queryClient.invalidateQueries({ queryKey: ["hr", "payroll", "gross-salary", employeeId] });
  void queryClient.invalidateQueries({ queryKey: ["hr", "payroll", "basic-salary", employeeId] });
  void queryClient.invalidateQueries({ queryKey: ["hr", "payroll", "summary", employeeId] });
  void queryClient.invalidateQueries({ queryKey: ["hr", "payroll", "wps-readiness", employeeId] });
}

export function invalidateHrEmployeeSalaryRevisions(
  queryClient: QueryClient,
  employeeId: number
): void {
  invalidateHrEmployeeOverview(queryClient, employeeId);
  void queryClient.invalidateQueries({ queryKey: ["hr", "payroll", "salary-revisions", employeeId] });
}

export function invalidateHrEmployeePayrollHolds(
  queryClient: QueryClient,
  employeeId: number
): void {
  invalidateHrSearchReads(queryClient, ["payroll"]);
  invalidatePayrollInquiryReads(queryClient, "global-wps-readiness");
  invalidateHrEmployeeOverview(queryClient, employeeId);
  void queryClient.invalidateQueries({ queryKey: ["hr", "payroll", "holds", employeeId] });
  void queryClient.invalidateQueries({ queryKey: ["hr", "payroll", "wps-readiness", employeeId] });
  void queryClient.invalidateQueries({ queryKey: ["hr", "payroll", "summary", employeeId] });
}

export function invalidateHrEmployeeWps(
  queryClient: QueryClient,
  employeeId: number
): void {
  invalidateHrSearchReads(queryClient, ["payroll"]);
  invalidatePayrollInquiryReads(queryClient, "global-wps-readiness");
  invalidateHrEmployeeOverview(queryClient, employeeId);
  void queryClient.invalidateQueries({ queryKey: ["hr", "payroll", "wps-profile", employeeId] });
  void queryClient.invalidateQueries({ queryKey: ["hr", "payroll", "wps-readiness", employeeId] });
  void queryClient.invalidateQueries({ queryKey: ["hr", "payroll", "summary", employeeId] });
}

export function invalidateHrGlobalPayroll(queryClient: QueryClient): void {
  invalidateHrSearchReads(queryClient, ["payroll"]);
  invalidatePayrollInquiryReads(queryClient, "global-salary-profiles");
}

export function invalidateHrGlobalWpsReadiness(queryClient: QueryClient): void {
  invalidateHrSearchReads(queryClient, ["payroll"]);
  invalidatePayrollInquiryReads(queryClient, "global-wps-readiness");
}

// ── HR Operations & Readiness (HR.6) ────────────────────────────────────────

export function invalidateHrEmployeeOperations(queryClient: QueryClient, employeeId: number): void {
  invalidateHrSearchReads(queryClient, ["operations"]);
  invalidateHrEmployeeOverview(queryClient, employeeId);
  invalidateHrGlobalAssignments(queryClient);
  invalidateHrGlobalReadiness(queryClient);
  invalidateHrGlobalBlocks(queryClient);
  void queryClient.invalidateQueries({ queryKey: ["hr", "operations", "assignments", employeeId] });
  void queryClient.invalidateQueries({ queryKey: ["hr", "operations", "role-requirements", employeeId] });
  void queryClient.invalidateQueries({ queryKey: ["hr", "operations", "site-readiness", employeeId] });
  void queryClient.invalidateQueries({ queryKey: ["hr", "operations", "blocks", employeeId] });
  void queryClient.invalidateQueries({ queryKey: ["hr", "operations", "assets", employeeId] });
  void queryClient.invalidateQueries({ queryKey: ["hr", "operations", "ppe", employeeId] });
  void queryClient.invalidateQueries({ queryKey: ["hr", "operations", "accommodation", employeeId] });
  void queryClient.invalidateQueries({ queryKey: ["hr", "operations", "summary", employeeId] });
  void queryClient.invalidateQueries({ queryKey: ["hr", "operations", "readiness-summary", employeeId] });
}

export function invalidateHrEmployeeAssignments(queryClient: QueryClient, employeeId: number): void {
  invalidateHrSearchReads(queryClient, ["operations"]);
  invalidateHrEmployeeOverview(queryClient, employeeId);
  invalidateHrGlobalAssignments(queryClient);
  void queryClient.invalidateQueries({ queryKey: ["hr", "operations", "assignments", employeeId] });
  void queryClient.invalidateQueries({ queryKey: ["hr", "operations", "summary", employeeId] });
}

export function invalidateHrGlobalAssignments(queryClient: QueryClient): void {
  invalidateHrSearchReads(queryClient, ["operations"]);
  void queryClient.invalidateQueries({ queryKey: ["hr", "operations", "assignments", "counted-page"] });
  void queryClient.invalidateQueries({ queryKey: ["hr", "operations", "global-assignments"] });
}

export function invalidateHrEmployeeReadiness(queryClient: QueryClient, employeeId: number): void {
  invalidateHrEmployeeOverview(queryClient, employeeId);
  invalidateHrGlobalReadiness(queryClient);
  void queryClient.invalidateQueries({ queryKey: ["hr", "operations", "site-readiness", employeeId] });
  void queryClient.invalidateQueries({ queryKey: ["hr", "operations", "readiness-summary", employeeId] });
}

export function invalidateHrGlobalReadiness(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: ["hr", "operations", "readiness", "counted-page"] });
  void queryClient.invalidateQueries({ queryKey: ["hr", "operations", "global-readiness"] });
}

export function invalidateHrEmployeeBlocks(queryClient: QueryClient, employeeId: number): void {
  invalidateHrSearchReads(queryClient, ["operations"]);
  invalidateHrEmployeeOverview(queryClient, employeeId);
  invalidateHrGlobalBlocks(queryClient);
  void queryClient.invalidateQueries({ queryKey: ["hr", "operations", "blocks", employeeId] });
  void queryClient.invalidateQueries({ queryKey: ["hr", "operations", "readiness-summary", employeeId] });
}

export function invalidateHrGlobalBlocks(queryClient: QueryClient): void {
  invalidateHrSearchReads(queryClient, ["operations"]);
  void queryClient.invalidateQueries({ queryKey: ["hr", "operations", "blocks", "counted-page"] });
  void queryClient.invalidateQueries({ queryKey: ["hr", "operations", "global-blocks"] });
}

export function invalidateHrEmployeeAssets(queryClient: QueryClient, employeeId: number): void {
  invalidateHrEmployeeOverview(queryClient, employeeId);
  void queryClient.invalidateQueries({ queryKey: ["hr", "operations", "assets", employeeId] });
  void queryClient.invalidateQueries({ queryKey: ["hr", "operations", "summary", employeeId] });
}

export function invalidateHrEmployeePpe(queryClient: QueryClient, employeeId: number): void {
  invalidateHrEmployeeOverview(queryClient, employeeId);
  void queryClient.invalidateQueries({ queryKey: ["hr", "operations", "ppe", employeeId] });
  void queryClient.invalidateQueries({ queryKey: ["hr", "operations", "summary", employeeId] });
}

export function invalidateHrEmployeeAccommodation(queryClient: QueryClient, employeeId: number): void {
  invalidateHrEmployeeOverview(queryClient, employeeId);
  void queryClient.invalidateQueries({ queryKey: ["hr", "operations", "accommodation", employeeId] });
  void queryClient.invalidateQueries({ queryKey: ["hr", "operations", "summary", employeeId] });
}

// ── HR Actions (HR.7) ─────────────────────────────────────────────────────────

export function invalidateHrEmployeeActions(queryClient: QueryClient, employeeId: number): void {
  invalidateHrSearchReads(queryClient, ["actions"]);
  void queryClient.invalidateQueries({ queryKey: ["hr", "actions", "summary", employeeId] });
  void queryClient.invalidateQueries({ queryKey: ["hr", "employees", "overview", employeeId] });
}

export function invalidateHrEmployeeProProcesses(queryClient: QueryClient, employeeId: number): void {
  invalidateHrSearchReads(queryClient, ["actions"]);
  invalidateHrEmployeeOverview(queryClient, employeeId);
  void queryClient.invalidateQueries({ queryKey: ["hr", "actions", "pro-processes", employeeId] });
  void queryClient.invalidateQueries({ queryKey: ["hr", "actions", "summary", employeeId] });
}

export function invalidateHrGlobalProProcesses(queryClient: QueryClient): void {
  invalidateHrSearchReads(queryClient, ["actions"]);
  void queryClient.invalidateQueries({ queryKey: ["hr", "actions", "global-pro-processes"] });
}

export function invalidateHrEmployeeHrActions(queryClient: QueryClient, employeeId: number): void {
  invalidateHrSearchReads(queryClient, ["actions"]);
  invalidateHrEmployeeOverview(queryClient, employeeId);
  void queryClient.invalidateQueries({ queryKey: ["hr", "actions", "hr-actions", employeeId] });
  void queryClient.invalidateQueries({ queryKey: ["hr", "actions", "summary", employeeId] });
}

export function invalidateHrEmployeePerformance(queryClient: QueryClient, employeeId: number): void {
  invalidateHrEmployeeOverview(queryClient, employeeId);
  void queryClient.invalidateQueries({ queryKey: ["hr", "actions", "performance", employeeId] });
  void queryClient.invalidateQueries({ queryKey: ["hr", "actions", "summary", employeeId] });
}

export function invalidateHrEmployeeDisciplinary(queryClient: QueryClient, employeeId: number): void {
  invalidateHrSearchReads(queryClient, ["actions"]);
  invalidateHrEmployeeOverview(queryClient, employeeId);
  void queryClient.invalidateQueries({ queryKey: ["hr", "actions", "disciplinary", employeeId] });
  void queryClient.invalidateQueries({ queryKey: ["hr", "actions", "summary", employeeId] });
}

export function invalidateHrGlobalDisciplinary(queryClient: QueryClient): void {
  invalidateHrSearchReads(queryClient, ["actions"]);
  void queryClient.invalidateQueries({ queryKey: ["hr", "actions", "global-disciplinary"] });
}

export function invalidateHrEmployeeNotes(queryClient: QueryClient, employeeId: number): void {
  invalidateHrEmployeeOverview(queryClient, employeeId);
  void queryClient.invalidateQueries({ queryKey: ["hr", "actions", "notes", employeeId] });
}

export function invalidateHrEmployeeApprovals(queryClient: QueryClient, employeeId: number): void {
  invalidateHrEmployeeOverview(queryClient, employeeId);
  void queryClient.invalidateQueries({ queryKey: ["hr", "actions", "approvals", employeeId] });
  void queryClient.invalidateQueries({ queryKey: ["hr", "actions", "summary", employeeId] });
}

export function invalidateHrGlobalApprovals(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: ["hr", "actions", "global-approvals"] });
}

export function invalidateHrEmployeeEos(queryClient: QueryClient, employeeId: number): void {
  invalidateHrSearchReads(queryClient, ["actions"]);
  invalidateHrEmployeeOverview(queryClient, employeeId);
  void queryClient.invalidateQueries({ queryKey: ["hr", "actions", "eos-cases", employeeId] });
  void queryClient.invalidateQueries({ queryKey: ["hr", "actions", "summary", employeeId] });
}

export function invalidateHrGlobalEos(queryClient: QueryClient): void {
  invalidateHrSearchReads(queryClient, ["actions"]);
  void queryClient.invalidateQueries({ queryKey: ["hr", "actions", "global-eos-cases"] });
}

export function invalidateHrEmployeeClearance(queryClient: QueryClient, eosCaseId: number, employeeId: number): void {
  invalidateHrEmployeeOverview(queryClient, employeeId);
  void queryClient.invalidateQueries({ queryKey: ["hr", "actions", "clearance-items", eosCaseId] });
  void queryClient.invalidateQueries({ queryKey: ["hr", "actions", "eos-cases", employeeId] });
}

// ── HR Recruitment & Onboarding (HR.8) ──────────────────────────────────────

export function invalidateHrRecruitment(queryClient: QueryClient): void {
  invalidateHrSearchReads(queryClient, ["candidates", "onboarding"], true);
  void queryClient.invalidateQueries({ queryKey: ["hr", "recruitment"] });
}

/** A changed requirement also affects derived readiness, without clearing drafts. */
export function invalidateHrEmployeeRoleRequirements(queryClient: QueryClient, employeeId: number): void {
  void queryClient.invalidateQueries({queryKey: ["hr", "operations", "role-requirements", employeeId]});
  invalidateHrEmployeeReadiness(queryClient, employeeId);
}

/** Confirmed candidate child mutations refresh their scoped read models. */
export function invalidateRecruitmentCandidateReadModels(queryClient: QueryClient, candidateId: number, kind: "documents" | "interviews" | "offers" | "onboarding"): void {
  void queryClient.invalidateQueries({queryKey: ["hr", "recruitment", "candidate", candidateId], predicate: query => query.queryKey.length === 6 && query.queryKey[5] === "counts"});
  if (kind !== "documents") {
    void queryClient.invalidateQueries({queryKey: ["hr", "recruitment", `global-${kind}`]});
    void queryClient.invalidateQueries({queryKey: ["hr", "recruitment", "summary"]});
  }
}

export function invalidateHrRequisitions(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: ["hr", "recruitment", "requisitions"] });
  void queryClient.invalidateQueries({ queryKey: ["hr", "recruitment", "summary"] });
}

export function invalidateHrRequisition(queryClient: QueryClient, id: number): void {
  void queryClient.invalidateQueries({ queryKey: ["hr", "recruitment", "requisition", id] });
  void queryClient.invalidateQueries({ queryKey: ["hr", "recruitment", "requisitions"] });
}

export function invalidateHrCandidates(queryClient: QueryClient): void {
  invalidateHrSearchReads(queryClient, ["candidates", "onboarding"], true);
  void queryClient.invalidateQueries({ queryKey: ["hr", "recruitment", "candidates"] });
  void queryClient.invalidateQueries({ queryKey: ["hr", "recruitment", "pipeline-summary"] });
  void queryClient.invalidateQueries({ queryKey: ["hr", "recruitment", "summary"] });
}

export function invalidateHrCandidate(queryClient: QueryClient, id: number): void {
  invalidateHrSearchReads(queryClient, ["candidates", "onboarding"], true);
  void queryClient.invalidateQueries({ queryKey: ["hr", "recruitment", "candidate", id] });
  void queryClient.invalidateQueries({ queryKey: ["hr", "recruitment", "candidates"] });
  void queryClient.invalidateQueries({ queryKey: ["hr", "recruitment", "pipeline-summary"] });
}

export function invalidateHrCandidateDocuments(queryClient: QueryClient, candidateId: number): void {
  void queryClient.invalidateQueries({ queryKey: ["hr", "recruitment", "candidate-documents", candidateId] });
}

export function invalidateHrCandidateInterviews(queryClient: QueryClient, candidateId: number): void {
  void queryClient.invalidateQueries({ queryKey: ["hr", "recruitment", "candidate-interviews", candidateId] });
  void queryClient.invalidateQueries({ queryKey: ["hr", "recruitment", "global-interviews"] });
}

export function invalidateHrGlobalInterviews(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: ["hr", "recruitment", "global-interviews"] });
}

export function invalidateHrCandidateOffers(queryClient: QueryClient, candidateId: number): void {
  void queryClient.invalidateQueries({ queryKey: ["hr", "recruitment", "candidate-offers", candidateId] });
  void queryClient.invalidateQueries({ queryKey: ["hr", "recruitment", "global-offers"] });
}

export function invalidateHrGlobalOffers(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: ["hr", "recruitment", "global-offers"] });
}

export function invalidateHrCandidateOnboarding(queryClient: QueryClient, candidateId: number): void {
  invalidateHrSearchReads(queryClient, ["onboarding"]);
  void queryClient.invalidateQueries({ queryKey: ["hr", "recruitment", "candidate-onboarding", candidateId] });
  void queryClient.invalidateQueries({ queryKey: ["hr", "recruitment", "global-onboarding"] });
}

export function invalidateHrEmployeeOnboarding(queryClient: QueryClient, employeeId: number): void {
  invalidateHrSearchReads(queryClient, ["onboarding"]);
  void queryClient.invalidateQueries({ queryKey: ["hr", "recruitment", "employee-onboarding", employeeId] });
  void queryClient.invalidateQueries({ queryKey: ["hr", "recruitment", "global-onboarding"] });
}

export function invalidateHrGlobalOnboarding(queryClient: QueryClient): void {
  invalidateHrSearchReads(queryClient, ["onboarding"]);
  void queryClient.invalidateQueries({ queryKey: ["hr", "recruitment", "global-onboarding"] });
}

export function invalidateHrEmployeeRecruitmentLink(queryClient: QueryClient, employeeId: number): void {
  invalidateHrEmployeeOverview(queryClient, employeeId);
  void queryClient.invalidateQueries({ queryKey: ["hr", "recruitment", "employee-link", employeeId] });
  void queryClient.invalidateQueries({ queryKey: ["hr", "recruitment", "candidates"] });
  void queryClient.invalidateQueries({ queryKey: ["hr", "recruitment", "summary"] });
}

// ── HR Dashboard (HR.9) ────────────────────────────────────────────────────

/** Invalidate all HR dashboard caches. */
export function invalidateHrDashboard(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: ["hr", "dashboard"] });
}

/** Invalidate only the top KPI summary bar. */
export function invalidateHrDashboardSummary(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: ["hr", "dashboard", "summary"] });
}

/** Invalidate only the attention items list. */
export function invalidateHrDashboardAttention(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: ["hr", "dashboard", "attention-items"] });
}

// ── HR Search (HR.10) ──────────────────────────────────────────────────────

/** Invalidate all HR search results (e.g. after any HR data change). */
export function invalidateHrSearch(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: ["hr", "search"] });
}

/** Invalidate HR search suggestions cache only. */
export function invalidateHrSearchSuggestions(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: ["hr", "search", "suggestions"] });
}

// ── Global Report Center (REPORT.2) ─────────────────────────────────────────

/** Invalidate the full report registry list. */
export function invalidateReportsRegistry(queryClient: QueryClient): void {
  invalidateReportCriterionReads(queryClient, REPORT_CRITERION_KEYS);
  void queryClient.invalidateQueries({ queryKey: ["reports", "registry"] });
}

/** Invalidate report templates cache. */
export function invalidateReportTemplates(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: ["reports", "templates"] });
}

/** Invalidate report branding profiles cache. */
export function invalidateReportBrandingProfiles(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: ["reports", "branding-profiles"] });
}

/** Invalidate a specific report run cache. */
export function invalidateReportRun(
  queryClient: QueryClient,
  runId: number
): void {
  void queryClient.invalidateQueries({ queryKey: ["reports", "run", runId] });
}

// ── Report Designer (REPORT DESIGNER.2) ─────────────────────────────────────

/** Invalidate all report designer template list caches. */
export function invalidateReportDesignerTemplates(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: ["reports", "designer", "templates"] });
}

/** Invalidate a single report designer template cache (metadata + layout). */
export function invalidateReportDesignerTemplate(queryClient: QueryClient, templateId: number): void {
  void queryClient.invalidateQueries({ queryKey: ["reports", "designer", "template", templateId] });
  void queryClient.invalidateQueries({ queryKey: ["reports", "designer", "layout", templateId] });
}

/** Invalidate report designer layout cache for a specific template. */
export function invalidateReportDesignerLayout(queryClient: QueryClient, templateId: number): void {
  void queryClient.invalidateQueries({ queryKey: ["reports", "designer", "layout", templateId] });
}

/** Invalidate report designer test options cache for a specific template. */
export function invalidateReportDesignerTestOptions(queryClient: QueryClient, templateId: number): void {
  void queryClient.invalidateQueries({ queryKey: ["reports", "designer", "test-options", templateId] });
}

// Independent P04 read families; business mutation authority is unchanged.
const pendingHrBrowserRefresh = new WeakSet<QueryClient>();

const pendingDmsDashboardRefresh = new WeakSet<QueryClient>();

const pendingDmsApprovalRefresh = new WeakMap<QueryClient, Set<number | null>>();

const employeeSearchCategories: readonly HrSearchCategory[] = ["employees", "compliance", "time", "payroll", "operations", "actions"];

function invalidateDmsApprovalReads(queryClient: QueryClient, documentId: number | null): void {
  const family = (ids: ReadonlySet<number | null>) => ({queryKey: ["dms"], predicate: (query: {queryKey: readonly unknown[]}) =>
    query.queryKey[1] === "approvals" && query.queryKey[2] === "queue"
    || ["approval-state", "approval-history"].includes(query.queryKey[1] as string) && (ids.has(null) || ids.has(query.queryKey[2] as number))});
  void queryClient.invalidateQueries({...family(new Set([documentId])), refetchType: "none"});
  const queued = pendingDmsApprovalRefresh.get(queryClient);
  if (queued) {queued.add(documentId); return;}
  const pending = new Set([documentId]); pendingDmsApprovalRefresh.set(queryClient, pending);
  queueMicrotask(() => {
    pendingDmsApprovalRefresh.delete(queryClient);
    const filters = family(pending);
    void queryClient.cancelQueries(filters);
    void queryClient.invalidateQueries({...filters, refetchType: "active"}, {cancelRefetch: true});
  });
}

type DmsBrowserOperation = "search" | "files" | "types";

type EntityDocumentOperation = "list" | "attach" | "selected" | "summary";

type EntityDocumentRefresh = {parent?: readonly [string, number]; operations: Set<EntityDocumentOperation>};

const entityDocumentOperations: readonly EntityDocumentOperation[] = ["list", "attach", "selected", "summary"];

const pendingEntityDocumentRefresh = new WeakMap<QueryClient, Map<string, EntityDocumentRefresh>>();

function invalidateEntityDocumentReads(queryClient: QueryClient, operations: readonly EntityDocumentOperation[] = entityDocumentOperations, parent?: readonly [string, number]): void {
  const family = (targets: Map<string, EntityDocumentRefresh>) => ({queryKey: ["dms", "entity-documents-read"],
    predicate: (query: {queryKey: readonly unknown[]}) => [...targets.values()].some(target =>
      target.operations.has(query.queryKey[5] as EntityDocumentOperation) && (!target.parent || target.parent[0] === query.queryKey[3] && target.parent[1] === query.queryKey[4]))});
  const scope = JSON.stringify(parent ?? null), next = {parent, operations: new Set(operations)};
  void queryClient.invalidateQueries({...family(new Map([[scope, next]])), refetchType: "none"});
  const queued = pendingEntityDocumentRefresh.get(queryClient);
  if (queued) {
    const selected = queued.get(scope) ?? next;
    for (const operation of operations) selected.operations.add(operation);
    queued.set(scope, selected);
    return;
  }
  const pending = new Map([[scope, next]]); pendingEntityDocumentRefresh.set(queryClient, pending);
  queueMicrotask(() => {
    pendingEntityDocumentRefresh.delete(queryClient);
    const filters = family(pending);
    void queryClient.cancelQueries(filters);
    void queryClient.invalidateQueries({...filters, refetchType: "active"}, {cancelRefetch: true});
  });
}

const pendingDmsBrowserRefresh = new WeakMap<QueryClient, Set<DmsBrowserOperation>>();

function invalidateDmsBrowserReads(queryClient: QueryClient, operations: readonly DmsBrowserOperation[]): void {
  const family = (ops: ReadonlySet<DmsBrowserOperation>) => ({queryKey: ["dms", "browser"],
    predicate: (query: {queryKey: readonly unknown[]}) => ops.has(query.queryKey[3] as DmsBrowserOperation)});
  void queryClient.invalidateQueries({...family(new Set(operations)), refetchType: "none"});
  const queued = pendingDmsBrowserRefresh.get(queryClient);
  if (queued) {for (const op of operations) queued.add(op); return;}
  const pending = new Set(operations); pendingDmsBrowserRefresh.set(queryClient, pending);
  queueMicrotask(() => {
    pendingDmsBrowserRefresh.delete(queryClient);
    const filters = family(pending);
    // Initial/observerless reads must also stop; only active observers refetch.
    void queryClient.cancelQueries(filters);
    void queryClient.invalidateQueries({...filters, refetchType: "active"}, {cancelRefetch: true});
  });
}

function invalidateHrDocumentBrowserReads(queryClient: QueryClient): void {
  const queryKey = ["hr", "employees", "document-browser"];
  void queryClient.cancelQueries({queryKey}, {revert: true});
  void queryClient.invalidateQueries({queryKey, refetchType: "none"});
  if (pendingHrBrowserRefresh.has(queryClient)) return;
  pendingHrBrowserRefresh.add(queryClient);
  queueMicrotask(() => {
    pendingHrBrowserRefresh.delete(queryClient);
    // Query.fetch may reuse an initial in-flight request even with
    // cancelRefetch:true when no data exists. Retire that pre-mutation request
    // first; cancelQueries synchronously cancels its retryer before returning.
    void queryClient.cancelQueries({queryKey});
    void queryClient.invalidateQueries({queryKey}, {cancelRefetch: true});
  });
}

export function invalidateDmsApprovalOutcome(queryClient: QueryClient, documentId: number): void {
  invalidateDmsDocumentRecord(queryClient, documentId);
  void queryClient.invalidateQueries({queryKey: ["notifications"]});
}
