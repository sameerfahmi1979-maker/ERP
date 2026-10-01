"use client";

import { type ReactNode, useRef, useCallback, useState, useEffect } from "react";
import { toast } from "sonner";
import { FormErrorSummary, useInlineFieldFeedback } from "@/components/workspace/form-feedback";
import { useWorkspaceNavigationLock } from "@/hooks/use-workspace-navigation-lock";
import { collectWorkspaceFieldIssues, type WorkspaceFieldIssue } from "@/lib/workspace/form-validation";
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
  /** Missing prerequisite data disables save, not Cancel or retry controls. */
  submitDisabled?: boolean;
  onCancel?: () => void;
  onSubmit?: () => void | Promise<unknown>;
  /** Controlled/custom inputs should supply meaningful dirty state. Otherwise native edits are tracked conservatively. */
  isDirty?: boolean;
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
export function ERPChildDialogForm(props: ERPChildDialogFormProps) {
  // Each opening owns a fresh interaction/validation session; no field values go to storage.
  return props.open ? <ChildDialogSession {...props} /> : null;
}

function ChildDialogSession({
  open,
  onOpenChange,
  title,
  subtitle,
  icon,
  mode = "add",
  size = "lg",
  isSubmitting = false,
  submitDisabled = false,
  isDirty,
  onCancel,
  onSubmit,
  submitLabel,
  cancelLabel = "Cancel",
  children,
}: ERPChildDialogFormProps) {
  // Track programmatic closes (Cancel/X/Save) to block outside-click and Esc.
  const programmaticCloseRef = useRef(false);
  const flight = useRef(false);
  const body = useRef<HTMLDivElement>(null);
  const [pending, setPending] = useState(false);
  const [edited, setEdited] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [issues, setIssues] = useState<WorkspaceFieldIssue[]>([]);
  const busy = isSubmitting || pending;
  useInlineFieldFeedback(issues);
  useWorkspaceNavigationLock(mode !== "view");
  useEffect(() => {
    const element = body.current;
    const customChange = (event: Event) => {
      const target = event.target;
      if (target instanceof HTMLInputElement || target instanceof HTMLSelectElement || target instanceof HTMLTextAreaElement) return;
      setEdited(true);
      if (issues.length) queueMicrotask(() => { if (body.current) setIssues(collectWorkspaceFieldIssues(body.current)); });
    };
    element?.addEventListener("change", customChange);
    return () => element?.removeEventListener("change", customChange);
  }, [issues.length]);

  useEffect(() => {
    if (mode === "view") return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [mode]);

  const closeDialog = useCallback(() => {
    programmaticCloseRef.current = true;
    onOpenChange(false);
    queueMicrotask(() => {
      programmaticCloseRef.current = false;
    });
  }, [onOpenChange]);

  const handleCancel = useCallback(() => {
    if (flight.current || isSubmitting) return;
    if (mode !== "view" && (isDirty ?? edited)) { setConfirmDiscard(true); return; }
    onCancel?.();
    closeDialog();
  }, [onCancel, closeDialog, isSubmitting, mode, isDirty, edited]);

  const submit = async () => {
    if (flight.current || isSubmitting || submitDisabled || !onSubmit) return;
    const invalid = body.current ? collectWorkspaceFieldIssues(body.current) : [];
    setIssues(invalid);
    if (invalid.length) { invalid[0].control?.focus(); return; }
    flight.current = true;
    setPending(true);
    try { await onSubmit(); }
    catch { toast.error("The save could not be confirmed. Your entries are still here. Check the record before retrying to avoid duplicates."); }
    finally { flight.current = false; setPending(false); }
  };

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
          "algt-form-surface flex flex-col p-0 gap-0 overflow-hidden",
          // UI.4G: content above overlay (z-[110]), combobox inside at z-[120].
          "z-[110]",
          "w-[calc(100vw-24px)]",
          SIZE_CLASSES[size],
          "max-h-[calc(100vh-96px)]",
          "max-w-none",
        )}
      >
        {mode !== "view" && <p className="px-6 pt-3 text-xs text-muted-foreground">Finish or cancel this dialog before leaving the page. Unsaved dialog entries and selected files are not restored after leaving or reloading.</p>}
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
            disabled={busy}
            type="button"
            onClick={handleCancel}
            aria-label="Close"
          >
            <XIcon className="h-4 w-4" />
          </Button>
        </div>

        {/* ── Body (scrollable) ───────────────────────────────────────── */}
        <div ref={body} className="flex-1 overflow-y-auto p-6 min-h-0" inert={busy || undefined}
          onChangeCapture={event => {
            setEdited(true);
            if (!issues.length || !body.current) return;
            const target = event.target;
            if (target instanceof HTMLInputElement || target instanceof HTMLSelectElement || target instanceof HTMLTextAreaElement) {
              setIssues(collectWorkspaceFieldIssues(body.current));
            } else {
              queueMicrotask(() => { if (body.current) setIssues(collectWorkspaceFieldIssues(body.current)); });
            }
          }}>
          <FormErrorSummary issues={issues} onReveal={issue => issue.control?.focus()} />
          {children}
        </div>

        {confirmDiscard && <div role="alert" className="border-t border-amber-500/40 bg-amber-500/10 px-6 py-3 text-sm">
          <p className="font-medium">Discard unsaved changes?</p><p>Your entries in this dialog have not been saved.</p>
          <div className="mt-2 flex gap-2">
            <Button type="button" variant="outline" onClick={() => setConfirmDiscard(false)}>Keep editing</Button>
            <Button type="button" variant="destructive" disabled={busy} onClick={() => { if (flight.current || isSubmitting) return; onCancel?.(); closeDialog(); }}>Discard changes</Button>
          </div>
        </div>}

        {/* ── Footer (sticky) ────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-6 py-3 border-t bg-muted/30 shrink-0">
          <Button
            type="button"
            variant="outline"
            onClick={handleCancel}
            disabled={busy}
          >
            {cancelLabel}
          </Button>

          {mode !== "view" && onSubmit && (
            <Button
              type="button"
              onClick={submit}
              disabled={busy || confirmDiscard || submitDisabled}
            >
              {busy && (
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
