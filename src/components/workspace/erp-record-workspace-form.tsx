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
import { cn } from "@/lib/utils";
import { ERPRecordHeader } from "./erp-record-header";
import { ERPRecordSectionNav } from "./erp-record-section-nav";
import { ERPRecordFormFooter } from "./erp-record-form-footer";
import type { ERPRecordSection, ERPRecordAuditInfo } from "./erp-record-section-nav";
import type { ERPRecordWorkspaceFormMode, ERPRecordStatusVariant } from "./erp-record-header";

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
  const contextValue = React.useMemo<ERPRecordWorkspaceFormContextValue>(
    () => ({
      requestClose: () => onRequestClose?.(),
      mode,
    }),
    [onRequestClose, mode]
  );

  return (
    <ERPRecordWorkspaceFormContext.Provider value={contextValue}>
      <div className="h-full flex flex-col overflow-hidden bg-background">

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
          actions={headerActions}
          onRequestClose={onRequestClose}
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
          {/* Section nav + scrollable body.
              ERP GLOBAL UI.4E.1: section nav is hidden when sections.length <= 1 (compact/single-section forms).
              This allows Finance Basics, UOM, Geography etc. to use the same shell without a heavy nav. */}
          <div className="flex flex-1 min-h-0 overflow-hidden">
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
              className="flex-1 min-h-0 overflow-y-auto overscroll-contain"
            >
              <div className="p-6 max-w-3xl space-y-6 pb-8">
                {children}
              </div>
            </div>
          </div>

          {/* Footer */}
          <ERPRecordFormFooter
            mode={mode}
            onCancel={onRequestClose}
            onSave={onSave as (() => void) | undefined}
            onSaveAndClose={onSaveAndClose as (() => void) | undefined}
            hasUnsavedChanges={isDirty}
            isSubmitting={isSubmitting}
            validationErrorsCount={validationErrorsCount}
            activeSubmitAction={activeSubmitAction}
          />
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

  React.useEffect(() => {
    if (isActive && !hasMounted) setHasMounted(true);
  }, [isActive, hasMounted]);

  if (!hasMounted) return null;

  return (
    <div
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
