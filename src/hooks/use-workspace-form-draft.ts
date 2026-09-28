"use client";

/**
 * ERP GLOBAL UI.4E.2 — useWorkspaceFormDraft
 *
 * Hook for workspace record forms to participate in the in-memory draft
 * preservation system. Captures unsaved field values and restores them
 * when the form remounts after a workspace tab switch.
 *
 * Usage:
 *   const { getDraftDefault, syncDraft, writeDraftField, clearDraft } =
 *     useWorkspaceFormDraft({ formId: "bank-workspace-form" });
 *
 *   // Replace defaultValue:
 *   <Input name="bank_name_en" defaultValue={getDraftDefault("bank_name_en", bank?.bank_name_en ?? "")} />
 *
 *   // Form-level sync:
 *   <form id={FORM_ID} onInput={syncDraft} onChange={syncDraft}>
 *
 *   // After save success:
 *   clearDraft();
 *
 * SECURITY: sensitive fields excluded by isDraftFieldAllowed() denylist.
 * Draft is never written to localStorage or sessionStorage.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useWorkspaceContext } from "@/components/workspace/workspace-provider";
import { useWorkspaceDraftStoreContext } from "@/components/workspace/workspace-draft-provider";
import { buildWorkspaceDraftKey, isDraftFieldAllowed } from "@/lib/workspace/workspace-draft-types";
import { snapshotFormData } from "@/lib/workspace/workspace-draft-store";
import { useWorkspaceFormOwner } from "@/hooks/use-workspace-form-owner";

export type UseWorkspaceFormDraftOptions = {
  /** HTML id of the form element — used for FormData snapshot */
  formId: string;
  /** Bind to the owning route rather than the next active tab during navigation. */
  ownerRoute?: string;
  /** Set false in view mode to disable draft capture. Default: true */
  enabled?: boolean;
  /** Entity type for record-scoped keys (optional, defaults to tab scope) */
  entityType?: string;
  /** Entity id for record-scoped keys (optional, defaults to tab scope) */
  entityId?: string | number | null;
};

export type UseWorkspaceFormDraftReturn = {
  /** The computed draft key for this form + tab combination */
  draftKey: string;
  /** True if a non-empty draft exists for this tab + form */
  hasDraft: boolean;
  /**
   * WS.3: True when the form mounted WITH a non-empty draft — i.e. unsaved
   * values from a previous visit were restored. Frozen at mount; use it to
   * show a "draft restored" notice (DraftRestoredNotice component).
   */
  restoredFromDraft: boolean;
  /**
   * Returns the draft value if it exists and the field is allowed,
   * otherwise returns serverFallback as a string.
   */
  getDraftDefault: (fieldName: string, serverFallback?: string | number | null | undefined) => string;
  /**
   * Returns a boolean draft value.
   * Returns serverFallback if no draft entry exists for the field.
   */
  getDraftBoolean: (fieldName: string, serverFallback?: boolean) => boolean;
  /** Empty is an explicit cleared selection, not a request to restore the server value. */
  getDraftNullableId: (fieldName: string, serverFallback?: number | null) => number | null;
  /** Distinguishes an explicit clear from a field that was never edited. */
  hasDraftField: (fieldName: string) => boolean;
  /**
   * Snapshot the form's current FormData into the draft store.
   * Captures synchronously: navigation must not race a delayed DOM read.
   */
  syncDraft: () => void;
  /**
   * Write a single field value to the draft store.
   * Use for controlled components (comboboxes, selects, checkboxes) that are
   * not captured by FormData snapshot.
   */
  writeDraftField: (fieldName: string, value: string | number | boolean | null | undefined) => void;
  /** Clear the draft for this form. Call after successful save. */
  clearDraft: () => void;
};

