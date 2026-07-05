"use client";

/**
 * Report Designer Field Picker Context — REPORT DESIGNER UX.3
 *
 * Provides governance-aware context (userPermissions, templateType) to the
 * field picker and TipTap editor deep inside the Puck block tree.
 *
 * Passed down from the ReportDesignerEditorClient (which receives
 * userPermissions as a server-side prop).
 */

import { createContext, useContext } from "react";
import type { FieldPickerContext } from "@/lib/report-designer/field-registry/types";

// ─────────────────────────────────────────────────────────────────────────────
// Context
// ─────────────────────────────────────────────────────────────────────────────

const FieldPickerCtx = createContext<FieldPickerContext>({
  userPermissions: [],
  templateType: "",
  governanceStatus: undefined,
});

// ─────────────────────────────────────────────────────────────────────────────
// Provider
// ─────────────────────────────────────────────────────────────────────────────

interface FieldPickerContextProviderProps {
  value: FieldPickerContext;
  children: React.ReactNode;
}

export function FieldPickerContextProvider({
  value,
  children,
}: FieldPickerContextProviderProps) {
  return <FieldPickerCtx.Provider value={value}>{children}</FieldPickerCtx.Provider>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────────────────────────────────────

export function useFieldPickerContext(): FieldPickerContext {
  return useContext(FieldPickerCtx);
}
