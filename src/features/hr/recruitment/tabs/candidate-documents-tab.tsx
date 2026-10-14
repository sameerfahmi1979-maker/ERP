"use client";
import { useGuardedTransition as useTransition } from "@/hooks/use-guarded-transition";
import { RecordCollection } from "@/components/erp/table/record-collection";
import { QueryReadBoundary, readHasFailed } from "@/components/erp/query-read-boundary";

import { ERPCombobox } from "@/components/erp/combobox";
import { ERPChildDialogForm } from "@/components/erp/erp-child-dialog-form";
import { RequiredLabel } from "@/components/erp/required-label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { invalidateRecruitmentCandidateReadModels } from "@/lib/query/invalidation";
import { queryKeys } from "@/lib/query/query-keys";
import { archiveCandidateDocument, linkCandidateDmsDocument, verifyCandidateDocument } from "@/server/actions/hr/recruitment";
import { useQueryClient } from "@tanstack/react-query";
import {useHrCandidateChildren, type CandidateChildReadProps} from "@/hooks/use-hr-candidate-children";
import { CheckCircle, FileText, Link2, Trash2 } from "lucide-react";
import { useLayoutEffect, useRef, useState } from "react";
import { toast } from "sonner";

type Props = CandidateChildReadProps & {
  candidateId: number;
  canManage: boolean;
  /** Transient parent read admission, separate from business permission. */
  mutationAdmitted?: boolean;
  onRetryMutationAdmission?: () => Promise<unknown>;
  onChildOpen?: (open: boolean) => void;
};

const PURPOSE_OPTIONS = [
  { value: "cv", label: "CV / Resume" },
  { value: "passport", label: "Passport" },
  { value: "certificate", label: "Certificate" },
  { value: "offer", label: "Offer Letter" },
  { value: "photo", label: "Photo" },
  { value: "other", label: "Other" },
];

const VERIFICATION_COLORS: Record<string, string> = {
  unverified: "bg-amber-100 text-amber-700",
  verified: "bg-green-100 text-green-700",
  failed: "bg-red-100 text-red-700",
};