export function useWorkspaceFormDraft({
  formId,
  ownerRoute,
  enabled = true,
  entityType,
  entityId,
}: UseWorkspaceFormDraftOptions): UseWorkspaceFormDraftReturn {
  const workspaceCtx = useWorkspaceContext();
  const draftStore = useWorkspaceDraftStoreContext();

  const owner = useWorkspaceFormOwner(ownerRoute);
  const activeTabId = owner?.id ?? null;
  // Standalone controls cannot share a form-id-only fallback with another record.
  const [standaloneId] = useState(() => crypto.randomUUID());

  // Build the draft key for this tab + form
  const draftKey = useMemo(
    () =>
      buildWorkspaceDraftKey({
        tabId: activeTabId ?? standaloneId,
        formId,
        entityType,
        entityId,
        scope: "tab",
      }),
    [activeTabId, standaloneId, formId, entityType, entityId]
  );

  // Freeze the draft snapshot at first render so defaultValue props remain stable.
  // Base UI warns when defaultValue changes after initialization; reading live from
  // the store on every render causes the prop to change if draftKey changes
  // (workspace state timing race between router.push and state propagation).
  // By freezing once, defaultValue is stable — the frozen snapshot is always the
  // correct draft value because by the time the form mounts, the workspace has
  // already set activeTabId (SET_ACTIVE_TAB + router.push happen together).
  const [frozenDefaults] = useState<Record<string, string>>(() =>
    enabled && draftStore ? { ...draftStore.getDraft(draftKey) } : {}
  );
  const [restorationAcknowledged, setRestorationAcknowledged] = useState(false);

  // ── Restore dirty indicator on remount if draft exists ───────────────────
  useEffect(() => {
    if (!enabled || !draftStore || !workspaceCtx || !activeTabId) return;
    if (draftStore.hasDraft(draftKey)) {
      workspaceCtx.dispatch({ type: "MARK_DIRTY", tabId: activeTabId, dirty: true });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftKey]); // Only run when the key changes (= on mount)

  // ── API ───────────────────────────────────────────────────────────────────

  const getDraftDefault = useCallback(
    (fieldName: string, serverFallback?: string | number | null | undefined): string => {
      if (!enabled || !isDraftFieldAllowed(fieldName)) {
        return serverFallback != null ? String(serverFallback) : "";
      }
      // Read from the frozen snapshot — stable across all renders of this instance.
      const frozen = frozenDefaults;
      if (fieldName in frozen) return frozen[fieldName];
      return serverFallback != null ? String(serverFallback) : "";
    },

    [enabled, frozenDefaults]
  );

  const getDraftBoolean = useCallback(
    (fieldName: string, serverFallback = false): boolean => {
      if (!enabled) return serverFallback;
      // Read from the frozen snapshot — stable across all renders of this instance.
      const frozen = frozenDefaults;
      if (fieldName in frozen) {
        const v = frozen[fieldName];
        return v === "true" || v === "on";
      }
      return serverFallback;
    },

    [enabled, frozenDefaults]
  );

  const syncDraft = useCallback(() => {
    if (!enabled || !draftStore) return;
    const snapshot = snapshotFormData(formId);
    if (Object.keys(snapshot).length > 0) draftStore.patchDraft(draftKey, snapshot);
  }, [enabled, draftStore, draftKey, formId]);

  const writeDraftField = useCallback(
    (fieldName: string, value: string | number | boolean | null | undefined) => {
      if (!enabled || !draftStore || !isDraftFieldAllowed(fieldName)) return;
      const str = value != null ? String(value) : "";
      draftStore.writeField(draftKey, fieldName, str);
    },
    [enabled, draftStore, draftKey]
  );

  const clearDraft = useCallback(() => {
    if (!draftStore) return;
    draftStore.clearDraft(draftKey);
    setRestorationAcknowledged(true);
  }, [draftStore, draftKey]);

  const hasDraft = draftStore?.hasDraft(draftKey) ?? false;
  const hasDraftField = useCallback((fieldName: string) =>
    enabled && isDraftFieldAllowed(fieldName) && Object.hasOwn(frozenDefaults, fieldName),
  [enabled, frozenDefaults]);
  const getDraftNullableId = useCallback((fieldName: string, serverFallback?: number | null) => {
    const raw = getDraftDefault(fieldName, serverFallback);
    const value = Number(raw);
    return raw && Number.isSafeInteger(value) && value > 0 ? value : null;
  }, [getDraftDefault]);

  // Frozen at mount — "did this form restore a non-empty draft?" (WS.3).
  // Lazy useState initializer: computed exactly once on first render, matching
  // the frozen-snapshot semantics above without reading a ref during render.
  const restoredFromDraft = enabled && !restorationAcknowledged && Object.keys(frozenDefaults).length > 0;

  return {
    draftKey,
    hasDraft,
    restoredFromDraft,
    getDraftDefault,
    getDraftBoolean,
    getDraftNullableId,
    hasDraftField,
    syncDraft,
    writeDraftField,
    clearDraft,
  };
}
