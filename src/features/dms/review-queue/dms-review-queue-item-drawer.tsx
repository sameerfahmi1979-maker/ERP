"use client";

import { useState, useEffect, useRef } from "react";
import { formatDistanceToNow, parseISO } from "date-fns";
import type { ReviewQueueItem } from "@/server/actions/dms/review-queue";
import {
  assignDmsReviewQueueItem,
  startDmsReviewQueueItem,
  resolveDmsReviewQueueItem,
  dismissDmsReviewQueueItem,
} from "@/server/actions/dms/review-queue";
import {
  reviewDmsValidationFinding,
  markDmsValidationFindingFalsePositive,
} from "@/server/actions/dms/validation";
import { reviewDmsEntityMatchCandidate } from "@/server/actions/dms/entity-matching";
import { Button } from "@/components/ui/button";
import { X, UserCheck, Play, CheckCircle2, Ban, ExternalLink, Clock, ShieldAlert, GitMerge, Search, Sparkles } from "lucide-react";
// Phase 16 — Apply-to-ERP entry point (feature-flag gated inside DmsApplyToErpPreview)
import { DmsApplyToErpPreview, DmsPartyTargetSelector } from "@/features/dms/apply-to-erp";
import type { PartyApplyTargetKind } from "@/lib/dms/apply-to-erp/types";
// DMS AI META.2 — Flow B: AI metadata suggestions review, embedded (not modal)
import { DmsAiMetadataSuggestionsDialog } from "@/features/dms/admin/dms-ai-metadata-suggestions-dialog";
import type { AiSuggestedField } from "@/lib/dms/metadata/ai-definition-builder";

// ── Resolution codes ──────────────────────────────────────────────────────────

const RESOLUTION_CODES = [
  { value: "accepted_as_is",       label: "Accepted As-Is — No changes needed" },
  { value: "manual_correction",    label: "Manual Correction — User fixed manually" },
  { value: "data_quality_issue",   label: "Data Quality — Source data issue noted" },
  { value: "ai_error_documented",  label: "AI Error — Documented for model improvement" },
  { value: "system_issue_fixed",   label: "System Issue — Technical issue resolved" },
  { value: "no_action_needed",     label: "No Action Needed — Safe to close" },
];

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  item:             ReviewQueueItem;
  canManage:        boolean;
  onClose:          () => void;
  onMutated:        () => void;
  onItemRefreshed?: () => void; // refresh item in-place without closing drawer
  onBusyChange?: (busy: boolean) => void;
}

// ── Detail drawer ─────────────────────────────────────────────────────────────

