/**
 * ERP GLOBAL UI.4E.2 — Workspace Draft Store
 *
 * In-memory factory for the workspace unsaved form draft store.
 * Creates an isolated Map per provider instance — safe for SSR since
 * this runs only inside client components.
 *
 * SECURITY:
 * - No localStorage / sessionStorage writes.
 * - Sensitive fields filtered by isDraftFieldAllowed() before storage.
 * - Only primitive string values are stored (no Files, Blobs, or objects).
 */

import {
  type WorkspaceDraftKey,
  type WorkspaceFormDraft,
  type WorkspaceDraftStoreApi,
  isDraftFieldAllowed,
} from "./workspace-draft-types";

/** Snapshot all safe named inputs from a form element into a flat Record. */
export function snapshotFormData(formId: string): WorkspaceFormDraft {
  if (typeof document === "undefined") return {};
  const form = document.getElementById(formId) as HTMLFormElement | null;
  if (!form) return {};
  const fd = new FormData(form);
  const snapshot: WorkspaceFormDraft = {};
  fd.forEach((value, key) => {
    if (typeof value === "string" && isDraftFieldAllowed(key)) {
      snapshot[key] = value;
    }
    // Skip File entries silently
  });
  return snapshot;
}

/** Create a new isolated draft store instance (used inside React provider). */
export function createWorkspaceDraftStore(): WorkspaceDraftStoreApi {
  const map = new Map<WorkspaceDraftKey, WorkspaceFormDraft>();

  return {
    getDraft(key) {
      return map.get(key);
    },

    setDraft(key, draft) {
      // Filter out denied fields before storing
      const safe: WorkspaceFormDraft = {};
      for (const [k, v] of Object.entries(draft)) {
        if (isDraftFieldAllowed(k)) safe[k] = v;
      }
      map.set(key, safe);
    },

    patchDraft(key, patch) {
      const existing = map.get(key) ?? {};
      const merged = { ...existing };
      for (const [k, v] of Object.entries(patch)) {
        if (isDraftFieldAllowed(k)) merged[k] = v;
      }
      map.set(key, merged);
    },

    writeField(key, fieldName, value) {
      if (!isDraftFieldAllowed(fieldName)) return;
      const existing = map.get(key) ?? {};
      map.set(key, { ...existing, [fieldName]: value });
    },

    clearDraft(key) {
      map.delete(key);
    },

    clearDraftsForTab(tabId) {
      const prefix = `draft:tab:${tabId}:`;
      for (const k of Array.from(map.keys())) {
        if (k.startsWith(prefix)) map.delete(k);
      }
    },

    hasDraft(key) {
      const d = map.get(key);
      return d !== undefined && Object.keys(d).length > 0;
    },
  };
}
