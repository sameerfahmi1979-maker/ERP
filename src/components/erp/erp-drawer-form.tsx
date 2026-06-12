"use client";

import * as React from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { 
  X, 
  Printer, 
  AlertTriangle,
  Info,
  Clock
} from "lucide-react";
import { UnsavedChangesDialog } from "@/components/erp/unsaved-changes-dialog";

// Minimal structural type for Base UI Dialog change event details
type DialogChangeEventDetails = {
  reason?: string;
  cancel?: () => void;
};

// Context for safe close request
const ERPDrawerFormContext = React.createContext<{
  requestClose: () => void;
} | null>(null);

export function useERPDrawerForm() {
  const context = React.useContext(ERPDrawerFormContext);
  return context;
}

// Root Component
interface ERPDrawerFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  subtitle?: string;
  mode?: "add" | "edit" | "view" | "draft" | "approval";
  status?: string;
  recordNumber?: string;
  children: React.ReactNode;
  onPrint?: () => void;
  onExportPDF?: () => void;
  onExportExcel?: () => void;
  onExportCSV?: () => void;
  onSendEmail?: () => void;
  isDirty?: boolean;
}

export function ERPDrawerForm({
  open,
  onOpenChange,
  title,
  subtitle,
  mode = "add",
  status,
  recordNumber,
  children,
  onPrint,
  onExportPDF,
  onExportCSV,
  onExportExcel,
  onSendEmail,
  isDirty = false
}: ERPDrawerFormProps) {
  const [showUnsavedDialog, setShowUnsavedDialog] = React.useState(false);

  const isEditable = mode === "add" || mode === "edit" || mode === "draft";
  const shouldBlockClose = isEditable && isDirty;

  // Request close - shows confirmation if dirty, otherwise closes immediately
  const requestClose = () => {
    if (shouldBlockClose) {
      setShowUnsavedDialog(true);
    } else {
      onOpenChange(false);
    }
  };

  // Intercept Base UI close attempts (outside click, Escape, close button).
  // Programmatic closes (Discard, Save & Close) call the parent onOpenChange
  // directly and never route through this handler, so blocking every dirty
  // close here is safe and avoids depending on specific reason strings.
  const handleOpenChange = (newOpen: boolean, eventDetails?: DialogChangeEventDetails) => {
    if (!newOpen && shouldBlockClose) {
      // cancel() tells Base UI's DialogStore.setOpen to abort the state change
      eventDetails?.cancel?.();
      setShowUnsavedDialog(true);
      return;
    }
    onOpenChange(newOpen);
  };

  const handleStayOnForm = () => {
    setShowUnsavedDialog(false);
  };

  const handleDiscardChanges = () => {
    setShowUnsavedDialog(false);
    onOpenChange(false);
  };

  return (
    <>
      <Sheet open={open} onOpenChange={handleOpenChange}>
        <SheetContent
          side="right"
          showCloseButton={false}
          className="p-0 border-l border-border bg-background text-foreground flex flex-col h-screen sm:!max-w-[80vw] w-full max-w-[1480px] min-w-[320px] md:min-w-[960px] focus:outline-none shadow-2xl transition duration-300"
        >
          <ERPDrawerFormContext.Provider value={{ requestClose }}>
            <ERPDrawerHeader
              title={title}
              subtitle={subtitle}
              mode={mode}
              status={status}
              recordNumber={recordNumber}
              onClose={requestClose}
              onPrint={onPrint}
              onExportPDF={onExportPDF}
              onExportExcel={onExportExcel}
              onExportCSV={onExportCSV}
              onSendEmail={onSendEmail}
            />
            <div className="flex-1 flex overflow-hidden min-h-0 bg-background">
              {children}
            </div>
          </ERPDrawerFormContext.Provider>
        </SheetContent>
      </Sheet>
      
      <UnsavedChangesDialog
        open={showUnsavedDialog}
        onOpenChange={setShowUnsavedDialog}
        onStay={handleStayOnForm}
        onDiscard={handleDiscardChanges}
      />
    </>
  );
}

// Header Component
interface ERPDrawerHeaderProps {
  title: string;
  subtitle?: string;
  mode: "add" | "edit" | "view" | "draft" | "approval";
  status?: string;
  recordNumber?: string;
  onClose: () => void;
  onPrint?: () => void;
  onExportPDF?: () => void;
  onExportExcel?: () => void;
  onExportCSV?: () => void;
  onSendEmail?: () => void;
}

