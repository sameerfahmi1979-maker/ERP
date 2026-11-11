"use client";

import { useState, useTransition, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { useWorkspace } from "@/hooks/use-workspace";
import { useNumberedAiApproval } from "@/hooks/use-numbered-ai-approval";
import {useRetainedBatchFinalization} from '@/hooks/use-retained-batch-finalization';
import { toast } from "sonner";
import {DmsAiIntakeView} from "./dms-ai-intake-view";
import { buildInitialReviewValues } from "./dms-ai-intake-review-form";
import type { ReviewFormValues } from "./dms-ai-intake-review-form";
import type { IntakeSessionData, IntakeAiResultRow } from "@/server/actions/dms/ai-intake";
import {
  approveAiIntakeAndCreateDocument,
  recoverAiIntakeApproval,
  discardAiIntake,
  retryAiIntake,
  saveAiIntakeDraft,
  getIntakeSessionSignedUrl,
} from "@/server/actions/dms/ai-intake";
import { finalizeDraftIntake, discardDraftIntake,recoverDraftFinalization } from "@/server/actions/dms/batch-intake";
import { previewDmsStandardFileName } from "@/server/actions/dms/standard-file-name";
import { getMetadataDefinitionsForType } from "@/server/actions/dms/document-metadata-values";
import type { DmsDocumentTypeRow } from "@/server/actions/dms/document-types";
import { aiApprovalInputSchema, type AiApprovalInput } from "@/lib/dms/numbered-ai-approval";
import { type IntakeLinkChip } from "@/features/dms/intake/dms-intake-link-panel";
import {confirmExactIntakeReview} from '@/server/actions/dms/intake-review';
import type {IntakeReviewConfirmation} from '@/lib/dms/intake-review';

// ── Format file size ──────────────────────────────────────────────────────────


// ── Props ─────────────────────────────────────────────────────────────────────

interface DmsAiIntakePageClientProps {
  session: IntakeSessionData;
  documentTypes: DmsDocumentTypeRow[];
}

// ── Component ─────────────────────────────────────────────────────────────────

export function DmsAiIntakePageClient({
  session: initialSession,
  documentTypes,
}: DmsAiIntakePageClientProps) {
  const router = useRouter();
  const { activeTab, updateTabRoute, renameTab, closeTab } = useWorkspace();
  const [session] = useState<IntakeSessionData>(initialSession);
  const approval = useNumberedAiApproval(String(initialSession.id), approveAiIntakeAndCreateDocument,session.document_id?undefined:recoverAiIntakeApproval);
  const batchApproval=useRetainedBatchFinalization({enabled:!!session.document_id,sessionId:session.id,recover:recoverDraftFinalization,submit:finalizeDraftIntake});
  const retainedApproval = session.document_id?batchApproval.pending:approval.pendingSessionIds.includes(session.id);
  const approvalBlocked=session.document_id?(batchApproval.loading||batchApproval.blocked||batchApproval.busy):(approval.retentionError||approval.loading);
  const [aiResultPatch, setAiResultPatch] = useState<Partial<IntakeAiResultRow> | null>(null);
  const aiResult = session.ai_result
    ? ({ ...session.ai_result, ...aiResultPatch } as IntakeAiResultRow)
    : null;

  const displaySession: IntakeSessionData = {
    ...session,
    ai_result: aiResult,
    ai_result_id:aiResult?.id??session.ai_result_id,
  };
  const [formValues, setFormValues] = useState<ReviewFormValues>(() =>
    buildInitialReviewValues(initialSession)
  );
  const [isPending, startTransition] = useTransition();
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [discardAnchor, setDiscardAnchor] = useState<"header"|"footer"|null>(null);
  const [discardReason, setDiscardReason] = useState("");
  // HR.DOCLINK.1A — ticked ERP record links, applied on Approve
  const [entityLinks, setEntityLinks] = useState<IntakeLinkChip[]>([]);
  const [fileReview,setFileReview]=useState<IntakeReviewConfirmation|null>(null);
  const [reviewBlockReason,setReviewBlockReason]=useState<string|null>(null);
  const [approvalError, setApprovalError] = useState<{ message: string; fieldId?: number } | null>(null);

  const isFailed = session.intake_status === "failed";
  const isProcessing = ["ocr_pending", "ocr_processing", "ai_pending", "ai_processing"].includes(session.intake_status);
  const isReady = ["review_pending", "review_in_progress"].includes(session.intake_status);

  // ── Form change handler ───────────────────────────────────────────────────

  const handleFormChange = useCallback((patch: Partial<ReviewFormValues>) => {
    setApprovalError(null);
    setFormValues((prev) => {
      // Metadata values must be MERGED (not replaced) because per-field onChange
      // callbacks close over a potentially stale snapshot of values.metadataValues.
      // Using the functional update's `prev` ensures concurrent seed/edit calls
      // accumulate correctly rather than the last writer winning.
      if (patch.metadataValues !== undefined) {
        return {
          ...prev,
          ...patch,
          metadataValues: { ...prev.metadataValues, ...patch.metadataValues },
        };
      }
      return { ...prev, ...patch };
    });
  }, []);

  // ── Validate before approve ───────────────────────────────────────────────

  const validate = async (): Promise<{ error: string; fieldId?: number } | { metadataValues: AiApprovalInput["metadataValues"] }> => {
    if (!formValues.title.trim()) return { error: "Title is required" };
    if (!formValues.documentTypeId) return { error: "Document type is required" };
    if (!formValues.standardFileName.trim()) return { error: "Standard file name is required" };

    const definitions = await getMetadataDefinitionsForType(formValues.documentTypeId, "intake");
    if (!definitions.success || !definitions.data) {
      return { error: "The metadata requirements could not be checked. Keep this review and try approving again." };
    }
    // Metadata from a previous type may still be in the draft. Submit only fields
    // defined for the selected type and check the required values before approval.
    const missing = definitions.data.filter(field => field.is_required && !formValues.metadataValues[field.id]?.rawValue.trim());
    if (missing.length) return {
      error: `Complete required metadata before approving: ${missing.map(field => field.field_label_en).join(", ")}.`,
      fieldId: missing[0].id,
    };
    const changedField = definitions.data.find(field => {
      const value = formValues.metadataValues[field.id];
      return value?.rawValue.trim() && value.fieldType !== field.field_type;
    });
    if (changedField) return {
      error: `The configuration for ${changedField.field_label_en} changed. Review and re-enter its value before approving.`,
      fieldId: changedField.id,
    };
    const metadata = aiApprovalInputSchema.shape.metadataValues.safeParse(definitions.data.flatMap(field => {
      const value = formValues.metadataValues[field.id];
      if (!value?.rawValue.trim()) return [];
      return [{ definitionId: field.id, fieldType: field.field_type, rawValue: value.rawValue }];
    }));
    if (!metadata.success) return { error: "Review the metadata values for this document type before approving." };
    const metadataValues = metadata.data;

    const docType = documentTypes.find((t) => t.id === formValues.documentTypeId);
    if (docType) {
      const preview = await previewDmsStandardFileName({
        typeCode: docType.type_code,
        requiresExpiryTracking: docType.requires_expiry_tracking,
        expiryDate: formValues.expiryDate || null,
        originalFilename: session.original_filename,
        extractedFields: aiResult?.extracted_fields_json ?? null,
        metadataValues,
        uploadSessionId: session.id,
        standardFileNameOverride: formValues.standardFileName,
        suggestedDescription: formValues.description || session.ai_result?.suggested_description || null,
        suggestedTitle: formValues.title || session.ai_result?.suggested_title || null,
      });
      if (preview.success && preview.data && !preview.data.validation.valid) {
        return { error: `Standard file name is incomplete (missing: ${preview.data.validation.missing.join(", ")})` };
      }
    }
    return { metadataValues };
  };

  const draftSnapshot = useRef(session.draft_snapshot ?? null);
  const draftRequest = useRef<{values:Parameters<typeof saveAiIntakeDraft>[1];review:{requestId:string;snapshot:string}}|null>(null);
  const [draftUncertain,setDraftUncertain]=useState(false);

  // ── Save draft ────────────────────────────────────────────────────────────

  const handleSaveDraft = () => {
    if (retainedApproval || approvalBlocked) return;
    startTransition(async () => {
      if(!draftSnapshot.current){toast.error("Reload the saved review before saving.");return;}
      draftRequest.current ??= {values:buildDraftPayload(formValues),review:{requestId:crypto.randomUUID(),snapshot:draftSnapshot.current}};
      const original=draftRequest.current;
      let result;
      try { result=await saveAiIntakeDraft(session.id,original.values,original.review); }
      catch { setDraftUncertain(true);toast.error("Draft save is unconfirmed. Retry Save draft to recover the same values.");return; }
      if(session.document_id?!batchApproval.isCurrent():!approval.isCurrent())return;
      if (result.success) {
        draftSnapshot.current=result.data?.snapshot??null;draftRequest.current=null;setDraftUncertain(false);
        toast.success("Draft saved");
      } else {
        setDraftUncertain(result.uncertain===true);if(!result.uncertain)draftRequest.current=null;
        toast.error(result.error ?? "Failed to save draft");
      }
    });
  };

  // ── Approve & Save ────────────────────────────────────────────────────────

  const handleApprove = () => {
    if(approvalBlocked || draftUncertain)return;
    setApprovalError(null);
    startTransition(async () => {
      const validated: Awaited<ReturnType<typeof validate>> = retainedApproval ? { metadataValues: [] } : await validate().catch(() => ({
        error: "Approval checks could not be completed. Keep this review and try again.",
      }));
      if (session.document_id ? !batchApproval.isCurrent() : !approval.isCurrent()) return;
      if ("error" in validated) {
        setApprovalError({ message: validated.error, fieldId: validated.fieldId });
        return;
      }

      if(!retainedApproval){
        if(!fileReview||fileReview.sessionId!==session.id||fileReview.typeId!==formValues.documentTypeId||fileReview.expiryDate!==(formValues.expiryDate||null)){
          toast.error(reviewBlockReason ?? 'The review details changed. Verify the original file and confirm the current values before approving.');return;
        }
        const reviewed=await confirmExactIntakeReview(fileReview);
        if(!reviewed.success){toast.error(reviewed.error);return;}
      }

      const sharedPayload = {
        uploadSessionId: session.id,
        title: formValues.title,
        standardFileName: formValues.standardFileName.trim(),
        documentTypeId: formValues.documentTypeId!,
        description: formValues.description || null,
        issueDate: formValues.issueDate || null,
        expiryDate: formValues.expiryDate || null,
        confidentialityLevel: formValues.confidentialityLevel,
        owningCompanyId: formValues.owningCompanyId,
        owningBranchId: formValues.owningBranchId,
        metadataValues: validated.metadataValues,
        // HR.DOCLINK.1A — ticked suggestions + manual links, written by the approve saga
        tagIds: formValues.tagIds ?? [],
        links: entityLinks.map((l) => ({ entityType: l.entityType, entityId: l.entityId })),
        aiResultId: aiResult?.id ?? null,
        allowDuplicate:fileReview?.confirmed===true&&fileReview.override===true,
      };

      // Batch drafts already have a draft document (pending_ai_review): finalize
      // that ONE draft in place. Single-file intake creates the document now.
      // Both paths approve exactly one document — never in bulk.
      const result = session.document_id
        ? await batchApproval.run(sharedPayload)
        : await approval.run(sharedPayload);

      // A response from a closed/replaced owner must not navigate a new tab or
      // another account. Batch dispatch and its existing lifecycle stay unchanged.
      if(!result||(session.document_id?!batchApproval.isCurrent():!approval.isCurrent()))return;

      if (result.success && result.data) {
        toast.success(`Document ${result.data.documentNo} created successfully`);
        // Convert the intake tab into the new document tab in-place so closing it
        // later doesn't navigate back to the intake URL (which would server-redirect
        // back to the document, creating an infinite new-tab loop).
        // Open the newly-approved document in edit mode (not the view-only
        // default) so the user can immediately continue working on it —
        // e.g. attaching links, adjusting metadata, etc. — without an extra click.
        const docRoute = `/dms/documents/record/${result.data.documentId}?mode=edit`;
        if (activeTab) {
          updateTabRoute(activeTab.id, docRoute, result.data.documentId);
          renameTab(activeTab.id, result.data.documentNo, "Document");
        }
        router.replace(docRoute);
      } else {
        toast.error(("error" in result ? result.error : null) ?? "Failed to create document");
      }
    });
  };

  // ── Retry AI ──────────────────────────────────────────────────────────────

  const handleRetry = () => {
    if (retainedApproval || approvalBlocked || draftUncertain) return;
    startTransition(async () => {
      const result = await retryAiIntake(session.id);
      if (result.success) {
        toast.success("AI analysis re-started. Refreshing…");
        router.refresh();
      } else {
        toast.error(result.error ?? "Failed to retry AI analysis");
      }
    });
  };

  // ── Discard ───────────────────────────────────────────────────────────────

  const handleDiscard = () => {
    if (retainedApproval || draftUncertain || isPending || !discardAnchor) return;
    startTransition(async () => {
      // Batch drafts have a draft document that must be soft-deleted per the DMS
      // delete standard; single-file intake has no document yet.
      const result = session.document_id
        ? await discardDraftIntake({ uploadSessionId: session.id, reason: discardReason || undefined })
        : await discardAiIntake(session.id, discardReason || undefined);
      if (result.success) {
        toast.success(session.document_id
          ? "Intake cancelled. Its unapproved draft is archived and its files and history are retained."
          : "Intake cancelled and removed from the active Inbox. Its history is retained; you can upload the file again.");
        // Close this tab and let the workspace return to wherever it came
        // from (e.g. the Batch Review Queue), instead of always landing on
        // the Upload Inbox.
        if (activeTab) {
          closeTab(activeTab.id, { force: true });
        } else {
          router.push("/dms/inbox");
        }
      } else {
        toast.error(result.error ?? "Failed to discard intake");
      }
    });
  };

  // ── Preview ───────────────────────────────────────────────────────────────

  const handlePreview = async () => {
    if (previewUrl) {
      window.open(previewUrl, "_blank");
      return;
    }
    setIsLoadingPreview(true);
    const result = await getIntakeSessionSignedUrl(session.id);
    setIsLoadingPreview(false);
    if (result.success && result.data) {
      setPreviewUrl(result.data.url);
      window.open(result.data.url, "_blank");
    } else {
      toast.error("Could not generate preview link");
    }
  };

  // ── Confidence summary ─────────────────────────────────────────────────────


  return <DmsAiIntakeView {...{session,displaySession,aiResult,documentTypes,formValues,handleFormChange,entityLinks,setEntityLinks,isReady,isFailed,isProcessing,isPending,retainedApproval,approvalBlocked,draftUncertain,handleRetry,handleSaveDraft,handleApprove,handleDiscard,handlePreview,isLoadingPreview,discardAnchor,setDiscardAnchor,discardReason,setDiscardReason,setFileReview,setReviewBlockReason}}
    approvalError={approvalError}
    approvalLoading={approval.loading} retentionError={approval.retentionError} batchLoading={batchApproval.loading} batchBlocked={batchApproval.blocked} navigate={url=>router.push(url)}
    onAiResultPatch={(patch,snapshot)=>{setAiResultPatch(prev=>({...prev,...patch}));setFileReview(null);if(snapshot)draftSnapshot.current=snapshot;}}/>;
}

// ── Build draft payload ────────────────────────────────────────────────────────

function buildDraftPayload(values: ReviewFormValues) {
  const payload: Parameters<typeof saveAiIntakeDraft>[1] = [];

  const addField = (
    fieldCode: string,
    reviewedValue: unknown,
    suggestedValue?: unknown,
    fieldType = "text"
  ) => {
    if (reviewedValue !== undefined) {
      payload.push({
        fieldScope: "document",
        fieldCode,
        fieldType,
        reviewedValueJson: reviewedValue,
        suggestedValueJson: suggestedValue ?? null,
        reviewStatus: "edited",
      });
    }
  };

  addField("title", values.title);
  addField("standard_file_name", values.standardFileName);
  addField("document_type_id", values.documentTypeId, values.documentTypeId, "number");
  addField("description", values.description);
  addField("issue_date", values.issueDate, null, "date");
  addField("expiry_date", values.expiryDate, null, "date");
  addField("confidentiality_level", values.confidentialityLevel);
  addField("owning_company_id", values.owningCompanyId, null, "number");
  addField("owning_branch_id", values.owningBranchId, null, "number");

  if(values.tagIds !== undefined) addField("tag_ids",values.tagIds,null,"json");

  for (const [id, mv] of Object.entries(values.metadataValues)) {
    {
      payload.push({
        fieldScope: "metadata",
        fieldCode: id,
        fieldType: mv.fieldType,
        reviewedValueJson: mv.rawValue,
        reviewStatus: "edited",
      });
    }
  }

  return payload;
}
