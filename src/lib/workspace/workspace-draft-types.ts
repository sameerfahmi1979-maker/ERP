/**
 * ERP GLOBAL UI.4E.2 — Workspace Draft Types
 *
 * Types for the in-memory workspace unsaved form draft preservation system.
 * SECURITY: Drafts are stored in-memory only. Never written to localStorage or sessionStorage.
 */

export type WorkspaceDraftKey = string;

/** Flat field-name → string-value snapshot of a form draft */
export type WorkspaceFormDraft = Record<string, string>;

export type WorkspaceDraftScope = "tab" | "record";

export type WorkspaceDraftKeyInput = {
  tabId?: string | null;
  formId: string;
  entityType?: string;
  entityId?: string | number | null;
  scope?: WorkspaceDraftScope;
};

export type WorkspaceDraftStoreApi = {
  getDraft: (key: WorkspaceDraftKey) => WorkspaceFormDraft | undefined;
  setDraft: (key: WorkspaceDraftKey, draft: WorkspaceFormDraft) => void;
  patchDraft: (key: WorkspaceDraftKey, patch: WorkspaceFormDraft) => void;
  writeField: (key: WorkspaceDraftKey, fieldName: string, value: string) => void;
  clearDraft: (key: WorkspaceDraftKey) => void;
  clearDraftsForTab: (tabId: string) => void;
  hasDraft: (key: WorkspaceDraftKey) => boolean;
};

/**
 * WORKSPACE.PERF.1 (WS.3, decision D3) — TWO-TIER field policy.
 *
 * The draft store is strictly IN-MEMORY (never localStorage/sessionStorage),
 * so the threat model is "another user of the same logged-in browser session"
 * — the same exposure as the rendered DOM itself. Two tiers:
 *
 * Tier 1 — NEVER_DRAFT (credentials & files): never stored anywhere, not even
 *   in memory. Passwords, tokens, secrets, API keys, OTP/PIN, file inputs.
 *
 * Tier 2 — MEMORY_ONLY (business PII): Emirates ID, IBAN, account numbers,
 *   passport numbers. ALLOWED in the in-memory draft (decision D3, 2026-08-03,
 *   Sameer) so these fields survive a tab switch like every other field.
 *   They remain FORBIDDEN in any persisted storage — if drafts are ever
 *   persisted to disk in the future, this tier must be re-excluded.
 *
 * Rules:
 * - Exact match (case-insensitive)
 * - Substring match for compound patterns (e.g. "my_password_field" contains "password")
 * - File/Blob values are always excluded at the capture layer (FormData snapshot)
 */
export const NEVER_DRAFT_FIELDS: readonly string[] = [
  "password",
  "temporary_password",
  "confirm_password",
  "current_password",
  "new_password",
  "token",
  "access_token",
  "refresh_token",
  "api_key",
  "secret",
  "client_secret",
  "otp",
  "pin",
  "file",
  "attachment",
  "attachments",
  "document_file",
];

/** Credential substrings — if a field name contains any of these, it is always denied */
export const NEVER_DRAFT_SUBSTRINGS: readonly string[] = [
  "password",
  "token",
  "secret",
  "api_key",
];

/**
 * Business PII allowed in the in-memory draft store ONLY (D3).
 * Kept as an explicit list so a future persisted-draft feature can re-exclude
 * them mechanically. NOT used by isDraftFieldAllowed (memory store allows them).
 */
export const MEMORY_ONLY_FIELDS: readonly string[] = [
  "bank_account_number",
  "account_number",
  "iban",
  "emirates_id",
  "passport_number",
];

/** @deprecated Kept for reference — replaced by NEVER_DRAFT_FIELDS + MEMORY_ONLY_FIELDS (D3). */
export const DRAFT_FIELD_DENYLIST: readonly string[] = NEVER_DRAFT_FIELDS;

/** @deprecated Kept for reference — replaced by NEVER_DRAFT_SUBSTRINGS (D3). */
export const DRAFT_FIELD_DENY_SUBSTRINGS: readonly string[] = NEVER_DRAFT_SUBSTRINGS;

/** Build the standard draft key: draft:tab:{tabId}:{formId} */
export function buildWorkspaceDraftKey(input: WorkspaceDraftKeyInput): WorkspaceDraftKey {
  const { tabId, formId, scope = "tab" } = input;
  if (scope === "tab" && tabId) {
    return `draft:tab:${tabId}:${formId}`;
  }
  if (scope === "record" && input.entityType && input.entityId != null) {
    return `draft:record:${input.entityType}:${input.entityId}:${formId}`;
  }
  // Fallback — should not happen in normal usage
  return `draft:fallback:${formId}`;
}

/**
 * Returns true if the field name is safe to store in the IN-MEMORY draft.
 * Only Tier-1 credential/file fields are denied; business PII (Tier 2) is
 * allowed per decision D3 because the store never touches disk.
 */
export function isDraftFieldAllowed(fieldName: string): boolean {
  const lower = fieldName.toLowerCase();
  if (NEVER_DRAFT_FIELDS.some((d) => d.toLowerCase() === lower)) return false;
  if (NEVER_DRAFT_SUBSTRINGS.some((s) => lower.includes(s.toLowerCase()))) return false;
  return true;
}
