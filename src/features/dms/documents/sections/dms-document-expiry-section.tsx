"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { format, parseISO, differenceInDays } from "date-fns";
import { AlertTriangle, CheckCircle2, CalendarX, RefreshCw, Plus, GitBranchPlus, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { getExpiryState, getDaysRemaining } from "../dms-expiry-badge";
import { DmsReminderScheduleTable } from "@/features/dms/expiry/dms-reminder-schedule-table";
import { DmsStartRenewalDialog } from "@/features/dms/renewals/dms-start-renewal-dialog";
import { generateDmsExpiryRemindersForDocument, rebuildDmsExpiryReminders } from "@/server/actions/dms/expiry-reminders";
import { invalidateDmsDocumentExpiry, invalidateDmsRenewals } from "@/lib/query/invalidation";
import { useWorkspace } from "@/hooks/use-workspace";

interface DmsDocumentExpirySectionProps {
  documentId: number;
  documentNo: string;
  documentTitle: string;
  issueDate: string | null;
  expiryDate: string | null;
  requiresExpiryTracking: boolean;
  /** DMS RENEWAL.2 — when false, this document's type is one-time (e.g. Visit Visa); hide renewal actions. */
  isRenewable?: boolean;
  /** DMS RENEWAL.2 — current document status; used to detect "superseded" state. */
  documentStatus?: string | null;
  /** DMS RENEWAL.2 — the replacement document this one was renewed into, if superseded. */
  supersededBy?: { id: number; document_no: string; title: string } | null;
  canManage?: boolean;
}

export function DmsDocumentExpirySection({
  documentId,
  documentNo,
  documentTitle,
  issueDate,
  expiryDate,
  requiresExpiryTracking,
  isRenewable = true,
  documentStatus = null,
  supersededBy = null,
  canManage = false,
}: DmsDocumentExpirySectionProps) {
  const queryClient = useQueryClient();
  const { openTab } = useWorkspace();
  const expiryState = getExpiryState(expiryDate);
  const daysRemaining = getDaysRemaining(expiryDate);
  const [generating, setGenerating] = useState(false);
  const [rebuilding, setRebuilding] = useState(false);
  const [showRenewalDialog, setShowRenewalDialog] = useState(false);
  const isSuperseded = documentStatus === "superseded";

  const handleGenerateReminders = async () => {
    setGenerating(true);
    try {
      const result = await generateDmsExpiryRemindersForDocument(documentId);
      if (result.success) {
        toast.success(`Reminder schedule generated: ${result.data?.created} reminders`);
        invalidateDmsDocumentExpiry(queryClient, documentId);
      } else {
        toast.error(result.error ?? "Failed to generate");
      }
    } finally {
      setGenerating(false);
    }
  };

  const handleRebuildReminders = async () => {
    setRebuilding(true);
    try {
      const result = await rebuildDmsExpiryReminders(documentId);
      if (result.success) {
        toast.success(`Reminder schedule rebuilt: ${result.data?.created} reminders created, ${result.data?.cancelled} cancelled`);
        invalidateDmsDocumentExpiry(queryClient, documentId);
      } else {
        toast.error(result.error ?? "Failed to rebuild");
      }
    } finally {
      setRebuilding(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Renewed banner — this document was renewed and replaced by a newer one */}
      {isSuperseded && (
        <div className="flex items-start gap-3 rounded-lg p-3 border text-sm bg-purple-50 border-purple-200 text-purple-700 dark:bg-purple-950/20 dark:border-purple-900 dark:text-purple-400">
          <GitBranchPlus className="h-4 w-4 mt-0.5 shrink-0" />
          <div className="flex-1">
            <p className="font-medium">This document has been renewed</p>
            <p className="text-xs mt-0.5 opacity-80">
              {supersededBy
                ? "A new document replaces it going forward."
                : "This document is marked as renewed, but the replacement document link is missing."}
            </p>
          </div>
          {supersededBy && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="shrink-0 gap-1 h-7 text-xs border-purple-300 text-purple-700 hover:bg-purple-100 dark:border-purple-800 dark:text-purple-300"
              onClick={() =>
                openTab({
                  route: `/dms/documents/record/${supersededBy.id}?mode=view`,
                  title: supersededBy.document_no,
                })
              }
            >
              View new document
              <ArrowRight className="h-3 w-3" />
            </Button>
          )}
        </div>
      )}

      {/* One-time (non-renewable) document type notice */}
      {!isRenewable && !isSuperseded && (
        <div className="flex items-start gap-2 text-xs text-muted-foreground bg-muted/20 border border-border rounded-lg p-3">
          <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          <p>One-time document — this document type does not support renewal. Upload a new document when this one expires.</p>
        </div>
      )}

      {/* Expiry status banner */}
      {expiryDate && (
        <div
          className={`flex items-start gap-3 rounded-lg p-3 border text-sm ${
            expiryState === "expired"
              ? "bg-red-50 border-red-200 text-red-700 dark:bg-red-950/20 dark:border-red-900 dark:text-red-400"
              : expiryState === "expiring_7"
              ? "bg-orange-50 border-orange-200 text-orange-700 dark:bg-orange-950/20 dark:border-orange-900 dark:text-orange-400"
              : expiryState === "expiring_30"
              ? "bg-amber-50 border-amber-200 text-amber-700 dark:bg-amber-950/20 dark:border-amber-900 dark:text-amber-400"
              : "bg-green-50 border-green-200 text-green-700 dark:bg-green-950/20 dark:border-green-900 dark:text-green-400"
          }`}
        >
          {expiryState === "expired" ? (
            <CalendarX className="h-4 w-4 mt-0.5 shrink-0" />
          ) : expiryState === "expiring_7" || expiryState === "expiring_30" ? (
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          ) : (
            <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" />
          )}
          <div className="flex-1">
            <p className="font-medium">
              {expiryState === "expired"
                ? `Expired ${Math.abs(daysRemaining ?? 0)} day${Math.abs(daysRemaining ?? 0) !== 1 ? "s" : ""} ago`
                : expiryState === "expiring_7"
                ? `Expiring in ${daysRemaining} day${daysRemaining !== 1 ? "s" : ""}`
                : expiryState === "expiring_30"
                ? `Expiring in ${daysRemaining} days`
                : "Valid — no expiry issues"}
            </p>
            <p className="text-xs mt-0.5 opacity-80">
              Expiry date: {format(parseISO(expiryDate), "dd MMMM yyyy")}
            </p>
          </div>
          {(expiryState === "expired" || expiryState === "expiring_7") && canManage && isRenewable && !isSuperseded && (
            <Button
              type="button"
              size="sm"
              className="shrink-0 gap-1 h-7 text-xs"
              onClick={() => setShowRenewalDialog(true)}
            >
              <Plus className="h-3 w-3" />
              Start Renewal
            </Button>
          )}
        </div>
      )}

      {/* Date fields */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground">Issue Date</p>
          <p className="text-sm">
            {issueDate ? format(parseISO(issueDate), "dd MMMM yyyy") : <span className="text-muted-foreground">Not set</span>}
          </p>
        </div>

        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground">Expiry Date</p>
          <p className="text-sm">
            {expiryDate ? format(parseISO(expiryDate), "dd MMMM yyyy") : <span className="text-muted-foreground">Not set</span>}
          </p>
        </div>

        {expiryDate && (
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground">Days Remaining</p>
            <p className={`text-sm font-semibold ${(daysRemaining ?? 0) < 0 ? "text-red-600" : (daysRemaining ?? 0) <= 30 ? "text-amber-600" : "text-green-600"}`}>
              {daysRemaining !== null
                ? daysRemaining < 0
                  ? `${Math.abs(daysRemaining)} days overdue`
                  : `${daysRemaining} days`
                : "—"}
            </p>
          </div>
        )}

        {issueDate && expiryDate && (
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground">Validity Period</p>
            <p className="text-sm">
              {differenceInDays(parseISO(expiryDate), parseISO(issueDate))} days
            </p>
          </div>
        )}
      </div>

      {requiresExpiryTracking && !expiryDate && (
        <div className="flex items-start gap-2 text-amber-600 text-sm bg-amber-50 border border-amber-200 rounded-lg p-3">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <p>This document type requires expiry tracking. Please set the expiry date in the Overview section.</p>
        </div>
      )}

      {/* Reminder schedule section */}
      {expiryDate && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Reminder Schedule</p>
            {canManage && (
              <div className="flex gap-1.5">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-6 text-xs gap-1"
                  disabled={generating}
                  onClick={handleGenerateReminders}
                >
                  <RefreshCw className={`h-3 w-3 ${generating ? "animate-spin" : ""}`} />
                  Generate
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-6 text-xs gap-1"
                  disabled={rebuilding}
                  onClick={handleRebuildReminders}
                >
                  <RefreshCw className={`h-3 w-3 ${rebuilding ? "animate-spin" : ""}`} />
                  Rebuild
                </Button>
              </div>
            )}
          </div>
          <DmsReminderScheduleTable documentId={documentId} />
        </div>
      )}

      {!expiryDate && (
        <div className="rounded-md border border-border p-3 bg-muted/10 text-xs text-muted-foreground text-center">
          Set an expiry date to enable reminder scheduling and renewal tracking.
        </div>
      )}

      {/* Start Renewal dialog */}
      <DmsStartRenewalDialog
        open={showRenewalDialog}
        onOpenChange={setShowRenewalDialog}
        documentId={documentId}
        documentNo={documentNo}
        documentTitle={documentTitle}
        onSuccess={() => {
          setShowRenewalDialog(false);
          invalidateDmsRenewals(queryClient);
        }}
      />
    </div>
  );
}
