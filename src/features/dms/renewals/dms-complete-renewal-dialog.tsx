"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CheckCircle2 } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { RequiredLabel } from "@/components/erp/required-label";
import { ERPChildDialogForm } from "@/components/erp/erp-child-dialog-form";
import { ERPCombobox } from "@/components/erp/combobox";
import type { ERPComboboxOption } from "@/components/erp/combobox";
import {
  completeDmsRenewalRequest,
  searchDmsDocumentsForRenewalReplacement,
  type RenewalReplacementCandidate,
} from "@/server/actions/dms/renewals";
import { getDmsDocumentLinks } from "@/server/actions/dms/document-links";
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
  /** DMS RENEWAL.2 — scopes the replacement-document search to the same document type. */
  documentTypeId: number | null;
  onSuccess?: () => void;
}

export function DmsCompleteRenewalDialog({
  open,
  onOpenChange,
  renewalId,
  renewalNo,
  documentId,
  documentTypeId,
  onSuccess,
}: DmsCompleteRenewalDialogProps) {
  const queryClient = useQueryClient();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [replacementDocumentId, setReplacementDocumentId] = useState<number | null>(null);
  const [newExpiryDate, setNewExpiryDate] = useState("");
  const [notes, setNotes] = useState("");

  const { data: candidates = [], isLoading: loadingCandidates } = useQuery({
    queryKey: ["dms", "renewals", "replacement-candidates", documentTypeId, documentId],
    queryFn: async () => {
      if (!documentTypeId) return [];
      const result = await searchDmsDocumentsForRenewalReplacement(documentTypeId, documentId);
      if (!result.success) throw new Error(result.error);
      return result.data ?? [];
    },
    enabled: open && !!documentTypeId,
    staleTime: 30_000,
  });

  // Shows who/what the search is scoped to (e.g. "Employee — John Doe"), so it's
  // clear the replacement list is limited to the same owner as the original doc.
  const { data: ownerLinks = [] } = useQuery({
    queryKey: ["dms", "documents", "links", documentId],
    queryFn: async () => {
      const result = await getDmsDocumentLinks(documentId);
      if (!result.success) return [];
      return result.data ?? [];
    },
    enabled: open,
    staleTime: 30_000,
  });
  const scopeOwner = ownerLinks.find((l) => l.is_primary) ?? ownerLinks[0];

  const reset = () => {
    setReplacementDocumentId(null);
    setNewExpiryDate("");
    setNotes("");
  };

  const handleClose = (v: boolean) => {
    if (!isSubmitting) {
      if (!v) reset();
      onOpenChange(v);
    }
  };

  // Auto-fill the new expiry date from the picked replacement document (still editable).
  const handleReplacementChange = (value: string | number | null) => {
    const id = value == null ? null : Number(value);
    setReplacementDocumentId(id);
    const picked = id != null ? candidates.find((c) => c.id === id) : null;
    if (picked?.expiry_date) setNewExpiryDate(picked.expiry_date);
  };

  const handleSubmit = async () => {
    if (!replacementDocumentId) {
      toast.error("Select the replacement document that was uploaded for this renewal");
      return;
    }
    setIsSubmitting(true);
    try {
      const result = await completeDmsRenewalRequest(renewalId, {
        new_expiry_date: newExpiryDate || undefined,
        replacement_document_id: replacementDocumentId,
        notes: notes || undefined,
      });

      if (result.success) {
        toast.success("Renewal completed — original document marked as renewed");
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

  const options: ERPComboboxOption[] = candidates.map((c: RenewalReplacementCandidate) => ({
    value: c.id,
    label: c.title,
    code: c.document_no,
    description: c.expiry_date ? `Expiry: ${c.expiry_date}` : undefined,
  }));

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
            <li>Link the replacement document you select below</li>
            <li>Mark the original document as <span className="font-medium">Renewed</span></li>
            <li>Update the new expiry date and rebuild its reminder schedule</li>
            <li>Dismiss all pending reminders on the original document</li>
          </ul>
        </div>

        <div>
          <RequiredLabel required className="mb-1.5 block">
            Replacement Document
          </RequiredLabel>
          <ERPCombobox
            value={replacementDocumentId}
            onValueChange={handleReplacementChange}
            options={options}
            placeholder="Search for the document already uploaded to replace this one..."
            searchPlaceholder="Search by document no. or title..."
            loading={loadingCandidates}
            required
            allowClear
            emptyText={
              documentTypeId
                ? scopeOwner
                  ? `No matching documents found for ${scopeOwner.entity_type_label} — ${scopeOwner.entity_display_name}. Upload the new document (linked to the same ${scopeOwner.entity_type_label.toLowerCase()}) first, then complete this renewal.`
                  : "No matching documents found — upload the new document first, then complete this renewal."
                : "Unknown document type"
            }
            noResultsText="No results found"
          />
          <p className="text-[10px] text-muted-foreground mt-1">
            {scopeOwner
              ? `Showing only documents linked to ${scopeOwner.entity_type_label} — ${scopeOwner.entity_display_name}. Upload the new/renewed file through the normal upload flow first, then pick it here to link it.`
              : "Upload the new/renewed file through the normal upload flow first, then pick it here to link it."}
          </p>
        </div>

        <div>
          <Label htmlFor="new-expiry" className="mb-1.5 block">
            New Expiry Date <span className="text-xs text-muted-foreground">(auto-filled from replacement, editable)</span>
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