export function DmsReviewQueueItemDrawer({ item, canManage, onClose, onMutated, onItemRefreshed, onBusyChange }: Props) {
  const actionFlight = useRef(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  useEffect(() => { onBusyChange?.(isSubmitting); return () => onBusyChange?.(false); }, [isSubmitting, onBusyChange]);
  const [error, setError]               = useState<string | null>(null);
  const [resolutionCode, setResolutionCode] = useState(RESOLUTION_CODES[0].value);
  const [resolutionNote, setResolutionNote] = useState("");
  const [dismissReason, setDismissReason]   = useState("");
  const [showResolveForm, setShowResolveForm] = useState(false);
  const [showDismissForm, setShowDismissForm] = useState(false);

  // Phase 16 Tier 2 — Party write-back state
  const [partyTargetKind, setPartyTargetKind] = useState<PartyApplyTargetKind>("party_licenses");
  const [partySelectedRowId, setPartySelectedRowId] = useState<number | null>(null);
  const [suggestedTaxExpiry] = useState(() => new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split("T")[0]);

  const isActive = ["open", "assigned", "in_review"].includes(item.status);

  const handleAssignToMe = async () => {
    if(actionFlight.current)return; actionFlight.current=true;
    try {
    setIsSubmitting(true); setError(null);
    const result = await assignDmsReviewQueueItem(item.id, 0); // 0 = self (server resolves current user)
    if (!result.success) setError("The action was not accepted. Check the item state and your access.");
    else onMutated();
    setIsSubmitting(false);

    } catch { setError("The change could not be confirmed. Your entries remain here. Refresh the item before retrying."); } finally { actionFlight.current=false; setIsSubmitting(false); }
};

  const handleStart = async () => {
    if(actionFlight.current)return; actionFlight.current=true;
    try {
    setIsSubmitting(true); setError(null);
    const result = await startDmsReviewQueueItem(item.id);
    if (!result.success) {
      setError("The action was not accepted. Check the item state and your access.");
      setIsSubmitting(false);
      return;
    }
    // Open source document in a new tab so the reviewer can do their work,
    // then refresh the item in-place (keeps drawer open for Resolve/Dismiss).
    if (sourceUrl) {
      window.open(sourceUrl, "_blank", "noreferrer");
    }
    onItemRefreshed?.();
    setIsSubmitting(false);

    } catch { setError("The change could not be confirmed. Your entries remain here. Refresh the item before retrying."); } finally { actionFlight.current=false; setIsSubmitting(false); }
};

  const handleResolve = async () => {
    if(actionFlight.current)return; actionFlight.current=true;
    try {
    setIsSubmitting(true); setError(null);
    const result = await resolveDmsReviewQueueItem(item.id, {
      resolutionCode,
      resolutionNote: resolutionNote.trim() || undefined,
    });
    if (!result.success) setError("The action was not accepted. Check the item state and your access.");
    else onMutated();
    setIsSubmitting(false);

    } catch { setError("The change could not be confirmed. Your entries remain here. Refresh the item before retrying."); } finally { actionFlight.current=false; setIsSubmitting(false); }
};

  const handleDismiss = async () => {
    if(actionFlight.current)return; actionFlight.current=true;
    try {
    if (!dismissReason.trim()) { setError("Please provide a dismissal reason."); return; }
    setIsSubmitting(true); setError(null);
    const result = await dismissDmsReviewQueueItem(item.id, dismissReason.trim());
    if (!result.success) setError("The action was not accepted. Check the item state and your access.");
    else onMutated();
    setIsSubmitting(false);

    } catch { setError("The change could not be confirmed. Your entries remain here. Refresh the item before retrying."); } finally { actionFlight.current=false; setIsSubmitting(false); }
};

  // Source link — prefer the final document (via session.document_id) in edit mode
  const sessionDocumentId = item.uploadSession?.document_id ?? null;
  const sourceUrl = sessionDocumentId
    ? `/dms/documents/record/${sessionDocumentId}?mode=edit`
    : item.documentId
    ? `/dms/documents/record/${item.documentId}?mode=edit`
    : item.uploadSessionId
    ? `/dms/intake/${item.uploadSession?.session_code ?? item.uploadSessionId}`
    : null;

  const REVIEW_TYPE_LABELS: Record<string, string> = {
    // Phase 12
    intake_classification_review:  "Intake Classification Review",
    intake_metadata_review:        "Intake Metadata Review",
    ai_analysis_metadata_review:   "AI Analysis Metadata Review",
    ocr_failure_review:            "OCR Failure Review",
    semantic_index_review:         "Semantic Index Review",
    ai_job_failure_review:         "AI Job Failure Review",
    // DMS AI META.2
    metadata_definition_suggestions_review: "AI Metadata Suggestions Review",
    // Phase 13
    validation_conflict_review:    "Validation Conflict Review",
    metadata_rule_violation_review: "Metadata Rule Violation",
    owner_matching_review:         "Owner Company Match Review",
    party_matching_review:         "Party Match Review",
    employee_matching_review:      "Employee Match Review",
    duplicate_document_review:     "Duplicate Document Review",
    document_consistency_review:   "Document Consistency Review",
  };

  // Phase 13 — entity match candidate actions
  const isMatchingReviewType = [
    "owner_matching_review", "party_matching_review", "employee_matching_review"
  ].includes(item.reviewType);

  const isValidationReviewType = [
    "validation_conflict_review", "metadata_rule_violation_review",
    "duplicate_document_review", "document_consistency_review"
  ].includes(item.reviewType);

  // DMS AI META.2 — Flow B: AI metadata suggestions review type. The embedded
  // dialog below is the sole place fields are created/dismissed for this
  // item; the generic Resolve/Dismiss footer is hidden for this type.
  const isMetadataSuggestionsReviewType = item.reviewType === "metadata_definition_suggestions_review";
  const metadataSuggestionsPayload = item.payloadJson as
    | {
        document_type_id?: number;
        document_type_code?: string;
        document_type_name?: string;
        trigger_document_id?: number;
        model?: string | null;
        suggestions?: Array<Record<string, unknown>>;
      }
    | null;
  const metadataSuggestions: AiSuggestedField[] = (metadataSuggestionsPayload?.suggestions ?? []).map((s) => ({
    field_code: String(s.field_code ?? ""),
    field_label_en: String(s.field_label_en ?? ""),
    field_type: (s.field_type as AiSuggestedField["field_type"]) ?? "text",
    is_required: s.is_required === true,
    is_ai_extractable: s.is_ai_extractable !== false,
    ai_field_hint: String(s.ai_field_hint ?? ""),
    ai_example_values: [],
    sort_order: typeof s.sort_order === "number" ? s.sort_order : 0,
    reasoning: String(s.reasoning ?? ""),
  }));

  const handleAcceptCandidate = async () => {
    if(actionFlight.current)return; actionFlight.current=true;
    try {
    if (!item.entityMatchCandidateId) return;
    setIsSubmitting(true); setError(null);
    const result = await reviewDmsEntityMatchCandidate(item.entityMatchCandidateId, {
      decision: "accepted_for_later_apply",
      note: "Accepted for later apply via review queue.",
    });
    if (!result.success) setError("The action was not accepted. Check the item state and your access.");
    else onMutated();
    setIsSubmitting(false);

    } catch { setError("The change could not be confirmed. Your entries remain here. Refresh the item before retrying."); } finally { actionFlight.current=false; setIsSubmitting(false); }
};

  const handleRejectCandidate = async () => {
    if(actionFlight.current)return; actionFlight.current=true;
    try {
    if (!item.entityMatchCandidateId) return;
    setIsSubmitting(true); setError(null);
    const result = await reviewDmsEntityMatchCandidate(item.entityMatchCandidateId, {
      decision: "rejected",
      note: "Rejected via review queue.",
    });
    if (!result.success) setError("The action was not accepted. Check the item state and your access.");
    else onMutated();
    setIsSubmitting(false);

    } catch { setError("The change could not be confirmed. Your entries remain here. Refresh the item before retrying."); } finally { actionFlight.current=false; setIsSubmitting(false); }
};

  const handleFindingFalsePositive = async () => {
    if(actionFlight.current)return; actionFlight.current=true;
    try {
    if (!item.validationFindingId) return;
    setIsSubmitting(true); setError(null);
    const result = await markDmsValidationFindingFalsePositive(item.validationFindingId, "Marked false positive via review queue.");
    if (!result.success) setError("The action was not accepted. Check the item state and your access.");
    else onMutated();
    setIsSubmitting(false);

    } catch { setError("The change could not be confirmed. Your entries remain here. Refresh the item before retrying."); } finally { actionFlight.current=false; setIsSubmitting(false); }
};

  const handleFindingReviewed = async () => {
    if(actionFlight.current)return; actionFlight.current=true;
    try {
    if (!item.validationFindingId) return;
    setIsSubmitting(true); setError(null);
    const result = await reviewDmsValidationFinding(item.validationFindingId, {
      decision: "reviewed_no_action",
      note: "Reviewed with no action via review queue.",
    });
    if (!result.success) setError("The action was not accepted. Check the item state and your access.");
    else onMutated();
    setIsSubmitting(false);

    } catch { setError("The change could not be confirmed. Your entries remain here. Refresh the item before retrying."); } finally { actionFlight.current=false; setIsSubmitting(false); }
};

  const PRIORITY_COLORS: Record<string, string> = {
    urgent: "text-red-700 bg-red-50 border-red-200",
    high:   "text-orange-700 bg-orange-50 border-orange-200",
    normal: "text-sky-700 bg-sky-50 border-sky-200",
    low:    "text-muted-foreground bg-slate-50 border-border",
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-start justify-between border-b border-border px-6 py-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-0.5">
            Review Item #{item.id}
          </p>
          <h2 className="text-base font-semibold text-foreground">
            {REVIEW_TYPE_LABELS[item.reviewType] ?? item.reviewType}
          </h2>
        </div>
        <button
          type="button"
          aria-label="Close review item" disabled={isSubmitting} onClick={onClose}
          className="rounded-md p-1 hover:bg-slate-100 text-muted-foreground"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5 min-h-0">

        {/* Priority + Status */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold uppercase ${PRIORITY_COLORS[item.priority] ?? PRIORITY_COLORS.normal}`}>
            {item.priority} priority
          </span>
          <span className="rounded-full border border-border px-2.5 py-1 text-xs font-medium text-muted-foreground bg-slate-50">
            {item.status.replace("_", " ")}
          </span>
          {item.confidence != null && (
            <span className="rounded-full border border-border px-2.5 py-1 text-xs font-mono text-muted-foreground bg-slate-50">
              {(item.confidence * 100).toFixed(0)}% confidence
            </span>
          )}
        </div>

        {/* Reason */}
        {(item.reasonMessage || item.reasonCode) && (
          <div className="rounded-md border border-amber-200 bg-amber-50 p-3">
            <p className="text-xs font-semibold text-amber-800 mb-1">Review Reason</p>
            <p className="text-sm text-amber-900">{item.reasonMessage ?? item.reasonCode}</p>
            {item.fieldCode && (
              <p className="mt-1 text-xs text-amber-700">
                Field: <code className="font-mono">{item.fieldCode}</code>
              </p>
            )}
          </div>
        )}

        {/* Source link */}
        {sourceUrl && (
          <div>
            <p className="text-xs font-semibold text-muted-foreground mb-1.5">Source Document</p>
            <a
              href={sourceUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-700 hover:bg-sky-100 transition-colors"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              {item.document?.document_no ?? item.uploadSession?.session_code ?? `Document ${item.documentId}`}
              {item.document?.title && (
                <span className="text-sky-500 font-normal">— {item.document.title.slice(0, 40)}</span>
              )}
            </a>
          </div>
        )}

        {/* Meta grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
          <div>
            <p className="text-muted-foreground font-medium">Queued</p>
            <p className="text-foreground">{formatDistanceToNow(parseISO(item.queuedAt), { addSuffix: true })}</p>
          </div>
          {item.dueAt && (
            <div>
              <p className="text-muted-foreground font-medium flex items-center gap-0.5">
                <Clock className="h-3 w-3" /> Due
              </p>
              <p className="text-foreground">{formatDistanceToNow(parseISO(item.dueAt), { addSuffix: true })}</p>
            </div>
          )}
          {item.assignedUser?.full_name && (
            <div>
              <p className="text-muted-foreground font-medium">Assigned To</p>
              <p className="text-foreground">{item.assignedUser.full_name}</p>
            </div>
          )}
          {item.reviewedAt && (
            <div>
              <p className="text-muted-foreground font-medium">Reviewed</p>
              <p className="text-foreground">{formatDistanceToNow(parseISO(item.reviewedAt), { addSuffix: true })}</p>
            </div>
          )}
        </div>

        {/* Resolution info (if already closed) */}
        {(item.status === "resolved" || item.status === "dismissed") && item.resolutionCode && (
          <div className="rounded-md border border-border bg-slate-50 p-3">
            <p className="text-xs font-semibold text-muted-foreground mb-1">
              {item.status === "resolved" ? "Resolution" : "Dismissal Reason"}
            </p>
            <p className="text-sm text-foreground">{item.resolutionCode.replace(/_/g, " ")}</p>
            {item.resolutionNote && (
              <p className="mt-1 text-xs text-muted-foreground">{item.resolutionNote}</p>
            )}
          </div>
        )}

        {/* Phase 13 — Validation Finding Details */}
        {item.validationFinding && (
          <div className="rounded-md border border-amber-200 bg-amber-50 p-4 space-y-3">
            <div className="flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-amber-600" />
              <p className="text-xs font-semibold text-amber-800 uppercase tracking-wide">Validation Finding</p>
              <span className={`ml-auto text-xs font-medium rounded-full px-2 py-0.5 border ${
                item.validationFinding.severity === "error"
                  ? "text-red-700 bg-red-50 border-red-200"
                  : item.validationFinding.severity === "warning"
                  ? "text-orange-700 bg-orange-50 border-orange-200"
                  : "text-muted-foreground bg-slate-50 border-border"
              }`}>
                {item.validationFinding.severity}
              </span>
            </div>
            <div className="space-y-1.5">
              <p className="text-sm font-medium text-amber-900">
                {item.validationFinding.ruleLabel ?? item.validationFinding.ruleCode}
              </p>
              {item.validationFinding.reasonMessage && (
                <p className="text-xs text-amber-700">{item.validationFinding.reasonMessage}</p>
              )}
            </div>
            {/* Conflict comparison */}
            {(item.validationFinding.currentValueSummary || item.validationFinding.aiValueSummary) && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                {item.validationFinding.currentValueSummary && (
                  <div className="rounded bg-card border border-amber-200 p-2">
                    <p className="text-xs text-amber-600 font-medium mb-0.5">Saved Value</p>
                    <p className="text-xs text-foreground font-mono break-all">
                      {item.validationFinding.currentValueSummary}
                    </p>
                  </div>
                )}
                {item.validationFinding.aiValueSummary && (
                  <div className="rounded bg-card border border-amber-200 p-2">
                    <p className="text-xs text-amber-600 font-medium mb-0.5">AI Value</p>
                    <p className="text-xs text-foreground font-mono break-all">
                      {item.validationFinding.aiValueSummary}
                    </p>
                  </div>
                )}
              </div>
            )}
            {item.validationFinding.confidence != null && (
              <p className="text-xs text-amber-600">
                Confidence: {(item.validationFinding.confidence * 100).toFixed(0)}%
              </p>
            )}
            <p className="text-xs text-amber-500 font-mono">
              Rule: {item.validationFinding.ruleCode} · Status: {item.validationFinding.status}
            </p>
          </div>
        )}

        {/* Phase 13 — Entity Match Candidate Details */}
        {item.entityMatchCandidate && (
          <div className="rounded-md border border-sky-200 bg-sky-50 p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Search className="h-4 w-4 text-sky-600" />
              <p className="text-xs font-semibold text-sky-800 uppercase tracking-wide">Entity Match Candidate</p>
              {item.entityMatchCandidate.matchScore != null && (
                <span className="ml-auto text-xs font-medium rounded-full px-2 py-0.5 border border-sky-200 bg-card text-sky-700">
                  {(item.entityMatchCandidate.matchScore * 100).toFixed(0)}% match
                </span>
              )}
            </div>
            <div className="space-y-1.5">
              <div className="flex items-start gap-2">
                <div className="flex-1">
                  <p className="text-xs text-sky-600 font-medium capitalize">
                    {item.entityMatchCandidate.targetEntityType.replace(/_/g, " ")}
                  </p>
                  <p className="text-sm font-semibold text-sky-900">
                    {item.entityMatchCandidate.targetDisplayName ?? `ID ${item.entityMatchCandidate.targetEntityId}`}
                  </p>
                </div>
                <p className="text-xs text-sky-500 font-mono mt-0.5">ID {item.entityMatchCandidate.targetEntityId}</p>
              </div>
              {item.entityMatchCandidate.matchReason && (
                <p className="text-xs text-sky-700">{item.entityMatchCandidate.matchReason}</p>
              )}
              {item.entityMatchCandidate.sourceTextSummary && (
                <p className="text-xs text-sky-500">Signal: {item.entityMatchCandidate.sourceTextSummary}</p>
              )}
            </div>
            <div className="flex items-center gap-2 text-xs text-sky-500">
              <span>Method: {item.entityMatchCandidate.matchMethod ?? "—"}</span>
              <span>·</span>
              <span>Status: {item.entityMatchCandidate.status}</span>
            </div>
          </div>
        )}

        {/* Phase 16 — Apply-to-ERP panel (entity match candidates in accepted status) */}
        {isMatchingReviewType
          && item.entityMatchCandidate
          && item.entityMatchCandidate.status === "accepted"
          && item.documentId
          && (
          <div className="rounded-md border border-emerald-200 bg-emerald-50 p-4 space-y-3">
            <p className="text-xs font-semibold text-emerald-800 uppercase tracking-wide">
              Apply to DMS Document — Phase 16
            </p>
            <p className="text-xs text-emerald-700">
              This candidate has been accepted. You may now apply it to the document record.
              Feature-flag gated — preview will indicate if not enabled.
            </p>
            <DmsApplyToErpPreview
              documentId={item.documentId}
              reviewQueueItemId={item.id}
              sourceType="entity_match_candidate"
              sourceId={item.entityMatchCandidateId}
              targetModule="dms_document"
              targetTable="dms_documents"
              targetRecordId={item.documentId}
              proposals={[
                {
                  sourceType:          "entity_match_candidate",
                  sourceId:            item.entityMatchCandidateId,
                  sourceFieldCode:     item.entityMatchCandidate.targetEntityType,
                  targetTable:         "dms_documents",
                  targetField:
                    item.entityMatchCandidate.targetEntityType === "owner_company" ? "owning_company_id"
                    : item.entityMatchCandidate.targetEntityType === "owner_branch"  ? "owning_branch_id"
                    : "party_id",
                  targetRecordId:      item.documentId,
                  targetDisplayLabel:  `${item.entityMatchCandidate.targetEntityType.replace(/_/g, " ")}: ${item.entityMatchCandidate.targetDisplayName ?? String(item.entityMatchCandidate.targetEntityId)}`,
                  currentValueSummary: null,
                  proposedValueSummary: String(item.entityMatchCandidate.targetEntityId),
                  valueType:           "bigint",
                  confidence:          item.entityMatchCandidate.matchScore,
                  requiresConfirmation: true,
                  conflictRisk:        false,
                },
              ]}
              label="Preview Apply to Document"
              onApplied={() => {
                // Drawer stays open; user can resolve/dismiss separately
              }}
            />
          </div>
        )}

        {/* Phase 16 Tier 2 — Party Write-back panel */}
        {/* Only shown when: matching review type + accepted candidate + party entity type + document has party_id */}
        {isMatchingReviewType
          && item.entityMatchCandidate
          && item.entityMatchCandidate.status === "accepted"
          && item.entityMatchCandidate.targetEntityType === "party"
          && item.documentId
          && item.entityMatchCandidate.targetEntityId
          && (
          <div className="rounded-md border border-violet-200 bg-violet-50 p-4 space-y-3">
            <p className="text-xs font-semibold text-violet-800 uppercase tracking-wide">
              Apply to Party Master — Phase 16 Tier 2
            </p>
            <p className="text-xs text-violet-700">
              Apply AI-extracted values to this party&apos;s Licenses or Tax Registration records.
              Feature-flag gated. You must select the specific record to update.
            </p>

            {/* Target kind selector */}
            <div className="flex gap-2">
              {(["party_licenses", "party_tax_registrations"] as PartyApplyTargetKind[]).map((kind) => (
                <button
                  key={kind}
                  type="button"
                  onClick={() => { setPartyTargetKind(kind); setPartySelectedRowId(null); }}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium border transition-colors ${
                    partyTargetKind === kind
                      ? "bg-violet-600 text-white border-violet-600"
                      : "bg-card text-violet-700 border-violet-300 hover:bg-violet-50"
                  }`}
                >
                  {kind === "party_licenses" ? "Party Licenses" : "Tax Registrations"}
                </button>
              ))}
            </div>

            {/* Row selector */}
            <DmsPartyTargetSelector
              documentId={item.documentId}
              partyId={item.entityMatchCandidate.targetEntityId}
              partyName={item.entityMatchCandidate.targetDisplayName}
              targetKind={partyTargetKind}
              selectedRowId={partySelectedRowId}
              onRowSelected={setPartySelectedRowId}
            />

            {/* Apply preview — only enabled once a row is selected */}
            {partySelectedRowId != null && (
              <DmsApplyToErpPreview
                documentId={item.documentId}
                reviewQueueItemId={item.id}
                sourceType="entity_match_candidate"
                sourceId={item.entityMatchCandidateId}
                targetModule="party"
                targetTable={partyTargetKind}
                targetRecordId={partySelectedRowId}
                partyId={item.entityMatchCandidate.targetEntityId}
                partyName={item.entityMatchCandidate.targetDisplayName}
                targetKind={partyTargetKind}
                proposals={[{
                  sourceType:          "entity_match_candidate",
                  sourceId:            item.entityMatchCandidateId,
                  sourceFieldCode:     "party_match_confirmed",
                  targetTable:         partyTargetKind,
                  targetField:         partyTargetKind === "party_licenses" ? "remarks" : "effective_to",
                  targetRecordId:      partySelectedRowId,
                  targetDisplayLabel:  partyTargetKind === "party_licenses"
                                         ? "License Remarks"
                                         : "Tax Effective To Date",
                  currentValueSummary: null,
                  proposedValueSummary: partyTargetKind === "party_licenses"
                                          ? `Verified – entity match: ${item.entityMatchCandidate.targetDisplayName ?? ""}`
                                          : suggestedTaxExpiry,
                  valueType:           partyTargetKind === "party_licenses" ? "text" : "date",
                  confidence:          item.entityMatchCandidate.matchScore ?? null,
                  requiresConfirmation: true,
                  conflictRisk:        false,
                }]}
                label={
                  partyTargetKind === "party_licenses"
                    ? "Preview Apply to Party License"
                    : "Preview Apply to Tax Registration"
                }
                onApplied={() => {
                  setPartySelectedRowId(null);
                }}
              />
            )}
            {partySelectedRowId == null && (
              <p className="text-xs text-violet-500 italic">
                Select a record above to enable apply preview.
              </p>
            )}
          </div>
        )}

        {/* DMS AI META.2 — Flow B: embedded AI metadata suggestions review */}
        {isMetadataSuggestionsReviewType && isActive && metadataSuggestionsPayload?.document_type_id && (
          <div className="rounded-md border border-purple-200 bg-purple-50 p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-purple-600" />
              <p className="text-xs font-semibold text-purple-800 uppercase tracking-wide">
                AI Metadata Suggestions
              </p>
            </div>
            <p className="text-xs text-purple-700">
              AI has suggested {metadataSuggestions.length} metadata field
              {metadataSuggestions.length !== 1 ? "s" : ""} for{" "}
              {metadataSuggestionsPayload.document_type_name ?? metadataSuggestionsPayload.document_type_code}.
              Review and select the fields you want to create — nothing is saved until you approve.
            </p>
            <div className="rounded-md border bg-card p-3">
              <DmsAiMetadataSuggestionsDialog
                open
                onOpenChange={() => {
                  /* embedded — lifecycle controlled by drawer/onMutated below */
                }}
                embedded
                suggestions={metadataSuggestions}
                documentTypeId={metadataSuggestionsPayload.document_type_id}
                documentTypeCode={metadataSuggestionsPayload.document_type_code ?? null}
                documentTypeName={metadataSuggestionsPayload.document_type_name ?? "this document type"}
                existingCount={0}
                model={metadataSuggestionsPayload.model ?? null}
                source="review_queue"
                triggerDocumentId={metadataSuggestionsPayload.trigger_document_id ?? null}
                reviewQueueItemId={item.id}
                onCreated={onMutated}
                onRejected={onMutated}
              />
            </div>
          </div>
        )}

        {/* Phase 13 — Safety Notice */}
        {(isValidationReviewType || isMatchingReviewType) && (
          <div className="rounded-md border border-border bg-slate-50 p-3 text-xs text-muted-foreground">
            <p className="font-semibold text-muted-foreground mb-1">Phase 13 Safety Notice</p>
            <p>
              All actions on this item update finding/candidate status only.
              No metadata is auto-saved, no owner company/branch/party/employee links are written,
              and no documents are merged.
              {isMatchingReviewType && " Accepted candidates can be applied to the document record using the Phase 16 Apply panel above."}
            </p>
          </div>
        )}

        {/* Audit timeline placeholder */}
        <div className="rounded-md border border-dashed border-border p-3 text-center text-xs text-muted-foreground">
            Audit timeline is not available in this panel.
        </div>

        {/* Error */}
        {error && (
          <div role="alert" className="rounded-md bg-destructive/10 border border-destructive/30 p-3 text-xs text-destructive">
            {error}
          </div>
        )}

        {/* Resolve form */}
        {showResolveForm && isActive && canManage && (
          <div className="rounded-md border border-border p-4 space-y-3 bg-card">
            <p className="text-sm font-semibold text-foreground">Resolve Item</p>
            <div>
              <label className="text-xs text-muted-foreground font-medium block mb-1">Resolution Code</label>
              <select
                aria-label="Resolution Code"
                value={resolutionCode}
                onChange={(e) => setResolutionCode(e.target.value)}
                className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-sky-500"
              >
                {RESOLUTION_CODES.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground font-medium block mb-1">Notes (optional)</label>
              <textarea
                aria-label="Resolution notes"
                value={resolutionNote}
                onChange={(e) => setResolutionNote(e.target.value.slice(0, 500))}
                rows={3}
                maxLength={500}
                className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-sky-500 resize-none"
                placeholder="Brief notes about this resolution…"
              />
              <p className="text-right text-xs text-muted-foreground mt-0.5">{resolutionNote.length}/500</p>
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={handleResolve} disabled={isSubmitting}>
                <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                Confirm Resolve
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setShowResolveForm(false)}>
                Cancel
              </Button>
            </div>
          </div>
        )}

        {/* Dismiss form */}
        {showDismissForm && isActive && canManage && (
          <div className="rounded-md border border-border p-4 space-y-3 bg-card">
            <p className="text-sm font-semibold text-foreground">Dismiss Item</p>
            <div>
              <label className="text-xs text-muted-foreground font-medium block mb-1">Reason for dismissal</label>
              <textarea
                aria-label="Reason for dismissal"
                value={dismissReason}
                onChange={(e) => setDismissReason(e.target.value.slice(0, 500))}
                rows={3}
                maxLength={500}
                className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-sky-500 resize-none"
                placeholder="Briefly explain why this item requires no action…"
              />
              <p className="text-right text-xs text-muted-foreground mt-0.5">{dismissReason.length}/500</p>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={handleDismiss} disabled={isSubmitting}>
                <Ban className="h-3.5 w-3.5 mr-1" />
                Confirm Dismiss
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setShowDismissForm(false)}>
                Cancel
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Footer — action controls */}
      {isActive && canManage && !showResolveForm && !showDismissForm && !isMetadataSuggestionsReviewType && (
        <div className="border-t border-border px-6 py-4 flex flex-wrap gap-2 bg-slate-50">
          {item.status === "open" && (
            <Button size="sm" variant="outline" onClick={handleAssignToMe} disabled={isSubmitting}>
              <UserCheck className="h-3.5 w-3.5 mr-1" />
              Assign to Me
            </Button>
          )}
          {(item.status === "open" || item.status === "assigned") && (
            <Button size="sm" onClick={handleStart} disabled={isSubmitting}>
              <Play className="h-3.5 w-3.5 mr-1" />
              Start Review
            </Button>
          )}

          {/* Phase 13 — Entity match actions (shown only for matching review types) */}
          {isMatchingReviewType && item.entityMatchCandidate && item.entityMatchCandidate.status === "pending" && (
            <>
              <Button
                size="sm"
                onClick={handleAcceptCandidate}
                disabled={isSubmitting}
                className="bg-sky-600 hover:bg-sky-700 text-white"
              >
                <GitMerge className="h-3.5 w-3.5 mr-1" />
                Accepted for Later Apply
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={handleRejectCandidate}
                disabled={isSubmitting}
                className="text-muted-foreground"
              >
                <Ban className="h-3.5 w-3.5 mr-1" />
                Reject Candidate
              </Button>
            </>
          )}

          {/* Phase 13 — Validation finding actions (shown only for validation review types) */}
          {isValidationReviewType && item.validationFinding && item.validationFinding.status === "open" && (
            <>
              <Button
                size="sm"
                onClick={handleFindingReviewed}
                disabled={isSubmitting}
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                Reviewed — No Action
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={handleFindingFalsePositive}
                disabled={isSubmitting}
                className="text-muted-foreground"
              >
                <ShieldAlert className="h-3.5 w-3.5 mr-1" />
                Mark False Positive
              </Button>
            </>
          )}

          <Button
            size="sm"
            onClick={() => { setShowResolveForm(true); setShowDismissForm(false); }}
            disabled={isSubmitting}
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
            Resolve
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => { setShowDismissForm(true); setShowResolveForm(false); }}
            disabled={isSubmitting}
            className="text-muted-foreground hover:text-foreground"
          >
            <Ban className="h-3.5 w-3.5 mr-1" />
            Dismiss
          </Button>
        </div>
      )}

      {!canManage && isActive && (
        <div className="border-t border-border px-6 py-3 bg-slate-50">
          <p className="text-xs text-muted-foreground">You have view-only access to the review queue.</p>
        </div>
      )}
    </div>
  );
}
