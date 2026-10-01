"use client";

/**
 * ERP GLOBAL UI.4C — ERPRecordWorkspaceForm
 *
 * Full-page record form shell for workspace record tabs.
 * Replaces ERPDrawerForm for large entities (5+ tabs, child tables).
 * Converted starting from UI.4D (Party Master pilot).
 *
 * Layout:
 *   ERPRecordHeader          (shrink-0, always visible)
 *   content zone             (flex-1, overflow-hidden, inert-able)
 *     ERPRecordSectionNav    (w-[240px] desktop / horizontal mobile)
 *     record body            (flex-1, overflow-auto via ScrollArea)
 *   ERPRecordFormFooter      (shrink-0, always visible)
 *
 * Child dialog inert support:
 *   When isChildDialogOpen=true the content zone becomes inert + opacity-50.
 *   Header, workspace tab bar, and sidebar remain fully interactive.
 *
 * Context:
 *   Provides ERPRecordWorkspaceFormContext so deeply-nested components
 *   can call requestClose without prop-drilling.
 */

import * as React from "react";
import { toast } from "sonner";
import { FormErrorSummary, mergeFieldIssues, useInlineFieldFeedback } from "./form-feedback";
import { collectWorkspaceFieldIssues, resolveWorkspaceFieldIssues, type WorkspaceFieldIssue } from "@/lib/workspace/form-validation";
import { WORKSPACE_FIELD_ERRORS_EVENT, type WorkspaceFieldErrors } from "@/lib/workspace/field-errors";
import { useWorkspaceContext } from "./workspace-provider";
import { useWorkspaceFormOwner } from "@/hooks/use-workspace-form-owner";
import { useWorkspaceNavigationLock } from "@/hooks/use-workspace-navigation-lock";
import { cn } from "@/lib/utils";
import { ERPRecordHeader } from "./erp-record-header";
import { ERPRecordSectionNav } from "./erp-record-section-nav";
import { ERPRecordFormFooter } from "./erp-record-form-footer";
import type { ERPRecordSection, ERPRecordAuditInfo } from "./erp-record-section-nav";
import type { ERPRecordWorkspaceFormMode, ERPRecordStatusVariant } from "./erp-record-header";

/** Legacy record adapters can wrap the shell in a form or place it inside the shell. */
function recordForm(root: HTMLElement | null): HTMLFormElement | null {
  return root?.closest("form") ?? root?.querySelector("form") ?? null;
}

// Re-export shared types so consumers import from one place
export type { ERPRecordSection, ERPRecordAuditInfo, ERPRecordWorkspaceFormMode, ERPRecordStatusVariant };

// ── Internal context (for deeply-nested consumers) ────────────────────────────

type ERPRecordWorkspaceFormContextValue = {
  /** Workspace-aware safe close — triggers dirty dialog if needed */
  requestClose: () => void;
  mode: ERPRecordWorkspaceFormMode;
};

const ERPRecordWorkspaceFormContext =
  React.createContext<ERPRecordWorkspaceFormContextValue | null>(null);

/** Access the record workspace form context from any nested component. */
export function useERPRecordWorkspaceForm() {
  return React.useContext(ERPRecordWorkspaceFormContext);
}

// ── Props ─────────────────────────────────────────────────────────────────────

export interface ERPRecordWorkspaceFormProps {
  /** Whether the form has unsaved changes — drives tab dot + footer indicator */
  isDirty: boolean;
  mode: ERPRecordWorkspaceFormMode;

  // ── Header ─────────────────────────────────────────────────────────────────
  title: string;
  subtitle?: string;
  recordCode?: string;
  statusLabel?: string;
  statusVariant?: ERPRecordStatusVariant;
  typeBadges?: string[];
  /** Extra header actions slot (e.g. Print, Export) */
  headerActions?: React.ReactNode;

  // ── Section nav ────────────────────────────────────────────────────────────
  sections: ERPRecordSection[];
  activeSection: string;
  onSectionChange: (sectionId: string) => void;
  auditInfo?: ERPRecordAuditInfo;

  // ── Footer / submit ────────────────────────────────────────────────────────
  isSubmitting?: boolean;
  validationErrorsCount?: number;
  activeSubmitAction?: "save" | "saveAndClose" | null;
  /** Save — keeps record form open after saving */
  onSave?: () => void | boolean | Promise<void> | Promise<boolean>;
  /** Save & close — save then close the current workspace tab */
  onSaveAndClose?: () => void | boolean | Promise<void> | Promise<boolean>;

  // ── Close / navigation ─────────────────────────────────────────────────────
  /**
   * Called when user clicks Close/Cancel/X.
   * Wire this to useRecordWorkspaceForm().requestClose — which calls
   * workspace.closeTab(activeTabId), triggering the 4B dirty dialog if needed.
   */
  onRequestClose?: () => void;

  // ── Child dialog inert support ─────────────────────────────────────────────
  /**
   * When true, the content zone (nav + body + footer) becomes inert + dim.
   * Child dialog portals escape the inert wrapper via portal to body.
   */
  isChildDialogOpen?: boolean;

