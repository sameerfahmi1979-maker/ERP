"use client";

/**
 * ERP GLOBAL UI.4E.2 — WorkspaceDraftProvider
 *
 * Provides the in-memory workspace draft store to all workspace form components.
 * The store is owned by a lazy React state initializer so each tree gets an isolated
 * Map — no cross-user / cross-request contamination even in SSR contexts.
 *
 * SECURITY: Drafts are never written to localStorage or sessionStorage.
 */

import { createContext, useContext, useState, type ReactNode } from "react";
import { createWorkspaceDraftStore } from "@/lib/workspace/workspace-draft-store";
import type { WorkspaceDraftStoreApi } from "@/lib/workspace/workspace-draft-types";

// ── Context ───────────────────────────────────────────────────────────────────

const WorkspaceDraftContext = createContext<WorkspaceDraftStoreApi | null>(null);

// ── Provider ──────────────────────────────────────────────────────────────────

export function WorkspaceDraftProvider({ children }: { children: ReactNode }) {
  const [store] = useState(createWorkspaceDraftStore);

  return (
    <WorkspaceDraftContext.Provider value={store}>
      {children}
    </WorkspaceDraftContext.Provider>
  );
}

// ── Consumer ──────────────────────────────────────────────────────────────────

/** Returns the workspace draft store. Returns null if used outside the provider (graceful). */
export function useWorkspaceDraftStoreContext(): WorkspaceDraftStoreApi | null {
  return useContext(WorkspaceDraftContext);
}
