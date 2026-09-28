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

import { usePersistentUiState } from "@/hooks/use-persistent-ui-state";
import {
  buildPageStateKey,
  type WorkspacePageStateScope
} from "@/lib/workspace/workspace-page-state";
import { useMemo } from "react";

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

  // useSyncExternalStore supplies the same SSR/hydration snapshot and switches
  // to the persisted preference without an effect copying it into React state.
  return usePersistentUiState(storageKey, initialSection);
}
