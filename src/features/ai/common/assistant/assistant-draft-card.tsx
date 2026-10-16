"use client";

import { useState } from "react";
import Link from "next/link";
import { FileEdit, CheckCircle, XCircle, ExternalLink, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  dismissAssistantActionDraft,
  markAssistantActionDraftReviewed,
  markAssistantActionDraftAccepted,
} from "@/server/actions/ai/common/assistant";
import type { AssistantDraftRow } from "@/lib/ai/common/assistant/types";

interface AssistantDraftCardProps {
  draft: AssistantDraftRow;
  onStatusChange?: () => void;
}

const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  reviewed: "Reviewed",
  accepted_for_manual_action: "Accepted",
  dismissed: "Dismissed",
  superseded: "Superseded",
  failed: "Failed",
};

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-200 dark:border-amber-800",
  reviewed: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-200 dark:border-blue-800",
  accepted_for_manual_action: "bg-green-50 text-green-700 border-green-200 dark:bg-green-950 dark:text-green-200 dark:border-green-800",
  dismissed: "bg-muted text-muted-foreground border-border",
  superseded: "bg-muted text-muted-foreground border-border",
  failed: "bg-red-50 text-red-600 border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-800",
};

export function AssistantDraftCard({ draft, onStatusChange }: AssistantDraftCardProps) {
  const [loading, setLoading] = useState(false);

  const isActive = draft.status === "draft" || draft.status === "reviewed";

  const handleAction = async (
    fn: (id: number) => Promise<{ success: boolean; error?: string }>
  ) => {
    setLoading(true);
    await fn(draft.id);
    setLoading(false);
    onStatusChange?.();
  };

  const payload = draft.draftPayloadJson;
  const navRoute = payload?.navigationRoute;
  const draftFields = payload?.draftFields ?? {};

  return (
    <div className="border border-amber-200 bg-amber-50 rounded-lg p-4 space-y-3 dark:border-amber-800 dark:bg-amber-950">
      <div className="flex items-start gap-2">
        <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 flex-shrink-0 dark:text-amber-300" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-semibold text-amber-700 uppercase tracking-wide dark:text-amber-200">
              AI Draft — requires human review
            </span>
            <span
              className={`text-xs px-2 py-0.5 rounded border font-medium ${
                STATUS_COLORS[draft.status] ?? STATUS_COLORS.draft
              }`}
            >
              {STATUS_LABELS[draft.status] ?? draft.status}
            </span>
            <Badge variant="outline" className="text-xs">
              {draft.actionCode}
            </Badge>
          </div>
          {payload?.summary && (
            <p className="text-sm text-foreground mt-1 font-medium">{payload.summary}</p>
          )}
        </div>
      </div>

      {/* Draft fields */}
      {Object.keys(draftFields).length > 0 && (
        <div className="bg-card border border-amber-100 rounded p-3 space-y-1.5 dark:border-amber-800">
          {Object.entries(draftFields).map(([label, value]) => (
            <div key={label} className="text-sm">
              <span className="font-medium text-muted-foreground">{label}:</span>{" "}
              <span className="text-foreground whitespace-pre-wrap">{value}</span>
            </div>
          ))}
        </div>
      )}

      {/* Review notes */}
      {payload?.reviewNotes && (
        <p className="text-xs text-amber-700 italic border-t border-amber-200 pt-2 dark:text-amber-200 dark:border-amber-800">
          {payload.reviewNotes}
        </p>
      )}

      {/* Actions */}
      {isActive && (
        <div className="flex items-center gap-2 flex-wrap pt-1">
          <Button
            variant="outline"
            size="sm"
            disabled={loading}
            onClick={() => handleAction(markAssistantActionDraftReviewed)}
            className="h-7 text-xs gap-1"
          >
            <CheckCircle className="h-3.5 w-3.5 text-blue-500 dark:text-blue-300" />
            Mark Reviewed
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={loading}
            onClick={() => handleAction(markAssistantActionDraftAccepted)}
            className="h-7 text-xs gap-1 border-green-200 text-green-700 hover:bg-green-50 dark:border-green-800 dark:text-green-200 dark:hover:bg-green-950"
          >
            <FileEdit className="h-3.5 w-3.5" />
            Accept for Manual Action
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={loading}
            onClick={() => handleAction(dismissAssistantActionDraft)}
            className="h-7 text-xs gap-1 text-muted-foreground"
          >
            <XCircle className="h-3.5 w-3.5" />
            Dismiss
          </Button>
          {navRoute && (
            <Link
              href={navRoute}
              className="inline-flex items-center gap-1 text-xs text-violet-600 hover:text-violet-700 ml-auto dark:text-violet-300 dark:hover:text-violet-200"
            >
              <ExternalLink className="h-3 w-3" />
              Open Record
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
