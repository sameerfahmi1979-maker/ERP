"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { RefreshCw } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ERPChildDialogForm } from "@/components/erp/erp-child-dialog-form";
import { createDmsRenewalRequest } from "@/server/actions/dms/renewals";
import { invalidateDmsRenewals, invalidateDmsExpiry } from "@/lib/query/invalidation";

type Priority = "normal" | "high" | "urgent";

interface DmsStartRenewalDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  documentId: number;
  documentNo: string;
  documentTitle: string;
  onSuccess?: () => void;
}

export function DmsStartRenewalDialog({
  open,
  onOpenChange,
  documentId,
  documentNo,
  documentTitle,
  onSuccess,
}: DmsStartRenewalDialogProps) {
  const queryClient = useQueryClient();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [priority, setPriority] = useState<Priority>("normal");
  const [targetDate, setTargetDate] = useState("");
  const [notes, setNotes] = useState("");

  const reset = () => {
    setPriority("normal");
    setTargetDate("");
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
      const result = await createDmsRenewalRequest({
        document_id: documentId,
        priority,
        target_renewal_date: targetDate || undefined,
        notes: notes || undefined,
      });

      if (result.success) {
        toast.success(`Renewal request created: ${result.data?.renewal_no}`);
        invalidateDmsRenewals(queryClient);
        invalidateDmsExpiry(queryClient);
        handleClose(false);
        onSuccess?.();
      } else {
        toast.error(result.error ?? "Failed to create renewal request");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ERPChildDialogForm
      open={open}
      onOpenChange={handleClose}
      title="Start Renewal"
      subtitle={`Start a renewal request for ${documentNo}`}
      icon={<RefreshCw className="h-5 w-5" />}
      mode="add"
      size="md"
      isSubmitting={isSubmitting}
      onSubmit={handleSubmit}
      submitLabel="Create Renewal Request"
    >
      <div className="space-y-4">
        <div className="rounded-md bg-muted/20 border border-border p-3 text-sm">
          <p className="font-medium truncate">{documentTitle}</p>
          <p className="text-xs text-muted-foreground font-mono mt-0.5">{documentNo}</p>
        </div>

        <div>
          <Label className="mb-1.5 block">Priority</Label>
          <div className="flex gap-2">
            {(["normal", "high", "urgent"] as Priority[]).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPriority(p)}
                className={`flex-1 rounded-md border px-3 py-1.5 text-xs capitalize transition-colors ${
                  priority === p
                    ? p === "urgent"
                      ? "border-red-400 bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-400"
                      : p === "high"
                      ? "border-orange-400 bg-orange-50 text-orange-700 dark:bg-orange-950/30 dark:text-orange-400"
                      : "border-primary bg-primary/10 text-primary"
                    : "border-border hover:border-muted-foreground/40"
                }`}
              >
                {p}
              </button>
            ))}
          </div>
        </div>

        <div>
          <Label htmlFor="target-date" className="mb-1.5 block">
            Target Renewal Date <span className="text-xs text-muted-foreground">(optional)</span>
          </Label>
          <Input
            id="target-date"
            type="date"
            value={targetDate}
            onChange={(e) => setTargetDate(e.target.value)}
          />
        </div>

        <div>
          <Label htmlFor="renewal-notes" className="mb-1.5 block">
            Notes <span className="text-xs text-muted-foreground">(optional)</span>
          </Label>
          <Textarea
            id="renewal-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Additional context for this renewal request…"
            rows={3}
            maxLength={4000}
          />
        </div>
      </div>
    </ERPChildDialogForm>
  );
}
