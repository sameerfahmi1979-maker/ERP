"use client";

/**
 * ERP DMS.4 — DmsDocumentRecordForm
 *
 * Full workspace record form for DMS Document records.
 * Uses ERPRecordWorkspaceForm, ERPRecordSectionPanel, useWorkspaceFormDraft, etc.
 * following the same patterns as PartyWorkspaceForm (ERP UI.4D).
 */

import { DraftRestoredNotice } from "@/components/workspace/draft-restored-notice";
import {useQueryClient} from "@tanstack/react-query";
import {invalidateDmsDocumentRecord, invalidateDmsEntityDocuments} from "@/lib/query/invalidation";
import type { ERPRecordSection } from "@/components/workspace/erp-record-section-nav";
import { ERPRecordSectionPanel as BaseSectionPanel, ERPRecordWorkspaceForm } from "@/components/workspace/erp-record-workspace-form";
import { useWorkspaceFormDirty as useFormDirty } from "@/hooks/use-workspace-form-dirty";
import { useWorkspaceFormNavigation as useWorkspace } from "@/hooks/use-workspace-form-navigation";
import { useWorkspaceFormDraft } from "@/hooks/use-workspace-form-draft";
import { useWorkspaceScrollState } from "@/hooks/use-workspace-scroll-state";
import { useWorkspaceSectionState } from "@/hooks/use-workspace-section-state";
import { useWorkspaceTabDirty } from "@/hooks/use-workspace-tab-dirty";
import type { AuthContext } from "@/lib/rbac/check";
import { hasPermission } from "@/lib/rbac/scope";
import type { DmsDocumentRecordData } from "@/server/actions/dms/documents";
import { createDmsDocument, updateDmsDocument } from "@/server/actions/dms/documents";
import {dmsCreationOriginSchema} from '@/lib/dms/numbered-document-create';
import {
  Activity,
  Brain,
  CalendarClock,
  Compass,
  Database,
  FileText,
  GitBranch,
  LayoutList,
  Link2,
  MessageSquare,
  Paperclip,
  ScanText,
  ShieldCheck,
  Sparkles,
  Tag,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useRef, useState, type ComponentProps } from "react";
import { toast } from "sonner";
import {DmsSectionActivity} from "./section-activity";
function ERPRecordSectionPanel(props:ComponentProps<typeof BaseSectionPanel>){
 return <BaseSectionPanel {...props}><DmsSectionActivity value={props.id===props.activeId}>{props.children}</DmsSectionActivity></BaseSectionPanel>;
}
import { DmsDocumentAiSection } from "./sections/dms-document-ai-section";
import { DmsDocumentAiSummarySection } from "./sections/dms-document-ai-summary-section";
import { DmsDocumentApprovalsSection } from "./sections/dms-document-approvals-section";
import { DmsDocumentAskAiSection } from "./sections/dms-document-ask-ai-section";
import { DmsDocumentAuditSection } from "./sections/dms-document-audit-section";
import {DmsDocumentLifecycleSection} from "./sections/dms-document-lifecycle-section";
import { DmsDocumentCommentsSection } from "./sections/dms-document-comments-section";
import { DmsDocumentContentSection } from "./sections/dms-document-content-section";
import { DmsDocumentExpirySection } from "./sections/dms-document-expiry-section";
import { DmsDocumentFilesSection } from "./sections/dms-document-files-section";
import { DmsDocumentIntelligenceSection } from "./sections/dms-document-intelligence-section";
import { DmsDocumentLinksSection } from "./sections/dms-document-links-section";
import { DmsDocumentMetadataSection } from "./sections/dms-document-metadata-section";
import { DmsDocumentOcrSection } from "./sections/dms-document-ocr-section";
import { DmsDocumentOverviewSection } from "./sections/dms-document-overview-section";
import { DmsDocumentSemanticSection } from "./sections/dms-document-semantic-section";
import { DmsDocumentTagsSection } from "./sections/dms-document-tags-section";
import { DmsDocumentUnderstandingSection } from "./sections/dms-document-understanding-section";
import { DmsDocumentVersionsSection } from "./sections/dms-document-versions-section";
import { useDmsCreationSession } from "./use-dms-creation-session";

