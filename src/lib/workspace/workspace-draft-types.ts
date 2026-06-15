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
 * Sensitive field denylist — checked case-insensitively at write time.
 * Fields whose names match any entry or contain sensitive substrings are NEVER stored in draft.
 *
 * Rules:
 * - Exact match (case-insensitive)
 * - Substring match for compound patterns (e.g. "my_password_field" contains "password")
 * - File/Blob values are always excluded at the capture layer (FormData snapshot)
 */
export const DRAFT_FIELD_DENYLIST: readonly string[] = [
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
  "bank_account_number",
  "account_number",
  "iban",
  "emirates_id",
  "passport_number",
];

/** Sensitive substrings — if a field name contains any of these, it is denied */
export const DRAFT_FIELD_DENY_SUBSTRINGS: readonly string[] = [
  "password",
  "token",
  "secret",
  "api_key",
  "iban",
];

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

/** Returns true if the field name is safe to store in draft */
export function isDraftFieldAllowed(fieldName: string): boolean {
  const lower = fieldName.toLowerCase();
  // Exact denylist match
  if (DRAFT_FIELD_DENYLIST.some((d) => d.toLowerCase() === lower)) return false;
  // Substring denylist match
  if (DRAFT_FIELD_DENY_SUBSTRINGS.some((s) => lower.includes(s.toLowerCase()))) return false;
  return true;
}
