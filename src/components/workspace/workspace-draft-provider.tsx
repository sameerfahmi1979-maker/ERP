"use client";

/**
 * ERP GLOBAL UI.4E.2 — WorkspaceDraftProvider
 *
 * Provides the in-memory workspace draft store to all workspace form components.
 * The store is owned by a React useRef so each component tree gets an isolated
 * Map — no cross-user / cross-request contamination even in SSR contexts.
 *
 * SECURITY: Drafts are never written to localStorage or sessionStorage.
 */

import { createContext, useContext, useRef, type ReactNode } from "react";
import { createWorkspaceDraftStore } from "@/lib/workspace/workspace-draft-store";
import type { WorkspaceDraftStoreApi } from "@/lib/workspace/workspace-draft-types";

// ── Context ───────────────────────────────────────────────────────────────────

const WorkspaceDraftContext = createContext<WorkspaceDraftStoreApi | null>(null);

// ── Provider ──────────────────────────────────────────────────────────────────

export function WorkspaceDraftProvider({ children }: { children: ReactNode }) {
  // useRef ensures the store is created once per provider mount and is stable
  const storeRef = useRef<WorkspaceDraftStoreApi | null>(null);
  if (storeRef.current === null) {
    storeRef.current = createWorkspaceDraftStore();
  }

  return (
    <WorkspaceDraftContext.Provider value={storeRef.current}>
      {children}
    </WorkspaceDraftContext.Provider>
  );
}

// ── Consumer ──────────────────────────────────────────────────────────────────

/** Returns the workspace draft store. Returns null if used outside the provider (graceful). */
export function useWorkspaceDraftStoreContext(): WorkspaceDraftStoreApi | null {
  return useContext(WorkspaceDraftContext);
}
