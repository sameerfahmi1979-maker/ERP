"use client";

/**
 * ERP GLOBAL UI.4C — ERPRecordFormFooter
 *
 * Sticky bottom footer for ERPRecordWorkspaceForm.
 * Visually matches ERPFormFooter, adapted for full-page workspace forms.
 *
 * Add/Edit mode: Cancel · Save · Save & Close
 * View mode:     Close
 *
 * Note: the footer receives onCancel directly from the parent
 * ERPRecordWorkspaceForm, which wires it to onRequestClose
 * (workspace-aware safe close via 4B dirty dialog).
 */

import * as React from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { AlertTriangle } from "lucide-react";

export interface ERPRecordFormFooterProps {
  mode: "add" | "edit" | "view";
  /**
   * Called when Cancel/Close is clicked.
   * Wire to useRecordWorkspaceForm().requestClose for workspace-aware close.
   */
  onCancel?: () => void;
  /** Save (keep record form open) */
  onSave?: () => void;
  /** Save & close (save then close record tab) */
  onSaveAndClose?: () => void;
  isSubmitting?: boolean;
  hasUnsavedChanges?: boolean;
  validationErrorsCount?: number;
  /** Which submit action is in progress */
  activeSubmitAction?: "save" | "saveAndClose" | null;
  className?: string;
}

export function ERPRecordFormFooter({
  mode,
  onCancel,
  onSave,
  onSaveAndClose,
  isSubmitting = false,
  hasUnsavedChanges = false,
  validationErrorsCount = 0,
  activeSubmitAction = null,
  className,
}: ERPRecordFormFooterProps) {
  const isViewMode = mode === "view";

  return (
    <div
      className={cn(
        "shrink-0 px-6 py-4 border-t border-border bg-card flex items-center justify-between shadow-xs",
        className
      )}
    >
      {/* Left: status indicators */}
      <div className="flex items-center gap-3">
        {hasUnsavedChanges && !isViewMode && (
          <span className="flex items-center gap-1.5 text-xs text-amber-500 font-semibold">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
            Unsaved Changes
          </span>
        )}
        {validationErrorsCount > 0 && !isViewMode && (
          <span className="flex items-center gap-1.5 text-xs text-red-500 font-semibold">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            {validationErrorsCount}{" "}
            {validationErrorsCount === 1 ? "error" : "errors"} to fix
          </span>
        )}
      </div>

      {/* Right: action buttons */}
      <div className="flex items-center gap-2">
        {isViewMode ? (
          <Button
            type="button"
            onClick={onCancel}
            className="bg-indigo-600 hover:bg-indigo-500 dark:bg-indigo-500 dark:hover:bg-indigo-400 text-white font-semibold h-9 px-4 text-xs shadow-xs focus:ring-1 focus:ring-ring"
          >
            Close
          </Button>
        ) : (
          <>
            <Button
              type="button"
              variant="outline"
              onClick={onCancel}
              disabled={isSubmitting}
              className="border-border text-foreground hover:bg-muted h-9 px-4 text-xs font-semibold"
            >
              Cancel
            </Button>

            {onSave && (
              <Button
                type="button"
                onClick={onSave}
                disabled={isSubmitting}
                variant="outline"
                className="border-border text-foreground hover:bg-muted bg-background h-9 px-4 text-xs font-semibold"
              >
                {isSubmitting && activeSubmitAction === "save" ? "Saving…" : "Save"}
              </Button>
            )}

            {onSaveAndClose && (
              <Button
                type="button"
                onClick={onSaveAndClose}
                disabled={isSubmitting}
                className="bg-indigo-600 hover:bg-indigo-500 dark:bg-indigo-500 dark:hover:bg-indigo-400 text-white font-semibold h-9 px-4 text-xs shadow-xs focus:ring-1 focus:ring-ring"
              >
                {isSubmitting && activeSubmitAction === "saveAndClose"
                  ? "Saving…"
                  : "Save & Close"}
              </Button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
