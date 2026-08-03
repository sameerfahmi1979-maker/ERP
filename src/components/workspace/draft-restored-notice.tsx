"use client";

/**
 * ERP GLOBAL WORKSPACE.PERF.1 (WS.3) — DraftRestoredNotice
 *
 * Small amber banner shown at the top of a record form when the workspace
 * draft system restored unsaved values after a tab switch. Makes draft
 * behavior visible and trustworthy: the user knows the values on screen
 * include unsaved edits, not the last saved state.
 *
 * Usage (inside a form using useWorkspaceFormDraft):
 *   const { restoredFromDraft, clearDraft } = useWorkspaceFormDraft({ formId });
 *   <DraftRestoredNotice visible={restoredFromDraft} />
 *
 * Pass onDiscard to offer a "Discard draft" action — the form is responsible
 * for resetting its own values to the saved/server state afterwards.
 */

import { useState } from "react";
import { History, X } from "lucide-react";
import { cn } from "@/lib/utils";

type DraftRestoredNoticeProps = {
  /** Render nothing when false (pass restoredFromDraft from the hook). */
  visible: boolean;
  /**
   * Optional discard handler. The handler must clear the draft AND reset the
   * form values back to the saved state (e.g. clearDraft() + state reset).
   */
  onDiscard?: () => void;
  className?: string;
};

export function DraftRestoredNotice({ visible, onDiscard, className }: DraftRestoredNoticeProps) {
  const [dismissed, setDismissed] = useState(false);

  if (!visible || dismissed) return null;

  return (
    <div
      role="status"
      className={cn(
        "flex items-center gap-2 rounded-md border border-amber-300/60 bg-amber-50 dark:bg-amber-950/30",
        "px-3 py-2 text-xs text-amber-800 dark:text-amber-300",
        className
      )}
    >
      <History className="h-3.5 w-3.5 shrink-0" />
      <span className="flex-1 min-w-0">
        Unsaved changes from your previous visit were restored — this form is not yet saved.
      </span>
      {onDiscard && (
        <button
          type="button"
          onClick={onDiscard}
          className="shrink-0 font-medium underline underline-offset-2 hover:text-amber-950 dark:hover:text-amber-100"
        >
          Discard draft
        </button>
      )}
      <button
        type="button"
        aria-label="Dismiss"
        onClick={() => setDismissed(true)}
        className="shrink-0 h-4 w-4 rounded flex items-center justify-center hover:bg-amber-200/60 dark:hover:bg-amber-900/60"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}
