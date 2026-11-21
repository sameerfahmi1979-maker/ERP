"use client";

import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CheckCircle2 } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { RequiredLabel } from "@/components/erp/required-label";
import { ERPChildDialogForm } from "@/components/erp/erp-child-dialog-form";
import { ERPCombobox } from "@/components/erp/combobox";
import type { ERPComboboxOption } from "@/components/erp/combobox";
import { DmsLoadError } from "@/features/dms/dms-load-error";
import { useReadCacheOwner } from "@/components/layout/read-cache-boundary";
import { RENEWAL_REPLACEMENT_SEARCH_LIMIT } from "@/lib/dms/renewal-completion";
import {
  completeDmsRenewalRequest,
  searchDmsDocumentsForRenewalReplacement,
} from "@/server/actions/dms/renewals";
import {
  invalidateAuthorizedRead,
  invalidateDmsRenewals,
  invalidateDmsExpiry,
  invalidateDmsDocumentExpiry,
  invalidateHrComplianceRenewals,
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
  const owner = useReadCacheOwner();
  const admitted = owner?.identity != null && owner.isLive();
  const ownerKey = [owner?.identity?.authUserId, owner?.identity?.scopeVersion, owner?.generation];
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [replacementDocumentId, setReplacementDocumentId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [cursors, setCursors] = useState<(number | null)[]>([null]);
  const [notes, setNotes] = useState("");
  const updatingSearch = search.trim() !== query;
  const before = cursors.at(-1) ?? null;
  useEffect(() => {
    const timer = setTimeout(() => setQuery(search.trim()), 250);
    return () => clearTimeout(timer);
  }, [search]);

  const {
    data: page,
    isLoading: loadingCandidates,
    isError: candidatesError,
    isFetching: candidatesFetching,
    refetch: retryCandidates,
  } = useQuery({
    queryKey: ["dms", "renewals", "replacement-candidates", ...ownerKey, renewalId, query, before],
    queryFn: async () => {
      const result = await searchDmsDocumentsForRenewalReplacement(renewalId, query, before);
      if (!owner?.isLive() || !result.success || !result.data) throw new Error(result.error);
      return result.data;
    },
    enabled: open && admitted && !updatingSearch,
    gcTime: 0,
    retry: false,
  });
  const loading = updatingSearch || loadingCandidates || candidatesFetching;
  const candidates = !admitted || loading || candidatesError ? [] : page?.rows ?? [];
  const nextBefore = admitted && !loading && !candidatesError ? page?.nextBefore : null;
  const replacement = candidates.find((candidate) => candidate.id === replacementDocumentId);

  const reset = () => {
    setReplacementDocumentId(null);
    setSearch("");
    setQuery("");
    setCursors([null]);
    setNotes("");
  };

  const handleClose = (v: boolean) => {
    if (!isSubmitting) {
      if (!v) reset();
      onOpenChange(v);
    }
  };

  const handleSubmit = async () => {
    if (!owner?.isLive() || !replacement) {
      toast.error("Select the replacement document that was uploaded for this renewal");
      return;
    }
    setIsSubmitting(true);
    try {
      const result = await completeDmsRenewalRequest(renewalId, {
        new_expiry_date: replacement.expiry_date ?? undefined,
        replacement_document_id: replacement.id,
        notes: notes || undefined,
      });

      if (result.success) {
        toast.success("Renewal completed — original document marked as renewed");
        invalidateDmsRenewals(queryClient);
        invalidateDmsExpiry(queryClient);
        invalidateDmsDocumentExpiry(queryClient, documentId);
        invalidateHrComplianceRenewals(queryClient);
        invalidateAuthorizedRead(queryClient, "dms-documents");
        invalidateAuthorizedRead(queryClient, "dms-archive");
        handleClose(false);
        onSuccess?.();
      } else {
        toast.error(result.error ?? "Failed to complete renewal");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const options: ERPComboboxOption[] = candidates.map((c) => ({
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
      submitDisabled={!replacement}
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
          <Label htmlFor="replacement-search" className="mb-1.5 block">Search replacement documents</Label>
          <Input
            id="replacement-search"
            type="search"
            value={search}
            maxLength={RENEWAL_REPLACEMENT_SEARCH_LIMIT}
            placeholder="Search by document no. or title"
            onChange={(event) => {
              const value = event.target.value;
              if (value.trim() !== search.trim()) {
                setCursors([null]);
                setReplacementDocumentId(null);
              }
              setSearch(value);
            }}
          />
        </div>

        <div>
          <RequiredLabel required className="mb-1.5 block">
            Replacement Document
          </RequiredLabel>
          {!updatingSearch && candidatesError ? (
            <DmsLoadError subject="replacement documents" retry={retryCandidates} pending={candidatesFetching} />
          ) : (
            <>
              <ERPCombobox
                ariaLabel="Replacement Document"
                value={replacementDocumentId}
                onValueChange={(value) => setReplacementDocumentId(value == null ? null : Number(value))}
                options={options}
                placeholder="Select the uploaded replacement"
                searchPlaceholder="Filter this page"
                showCode
                loading={loading}
                required
                emptyText="No matching documents found."
              />
            </>
          )}
          {admitted && (cursors.length > 1 || nextBefore) && (
            <div className="mt-2 flex items-center gap-2">
              <Button type="button" size="sm" variant="outline" disabled={cursors.length === 1 || loading}
                onClick={() => {
                  setCursors((current) => current.slice(0, -1));
                  setReplacementDocumentId(null);
                }}>
                Previous results
              </Button>
              <Button type="button" size="sm" variant="outline" disabled={nextBefore == null}
                onClick={() => {
                  if (nextBefore == null) return;
                  setCursors([...cursors, nextBefore]);
                  setReplacementDocumentId(null);
                }}>
                Next results
              </Button>
            </div>
          )}
        </div>

        <div>
          <Label htmlFor="new-expiry" className="mb-1.5 block">
            New Expiry Date <span className="text-xs text-muted-foreground">(from replacement document)</span>
          </Label>
          <Input
            id="new-expiry"
            type="date"
            value={replacement?.expiry_date ?? ""}
            readOnly
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