  /**
   * ERP GLOBAL UI.4E — optional ref forwarded to the record body scroll container.
   * Use with useWorkspaceScrollState to persist/restore scroll position when
   * switching workspace tabs.
   */
  bodyScrollRef?: React.RefObject<HTMLDivElement | null>;

  children: React.ReactNode;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function ERPRecordWorkspaceForm({
  isDirty,
  mode,
  title,
  subtitle,
  recordCode,
  statusLabel,
  statusVariant,
  typeBadges,
  headerActions,
  sections,
  activeSection,
  onSectionChange,
  auditInfo,
  isSubmitting = false,
  validationErrorsCount = 0,
  activeSubmitAction = null,
  onSave,
  onSaveAndClose,
  onRequestClose,
  isChildDialogOpen = false,
  bodyScrollRef,
  children,
}: ERPRecordWorkspaceFormProps) {
  const root = React.useRef<HTMLDivElement>(null);
  const flight = React.useRef(false);
  const [saving, setSaving] = React.useState(false);
  const [compactIdentity, setCompactIdentity] = React.useState(false);
  const [issues, setIssues] = React.useState<WorkspaceFieldIssue[]>([]);
  const [serverIssues, setServerIssues] = React.useState<WorkspaceFieldIssue[]>([]);
  const [focusTarget, setFocusTarget] = React.useState<WorkspaceFieldIssue | null>(null);
  const errorId = React.useId();
  const pending = saving || isSubmitting;
  useWorkspaceNavigationLock(isChildDialogOpen || pending);
  const workspace = useWorkspaceContext();
  const owner = useWorkspaceFormOwner();
  const dispatch = workspace?.dispatch;
  const ownerId = owner?.id;
  React.useEffect(() => {
    if (!dispatch || !ownerId) return;
    dispatch({ type: "MARK_CHILD_DIALOG_OPEN", tabId: ownerId, open: isChildDialogOpen || pending });
    return () => dispatch({ type: "MARK_CHILD_DIALOG_OPEN", tabId: ownerId, open: false });
  }, [dispatch, ownerId, isChildDialogOpen, pending]);
  const allIssues = React.useMemo(() => mergeFieldIssues(issues, serverIssues), [issues, serverIssues]);
  useInlineFieldFeedback(allIssues);
  React.useEffect(() => {
    const element = root.current;
    const customChange = (event: Event) => {
      const form = recordForm(element), target = event.target;
      if (!issues.length || !form || !(target instanceof HTMLElement) || target.closest("form") !== form) return;
      if (target instanceof HTMLInputElement || target instanceof HTMLSelectElement || target instanceof HTMLTextAreaElement) return;
      // Custom widgets emit a native change event; React does not synthesize onChange for a div.
      queueMicrotask(() => { if (recordForm(root.current) === form) setIssues(collectWorkspaceFieldIssues(form)); });
    };
    element?.addEventListener("change", customChange);
    return () => element?.removeEventListener("change", customChange);
  }, [issues.length]);
  const reveal = (issue: WorkspaceFieldIssue) => {
    if (issue.section) onSectionChange(issue.section);
    // The same summary entry can be activated repeatedly. A fresh request is
    // needed even when the field/section did not change (notably in WebKit).
    setFocusTarget({ ...issue });
  };
  React.useEffect(() => {
    if (!pending && focusTarget?.control?.isConnected) focusTarget.control.focus();
  }, [focusTarget, activeSection, pending]);
  React.useEffect(() => {
    const element = root.current;
    const handler = (event: Event) => {
      const form = recordForm(element);
      if (!form || event.target !== form) return;
      const next = resolveWorkspaceFieldIssues(form, (event as CustomEvent<WorkspaceFieldErrors>).detail);
      setServerIssues(next);
      if (next[0]) {
        if (next[0].section) onSectionChange(next[0].section);
        setFocusTarget(next[0]);
      }
    };
    const eventRoot = recordForm(element) ?? element;
    eventRoot?.addEventListener(WORKSPACE_FIELD_ERRORS_EVENT, handler);
    return () => eventRoot?.removeEventListener(WORKSPACE_FIELD_ERRORS_EVENT, handler);
  }, [onSectionChange]);
  const validate = () => {
    const form = recordForm(root.current);
    const next = form ? collectWorkspaceFieldIssues(form) : [];
    setIssues(next);
    setServerIssues([]);
    if (next.length) reveal(next[0]);
    return next.length === 0;
  };
  const runSave = async (action: NonNullable<typeof onSave>) => {
    if (flight.current || pending || isChildDialogOpen || !validate()) return;
    flight.current = true;
    setSaving(true);
    try { await action(); }
    catch { toast.error("The save could not be confirmed. Your draft is retained; check the record before retrying."); }
    finally { flight.current = false; setSaving(false); }
  };
  const contextValue = React.useMemo<ERPRecordWorkspaceFormContextValue>(
    () => ({
      requestClose: () => onRequestClose?.(),
      mode,
    }),
    [onRequestClose, mode]
  );

  return (
    <ERPRecordWorkspaceFormContext.Provider value={contextValue}>
      <div ref={root} className="h-full min-h-0 min-w-0 flex flex-col overflow-hidden bg-card border border-border rounded-sm"
        onChangeCapture={event => {
          const form = recordForm(root.current);
          if (issues.length && form && (event.target as HTMLInputElement).form === form) {
            setIssues(collectWorkspaceFieldIssues(form));
          }
        }}
        onInputCapture={event => {
          const form = recordForm(root.current);
          if (issues.length && form && (event.target as HTMLInputElement).form === form) {
            setIssues(collectWorkspaceFieldIssues(form));
          }
        }}
        onSubmitCapture={event => {
          // Child dialogs have their own validation and save lifecycle.
          if (event.target !== recordForm(root.current)) return;
          if (pending || isChildDialogOpen || !validate()) { event.preventDefault(); event.stopPropagation(); }
        }}
        onInvalidCapture={event => {
          if ((event.target as HTMLInputElement).form !== recordForm(root.current)) return;
          event.preventDefault();
          validate();
        }}
      >

        {/* ── Header — always active (never dimmed by child dialog) ── */}
        <ERPRecordHeader
          mode={mode}
          title={title}
          subtitle={subtitle}
          recordCode={recordCode}
          statusLabel={statusLabel}
          statusVariant={statusVariant}
          typeBadges={typeBadges}
          isDirty={isDirty}
          compact={compactIdentity}
          actions={headerActions}
          onRequestClose={pending || isChildDialogOpen ? undefined : onRequestClose}
        />

        {/* ── Content zone — inert + dimmed when child dialog is open ── */}
        <div
          inert={isChildDialogOpen || undefined}
          className={cn(
            "flex flex-col flex-1 min-h-0 overflow-hidden",
            "transition-opacity duration-200",
            isChildDialogOpen && "opacity-50"
          )}
        >
          {/* Footer */}
          <ERPRecordFormFooter
            mode={mode}
            onCancel={pending || isChildDialogOpen ? undefined : onRequestClose}
            onSave={onSave ? () => { void runSave(onSave); } : undefined}
            onSaveAndClose={onSaveAndClose ? () => { void runSave(onSaveAndClose); } : undefined}
            hasUnsavedChanges={isDirty}
            isSubmitting={pending}
            validationErrorsCount={Math.max(validationErrorsCount, allIssues.length)}
            activeSubmitAction={activeSubmitAction}
          />

          {/* Section nav + scrollable body.
              ERP GLOBAL UI.4E.1: section nav is hidden when sections.length <= 1 (compact/single-section forms).
              This allows Finance Basics, UOM, Geography etc. to use the same shell without a heavy nav. */}
          <div inert={pending || undefined} aria-busy={pending} className="flex flex-col lg:flex-row flex-1 min-h-0 min-w-0 overflow-hidden">
            {sections.length > 1 && (
              <ERPRecordSectionNav
                sections={sections}
                activeSection={activeSection}
                onSectionChange={onSectionChange}
                auditInfo={auditInfo}
              />
            )}

            {/* Record body — native overflow-auto so scroll position can be tracked (UI.4E) */}
            <div
              ref={bodyScrollRef}
              data-record-body
              onScroll={event => setCompactIdentity(event.currentTarget.scrollTop > 96)}
              className="flex-1 min-w-0 min-h-0 overflow-y-auto overscroll-contain"
            >
              <div className="p-4 md:p-6 max-w-5xl space-y-6 pb-8">
                <FormErrorSummary issues={allIssues} onReveal={reveal} id={errorId} />
                {children}
              </div>
            </div>
          </div>

        </div>

      </div>
    </ERPRecordWorkspaceFormContext.Provider>
  );
}

// ── ERPRecordSectionPanel ─────────────────────────────────────────────────────
// Same pattern as ERPDrawerSection — lazy mount support.

/**
 * Wraps the content for one record section panel.
 * lazyMount=true: children don't render until the section is first activated,
 * then stay mounted (keepMounted pattern from ERPDrawerSection).
 *
 * Safety rule: Only use lazyMount on sections whose fields are NOT read by
 * new FormData(form) in the parent save handler.
 */
export function ERPRecordSectionPanel({
  id,
  activeId,
  title,
  children,
  lazyMount = false,
}: {
  id: string;
  activeId: string;
  title?: string;
  children: React.ReactNode;
  lazyMount?: boolean;
}) {
  const isActive = id === activeId;
  const [hasMounted, setHasMounted] = React.useState<boolean>(!lazyMount || isActive);

  if ((!lazyMount || isActive) && !hasMounted) setHasMounted(true);

  if (!hasMounted) return null;

  return (
    <div
      data-workspace-section={id}
      className={cn("space-y-4.5", isActive ? "animate-in fade-in duration-200" : "hidden")}
      aria-hidden={!isActive}
    >
      {title && (
        <h3 className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider border-b border-border pb-2">
          {title}
        </h3>
      )}
      {children}
    </div>
  );
}
