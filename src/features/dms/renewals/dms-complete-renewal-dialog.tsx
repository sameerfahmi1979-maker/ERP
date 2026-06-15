"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CheckCircle2 } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ERPChildDialogForm } from "@/components/erp/erp-child-dialog-form";
import { completeDmsRenewalRequest } from "@/server/actions/dms/renewals";
import {
  invalidateDmsRenewals,
  invalidateDmsExpiry,
  invalidateDmsDocumentExpiry,
} from "@/lib/query/invalidation";

interface DmsCompleteRenewalDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  renewalId: number;
  renewalNo: string;
  documentId: number;
  onSuccess?: () => void;
}

export function DmsCompleteRenewalDialog({
  open,
  onOpenChange,
  renewalId,
  renewalNo,
  documentId,
  onSuccess,
}: DmsCompleteRenewalDialogProps) {
  const queryClient = useQueryClient();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [newExpiryDate, setNewExpiryDate] = useState("");
  const [notes, setNotes] = useState("");

  const reset = () => {
    setNewExpiryDate("");
    setNotes("");
  };

  const handleClose = (v: boolean) => {
    if (!isSubmitting) {
      if (!v) reset();
      onOpenChange(v);
    }
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);
    try {
      const result = await completeDmsRenewalRequest(renewalId, {
        new_expiry_date: newExpiryDate || undefined,
        notes: notes || undefined,
      });

      if (result.success) {
        toast.success("Renewal completed successfully");
        invalidateDmsRenewals(queryClient);
        invalidateDmsExpiry(queryClient);
        invalidateDmsDocumentExpiry(queryClient, documentId);
        handleClose(false);
        onSuccess?.();
      } else {
        toast.error(result.error ?? "Failed to complete renewal");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ERPChildDialogForm
      open={open}
      onOpenChange={handleClose}
      title="Complete Renewal"
      subtitle={`Mark renewal ${renewalNo} as completed`}
      icon={<CheckCircle2 className="h-5 w-5 text-green-500" />}
      mode="edit"
      size="md"
      isSubmitting={isSubmitting}
      onSubmit={handleSubmit}
      submitLabel="Complete Renewal"
    >
      <div className="space-y-4">
        <div className="rounded-md bg-muted/20 border border-border p-3 text-sm">
          <p className="text-xs text-muted-foreground">Completing this renewal will:</p>
          <ul className="text-xs mt-1 space-y-0.5 list-disc list-inside text-muted-foreground">
            <li>Update document expiry date (if provided)</li>
            <li>Rebuild the reminder schedule</li>
            <li>Dismiss all pending reminders</li>
            <li>Mark this renewal as completed</li>
          </ul>
        </div>

        <div>
          <Label htmlFor="new-expiry" className="mb-1.5 block">
            New Expiry Date <span className="text-xs text-muted-foreground">(optional — updates document)</span>
          </Label>
          <Input
            id="new-expiry"
            type="date"
            value={newExpiryDate}
            onChange={(e) => setNewExpiryDate(e.target.value)}
          />
        </div>

        <div>
          <Label htmlFor="complete-notes" className="mb-1.5 block">
            Completion Notes <span className="text-xs text-muted-foreground">(optional)</span>
          </Label>
          <Textarea
            id="complete-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Notes on how the renewal was completed…"
            rows={3}
            maxLength={4000}
          />
        </div>
      </div>
    </ERPChildDialogForm>
  );
}
