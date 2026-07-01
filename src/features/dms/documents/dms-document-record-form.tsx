"use client";

/**
 * ERP DMS.4 — DmsDocumentRecordForm
 *
 * Full workspace record form for DMS Document records.
 * Uses ERPRecordWorkspaceForm, ERPRecordSectionPanel, useWorkspaceFormDraft, etc.
 * following the same patterns as PartyWorkspaceForm (ERP UI.4D).
 */

import { useState, useCallback, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  LayoutList,
  Database,
  Link2,
  Tag,
  GitBranch,
  Paperclip,
  CalendarClock,
  ShieldCheck,
  MessageSquare,
  Activity,
  ScanText,
  Brain,
  Compass,
  FileText,
  Sparkles,
} from "lucide-react";
import { ERPRecordWorkspaceForm, ERPRecordSectionPanel } from "@/components/workspace/erp-record-workspace-form";
import { useFormDirty } from "@/hooks/use-form-dirty";
import { useWorkspace } from "@/hooks/use-workspace";
import { useWorkspaceTabDirty } from "@/hooks/use-workspace-tab-dirty";
import { useWorkspaceFormDraft } from "@/hooks/use-workspace-form-draft";
import { useWorkspaceSectionState } from "@/hooks/use-workspace-section-state";
import { useWorkspaceScrollState } from "@/hooks/use-workspace-scroll-state";
import { createDmsDocument, updateDmsDocument } from "@/server/actions/dms/documents";
import { linkDmsDocumentToEntity } from "@/server/actions/dms/entity-documents";
import type { DmsDocumentRecordData } from "@/server/actions/dms/documents";
import type { ERPRecordSection } from "@/components/workspace/erp-record-section-nav";
import type { AuthContext } from "@/lib/rbac/check";
import { DmsDocumentStatusBadge } from "./dms-document-status-badge";
import { DmsConfidentialityBadge } from "./dms-confidentiality-badge";
import { DmsExpiryBadge } from "./dms-expiry-badge";
import { DmsDocumentOverviewSection } from "./sections/dms-document-overview-section";
import { DmsDocumentMetadataSection } from "./sections/dms-document-metadata-section";
import { DmsDocumentLinksSection } from "./sections/dms-document-links-section";
import { DmsDocumentTagsSection } from "./sections/dms-document-tags-section";
import { DmsDocumentVersionsSection } from "./sections/dms-document-versions-section";
import { DmsDocumentFilesSection } from "./sections/dms-document-files-section";
import { DmsDocumentExpirySection } from "./sections/dms-document-expiry-section";
import { DmsDocumentApprovalsSection } from "./sections/dms-document-approvals-section";
import { DmsDocumentCommentsSection } from "./sections/dms-document-comments-section";
import { DmsDocumentAuditSection } from "./sections/dms-document-audit-section";
import { DmsDocumentOcrSection } from "./sections/dms-document-ocr-section";
import { DmsDocumentAiSection } from "./sections/dms-document-ai-section";
import { DmsDocumentUnderstandingSection } from "./sections/dms-document-understanding-section";
import { DmsDocumentContentSection } from "./sections/dms-document-content-section";
import { DmsDocumentAiSummarySection } from "./sections/dms-document-ai-summary-section";
import { DmsDocumentIntelligenceSection } from "./sections/dms-document-intelligence-section";
import { DmsDocumentSemanticSection } from "./sections/dms-document-semantic-section";
import { DmsDocumentAskAiSection } from "./sections/dms-document-ask-ai-section";

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
      key={`${props.mode}-${props.doc?.id ?? "new"}`}
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
  const { closeTab, activeTab, renameTab, updateTabRoute, markDirty } = useWorkspace();

  const [currentMode, setCurrentMode] = useState<"add" | "edit" | "view">(mode);
  const isViewing = currentMode === "view";

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
  const [createdDocId, setCreatedDocId] = useState<number | null>(null);
  const effectiveDocId = doc?.id ?? createdDocId;

  // ── Dirty tracking ────────────────────────────────────────────────────────────
  const { isDirty, resetDirty } = useFormDirty({ formId: "dms-doc-workspace-form", enabled: !isViewing });
  useWorkspaceTabDirty({ isDirty, enabled: !isViewing });

  // ── Draft preservation (UI.4E.2) ──────────────────────────────────────────────
  const { getDraftDefault, writeDraftField, clearDraft } = useWorkspaceFormDraft({
    formId: "dms-doc-workspace-form",
    enabled: !isViewing,
  });

  // ── Controlled fields ────────────────────────────────────────────────────────
  const [documentTypeId, setDocumentTypeId] = useState<number | null>(() => {
    const d = getDraftDefault("document_type_id", "");
    return d ? Number(d) : doc?.document_type_id ?? null;
  });
  const [categoryId, setCategoryId] = useState<number | null>(() => {
    const d = getDraftDefault("category_id", "");
    return d ? Number(d) : doc?.category_id ?? null;
  });
  const [status, setStatus] = useState<string>(() => {
    const d = getDraftDefault("status", "");
    return d || doc?.status || "draft";
  });
  const [confidentialityLevel, setConfidentialityLevel] = useState<string>(() => {
    const d = getDraftDefault("confidentiality_level", "");
    return d || doc?.confidentiality_level || "internal";
  });
  const [owningCompanyId, setOwningCompanyId] = useState<number | null>(() => {
    const d = getDraftDefault("owning_company_id", "");
    return d ? Number(d) : doc?.owning_company_id ?? null;
  });
  const [owningBranchId, setOwningBranchId] = useState<number | null>(() => {
    const d = getDraftDefault("owning_branch_id", "");
    return d ? Number(d) : doc?.owning_branch_id ?? null;
  });
  const [partyId, setPartyId] = useState<number | null>(() => {
    const d = getDraftDefault("party_id", "");
    return d ? Number(d) : doc?.party_id ?? null;
  });

  // ── Child dialog blocking ─────────────────────────────────────────────────────
  const [childDialogOpen, setChildDialogOpen] = useState(false);

  // ── Section list ──────────────────────────────────────────────────────────────
  const childLocked = !effectiveDocId;

  const sections: ERPRecordSection[] = useMemo(
    () => [
      { id: "overview", label: "Overview", icon: <LayoutList className="h-3.5 w-3.5" /> },
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
    if (isViewing) return false;

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

    const payload = {
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

    try {
      let result;
      if (currentMode === "edit" && (doc || createdDocId)) {
        const id = doc?.id ?? createdDocId!;
        result = await updateDmsDocument({ id, ...payload });
      } else {
        result = await createDmsDocument(payload);
      }

      if (result.success) {
        toast.success(`Document ${currentMode === "edit" ? "updated" : "created"} successfully`);
        clearDraft();
        resetDirty();

        if (currentMode === "add" && result.data && "id" in result.data) {
          const newId = (result.data as { id: number; document_no: string }).id;
          const docNo = (result.data as { id: number; document_no: string }).document_no;

          // Auto-link to entity context if provided (generic — any module)
          if (entityContext) {
            await linkDmsDocumentToEntity(newId, entityContext.entityType, entityContext.entityId, {
              is_primary: true,
            });
          }

          setCreatedDocId(newId);
          setCurrentMode("edit");

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
      console.error("performSave error", err);
      toast.error("Unexpected error saving document");
      return false;
    }
  };

  const handleSave = async () => {
    setIsSubmitting(true);
    setActiveSubmitAction("save");
    await performSave();
    setIsSubmitting(false);
    setActiveSubmitAction(null);
  };

  const handleSaveAndClose = async () => {
    setIsSubmitting(true);
    setActiveSubmitAction("saveAndClose");
    const success = await performSave();
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
    <form id="dms-doc-workspace-form" className="h-full" onChange={() => markDirty(activeTab?.id ?? "", true)}>
      <ERPRecordWorkspaceForm
        isDirty={isDirty}
        mode={currentMode === "add" ? "add" : currentMode === "view" ? "view" : "edit"}
        title={doc?.title ?? "New Document"}
        subtitle={doc?.document_no ?? "Document not yet saved"}
        recordCode={doc?.document_no}
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
          <DmsDocumentOverviewSection
            doc={doc ?? null}
            isViewing={isViewing}
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
            setOwningCompanyId={(id) => { setOwningCompanyId(id); writeDraftField("owning_company_id", id); }}
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
              canTriggerOcr={
                authContext.permissionCodes.includes("dms.documents.ocr.trigger") ||
                authContext.permissionCodes.includes("dms.documents.edit") ||
                authContext.permissionCodes.includes("dms.admin") ||
                authContext.roleCodes.includes("system_admin") ||
                authContext.roleCodes.includes("group_admin")
              }
              canDeleteFiles={
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
          <DmsDocumentApprovalsSection />
        </ERPRecordSectionPanel>

        {/* ── Comments ── */}
        <ERPRecordSectionPanel id="comments" activeId={activeSection} lazyMount>
          <DmsDocumentCommentsSection
            documentId={effectiveDocId}
            currentUserId={authContext.profile?.id ?? null}
          />
        </ERPRecordSectionPanel>

        {/* ── Audit ── */}
        <ERPRecordSectionPanel id="audit" activeId={activeSection} lazyMount>
          <DmsDocumentAuditSection documentId={effectiveDocId} />
        </ERPRecordSectionPanel>
      </ERPRecordWorkspaceForm>
    </form>
  );
}
