/**
 * ERP GLOBAL UI.4E — Workspace Page State Utilities
 *
 * Low-level localStorage helpers for workspace open-element cache.
 *
 * Key format: algt_erp_workspace_page_state:{scope}:{identifier}:{key}
 *
 * Scopes:
 *   "route"  — state keyed to a route path (list screens)
 *   "record" — state keyed to entity type + id (record forms)
 *   "tab"    — state keyed to the workspace tab id (transient, new records)
 *   "global" — global user preferences
 *
 * Safety rules:
 *   - Do NOT store passwords, tokens, or Supabase sessions
 *   - Do NOT store full row datasets or file blobs
 *   - Do NOT store unsaved form field values containing PII (bank account, IBAN, etc.)
 *   - ONLY store safe UI state: search, sort, pagination, section ids, scroll positions
 */

const PREFIX = "algt_erp_workspace_page_state";

export type WorkspacePageStateScope = "route" | "record" | "tab" | "global";

// ── Key generation ─────────────────────────────────────────────────────────────

export function buildPageStateKey(
  scope: WorkspacePageStateScope,
  identifier: string,
  key: string
): string {
  const safe = identifier.replace(/[^a-zA-Z0-9/_-]/g, "_");
  return `${PREFIX}:${scope}:${safe}:${key}`;
}

// ── Read ───────────────────────────────────────────────────────────────────────

export function readPageState<T>(storageKey: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(storageKey);
    if (raw === null) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

// ── Write ──────────────────────────────────────────────────────────────────────

export function writePageState<T>(storageKey: string, value: T): void {
  if (typeof window === "undefined") return;
  try {
    if (value === undefined || value === null) {
      localStorage.removeItem(storageKey);
    } else {
      localStorage.setItem(storageKey, JSON.stringify(value));
    }
  } catch {
    // localStorage quota exceeded or unavailable — fail silently
  }
}

// ── Delete ─────────────────────────────────────────────────────────────────────

export function clearPageState(storageKey: string): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(storageKey);
  } catch {
    // fail silently
  }
}

// ── Clear all keys for a scope ─────────────────────────────────────────────────

export function clearScopePageState(
  scope: WorkspacePageStateScope,
  identifier: string
): void {
  if (typeof window === "undefined") return;
  try {
    const prefix = `${PREFIX}:${scope}:${identifier.replace(/[^a-zA-Z0-9/_-]/g, "_")}:`;
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(prefix)) keysToRemove.push(k);
    }
    keysToRemove.forEach((k) => localStorage.removeItem(k));
  } catch {
    // fail silently
  }
}