interface DocumentType {
  id: number;
  name_en: string;
  type_code: string;
  category_id: number | null;
  requires_expiry_tracking: boolean;
  is_renewable?: boolean;
  default_confidentiality: string;
}

interface Category {
  id: number;
  name_en: string;
  category_code: string;
}

export type DmsEntityContext = {
  entityType: string;
  entityId: number;
  scope?:{company:number|null;branch:number|null};
};

export type DmsDocumentRecordFormProps = {
  doc?: DmsDocumentRecordData | null;
  mode: "add" | "edit" | "view";
  authContext: AuthContext;
  documentTypes: DocumentType[];
  categories: Category[];
  entityContext?: DmsEntityContext | null;
};

export function DmsDocumentRecordForm(props: DmsDocumentRecordFormProps) {
  return (
    <DmsDocumentRecordFormInner
      key={`${props.authContext.profile?.id ?? "unknown"}-${props.mode}-${props.doc?.id ?? "new"}-${props.entityContext?.entityType ?? ""}-${props.entityContext?.entityId ?? ""}`}
      {...props}
    />
  );
}

function DmsDocumentRecordFormInner({
  doc,
  mode,
  authContext,
  documentTypes,
  categories,
  entityContext,
}: DmsDocumentRecordFormProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { closeTab, activeTab, renameTab, updateTabRoute, markDirty } = useWorkspace();
  const creation = useDmsCreationSession(activeTab?.id, authContext.profile?.id);
  const submitFlight = useRef(false);

  const [currentMode, setCurrentMode] = useState<"add" | "edit" | "view">(() => mode === "add" && creation.receipt ? "view" : mode);
  const isViewing = currentMode === "view";
  // UI capabilities mirror the server action; the file endpoint still checks row scope/confidentiality.
  const canPreviewFiles = hasPermission(authContext, "dms.documents.preview") || hasPermission(authContext, "dms.admin");
  const canDownloadFiles = hasPermission(authContext, "dms.documents.download") || hasPermission(authContext, "dms.admin");

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeSubmitAction, setActiveSubmitAction] = useState<"save" | "saveAndClose" | null>(null);

  // ── Section nav ──────────────────────────────────────────────────────────────
  const [activeSection, setActiveSection] = useWorkspaceSectionState(
    doc?.id
      ? { key: "active-section", initialSection: "overview", scope: "record", recordType: "dms-document", recordId: doc.id }
      : { key: "active-section", initialSection: "overview", scope: "tab", identifier: activeTab?.id ?? "new-dms-doc" }
  );

  // ── Scroll state ─────────────────────────────────────────────────────────────
  const bodyScrollRef = useRef<HTMLDivElement>(null);
  useWorkspaceScrollState(
    doc?.id
      ? { key: "body-scroll", ref: bodyScrollRef, scope: "record", recordType: "dms-document", recordId: doc.id }
      : { key: "body-scroll", ref: bodyScrollRef, scope: "tab", identifier: activeTab?.id ?? "new-dms-doc" }
  );

  // ── Created record tracking ───────────────────────────────────────────────────
  const [createdDocId, setCreatedDocId] = useState<number | null>(creation.receipt?.id ?? null);
  const effectiveDocId = doc?.id ?? createdDocId;

  // ── Dirty tracking ────────────────────────────────────────────────────────────
  const { isDirty, resetDirty } = useFormDirty({ formId: "dms-doc-workspace-form", enabled: !isViewing });
  useWorkspaceTabDirty({ isDirty, enabled: !isViewing });

  // ── Draft preservation (UI.4E.2) ──────────────────────────────────────────────
  const { getDraftDefault, getDraftNullableId, writeDraftField, clearDraft, syncDraft, restoredFromDraft } = useWorkspaceFormDraft({
    formId: "dms-doc-workspace-form",
    enabled: !isViewing,
  });

  // ── Controlled fields ────────────────────────────────────────────────────────
  const [documentTypeId, setDocumentTypeId] = useState<number | null>(() => {
    return creation.pending?.payload.document_type_id ?? getDraftNullableId("document_type_id", doc?.document_type_id);
  });
  const [categoryId, setCategoryId] = useState<number | null>(() => {
    return creation.pending?.payload.category_id ?? getDraftNullableId("category_id", doc?.category_id);
  });
  const [status, setStatus] = useState<string>(() => {
    const d = getDraftDefault("status", "");
    return creation.pending?.payload.status ?? (d || doc?.status || "draft");
  });
  const [confidentialityLevel, setConfidentialityLevel] = useState<string>(() => {
    const d = getDraftDefault("confidentiality_level", "");
    return creation.pending?.payload.confidentiality_level ?? (d || doc?.confidentiality_level || "internal");
  });
  const [owningCompanyId, setOwningCompanyId] = useState<number | null>(() => {
    return creation.pending ? creation.pending.payload.owning_company_id ?? null : getDraftNullableId("owning_company_id", doc?doc.owning_company_id:entityContext?.scope?.company);
  });
  const [owningBranchId, setOwningBranchId] = useState<number | null>(() => {
    return creation.pending ? creation.pending.payload.owning_branch_id ?? null : getDraftNullableId("owning_branch_id", doc?doc.owning_branch_id:entityContext?.scope?.branch);
  });
  const [partyId, setPartyId] = useState<number | null>(() => {
    return creation.pending ? creation.pending.payload.party_id ?? null : getDraftNullableId("party_id", doc?doc.party_id:(entityContext?.entityType==='party'?entityContext.entityId:undefined));
  });

  // ── Child dialog blocking ─────────────────────────────────────────────────────
  const [childDialogOpen, setChildDialogOpen] = useState(false);

  // ── Section list ──────────────────────────────────────────────────────────────
  const childLocked = !effectiveDocId;

  const sections: ERPRecordSection[] = useMemo(
    () => [
      { id: "overview", label: "Overview", icon: <LayoutList className="h-3.5 w-3.5" /> },
      { id: "lifecycle", label: "Lifecycle", icon: <GitBranch className="h-3.5 w-3.5" />, disabled: childLocked },
      { id: "metadata", label: "Metadata", icon: <Database className="h-3.5 w-3.5" />, disabled: childLocked },
      { id: "links", label: "Links", icon: <Link2 className="h-3.5 w-3.5" />, disabled: childLocked },
      { id: "tags", label: "Tags", icon: <Tag className="h-3.5 w-3.5" />, disabled: childLocked },
      { id: "versions", label: "Versions", icon: <GitBranch className="h-3.5 w-3.5" />, disabled: childLocked },
      { id: "files", label: "Files", icon: <Paperclip className="h-3.5 w-3.5" />, disabled: childLocked },
      { id: "expiry", label: "Expiry", icon: <CalendarClock className="h-3.5 w-3.5" />, disabled: childLocked },
      { id: "ocr", label: "OCR / Text", icon: <ScanText className="h-3.5 w-3.5" />, disabled: childLocked },
      { id: "content", label: "Extracted Text", icon: <FileText className="h-3.5 w-3.5" />, disabled: childLocked },
      { id: "ai-summary", label: "AI Summary", icon: <Brain className="h-3.5 w-3.5" />, disabled: childLocked },
      { id: "intelligence", label: "Intelligence", icon: <Brain className="h-3.5 w-3.5" />, disabled: childLocked },
      { id: "semantic", label: "Semantic", icon: <Compass className="h-3.5 w-3.5" />, disabled: childLocked },
      { id: "ask-ai", label: "Ask AI", icon: <Brain className="h-3.5 w-3.5" />, disabled: childLocked },
      { id: "ai", label: "AI Analysis", icon: <Brain className="h-3.5 w-3.5" />, disabled: childLocked },
      { id: "understanding", label: "Understanding", icon: <Sparkles className="h-3.5 w-3.5" />, disabled: childLocked },
      { id: "approvals", label: "Approvals", icon: <ShieldCheck className="h-3.5 w-3.5" />, disabled: childLocked },
      { id: "comments", label: "Comments", icon: <MessageSquare className="h-3.5 w-3.5" />, disabled: childLocked },
      { id: "audit", label: "Audit", icon: <Activity className="h-3.5 w-3.5" />, disabled: childLocked },
    ],
    [childLocked]
  );

  // ── Workspace close ──────────────────────────────────────────────────────────
  const handleRequestClose = useCallback(() => {
    closeTab(activeTab?.id ?? "");
  }, [closeTab, activeTab?.id]);

  // ── Core save logic ───────────────────────────────────────────────────────────
  const performSave = async (): Promise<boolean> => {
    if (isViewing || !creation.isCurrent()) return false;

    const form = document.getElementById("dms-doc-workspace-form") as HTMLFormElement | null;
    if (!form) return false;

    const fd = new FormData(form);

    if (!documentTypeId) {
      toast.error("Please select a document type");
      return false;
    }
    if (!categoryId) {
      toast.error("Please select a category");
      return false;
    }

    const origin=currentMode==='add'&&entityContext?dmsCreationOriginSchema.safeParse({entityType:entityContext.entityType,entityId:entityContext.entityId}):null;
    if(origin&&!origin.success){toast.error('The original document subject is invalid. Reopen the source record.');return false;}
    const payload = creation.pending?.payload ?? {
      ...(origin?.success?{originContext:origin.data}:{}),
      title: (fd.get("title") as string) || "",
      description: (fd.get("description") as string) || null,
      document_type_id: documentTypeId,
      category_id: categoryId,
      status: status as "draft" | "pending_review" | "approved" | "rejected" | "active" | "expired" | "archived" | "superseded",
      confidentiality_level: confidentialityLevel as "internal" | "company" | "hr" | "finance" | "legal" | "executive",
      issue_date: (fd.get("issue_date") as string) || null,
      expiry_date: (fd.get("expiry_date") as string) || null,
      owning_company_id: owningCompanyId ?? null,
      owning_branch_id: owningBranchId ?? null,
      party_id: partyId ?? null,
    };

    if (!payload.title) {
      toast.error("Title is required");
      return false;
    }

    let committed = false;
    try {
      let result;
      if (currentMode === "edit" && (doc || createdDocId)) {
        const id = doc?.id ?? createdDocId!;
        result = await updateDmsDocument({ id, ...payload });
      } else {
        result = await creation.create(payload, createDmsDocument);
      }
      if (!creation.isCurrent()) return false;

      if (result.success) {
        committed = true;
        const savedId = currentMode === "edit" ? doc?.id ?? createdDocId : result.data && "id" in result.data ? Number(result.data.id) : null;
        if (savedId) invalidateDmsDocumentRecord(queryClient, savedId);
        toast.success(`Document ${currentMode === "edit" ? "updated" : "created"} successfully`);
        clearDraft();
        resetDirty();

        if (currentMode === "add" && result.data && "id" in result.data) {
          const newId = (result.data as { id: number; document_no: string }).id;
          const docNo = (result.data as { id: number; document_no: string }).document_no;

          // Preserve the committed identity before any optional post-create work.
          setCreatedDocId(newId);
          setCurrentMode("edit");
          if(entityContext){
            if(payload.originContext)invalidateDmsEntityDocuments(queryClient,entityContext.entityType,entityContext.entityId);
            else toast.warning('This retained creation predates atomic subject linking. Verify its Links before adding a subject; do not create a replacement document.');
          }

          if (activeTab?.id) {
            renameTab(activeTab.id, `Document — ${docNo}`, docNo);
            const newRoute = `/dms/documents/record/${newId}?mode=edit`;
            updateTabRoute(activeTab.id, newRoute, newId, "edit");
            router.replace(newRoute);
          }
        }
        return true;
      } else {
        toast.error(result.error ?? "Failed to save document");
        return false;
      }
    } catch (err) {
      if (!creation.isCurrent()) return false;
      if (committed) {
        toast.warning("Document saved. Reopen it from the list if navigation or refresh is unavailable.");
        return true;
      }
      console.error("performSave error", err);
      toast.error("Unexpected error saving document");
      return false;
    }
  };

  const handleSave = async () => {
    if (submitFlight.current || !creation.isCurrent()) return;
    submitFlight.current = true;
    setIsSubmitting(true);
    setActiveSubmitAction("save");
    try { await performSave(); }
    finally { submitFlight.current = false; if (creation.isCurrent()) { setIsSubmitting(false); setActiveSubmitAction(null); } }
  };

  const handleSaveAndClose = async () => {
    if (submitFlight.current || !creation.isCurrent()) return;
    submitFlight.current = true;
    setIsSubmitting(true);
    setActiveSubmitAction("saveAndClose");
    const success = await performSave();
    submitFlight.current = false;
    if (!creation.isCurrent()) return;
    setIsSubmitting(false);
    setActiveSubmitAction(null);
    if (success) {
      // Data is persisted — force-close to bypass the dirty dialog, since the
      // dirty flag reset from performSave() may not have propagated to the tab yet.
      if (activeTab?.id) markDirty(activeTab.id, false);
      closeTab(activeTab?.id ?? "", { force: true });
    }
  };

  // ── Header badges ─────────────────────────────────────────────────────────────
  const headerStatusLabel = doc?.status ?? status;
  const headerStatusVariant: "default" | "success" | "warning" | "danger" | "muted" =
    headerStatusLabel === "active" || headerStatusLabel === "approved"
      ? "success"
      : headerStatusLabel === "expired" || headerStatusLabel === "rejected"
      ? "danger"
      : headerStatusLabel === "pending_review"
      ? "warning"
      : "muted";

  const selectedDocType = documentTypes.find((t) => t.id === documentTypeId);

  return (
    <form
      id="dms-doc-workspace-form"
      className="h-full"
      // WS.3: syncDraft captures all named inputs (title, description, dates,
      // hidden combobox inputs) into the in-memory draft on every edit.
      onInput={(event) => {
        if ((event.target as Element).closest("form") === event.currentTarget) syncDraft();
      }}
      onChange={(event) => {
        // React portal events bubble through this parent even when a child
        // dialog owns the input. They must not create a document draft.
        if ((event.target as Element).closest("form") !== event.currentTarget) return;
        markDirty(activeTab?.id ?? "", true);
        syncDraft();
      }}
    >
      <ERPRecordWorkspaceForm
        isDirty={isDirty}
        mode={currentMode === "add" ? "add" : currentMode === "view" ? "view" : "edit"}
        title={doc?.title ?? "New Document"}
        subtitle={doc?.document_no ?? creation.receipt?.document_no ?? "Document not yet saved"}
        recordCode={doc?.document_no ?? creation.receipt?.document_no}
        headerActions={!doc && creation.receipt ? <button type="button" className="text-sm underline" onClick={() => router.replace(`/dms/documents/record/${creation.receipt!.id}?mode=edit`)}>Open saved document</button> : undefined}
        statusLabel={headerStatusLabel.replace("_", " ").replace(/\b\w/g, (l) => l.toUpperCase())}
        statusVariant={headerStatusVariant}
        typeBadges={selectedDocType ? [selectedDocType.name_en] : undefined}
        sections={sections}
        activeSection={activeSection}
        onSectionChange={setActiveSection}
        auditInfo={
          doc
            ? {
                updatedAt: doc.updated_at,
                updatedBy: String(doc.updated_by ?? ""),
                createdBy: String(doc.created_by ?? ""),
              }
            : undefined
        }
        isSubmitting={isSubmitting}
        activeSubmitAction={activeSubmitAction}
        onSave={isViewing ? undefined : handleSave}
        onSaveAndClose={isViewing ? undefined : handleSaveAndClose}
        onRequestClose={handleRequestClose}
        isChildDialogOpen={childDialogOpen}
        bodyScrollRef={bodyScrollRef}
      >
        {/* ── Overview ── */}
        <ERPRecordSectionPanel id="overview" activeId={activeSection}>
          {creation.recoveryError && <p role="alert" className="mb-3 text-sm text-destructive">{creation.recoveryError}</p>}
          {currentMode === "add" && creation.uncertain && !isSubmitting && <p role="alert" className="mb-3 text-sm">Creation is unconfirmed. Save again to retry the original submitted values; do not create another document.</p>}
          {/* WS.3: visible signal that unsaved values from a previous visit were restored */}
          <DraftRestoredNotice visible={!isViewing && restoredFromDraft} className="mb-3" />
          <DmsDocumentOverviewSection
            doc={doc ?? null}
            isViewing={isViewing || (currentMode === "add" && (isSubmitting || creation.uncertain || !!creation.recoveryError))}
            getDraftDefault={(field, fallback) => creation.pending && field in creation.pending.payload ? String(creation.pending.payload[field as keyof typeof creation.pending.payload] ?? "") : getDraftDefault(field, fallback)}
            documentTypes={documentTypes}
            categories={categories}
            documentTypeId={documentTypeId}
            setDocumentTypeId={(id) => { setDocumentTypeId(id); writeDraftField("document_type_id", id); }}
            categoryId={categoryId}
            setCategoryId={(id) => { setCategoryId(id); writeDraftField("category_id", id); }}
            confidentialityLevel={confidentialityLevel}
            setConfidentialityLevel={(v) => { setConfidentialityLevel(v); writeDraftField("confidentiality_level", v); }}
            status={status}
            setStatus={(v) => { setStatus(v); writeDraftField("status", v); }}
            owningCompanyId={owningCompanyId}
            setOwningCompanyId={(id) => { setOwningCompanyId(id); setOwningBranchId(null); writeDraftField("owning_company_id", id); writeDraftField("owning_branch_id", null); }}
            owningBranchId={owningBranchId}
            setOwningBranchId={(id) => { setOwningBranchId(id); writeDraftField("owning_branch_id", id); }}
            partyId={partyId}
            setPartyId={(id) => { setPartyId(id); writeDraftField("party_id", id); }}
          />
        </ERPRecordSectionPanel>

        {/* ── Metadata ── */}
        <ERPRecordSectionPanel id="metadata" activeId={activeSection} lazyMount>
          <DmsDocumentMetadataSection
            documentId={effectiveDocId}
            documentTypeId={documentTypeId}
            isViewing={isViewing}
          />
        </ERPRecordSectionPanel>

        {/* ── Links ── */}
        <ERPRecordSectionPanel id="links" activeId={activeSection} lazyMount>
          <DmsDocumentLinksSection documentId={effectiveDocId} isViewing={isViewing} />
        </ERPRecordSectionPanel>

        {/* ── Tags ── */}
        <ERPRecordSectionPanel id="tags" activeId={activeSection} lazyMount>
          <DmsDocumentTagsSection documentId={effectiveDocId} isViewing={isViewing} />
        </ERPRecordSectionPanel>

        {/* ── Versions ── */}
        <ERPRecordSectionPanel id="versions" activeId={activeSection} lazyMount>
          {effectiveDocId ? (
            <DmsDocumentVersionsSection
              documentId={effectiveDocId}
              canPreview={canPreviewFiles}
              canDownload={canDownloadFiles}
              documentNo={doc?.document_no ?? ""}
              canUpload={!isViewing}
              canEdit={!isViewing}
            />
          ) : (
            <div className="py-6 text-center text-sm text-muted-foreground">
              Save the document first to see versions.
            </div>
          )}
        </ERPRecordSectionPanel>

        {/* ── Files ── */}
        <ERPRecordSectionPanel id="files" activeId={activeSection} lazyMount>
          {effectiveDocId ? (
            <DmsDocumentFilesSection
              documentId={effectiveDocId}
              canPreview={canPreviewFiles}
              canDownload={canDownloadFiles}
              canTriggerOcr={
                authContext.permissionCodes.includes("dms.documents.ocr.trigger") ||
                authContext.permissionCodes.includes("dms.documents.edit") ||
                authContext.permissionCodes.includes("dms.admin") ||
                authContext.roleCodes.includes("system_admin") ||
                authContext.roleCodes.includes("group_admin")
              }
            />
          ) : (
            <div className="py-6 text-center text-sm text-muted-foreground">
              Save the document first to see attached files.
            </div>
          )}
        </ERPRecordSectionPanel>

        {/* ── OCR / Text ── */}
        <ERPRecordSectionPanel id="ocr" activeId={activeSection} lazyMount>
          {effectiveDocId ? (
            <DmsDocumentOcrSection
              documentId={effectiveDocId}
              canTrigger={
                authContext.permissionCodes.includes("dms.documents.ocr.trigger") ||
                authContext.permissionCodes.includes("dms.documents.edit") ||
                authContext.permissionCodes.includes("dms.admin") ||
                authContext.roleCodes.includes("system_admin") ||
                authContext.roleCodes.includes("group_admin")
              }
              canViewText={
                authContext.permissionCodes.includes("dms.documents.ocr.view") ||
                authContext.permissionCodes.includes("dms.documents.view") ||
                authContext.permissionCodes.includes("dms.documents.preview") ||
                authContext.permissionCodes.includes("dms.admin") ||
                authContext.roleCodes.includes("system_admin") ||
                authContext.roleCodes.includes("group_admin")
              }
            />
          ) : (
            <div className="py-6 text-center text-sm text-muted-foreground">
              Save the document first to use OCR features.
            </div>
          )}
        </ERPRecordSectionPanel>

        {/* ── Extracted Text (DMS 12.1) ── */}
        <ERPRecordSectionPanel id="content" activeId={activeSection} lazyMount>
          {effectiveDocId ? (
            <DmsDocumentContentSection
              documentId={effectiveDocId}
              canResync={
                authContext.permissionCodes.includes("dms.documents.edit") ||
                authContext.permissionCodes.includes("dms.admin") ||
                authContext.roleCodes.includes("system_admin") ||
                authContext.roleCodes.includes("group_admin")
              }
            />
          ) : (
            <div className="py-6 text-center text-sm text-muted-foreground">
              Save the document first to view extracted text.
            </div>
          )}
        </ERPRecordSectionPanel>

        {/* ── AI Summary (DMS 12.2) ── */}
        <ERPRecordSectionPanel id="ai-summary" activeId={activeSection} lazyMount>
          {effectiveDocId ? (
            <DmsDocumentAiSummarySection
              documentId={effectiveDocId}
              canGenerate={
                authContext.permissionCodes.includes("dms.documents.ai.run") ||
                authContext.permissionCodes.includes("dms.admin") ||
                authContext.roleCodes.includes("system_admin") ||
                authContext.roleCodes.includes("group_admin")
              }
              isConfidentialForNonAdmin={
                ["hr", "legal", "executive"].includes(confidentialityLevel) &&
                !authContext.permissionCodes.includes("dms.admin") &&
                !authContext.roleCodes.includes("system_admin") &&
                !authContext.roleCodes.includes("group_admin")
              }
            />
          ) : (
            <div className="py-6 text-center text-sm text-muted-foreground">
              Save the document first to view AI summary.
            </div>
          )}
        </ERPRecordSectionPanel>

        {/* ── Intelligence (DMS 12.3) ── */}
        <ERPRecordSectionPanel id="intelligence" activeId={activeSection} lazyMount>
          {effectiveDocId ? (
            <DmsDocumentIntelligenceSection
              documentId={effectiveDocId}
              canEvaluate={
                authContext.permissionCodes.includes("dms.documents.edit") ||
                authContext.permissionCodes.includes("dms.admin") ||
                authContext.roleCodes.includes("system_admin") ||
                authContext.roleCodes.includes("group_admin")
              }
            />
          ) : (
            <div className="py-6 text-center text-sm text-muted-foreground">
              Save the document first to evaluate intelligence.
            </div>
          )}
        </ERPRecordSectionPanel>

        {/* ── Semantic Embedding (DMS 12.5) ── */}
        <ERPRecordSectionPanel id="semantic" activeId={activeSection} lazyMount>
          {effectiveDocId ? (
            <DmsDocumentSemanticSection
              documentId={effectiveDocId}
              canGenerate={
                authContext.permissionCodes.includes("dms.documents.ai.run") ||
                authContext.permissionCodes.includes("dms.admin") ||
                authContext.roleCodes.includes("system_admin") ||
                authContext.roleCodes.includes("group_admin")
              }
            />
          ) : (
            <div className="py-6 text-center text-sm text-muted-foreground">
              Save the document first to generate an embedding.
            </div>
          )}
        </ERPRecordSectionPanel>

        {/* ── Ask AI (DMS 12.4) ── */}
        <ERPRecordSectionPanel id="ask-ai" activeId={activeSection} lazyMount>
          <DmsDocumentAskAiSection
            documentId={effectiveDocId ?? null}
            confidentialityLevel={confidentialityLevel}
            isAdmin={
              authContext.permissionCodes.includes("dms.admin") ||
              authContext.roleCodes.includes("system_admin")
            }
          />
        </ERPRecordSectionPanel>

        {/* ── AI Analysis ── */}
        <ERPRecordSectionPanel id="ai" activeId={activeSection} lazyMount>
          {effectiveDocId ? (
            <DmsDocumentAiSection
              documentId={effectiveDocId}
              documentTypeId={documentTypeId}
              canRun={
                authContext.permissionCodes.includes("dms.documents.ai.run") ||
                authContext.permissionCodes.includes("dms.documents.review_ai") ||
                authContext.permissionCodes.includes("dms.admin") ||
                authContext.roleCodes.includes("system_admin") ||
                authContext.roleCodes.includes("group_admin")
              }
              canView={
                authContext.permissionCodes.includes("dms.documents.ai.view") ||
                authContext.permissionCodes.includes("dms.documents.view") ||
                authContext.permissionCodes.includes("dms.documents.review_ai") ||
                authContext.permissionCodes.includes("dms.admin") ||
                authContext.roleCodes.includes("system_admin") ||
                authContext.roleCodes.includes("group_admin")
              }
              canApplyMetadata={
                !isViewing && (
                  authContext.permissionCodes.includes("dms.documents.edit") ||
                  authContext.permissionCodes.includes("dms.documents.review_ai") ||
                  authContext.permissionCodes.includes("dms.admin") ||
                  authContext.roleCodes.includes("system_admin") ||
                  authContext.roleCodes.includes("group_admin")
                )
              }
              canProposeCorrection={
                authContext.permissionCodes.includes("dms.apply_correction.create") ||
                authContext.permissionCodes.includes("dms.apply_correction.admin") ||
                authContext.roleCodes.includes("system_admin") ||
                authContext.roleCodes.includes("group_admin")
              }
            />
          ) : (
            <div className="py-6 text-center text-sm text-muted-foreground">
              Save the document first to use AI analysis.
            </div>
          )}
        </ERPRecordSectionPanel>

        {/* ── Understanding (COMMON AI.2) ── */}
        <ERPRecordSectionPanel id="understanding" activeId={activeSection} lazyMount>
          <DmsDocumentUnderstandingSection
            documentId={effectiveDocId ?? null}
            onNavigateToSection={setActiveSection}
          />
        </ERPRecordSectionPanel>

        {/* ── Expiry ── */}
        <ERPRecordSectionPanel id="expiry" activeId={activeSection} lazyMount>
          <DmsDocumentExpirySection
            documentId={effectiveDocId ?? 0}
            documentNo={doc?.document_no ?? ""}
            documentTitle={doc?.title ?? ""}
            issueDate={doc?.issue_date ?? null}
            expiryDate={doc?.expiry_date ?? null}
            requiresExpiryTracking={selectedDocType?.requires_expiry_tracking ?? false}
            isRenewable={selectedDocType?.is_renewable ?? true}
            documentStatus={doc?.status ?? null}
            supersededBy={doc?.superseded_by ?? null}
            canManage={!isViewing && !!effectiveDocId}
          />
        </ERPRecordSectionPanel>

        {/* ── Approvals ── */}
        <ERPRecordSectionPanel id="approvals" activeId={activeSection} lazyMount>
          <DmsDocumentApprovalsSection documentId={effectiveDocId} authContext={authContext} />
        </ERPRecordSectionPanel>

        {/* ── Comments ── */}
        <ERPRecordSectionPanel id="comments" activeId={activeSection} lazyMount>
          <DmsDocumentCommentsSection
            documentId={effectiveDocId}
            currentUserId={authContext.profile?.id ?? null}
          />
        </ERPRecordSectionPanel>

        <ERPRecordSectionPanel id="lifecycle" activeId={activeSection} lazyMount>
          <DmsDocumentLifecycleSection documentId={effectiveDocId} onNavigate={setActiveSection}/>
        </ERPRecordSectionPanel>
        {/* ── Audit ── */}
        <ERPRecordSectionPanel id="audit" activeId={activeSection} lazyMount>
          <DmsDocumentAuditSection documentId={effectiveDocId} />
        </ERPRecordSectionPanel>
      </ERPRecordWorkspaceForm>
    </form>
  );
}
