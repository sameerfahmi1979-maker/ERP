"use client";

import { useState, useTransition, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useWorkspace } from "@/hooks/use-workspace";
import { toast } from "sonner";
import {
  Bot,
  FileText,
  RefreshCw,
  CheckCircle2,
  XCircle,
  RotateCcw,
  Save,
  AlertTriangle,
  FileIcon,
  ExternalLink,
  Link as LinkIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { DmsAiIntakeStatusBadge } from "./dms-ai-intake-status-badge";
import { DmsAiConfidenceBadge } from "@/features/dms/ai/dms-ai-confidence-badge";
import { DmsAiIntakeReviewForm, buildInitialReviewValues } from "./dms-ai-intake-review-form";
import type { ReviewFormValues } from "./dms-ai-intake-review-form";
import type { IntakeSessionData, IntakeAiResultRow } from "@/server/actions/dms/ai-intake";
import {
  approveAiIntakeAndCreateDocument,
  discardAiIntake,
  retryAiIntake,
  saveAiIntakeDraft,
  getIntakeSessionSignedUrl,
} from "@/server/actions/dms/ai-intake";
import { finalizeDraftIntake, discardDraftIntake } from "@/server/actions/dms/batch-intake";
import { previewDmsStandardFileName } from "@/server/actions/dms/standard-file-name";
import type { DmsDocumentTypeRow } from "@/server/actions/dms/document-types";
import { DmsOrchestrationProgressCard } from "@/features/dms/orchestration";

// ── Format file size ──────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

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
  const [aiResultPatch, setAiResultPatch] = useState<Partial<IntakeAiResultRow> | null>(null);
  const aiResult = session.ai_result
    ? ({ ...session.ai_result, ...aiResultPatch } as IntakeAiResultRow)
    : null;

  const displaySession: IntakeSessionData = {
    ...session,
    ai_result: aiResult,
  };
  const [formValues, setFormValues] = useState<ReviewFormValues>(() =>
    buildInitialReviewValues(initialSession)
  );
  const [isPending, startTransition] = useTransition();
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [discardDialogOpen, setDiscardDialogOpen] = useState(false);
  const [discardReason, setDiscardReason] = useState("");

  const isFailed = session.intake_status === "failed";
  const isProcessing = ["ocr_pending", "ocr_processing", "ai_pending", "ai_processing"].includes(session.intake_status);
  const isReady = ["review_pending", "review_in_progress"].includes(session.intake_status);

  // ── Form change handler ───────────────────────────────────────────────────

  const handleFormChange = useCallback((patch: Partial<ReviewFormValues>) => {
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

  const validate = async (): Promise<string | null> => {
    if (!formValues.title.trim()) return "Title is required";
    if (!formValues.documentTypeId) return "Document type is required";
    if (!formValues.standardFileName.trim()) return "Standard file name is required";

    const docType = documentTypes.find((t) => t.id === formValues.documentTypeId);
    if (docType) {
      const preview = await previewDmsStandardFileName({
        typeCode: docType.type_code,
        requiresExpiryTracking: docType.requires_expiry_tracking,
        expiryDate: formValues.expiryDate || null,
        originalFilename: session.original_filename,
        extractedFields: aiResult?.extracted_fields_json ?? null,
        metadataValues: Object.entries(formValues.metadataValues).map(([id, v]) => ({
          definitionId: parseInt(id, 10),
          rawValue: v.rawValue,
        })),
        uploadSessionId: session.id,
        standardFileNameOverride: formValues.standardFileName,
        suggestedDescription: formValues.description || session.ai_result?.suggested_description || null,
        suggestedTitle: formValues.title || session.ai_result?.suggested_title || null,
      });
      if (preview.success && preview.data && !preview.data.validation.valid) {
        return `Standard file name is incomplete (missing: ${preview.data.validation.missing.join(", ")})`;
      }
    }
    return null;
  };

  // ── Save draft ────────────────────────────────────────────────────────────

  const handleSaveDraft = () => {
    startTransition(async () => {
      const draftPayload = buildDraftPayload(formValues);
      const result = await saveAiIntakeDraft(session.id, draftPayload);
      if (result.success) {
        toast.success("Draft saved");
      } else {
        toast.error(result.error ?? "Failed to save draft");
      }
    });
  };

  // ── Approve & Save ────────────────────────────────────────────────────────

  const handleApprove = () => {
    startTransition(async () => {
      const error = await validate();
      if (error) {
        toast.error(error);
        return;
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
        metadataValues: Object.entries(formValues.metadataValues).map(([id, v]) => ({
          definitionId: parseInt(id),
          fieldType: v.fieldType,
          rawValue: v.rawValue,
        })).filter((v) => v.rawValue !== ""),
        aiResultId: aiResult?.id ?? null,
      };

      // Batch drafts already have a draft document (pending_ai_review): finalize
      // that ONE draft in place. Single-file intake creates the document now.
      // Both paths approve exactly one document — never in bulk.
      const result = session.document_id
        ? await finalizeDraftIntake(sharedPayload)
        : await approveAiIntakeAndCreateDocument(sharedPayload);

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
        toast.error(result.error ?? "Failed to create document");
      }
    });
  };

  // ── Retry AI ──────────────────────────────────────────────────────────────

  const handleRetry = () => {
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
    if (!discardDialogOpen) {
      setDiscardDialogOpen(true);
      return;
    }
    startTransition(async () => {
      // Batch drafts have a draft document that must be soft-deleted per the DMS
      // delete standard; single-file intake has no document yet.
      const result = session.document_id
        ? await discardDraftIntake({ uploadSessionId: session.id, reason: discardReason || undefined })
        : await discardAiIntake(session.id, discardReason || undefined);
      if (result.success) {
        toast.success("Intake discarded");
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

  const classificationConf = aiResult?.classification_confidence ?? null;
  const classificationScore = aiResult?.classification_score ?? null;

  return (
    <div className="flex flex-col min-h-0 gap-0">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4 pb-4 border-b">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-violet-100 dark:bg-violet-900/30 text-violet-600">
            <Bot className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-base font-semibold">AI-Assisted Document Intake</h1>
            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
              <span className="text-xs text-muted-foreground font-mono">{session.session_code}</span>
              <DmsAiIntakeStatusBadge status={session.intake_status} />
              {classificationConf && (
                <DmsAiConfidenceBadge label={classificationConf} score={classificationScore} />
              )}
              {session.is_duplicate && (
                <Badge variant="outline" className="text-[10px] border-orange-300 text-orange-700 bg-orange-50">
                  Duplicate File Detected
                </Badge>
              )}
            </div>
          </div>
        </div>

        {/* Header actions */}
        <div className="flex items-center gap-2 shrink-0">
          {(isFailed || isReady) && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleRetry}
              disabled={isPending}
            >
              <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
              Re-run AI
            </Button>
          )}
          {isReady && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={handleSaveDraft}
                disabled={isPending}
              >
                <Save className="h-3.5 w-3.5 mr-1.5" />
                Save Draft
              </Button>
              <Button
                size="sm"
                onClick={handleApprove}
                disabled={isPending}
                className="bg-green-600 hover:bg-green-700 text-white"
              >
                {isPending ? (
                  <RefreshCw className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
                )}
                Approve &amp; Save
              </Button>
            </>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setDiscardDialogOpen((v) => !v)}
            disabled={isPending}
            className="text-destructive hover:text-destructive"
          >
            <XCircle className="h-3.5 w-3.5 mr-1.5" />
            Discard
          </Button>
        </div>
      </div>

      {/* ── Discard confirmation ────────────────────────────────────────────── */}
      {discardDialogOpen && (
        <div className="mt-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4 space-y-3">
          <div className="flex items-center gap-2 text-sm font-medium text-destructive">
            <AlertTriangle className="h-4 w-4" />
            Confirm Discard Intake
          </div>
          <p className="text-xs text-muted-foreground">
            This will discard the AI intake session. The uploaded file will remain in staging and no document will be created.
          </p>
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={discardReason}
              onChange={(e) => setDiscardReason(e.target.value)}
              placeholder="Reason (optional)"
              className="flex-1 h-8 text-xs rounded-md border bg-background px-3 outline-none focus:ring-2 focus:ring-destructive/30"
            />
            <Button
              size="sm"
              variant="destructive"
              onClick={handleDiscard}
              disabled={isPending}
            >
              Confirm Discard
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setDiscardDialogOpen(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* ── Processing state ─────────────────────────────────────────────────── */}
      {isProcessing && (
        <div className="mt-6 flex flex-col items-center justify-center gap-4 py-16">
          <div className="h-12 w-12 rounded-full border-4 border-violet-500 border-t-transparent animate-spin" />
          <div className="text-center">
            <p className="text-sm font-medium">AI is analyzing your document…</p>
            <p className="text-xs text-muted-foreground mt-1">This may take 10–30 seconds depending on file size and AI provider.</p>
          </div>
          <DmsAiIntakeStatusBadge status={session.intake_status} />
        </div>
      )}

      {/* ── Failed state ──────────────────────────────────────────────────────── */}
      {isFailed && (
        <div className="mt-6 rounded-lg border border-destructive/30 bg-destructive/5 p-6 space-y-3">
          <div className="flex items-center gap-2 font-medium text-destructive">
            <AlertTriangle className="h-5 w-5" />
            AI Analysis Failed
          </div>
          <p className="text-sm text-muted-foreground">
            The AI could not analyze your document. You can retry the analysis or create the document manually.
          </p>
          <div className="flex gap-2">
            <Button size="sm" onClick={handleRetry} disabled={isPending}>
              <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
              Retry AI
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => router.push("/dms/documents/record/new")}
            >
              <FileText className="h-3.5 w-3.5 mr-1.5" />
              Create Manually
            </Button>
          </div>
        </div>
      )}

      {/* ── AI Orchestration Progress Card (ORCH.1) ───────────────────────────── */}
      {isReady && session.document_id && (
        <div className="mt-4">
          <DmsOrchestrationProgressCard
            sessionCode={session.session_code}
            documentId={session.document_id}
            autoTrigger
          />
        </div>
      )}

      {/* ── Review layout ─────────────────────────────────────────────────────── */}
      {isReady && (
        <div className="mt-4 grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
          {/* ── Left panel: File info + AI summary ──────────────────────────── */}
          <div className="lg:col-span-1 space-y-4">
            {/* File info card */}
            <div className="rounded-lg border bg-card p-4 space-y-3">
              <div className="flex items-center gap-2">
                <FileIcon className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className="text-sm font-medium truncate">{session.original_filename}</span>
              </div>
              <Separator />
              <dl className="space-y-1.5 text-xs">
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Size</dt>
                  <dd className="font-mono">{formatBytes(session.file_size_bytes)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Type</dt>
                  <dd className="font-mono truncate">{session.mime_type}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Intake</dt>
                  <dd><DmsAiIntakeStatusBadge status={session.intake_status} /></dd>
                </div>
                {session.is_duplicate && (
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Duplicate</dt>
                    <dd>
                      <Badge variant="outline" className="text-[10px] border-orange-300 text-orange-700 bg-orange-50">
                        Yes
                      </Badge>
                    </dd>
                  </div>
                )}
              </dl>
              <Button
                variant="outline"
                size="sm"
                className="w-full text-xs"
                onClick={handlePreview}
                disabled={isLoadingPreview}
              >
                {isLoadingPreview ? (
                  <RefreshCw className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                ) : (
                  <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                )}
                Preview File
              </Button>
            </div>

            {/* AI Summary card */}
            {aiResult && (
              <div className="rounded-lg border bg-card p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <Bot className="h-4 w-4 text-violet-500 shrink-0" />
                  <span className="text-sm font-medium">AI Analysis Summary</span>
                </div>
                <Separator />
                <dl className="space-y-2 text-xs">
                  {aiResult.suggested_type && (
                    <div>
                      <dt className="text-muted-foreground mb-0.5">Suggested Type</dt>
                      <dd className="font-medium">{aiResult.suggested_type.name_en}</dd>
                    </div>
                  )}
                  {aiResult.classification_reason && (
                    <div>
                      <dt className="text-muted-foreground mb-0.5">Classification Reason</dt>
                      <dd className="text-muted-foreground italic text-[11px] leading-relaxed line-clamp-3">
                        {aiResult.classification_reason}
                      </dd>
                    </div>
                  )}
                  <div>
                    <dt className="text-muted-foreground mb-0.5">Classification Confidence</dt>
                    <dd>
                      <DmsAiConfidenceBadge
                        label={aiResult.classification_confidence}
                        score={aiResult.classification_score}
                      />
                    </dd>
                  </div>
                  {aiResult.expiry_date_suggestion && (
                    <div>
                      <dt className="text-muted-foreground mb-0.5">Suggested Expiry</dt>
                      <dd className="font-mono">{aiResult.expiry_date_suggestion}</dd>
                    </div>
                  )}
                  {aiResult.extracted_fields_json && (
                    <div>
                      <dt className="text-muted-foreground mb-0.5">Extracted Fields</dt>
                      <dd>{Object.keys(aiResult.extracted_fields_json).filter((k) => k !== "__additional_fields").length} field(s)</dd>
                    </div>
                  )}
                </dl>
              </div>
            )}

            {/* Detected related parties (DB matches) */}
            {(() => {
              const links = Array.isArray(aiResult?.suggested_links_json)
                ? (aiResult!.suggested_links_json as Array<Record<string, unknown>>).filter(
                    (l) => l && l.entityType === "party" && l.entityId
                  )
                : [];
              if (links.length === 0) return null;
              return (
                <div className="rounded-lg border bg-card p-4 space-y-2">
                  <div className="flex items-center gap-2">
                    <LinkIcon className="h-4 w-4 text-emerald-500 shrink-0" />
                    <span className="text-sm font-medium">Matched Parties in Database</span>
                  </div>
                  <Separator />
                  <p className="text-[11px] text-muted-foreground">
                    The AI matched names in the document to existing party records. Verify before linking.
                  </p>
                  <ul className="space-y-1.5">
                    {links.map((l, i) => (
                      <li key={i} className="flex items-start gap-2 text-xs">
                        <a
                          href={`/master-data/parties/record/${l.entityId as number}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary hover:underline font-medium flex items-center gap-0.5 shrink-0"
                        >
                          {String(l.entityName ?? `Party #${l.entityId}`)}
                          <ExternalLink className="h-2.5 w-2.5" />
                        </a>
                        {typeof l.confidenceScore === "number" && (
                          <span className="text-[10px] text-muted-foreground">
                            {Math.round((l.confidenceScore as number) * 100)}%
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })()}

            {/* AI warnings */}
            {(() => {
              const raw = aiResult?.raw_response_json as { warnings?: unknown } | null | undefined;
              const warnings = Array.isArray(raw?.warnings)
                ? (raw!.warnings as unknown[]).filter((w): w is string => typeof w === "string")
                : [];
              if (warnings.length === 0) return null;
              return (
                <div className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/20 p-4 space-y-1.5">
                  <div className="flex items-center gap-2 text-sm font-medium text-amber-700 dark:text-amber-400">
                    <AlertTriangle className="h-4 w-4" />
                    AI Notes
                  </div>
                  <ul className="list-disc list-inside space-y-0.5 text-[11px] text-amber-700 dark:text-amber-400">
                    {warnings.map((w, i) => <li key={i}>{w}</li>)}
                  </ul>
                </div>
              );
            })()}

            {/* Duplicate warning */}
            {session.is_duplicate && session.duplicate_document_id && (
              <div className="rounded-lg border border-orange-300 bg-orange-50 dark:bg-orange-950/20 p-4 space-y-2">
                <div className="flex items-center gap-2 text-sm font-medium text-orange-700 dark:text-orange-400">
                  <AlertTriangle className="h-4 w-4" />
                  Duplicate File
                </div>
                <p className="text-xs text-orange-600 dark:text-orange-500">
                  A document with the same file hash already exists in the system.
                  You can still approve this intake to create a new document.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs border-orange-300"
                  onClick={() => router.push(`/dms/documents/record/${session.duplicate_document_id}`)}
                >
                  View Existing Document
                </Button>
              </div>
            )}
          </div>

          {/* ── Right panel: Review form ───────────────────────────────────── */}
          <div className="lg:col-span-2">
            <div className="rounded-lg border bg-card p-5">
              <div className="flex items-center gap-2 mb-5">
                <FileText className="h-4 w-4 text-muted-foreground" />
                <h3 className="text-sm font-semibold">Review &amp; Correct AI-Filled Fields</h3>
                {aiResult && (
                  <Badge variant="outline" className="text-[10px] bg-violet-50 text-violet-700 border-violet-200 ml-auto">
                    AI Pre-filled
                  </Badge>
                )}
              </div>
              <DmsAiIntakeReviewForm
                session={displaySession}
                values={formValues}
                onChange={handleFormChange}
                initialDocTypes={documentTypes}
                aiResultOverride={aiResult}
                onAiResultPatch={(patch) =>
                  setAiResultPatch((prev) => ({ ...(prev ?? {}), ...patch }))
                }
              />
            </div>
          </div>
        </div>
      )}

      {/* ── Footer ─────────────────────────────────────────────────────────── */}
      {isReady && (
        <div className="mt-6 flex items-center justify-between border-t pt-4">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setDiscardDialogOpen(true)}
            className="text-destructive border-destructive/30 hover:bg-destructive/5"
            disabled={isPending}
          >
            <XCircle className="h-3.5 w-3.5 mr-1.5" />
            Discard Intake
          </Button>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleSaveDraft}
              disabled={isPending}
            >
              <Save className="h-3.5 w-3.5 mr-1.5" />
              Save Draft
            </Button>
            <Button
              size="sm"
              onClick={handleApprove}
              disabled={isPending}
              className="bg-green-600 hover:bg-green-700 text-white"
            >
              {isPending ? (
                <RefreshCw className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              ) : (
                <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
              )}
              Approve &amp; Save
            </Button>
          </div>
        </div>
      )}
    </div>
  );
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
    if (reviewedValue !== null && reviewedValue !== undefined && reviewedValue !== "") {
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

  for (const [id, mv] of Object.entries(values.metadataValues)) {
    if (mv.rawValue) {
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
