"use client";

/**
 * DMS AI META.2 — Flow A: Intake Review Zero-Definition Notice
 *
 * Rendered inside the intake metadata section when the selected document
 * type has zero active metadata definitions. Shows different UI depending
 * on whether the current user is authorized to approve AI suggestions:
 *
 *   - Authorized, no pending batch:  [Suggest Fields with AI] [Skip for Now]
 *   - Authorized, pending batch:     [Open Suggestions Review] (from Flow B)
 *   - Not authorized:                "Ask a DMS Manager..." message only
 *
 * Governance rule: AI suggests. Human chooses. System saves only approved
 * items. This component never creates definitions itself — it only opens
 * DmsAiMetadataSuggestionsDialog, which is the sole approval surface.
 */

import { useEffect, useState } from "react";
import { AlertTriangle, Loader2, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DmsAiMetadataSuggestionsDialog } from "@/features/dms/admin/dms-ai-metadata-suggestions-dialog";
import { suggestMetadataDefinitions } from "@/server/actions/dms/ai-metadata-suggestions";
import type { AiSuggestedField } from "@/lib/dms/metadata/ai-definition-builder";
import {
  canCurrentUserApproveAiMetadataSuggestions,
  getOpenMetadataSuggestionsReviewItem,
  skipMetadataSuggestionsForNow,
} from "@/server/actions/dms/metadata-suggestion-review";

type Props = {
  documentTypeId: number;
  documentTypeName: string;
  /** Called after at least one definition is created, so the parent can reload definitions + offer re-extraction. */
  onDefinitionsCreated: () => void;
};

export function DmsAiIntakeZeroDefinitionsNotice({
  documentTypeId,
  documentTypeName,
  onDefinitionsCreated,
}: Props) {
  const [isAuthorized, setIsAuthorized] = useState<boolean | null>(null);
  const [pendingReviewQueueItemId, setPendingReviewQueueItemId] = useState<number | null>(null);
  const [dismissedThisSession, setDismissedThisSession] = useState(false);
  const [isCheckingPending, setIsCheckingPending] = useState(true);

  const [isSuggesting, setIsSuggesting] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogSuggestions, setDialogSuggestions] = useState<AiSuggestedField[]>([]);
  const [dialogModel, setDialogModel] = useState<string | null>(null);
  const [dialogReviewQueueItemId, setDialogReviewQueueItemId] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setDismissedThisSession(false);
      setIsCheckingPending(true);
      const [authorized, pendingResult] = await Promise.all([
        canCurrentUserApproveAiMetadataSuggestions(),
        getOpenMetadataSuggestionsReviewItem(documentTypeId),
      ]);
      if (cancelled) return;
      setIsAuthorized(authorized);
      setPendingReviewQueueItemId(
        pendingResult.success && pendingResult.data ? pendingResult.data.reviewQueueItemId : null
      );
      setIsCheckingPending(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [documentTypeId]);

  const handleSuggest = async () => {
    setIsSuggesting(true);
    try {
      const result = await suggestMetadataDefinitions(documentTypeId);
      if (!result.success) {
        toast.error(result.error ?? "Failed to generate suggestions");
        return;
      }
      if (result.suggestions.length === 0) {
        toast.info("AI could not generate metadata field suggestions for this document type.");
        return;
      }
      setDialogSuggestions(result.suggestions);
      setDialogModel(result.model);
      setDialogReviewQueueItemId(null);
      setDialogOpen(true);
    } finally {
      setIsSuggesting(false);
    }
  };

  const handleOpenPending = async () => {
    setIsSuggesting(true);
    try {
      const result = await getOpenMetadataSuggestionsReviewItem(documentTypeId);
      if (!result.success || !result.data) {
        toast.error(result.error ?? "This suggestion batch is no longer available.");
        return;
      }
      setDialogSuggestions(result.data.suggestions);
      setDialogModel(result.data.model);
      setDialogReviewQueueItemId(result.data.reviewQueueItemId);
      setDialogOpen(true);
    } finally {
      setIsSuggesting(false);
    }
  };

  const handleSkip = () => {
    setDismissedThisSession(true);
    void skipMetadataSuggestionsForNow(documentTypeId, null);
  };

  if (dismissedThisSession) return null;
  if (isAuthorized === null || isCheckingPending) return null; // avoid flicker while checking

  return (
    <>
      <div className="flex items-start gap-3 rounded-md border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30 p-3">
        <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
        <div className="flex-1 space-y-2">
          <div className="text-xs text-amber-800 dark:text-amber-300">
            {pendingReviewQueueItemId ? (
              <>
                <span className="font-medium">AI metadata suggestions are pending review</span> for{" "}
                {documentTypeName}.
              </>
            ) : (
              <>
                <span className="font-medium">This document type has no metadata fields defined yet.</span>{" "}
                AI cannot extract structured data until fields are created.
                {!isAuthorized && " Ask a DMS Manager or authorized admin to create metadata fields."}
              </>
            )}
          </div>

          {isAuthorized && (
            <div className="flex items-center gap-2">
              {pendingReviewQueueItemId ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 gap-1.5 text-xs"
                  onClick={handleOpenPending}
                  disabled={isSuggesting}
                >
                  {isSuggesting ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Sparkles className="h-3.5 w-3.5 text-purple-500" />
                  )}
                  Open Suggestions Review
                </Button>
              ) : (
                <>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 gap-1.5 text-xs"
                    onClick={handleSuggest}
                    disabled={isSuggesting}
                  >
                    {isSuggesting ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Sparkles className="h-3.5 w-3.5 text-purple-500" />
                    )}
                    Suggest Fields with AI
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-7 gap-1 text-xs text-muted-foreground"
                    onClick={handleSkip}
                  >
                    <X className="h-3 w-3" />
                    Skip for Now
                  </Button>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      <DmsAiMetadataSuggestionsDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        suggestions={dialogSuggestions}
        documentTypeId={documentTypeId}
        documentTypeName={documentTypeName}
        existingCount={0}
        model={dialogModel}
        source="intake_review"
        triggerDocumentId={null}
        reviewQueueItemId={dialogReviewQueueItemId}
        onCreated={onDefinitionsCreated}
        onRejected={() => setPendingReviewQueueItemId(null)}
      />
    </>
  );
}
