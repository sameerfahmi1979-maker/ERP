"use client";

import { useState, useTransition } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query/query-keys";
import { listCandidateDocuments, linkCandidateDmsDocument, archiveCandidateDocument, verifyCandidateDocument } from "@/server/actions/hr/recruitment";
import type { CandidateDocumentRow } from "@/server/actions/hr/recruitment";
import { ERPChildDialogForm } from "@/components/erp/erp-child-dialog-form";
import { ERPCombobox } from "@/components/erp/combobox";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Link2, CheckCircle, Trash2, FileText } from "lucide-react";
import { toast } from "sonner";
import { RequiredLabel } from "@/components/erp/required-label";

type Props = {
  candidateId: number;
  canManage: boolean;
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

export function CandidateDocumentsTab({ candidateId, canManage, onChildOpen }: Props) {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const [dmsDocId, setDmsDocId] = useState("");
  const [purpose, setPurpose] = useState<string | null>(null);
  const [notes, setNotes] = useState("");

  const { data: docsRes, isLoading } = useQuery({
    queryKey: queryKeys.recruitment.candidateDocuments(candidateId),
    queryFn: () => listCandidateDocuments(candidateId),
    staleTime: 30_000,
  });
  const docs = Array.isArray(docsRes?.data) ? docsRes.data : [];

  function openDialog() {
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
    const docId = parseInt(dmsDocId);
    if (!docId) { toast.error("Enter a valid DMS document ID"); return; }
    startTransition(async () => {
      const res = await linkCandidateDmsDocument(candidateId, {
        dms_document_id: docId,
        document_purpose: purpose as "cv" | "passport" | "certificate" | "offer" | "photo" | "other" | null | undefined,
        notes: notes || null,
      });
      if (res.success) {
        toast.success("Document linked");
        void queryClient.invalidateQueries({ queryKey: queryKeys.recruitment.candidateDocuments(candidateId) });
        closeDialog();
      } else {
        toast.error(res.error ?? "Failed to link document");
      }
    });
  }

  function handleVerify(id: number) {
    startTransition(async () => {
      const res = await verifyCandidateDocument(id);
      if (res.success) {
        toast.success("Document verified");
        void queryClient.invalidateQueries({ queryKey: queryKeys.recruitment.candidateDocuments(candidateId) });
      } else {
        toast.error(res.error ?? "Failed to verify");
      }
    });
  }

  function handleArchive(id: number) {
    startTransition(async () => {
      const res = await archiveCandidateDocument(id);
      if (res.success) {
        toast.success("Document removed");
        void queryClient.invalidateQueries({ queryKey: queryKeys.recruitment.candidateDocuments(candidateId) });
      } else {
        toast.error(res.error ?? "Failed to remove");
      }
    });
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wide">Documents</h3>
        {canManage && (
          <Button size="sm" onClick={openDialog}>
            <Link2 className="h-4 w-4 mr-1" /> Link DMS Document
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-14 rounded" />)}
        </div>
      ) : docs.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground text-sm">
          <FileText className="h-8 w-8 mx-auto mb-2 opacity-40" />
          No documents linked yet.
        </div>
      ) : (
        <div className="divide-y border rounded-lg">
          {docs.map((doc) => (
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
                    <Button size="sm" variant="ghost" onClick={() => handleVerify(doc.id)} disabled={isPending} title="Mark verified">
                      <CheckCircle className="h-4 w-4 text-green-600" />
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => handleArchive(doc.id)} disabled={isPending} title="Remove link">
                    <Trash2 className="h-4 w-4 text-red-500" />
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <ERPChildDialogForm
        open={dialogOpen}
        onOpenChange={closeDialog}
        title="Link DMS Document"
        subtitle="Link an existing DMS document to this candidate"
        icon={<Link2 className="h-5 w-5" />}
        mode="add"
        size="md"
        isSubmitting={isPending}
        onSubmit={handleLink}
        submitLabel="Link Document"
      >
        <div className="grid grid-cols-12 gap-4">
          <div className="col-span-12">
            <RequiredLabel required>DMS Document ID</RequiredLabel>
            <Input
              type="number"
              value={dmsDocId}
              onChange={(e) => setDmsDocId(e.target.value)}
              placeholder="Enter DMS document ID"
            />
            <p className="text-xs text-muted-foreground mt-1">Enter the numeric ID of the document from the DMS module.</p>
          </div>
          <div className="col-span-12">
            <Label>Document Purpose</Label>
            <ERPCombobox
              value={purpose}
              onValueChange={(v) => setPurpose(v ? String(v) : null)}
              options={PURPOSE_OPTIONS}
              placeholder="Select purpose..."
            />
          </div>
          <div className="col-span-12">
            <Label>Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Optional notes..." />
          </div>
        </div>
      </ERPChildDialogForm>
    </div>
  );
}
