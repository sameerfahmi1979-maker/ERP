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
  if (!(form instanceof HTMLFormElement)) return {};
  const fd = new FormData(form);
  const snapshot: WorkspaceFormDraft = {};
  const forbidden = new Set(Array.from(form.elements).filter(element =>
    element instanceof HTMLInputElement && ["password", "file"].includes(element.type)
  ).map(element => (element as HTMLInputElement).name));
  fd.forEach((value, key) => {
    if (typeof value === "string" && !forbidden.has(key) && isDraftFieldAllowed(key)) {
      snapshot[key] = value;
    }
    // Skip File entries silently
  });
  // FormData omits unchecked checkboxes. Explicit false prevents stale true from
  // surviving a patch. Repeated-name/multi-value controls need a typed adapter.
  for (const control of Array.from(form.elements)) {
    if (control instanceof HTMLInputElement && control.type === "checkbox" &&
      control.name && !control.disabled && !forbidden.has(control.name) && isDraftFieldAllowed(control.name)) {
      snapshot[control.name] = String(control.checked);
    }
  }
  return snapshot;
}

/** Create a new isolated draft store instance (used inside React provider). */
export function createWorkspaceDraftStore(): WorkspaceDraftStoreApi {
  const map = new Map<WorkspaceDraftKey, WorkspaceFormDraft>();
  const view = new Map<string, string>();
  const listeners = new Set<() => void>();
  const emit = () => { for (const listener of listeners) listener(); };

  return {
    subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    getDraft(key) {
      const draft = map.get(key);
      return draft ? {...draft} : undefined;
    },

    setDraft(key, draft) {
      // Filter out denied fields before storing
      const safe: WorkspaceFormDraft = {};
      for (const [k, v] of Object.entries(draft)) {
        if (isDraftFieldAllowed(k) && typeof v === "string") safe[k] = v;
      }
      map.set(key, safe);
      emit();
    },

    patchDraft(key, patch) {
      const existing = map.get(key) ?? {};
      const merged = { ...existing };
      for (const [k, v] of Object.entries(patch)) {
        if (isDraftFieldAllowed(k) && typeof v === "string") merged[k] = v;
      }
      map.set(key, merged);
      emit();
    },

    writeField(key, fieldName, value) {
      if (!isDraftFieldAllowed(fieldName) || typeof value !== "string") return;
      const existing = map.get(key) ?? {};
      map.set(key, { ...existing, [fieldName]: value });
      emit();
    },

    clearDraft(key) {
      map.delete(key);
      emit();
    },

    clearDraftsForTab(tabId) {
      const prefix = `draft:tab:${tabId}:`;
      for (const k of Array.from(map.keys())) {
        if (k.startsWith(prefix)) map.delete(k);
      }
      for (const k of view.keys()) if (k.startsWith(prefix)) view.delete(k);
      emit();
    },

    hasDraft(key) {
      const d = map.get(key);
      return d !== undefined && Object.keys(d).length > 0;
    },
    getViewState: key => view.get(key),
    setViewState: (key, value) => { view.set(key, value); },
  };
}