export function ERPDrawerHeader({
  title,
  subtitle,
  mode,
  status,
  recordNumber,
  onClose,
  onPrint,
  onExportPDF,
  onExportExcel,
  onExportCSV,
  onSendEmail
}: ERPDrawerHeaderProps) {
  return (
    <div className="px-6 py-4.5 border-b border-border flex items-center justify-between bg-card shrink-0 shadow-xs">
      <div className="space-y-1">
        <div className="flex items-center gap-2 flex-wrap">
          <SheetTitle className="text-foreground font-bold text-base md:text-lg tracking-tight leading-none">{title}</SheetTitle>
          <ERPDraftBadge mode={mode} />
          {recordNumber && (
            <Badge variant="outline" className="bg-muted text-muted-foreground border-border text-[10px] py-0 px-2 font-medium">
              {recordNumber}
            </Badge>
          )}
          {status && <ERPStatusBadge status={status} />}
        </div>
        {subtitle && (
          <SheetDescription className="text-muted-foreground text-xs font-normal mt-0.5">
            {subtitle}
          </SheetDescription>
        )}
      </div>

      <div className="flex items-center gap-2">
        {/* Export & Print Actions - Placeholder (Phase 002E.3) */}
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled
          className="h-8 text-xs gap-1.5 px-3 opacity-60 cursor-not-allowed"
          title="Export and email actions will be enabled in Phase 002E.3"
        >
          <Printer className="h-3.5 w-3.5" />
          <span>Actions</span>
        </Button>

        <Button
          variant="ghost"
          size="icon"
          onClick={onClose}
          className="h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-muted rounded-md focus:ring-1 focus:ring-ring"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

// Side Section Navigation
interface ERPDrawerSectionNavProps {
  sections: { id: string; label: string; icon: React.ComponentType<{ className?: string }> }[];
  activeSection: string;
  setActiveSection: (id: string) => void;
  auditInfo?: {
    createdBy?: string;
    updatedBy?: string;
    updatedAt?: string;
  };
}

export function ERPDrawerSectionNav({
  sections,
  activeSection,
  setActiveSection,
  auditInfo
}: ERPDrawerSectionNavProps) {
  return (
    <div className="w-[240px] border-r border-border bg-muted/30 p-4 flex flex-col justify-between shrink-0 h-full">
      <div className="space-y-1">
        <div className="text-[10px] font-bold text-muted-foreground/80 tracking-wider uppercase px-2.5 mb-2">Form Sections</div>
        {sections.map((section) => {
          const Icon = section.icon;
          return (
            <button
              key={section.id}
              type="button"
              onClick={() => setActiveSection(section.id)}
              className={cn(
                "w-full flex items-center gap-2.5 px-3 py-2 text-xs rounded-md transition-all text-left font-medium focus:outline-none focus:ring-1 focus:ring-ring",
                activeSection === section.id
                  ? "bg-indigo-600 text-white font-semibold shadow-sm dark:bg-indigo-500"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/80"
              )}
            >
              <Icon className="h-3.5 w-3.5 shrink-0" />
              <span>{section.label}</span>
            </button>
          );
        })}
      </div>

      {auditInfo && (
        <div className="border-t border-border pt-4 px-2 space-y-2">
          <div className="text-[10px] font-bold text-muted-foreground/80 tracking-wider uppercase mb-1">Audit Metadata</div>
          {auditInfo.updatedAt && (
            <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
              <Clock className="h-3 w-3 shrink-0" />
              <span className="truncate">Saved {auditInfo.updatedAt}</span>
            </div>
          )}
          {auditInfo.updatedBy && (
            <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
              <Info className="h-3 w-3 shrink-0" />
              <span className="truncate">By {auditInfo.updatedBy}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Drawer Content Body
export function ERPDrawerBody({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <ScrollArea className={cn("flex-1 p-6 h-full", className)}>
      <div className="max-w-4xl space-y-6 pb-8">
        {children}
      </div>
    </ScrollArea>
  );
}

// Drawer Section Panel
//
// lazyMount (default: false) — when true the section's children are not
// rendered until the section is first activated.  Once mounted the section
// stays mounted for the lifetime of the drawer (keepMounted = true implicit)
// so field values and component state are preserved on subsequent re-visits.
//
// Safety rule: only use lazyMount on sections whose children do not
// contribute named form inputs that are read via new FormData(form) in the
// parent save handler.  Display-only sections and child CRUD sections (which
// manage their own Supabase mutations) are safe candidates.
export function ERPDrawerSection({
  id,
  activeId,
  title,
  children,
  lazyMount = false,
}: {
  id: string;
  activeId: string;
  title: string;
  children: React.ReactNode;
  lazyMount?: boolean;
}) {
  const isActive = id === activeId;

  // Track whether this section has ever been active.
  // If lazyMount=false (default) we start true so children always render.
  // If lazyMount=true we start false and flip to true on first activation.
  const [hasMounted, setHasMounted] = React.useState<boolean>(!lazyMount || isActive);

  React.useEffect(() => {
    if (isActive && !hasMounted) {
      setHasMounted(true);
    }
  }, [isActive, hasMounted]);

  // Before first activation, render nothing (no DOM, no data fetches).
  if (!hasMounted) return null;

  return (
    <div 
      className={`space-y-4.5 ${isActive ? 'animate-in fade-in duration-200' : 'hidden'}`}
      aria-hidden={!isActive}
    >
      <h3 className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider border-b border-border pb-2">{title}</h3>
      {children}
    </div>
  );
}

// Dynamic Grid Layout
export function ERPFieldGrid({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-12 gap-x-4 gap-y-3.5">
      {children}
    </div>
  );
}

// Sticky Footer Component
interface ERPDrawerFooterProps {
  onCancel: () => void;
  /** @deprecated Use formId — submit is wired via the form attribute */
  onSubmit?: () => void;
  formId?: string;
  isSubmitting?: boolean;
  hasUnsavedChanges?: boolean;
  draftSaveText?: string;
  submitText?: string;
  onSaveDraft?: () => void;
  validationErrorsCount?: number;
}

export function ERPDrawerFooter({
  onCancel,
  onSubmit,
  formId = "drawer-form",
  isSubmitting = false,
  hasUnsavedChanges = false,
  draftSaveText = "Save as Draft",
  submitText = "Save & Close",
  onSaveDraft,
  validationErrorsCount = 0
}: ERPDrawerFooterProps) {
  const handleSubmitClick = () => {
    if (onSubmit) {
      onSubmit();
      return;
    }
    const formEl = document.getElementById(formId) as HTMLFormElement | null;
    formEl?.requestSubmit();
  };
  return (
    <div className="px-6 py-4 border-t border-border bg-card flex items-center justify-between shrink-0 mt-auto shadow-xs">
      <div className="flex items-center gap-2">
        {hasUnsavedChanges && (
          <div className="flex items-center gap-1.5 text-xs text-amber-500 font-semibold">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse"></span>
            <span>Unsaved Changes</span>
          </div>
        )}
        {validationErrorsCount > 0 && (
          <ERPValidationSummary errorCount={validationErrorsCount} />
        )}
      </div>

      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          className="border-border text-foreground hover:bg-muted h-9 px-4 text-xs font-semibold"
        >
          Cancel
        </Button>
        {onSaveDraft && (
          <Button
            type="button"
            variant="outline"
            onClick={onSaveDraft}
            disabled={isSubmitting}
            className="border-border text-foreground hover:bg-muted h-9 px-4 text-xs font-semibold"
          >
            {draftSaveText}
          </Button>
        )}
        <Button
          type="button"
          onClick={handleSubmitClick}
          disabled={isSubmitting}
          className="bg-indigo-600 hover:bg-indigo-500 dark:bg-indigo-500 dark:hover:bg-indigo-400 text-white font-semibold h-9 px-4 text-xs shadow-xs focus:ring-1 focus:ring-ring"
        >
          {isSubmitting ? "Processing..." : submitText}
        </Button>
      </div>
    </div>
  );
}

// Banners and Badges
export function ERPDraftBadge({ mode }: { mode: string }) {
  if (mode !== "draft") return null;
  return (
    <Badge variant="outline" className="bg-amber-500/10 text-amber-500 border-amber-500/20 text-[10px] py-0 px-2 font-medium">
      Draft
    </Badge>
  );
}

export function ERPStatusBadge({ status }: { status: string }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "text-[10px] py-0 px-2 font-medium capitalize",
        status === "active" 
          ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" 
          : status === "inactive" 
          ? "bg-muted text-muted-foreground border-border" 
          : "bg-red-500/10 text-red-500 border-red-500/20"
      )}
    >
      {status}
    </Badge>
  );
}

export function ERPValidationSummary({ errorCount }: { errorCount: number }) {
  return (
    <div className="flex items-center gap-1.5 text-xs text-red-500 font-semibold">
      <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
      <span>{errorCount} {errorCount === 1 ? "error" : "errors"} to fix</span>
    </div>
  );
}

export function ERPUnsavedChangesBar() {
  return (
    <div className="w-full bg-amber-500/10 border-b border-amber-500/20 px-6 py-2 flex items-center gap-2 text-xs text-amber-500">
      <AlertTriangle className="h-4 w-4 shrink-0" />
      <span>You have unsaved changes in this form. Click Save as Draft or Submit to store them.</span>
    </div>
  );
}
