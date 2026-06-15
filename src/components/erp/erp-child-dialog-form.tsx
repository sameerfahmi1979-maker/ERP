"use client";

import { type ReactNode, useRef, useCallback } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Loader2, X as XIcon } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";

// ──────────────────────────────────────────────────────────────────────────────
// Size tokens — matches prompt spec §4.3
// sm  = 520px  (simple confirmation / ≤4 fields)
// md  = 720px  (small form, ≤8 fields, no cascades)
// lg  = 960px  (default — most child forms)
// xl  = 1120px (complex matrix/table forms — requires justification)
// ──────────────────────────────────────────────────────────────────────────────
const SIZE_CLASSES: Record<string, string> = {
  sm: "sm:max-w-[520px]",
  md: "sm:max-w-[720px]",
  lg: "sm:max-w-[960px]",
  xl: "sm:max-w-[1120px]",
};

export type ERPChildDialogFormProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  mode?: "add" | "edit" | "view";
  size?: keyof typeof SIZE_CLASSES;
  isSubmitting?: boolean;
  onCancel?: () => void;
  onSubmit?: () => void;
  submitLabel?: string;
  cancelLabel?: string;
  children: ReactNode;
};

/**
 * ERPChildDialogForm — ERP GLOBAL UI.4G standard wrapper for all child form dialogs.
 *
 * Design decision (UI.4G):
 *   Child forms are intentional BLOCKING modal tasks. When open:
 *   - Full workspace is covered by the overlay (z-[100])
 *   - Dialog content renders at z-[110], above tab bar (z-[30])
 *   - Combobox/popover inside the dialog uses z-[120]
 *   - Outside click and Esc are disabled — user must Cancel/Save explicitly
 *   - Parent record content is inert (handled by ERPRecordWorkspaceForm)
 */
export function ERPChildDialogForm({
  open,
  onOpenChange,
  title,
  subtitle,
  icon,
  mode = "add",
  size = "lg",
  isSubmitting = false,
  onCancel,
  onSubmit,
  submitLabel,
  cancelLabel = "Cancel",
  children,
}: ERPChildDialogFormProps) {
  // Track programmatic closes (Cancel/X/Save) to block outside-click and Esc.
  const programmaticCloseRef = useRef(false);

  const closeDialog = useCallback(() => {
    programmaticCloseRef.current = true;
    onOpenChange(false);
    queueMicrotask(() => {
      programmaticCloseRef.current = false;
    });
  }, [onOpenChange]);

  const handleCancel = useCallback(() => {
    onCancel?.();
    closeDialog();
  }, [onCancel, closeDialog]);

  // Guard: only allow close if triggered programmatically (not by Esc/outside click).
  const guardedOnOpenChange = useCallback(
    (newOpen: boolean) => {
      if (!newOpen && !programmaticCloseRef.current) {
        // Blocked — outside click or Esc
        return;
      }
      onOpenChange(newOpen);
    },
    [onOpenChange],
  );

  const defaultSubmitLabel = mode === "edit" ? "Save" : "Add";
  const resolvedSubmitLabel = submitLabel ?? defaultSubmitLabel;

  return (
    <Dialog open={open} onOpenChange={guardedOnOpenChange}>
      <DialogContent
        showCloseButton={false}
        // UI.4G: overlay covers entire viewport including workspace tab bar.
        // z-[100] ensures the overlay is above the tab bar (z-[30]).
        overlayClassName="bg-slate-950/60 backdrop-blur-[2px] z-[100]"
        className={cn(
          "flex flex-col p-0 gap-0 overflow-hidden",
          // UI.4G: content above overlay (z-[110]), combobox inside at z-[120].
          "z-[110]",
          "w-[calc(100vw-24px)]",
          SIZE_CLASSES[size],
          "max-h-[calc(100vh-96px)]",
          "max-w-none",
        )}
      >
        {/* ── Header ─────────────────────────────────────────────────── */}
        <div className="flex items-start gap-3 px-6 py-4 border-b shrink-0">
          {icon && (
            <div className="mt-0.5 text-muted-foreground shrink-0">{icon}</div>
          )}
          <div className="flex-1 min-w-0">
            <DialogTitle className="text-base font-semibold leading-none">
              {title}
            </DialogTitle>
            {subtitle && (
              <p className="text-sm text-muted-foreground mt-1 leading-snug">
                {subtitle}
              </p>
            )}
          </div>
          {/* X button — plain button, not DialogPrimitive.Close, so we control close behavior */}
          <Button
            variant="ghost"
            size="icon-sm"
            className="shrink-0 -mr-2 -mt-1"
            disabled={isSubmitting}
            type="button"
            onClick={handleCancel}
            aria-label="Close"
          >
            <XIcon className="h-4 w-4" />
          </Button>
        </div>

        {/* ── Body (scrollable) ───────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto p-6 min-h-0">{children}</div>

        {/* ── Footer (sticky) ────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-6 py-3 border-t bg-muted/30 shrink-0">
          <Button
            type="button"
            variant="outline"
            onClick={handleCancel}
            disabled={isSubmitting}
          >
            {cancelLabel}
          </Button>

          {mode !== "view" && onSubmit && (
            <Button
              type="button"
              onClick={onSubmit}
              disabled={isSubmitting}
            >
              {isSubmitting && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              {resolvedSubmitLabel}
            </Button>
          )}

          {mode === "view" && (
            <Button type="button" variant="outline" onClick={handleCancel}>
              Close
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
