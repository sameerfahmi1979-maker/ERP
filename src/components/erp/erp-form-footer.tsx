"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { AlertTriangle } from "lucide-react";
import { useERPDrawerForm } from "@/components/erp/erp-drawer-form";

interface ERPFormFooterProps {
  /**
   * Mode determines which buttons to show
   * - "add" or "edit": Shows Cancel, Save, Save & Close
   * - "view": Shows Close only
   */
  mode: "add" | "edit" | "view";
  
  /**
   * Callback when Cancel is clicked (add/edit mode)
   * or Close is clicked (view mode)
   */
  onCancel: () => void;
  
  /**
   * Callback when Save is clicked (keeps form open)
   * Optional - if not provided, Save button won't be shown
   */
  onSave?: () => void;
  
  /**
   * Callback when Save & Close is clicked (saves and closes)
   */
  onSaveAndClose?: () => void;
  
  /**
   * Form ID to submit via button form attribute
   * Alternative to onClick handlers
   */
  formId?: string;
  
  /**
   * Whether form is currently submitting
   */
  isSubmitting?: boolean;
  
  /**
   * Whether there are unsaved changes (shows indicator)
   */
  hasUnsavedChanges?: boolean;
  
  /**
   * Number of validation errors to display
   */
  validationErrorsCount?: number;
  
  /**
   * Which button triggered the submit ("save" or "saveAndClose")
   * Used to show different loading states
   */
  activeSubmitAction?: "save" | "saveAndClose" | null;
  
  /**
   * Additional className for footer container
   */
  className?: string;
}

export function ERPFormFooter({
  mode,
  onCancel,
  onSave,
  onSaveAndClose,
  isSubmitting = false,
  hasUnsavedChanges = false,
  validationErrorsCount = 0,
  activeSubmitAction = null,
  className
}: ERPFormFooterProps) {
  const isViewMode = mode === "view";
  const drawerContext = useERPDrawerForm();
  
  // Use context's requestClose if available (for safe close), otherwise use onCancel prop
  const handleCancel = () => {
    if (drawerContext?.requestClose) {
      drawerContext.requestClose();
    } else {
      onCancel();
    }
  };
  
  return (
    <div className={cn(
      "px-6 py-4 border-t border-border bg-card flex items-center justify-between shrink-0 mt-auto shadow-xs",
      className
    )}>
      {/* Left side - Status indicators */}
      <div className="flex items-center gap-2">
        {hasUnsavedChanges && !isViewMode && (
          <div className="flex items-center gap-1.5 text-xs text-amber-500 font-semibold">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse"></span>
            <span>Unsaved Changes</span>
          </div>
        )}
        {validationErrorsCount > 0 && !isViewMode && (
          <div className="flex items-center gap-1.5 text-xs text-red-500 font-semibold">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            <span>{validationErrorsCount} {validationErrorsCount === 1 ? "error" : "errors"} to fix</span>
          </div>
        )}
      </div>

      {/* Right side - Action buttons */}
      <div className="flex items-center gap-2">
        {isViewMode ? (
          // View mode: Close button only - use onCancel directly (no safe close needed in view mode)
          <Button
            type="button"
            onClick={onCancel}
            className="bg-indigo-600 hover:bg-indigo-500 dark:bg-indigo-500 dark:hover:bg-indigo-400 text-white font-semibold h-9 px-4 text-xs shadow-xs focus:ring-1 focus:ring-ring"
          >
            Close
          </Button>
        ) : (
          // Add/Edit mode: Cancel, Save, Save & Close
          <>
            <Button
              type="button"
              variant="outline"
              onClick={handleCancel}
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
                className="border-border text-foreground hover:bg-muted bg-background h-9 px-4 text-xs font-semibold"
              >
                {isSubmitting && activeSubmitAction === "save" ? "Saving..." : "Save"}
              </Button>
            )}
            
            {onSaveAndClose && (
              <Button
                type="button"
                onClick={onSaveAndClose}
                disabled={isSubmitting}
                className="bg-indigo-600 hover:bg-indigo-500 dark:bg-indigo-500 dark:hover:bg-indigo-400 text-white font-semibold h-9 px-4 text-xs shadow-xs focus:ring-1 focus:ring-ring"
              >
                {isSubmitting && activeSubmitAction === "saveAndClose" ? "Saving..." : "Save & Close"}
              </Button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
