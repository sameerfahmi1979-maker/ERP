"use client";

/**
 * ERP GLOBAL UI.4E — useWorkspacePageState
 *
 * Generic hook for persisting and restoring safe UI state for any opened
 * workspace screen. Uses localStorage with the standard workspace page state
 * key format.
 *
 * Usage:
 *   const { state, setState } = useWorkspacePageState({
 *     key: "parties-table",
 *     initialState: { search: "", page: 0 },
 *     scope: "route",
 *     identifier: "/admin/master-data/parties",
 *   });
 *
 * See workspace-page-state.ts for allowed/disallowed values.
 */

import { useCallback, useMemo } from "react";
import { usePersistentUiState } from "./use-persistent-ui-state";
import {
  buildPageStateKey,
  type WorkspacePageStateScope,
} from "@/lib/workspace/workspace-page-state";

export type WorkspacePageStateValue =
  | string
  | number
  | boolean
  | null
  | string[]
  | number[]
  | Record<string, unknown>
  | Array<Record<string, unknown>>;

export interface UseWorkspacePageStateOptions<TState extends Record<string, WorkspacePageStateValue>> {
  /** Namespace key for this piece of state */
  key: string;
  /** Initial state if nothing is stored */
  initialState: TState;
  /** Whether to persist to localStorage (default: true) */
  persist?: boolean;
  /** Scope for key generation (default: "route") */
  scope?: WorkspacePageStateScope;
  /** Unique identifier within scope (e.g. route path, "party:123", tabId) */
  identifier: string;
}

export function useWorkspacePageState<
  TState extends Record<string, WorkspacePageStateValue>,
>(options: UseWorkspacePageStateOptions<TState>): {
  state: TState;
  setState: (patch: Partial<TState> | ((prev: TState) => TState)) => void;
  resetState: () => void;
  storageKey: string;
} {
  const {
    key,
    initialState,
    persist = true,
    scope = "route",
    identifier,
  } = options;

  const storageKey = useMemo(
    () => buildPageStateKey(scope, identifier, key),
    [scope, identifier, key]
  );

  const [state,setStateInternal]=usePersistentUiState(persist ? storageKey : undefined,initialState);
  const setState=useCallback((patch:Partial<TState>|((prev:TState)=>TState))=>{
    setStateInternal(prev=>typeof patch==="function" ? patch(prev) : {...prev,...patch});
  },[setStateInternal]);
  const resetState=useCallback(()=>setStateInternal(initialState),[initialState,setStateInternal]);

  return { state, setState, resetState, storageKey };
}
