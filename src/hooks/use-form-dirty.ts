"use client";

import { useState, useEffect, useCallback } from "react";

interface UseFormDirtyOptions {
  formId: string;
  enabled: boolean;
}

/**
 * Hook to track form dirty state (unsaved changes).
 *
 * Uses document-level event delegation (capture phase) instead of attaching
 * listeners directly to the form element. This is critical because drawer
 * forms are rendered inside a portal (Base UI Sheet/Dialog) that mounts
 * AFTER this hook's effect runs — a direct getElementById lookup at mount
 * time finds nothing and listeners would never be attached.
 *
 * @param formId - The HTML id of the form element to track
 * @param enabled - Whether dirty tracking is enabled (should be false in View mode)
 * @returns Object with isDirty state, resetDirty and markDirty functions
 */
export function useFormDirty({ formId, enabled }: UseFormDirtyOptions) {
  const [isDirtyInternal, setIsDirtyInternal] = useState(false);

  // Derived: disabled tracking (e.g. View mode) always reports clean.
  const isDirty = enabled && isDirtyInternal;

  const resetDirty = useCallback(() => {
    setIsDirtyInternal(false);
  }, []);

  const markDirty = useCallback(() => {
    setIsDirtyInternal(true);
  }, []);

  useEffect(() => {
    if (!enabled) {
      return undefined;
    }

    // Delegated listener: works no matter when the form mounts (portals,
    // conditional rendering, drawer open/close) because it lives on document.
    const handleEvent = (event: Event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const form = target.closest("form");
      if (form?.id === formId) {
        setIsDirtyInternal(true);
      }
    };

    // Capture phase so custom components that stop propagation are still caught.
    document.addEventListener("input", handleEvent, true);
    document.addEventListener("change", handleEvent, true);

    return () => {
      document.removeEventListener("input", handleEvent, true);
      document.removeEventListener("change", handleEvent, true);
    };
  }, [formId, enabled]);

  // Auto-reset when the tracked form leaves the DOM (drawer closed/discarded).
  // Many form dialogs stay mounted while their drawer is closed; without this,
  // stale dirty state would wrongly block the next clean open.
  useEffect(() => {
    if (!isDirtyInternal) {
      return undefined;
    }

    const observer = new MutationObserver(() => {
      if (!document.getElementById(formId)) {
        setIsDirtyInternal(false);
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });

    return () => observer.disconnect();
  }, [isDirtyInternal, formId]);

  return { isDirty, resetDirty, markDirty };
}
