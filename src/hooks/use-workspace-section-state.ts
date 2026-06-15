"use client";

/**
 * ERP GLOBAL UI.4E — useWorkspaceSectionState
 *
 * Remembers the active inner section/tab for record workspace forms and
 * complex pages. Persists across workspace tab switches.
 *
 * Usage (existing record):
 *   const [activeSection, setActiveSection] = useWorkspaceSectionState({
 *     key: "active-section",
 *     initialSection: "basic",
 *     scope: "record",
 *     recordType: "party",
 *     recordId: party.id,
 *   });
 *
 * Usage (new record):
 *   const [activeSection, setActiveSection] = useWorkspaceSectionState({
 *     key: "active-section",
 *     initialSection: "basic",
 *     scope: "tab",
 *     identifier: activeTabId,     // pass workspace tab id
 *   });
 */

import { useState, useCallback, useMemo, useEffect } from "react";
import {
  buildPageStateKey,
  readPageState,
  writePageState,
  type WorkspacePageStateScope,
} from "@/lib/workspace/workspace-page-state";

interface UseWorkspaceSectionStateOptions {
  key: string;
  initialSection: string;
  scope?: WorkspacePageStateScope;
  /** Required for scope="record" */
  recordType?: string;
  /** Required for scope="record" */
  recordId?: string | number;
  /**
   * Used for scope="tab" or scope="route".
   * For scope="record", pass recordType + recordId instead.
   */
  identifier?: string;
}

export function useWorkspaceSectionState(
  options: UseWorkspaceSectionStateOptions
): [string, (sectionId: string) => void] {
  const {
    key,
    initialSection,
    scope = "route",
    recordType,
    recordId,
    identifier,
  } = options;

  const resolvedIdentifier = useMemo(() => {
    if (scope === "record" && recordType && recordId !== undefined && recordId !== null) {
      return `${recordType}:${recordId}`;
    }
    return identifier ?? "unknown";
  }, [scope, recordType, recordId, identifier]);

  const storageKey = useMemo(
    () => buildPageStateKey(scope, resolvedIdentifier, key),
    [scope, resolvedIdentifier, key]
  );

  // Start with initialSection so SSR and client first-render match exactly.
  // Reading localStorage synchronously in useState() causes a hydration mismatch
  // because the server returns initialSection while the client may return a
  // stored value. We defer the localStorage read to useEffect (post-hydration).
  const [activeSection, setActiveSectionInternal] = useState<string>(initialSection);

  useEffect(() => {
    const stored = readPageState<string>(storageKey, initialSection);
    setActiveSectionInternal(stored);
    // Re-run when storageKey changes (e.g., navigating to a different record).
    // initialSection is intentionally omitted — it is a stable constant string.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  const setActiveSection = useCallback(
    (sectionId: string) => {
      writePageState(storageKey, sectionId);
      setActiveSectionInternal(sectionId);
    },
    [storageKey]
  );

  return [activeSection, setActiveSection];
}