export function CandidateDocumentsTab({ candidateId, canManage, authContext, onReadDenied, mutationAdmitted = true, onRetryMutationAdmission, onChildOpen }: Props) {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [retryingReads, setRetryingReads] = useState(false);
  const retryFlight = useRef(false);

  const [dmsDocId, setDmsDocId] = useState("");
  const [purpose, setPurpose] = useState<string | null>(null);
  const [notes, setNotes] = useState("");

  const read = useHrCandidateChildren("documents", candidateId, {authContext, onReadDenied});
  const uiRead1 = read.query, docsRes = uiRead1.data, docs = read.rows;
  const documentReadAdmitted = uiRead1.isSuccess && docsRes?.success === true && !uiRead1.isFetching && !readHasFailed(uiRead1);
  const mutationReady = canManage && mutationAdmitted && documentReadAdmitted && !retryingReads;
  // A retained callback must consult the latest committed admission, including
  // after terminal parent unmount. A portal does not inherit its parent's inert.
  const mutationAdmission = useRef(false);
  useLayoutEffect(() => {
    mutationAdmission.current = mutationReady;
    return () => { mutationAdmission.current = false; };
  }, [mutationReady]);

  async function retryReads() {
    if (retryFlight.current) return;
    retryFlight.current = true;
    setRetryingReads(true);
    try {
      await Promise.allSettled([
        Promise.resolve().then(() => onRetryMutationAdmission?.()),
        uiRead1.refetch({cancelRefetch: false}),
      ]);
    } finally { retryFlight.current = false; setRetryingReads(false); }
  }

  function openDialog() {
    if (!mutationAdmission.current) return;
    setDmsDocId("");
    setPurpose(null);
    setNotes("");
    setDialogOpen(true);
    onChildOpen?.(true);
  }

  function closeDialog() {
    setDialogOpen(false);
    onChildOpen?.(false);
  }

  function handleLink() {
    if (!mutationAdmission.current) return;
    const docId = parseInt(dmsDocId);
    if (!docId) { toast.error("Enter a valid DMS document ID"); return; }
    startTransition(async () => {
      if (!mutationAdmission.current) return;
      const res = await linkCandidateDmsDocument(candidateId, {
        dms_document_id: docId,
        document_purpose: purpose as "cv" | "passport" | "certificate" | "offer" | "photo" | "other" | null | undefined,
        notes: notes || null,
      });
      if (res.success) {
        toast.success("Document linked");
        void queryClient.invalidateQueries({ queryKey: queryKeys.recruitment.candidateDocuments(candidateId) });
        invalidateRecruitmentCandidateReadModels(queryClient, candidateId, "documents");
        closeDialog();
      } else {
        toast.error(res.error ?? "Failed to link document");
      }
    });
  }

  function handleVerify(id: number) {
    if (!mutationAdmission.current) return;
    startTransition(async () => {
      if (!mutationAdmission.current) return;
      const res = await verifyCandidateDocument(id);
      if (res.success) {
        toast.success("Document verified");
        void queryClient.invalidateQueries({ queryKey: queryKeys.recruitment.candidateDocuments(candidateId) });
        invalidateRecruitmentCandidateReadModels(queryClient, candidateId, "documents");
      } else {
        toast.error(res.error ?? "Failed to verify");
      }
    });
  }

  function handleArchive(id: number) {
    if (!mutationAdmission.current) return;
    startTransition(async () => {
      if (!mutationAdmission.current) return;
      const res = await archiveCandidateDocument(id);
      if (res.success) {
        toast.success("Document removed");
        void queryClient.invalidateQueries({ queryKey: queryKeys.recruitment.candidateDocuments(candidateId) });
        invalidateRecruitmentCandidateReadModels(queryClient, candidateId, "documents");
      } else {
        toast.error(res.error ?? "Failed to remove");
      }
    });
  }

  if (read.denied) return <p role="alert">Candidate document access is no longer available.</p>;
  return (
    <QueryReadBoundary queries={[uiRead1]}><div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wide">Documents</h3>
        {canManage && (
          <Button size="sm" onClick={openDialog} disabled={!mutationReady}>
            <Link2 className="h-4 w-4 mr-1" /> Link DMS Document
          </Button>
        )}
      </div>

      {
        <div className="divide-y border rounded-lg">
<RecordCollection id="hr.candidate-documents-tab.CandidateDocumentsTab.docs" rows={docs} serverRead={read.serverRead} isLoading={read.busy} message={read.validationMessage} userProfileId={String(authContext.profile?.id ?? "")} fields={[{"id":"dms_document_document_title","path":"dms_document.document_title","label":"Document Title"},{"id":"document_purpose","path":"document_purpose","label":"Document Purpose"}]} renderRecord={(doc) => (
            <div key={doc.id} className="flex items-center gap-3 p-3">
              <FileText className="h-4 w-4 text-slate-400 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">
                  {doc.dms_document?.document_title ?? doc.dms_document?.document_number ?? `Document #${doc.dms_document_id}`}
                </p>
                <div className="flex items-center gap-2 mt-0.5">
                  {doc.document_purpose && <Badge variant="outline" className="text-xs">{doc.document_purpose}</Badge>}
                  <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${VERIFICATION_COLORS[doc.verification_status]}`}>
                    {doc.verification_status}
                  </span>
                </div>
              </div>
              {canManage && (
                <div className="flex items-center gap-1">
                  {doc.verification_status !== "verified" && (
                    <Button aria-label="Mark verified" size="sm" variant="ghost" onClick={() => handleVerify(doc.id)} disabled={isPending || !mutationReady} title="Mark verified">
                      <CheckCircle className="h-4 w-4 text-green-600" />
                    </Button>
                  )}
                  <Button aria-label="Remove link" size="sm" variant="ghost" onClick={() => handleArchive(doc.id)} disabled={isPending || !mutationReady} title="Remove link">
                    <Trash2 className="h-4 w-4 text-red-500" />
                  </Button>
                </div>
              )}
            </div>
          )} />
        </div>
      }

      <ERPChildDialogForm
        open={dialogOpen}
        onOpenChange={closeDialog}
        title="Link DMS Document"
        subtitle="Link an existing DMS document to this candidate"
        icon={<Link2 className="h-5 w-5" />}
        mode="add"
        size="md"
        isSubmitting={isPending}
        submitDisabled={!mutationReady}
        onSubmit={handleLink}
        submitLabel="Link Document"
      >
        {!mutationReady && <div role="alert" className="mb-4 rounded-sm border border-destructive p-3 text-sm" aria-busy={retryingReads || undefined}>
          <p>{canManage
            ? "Document changes are paused until access and document details are verified. Your entries are retained. Retry the checks or cancel this dialog."
            : "You do not have permission to change candidate documents. Your entries are retained; cancel this dialog."}</p>
          {canManage && <Button type="button" variant="outline" className="mt-2" disabled={retryingReads}
            onClick={() => void retryReads()}>{retryingReads ? "Retrying document checks…" : "Retry document checks"}</Button>}
        </div>}
        <div className="grid grid-cols-12 gap-4">
          <div className="col-span-12">
            <RequiredLabel required>DMS Document ID</RequiredLabel>
            <Input aria-label="DMS Document ID" required
              type="number"
              value={dmsDocId}
              onChange={(e) => setDmsDocId(e.target.value)}
              placeholder="Enter DMS document ID"
            />
            <p className="text-xs text-muted-foreground mt-1">Enter the numeric ID of the document from the DMS module.</p>
          </div>
          <div className="col-span-12">
            <Label>Document Purpose</Label>
            <ERPCombobox ariaLabel="Document Purpose"
              value={purpose}
              onValueChange={(v) => setPurpose(v ? String(v) : null)}
              options={PURPOSE_OPTIONS}
              placeholder="Select purpose..."
            />
          </div>
          <div className="col-span-12">
            <Label>Notes</Label>
            <Textarea aria-label="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Optional notes..." />
          </div>
        </div>
      </ERPChildDialogForm>
    </div></QueryReadBoundary>
  );
}
