"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { GitBranchPlus, Inbox as InboxIcon, ExternalLink } from "lucide-react";
import Link from "next/link";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ERPChildDialogForm } from "@/components/erp/erp-child-dialog-form";
import { ERPCombobox } from "@/components/erp/combobox";
import type { ERPComboboxOption } from "@/components/erp/combobox";
import {
  attachUploadToExistingDocument,
  getEligibleUploadSessionsForVersionLink,
  type EligibleVersionLinkCandidate,
} from "@/server/actions/dms/document-upload-attach";
import {
  invalidateDmsDocumentFiles,
  invalidateDmsDocumentVersions,
  invalidateDmsDocumentFileStorage,
} from "@/lib/query/invalidation";

interface DmsLinkVersionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  documentId: number;
  documentNo: string;
  onSuccess?: () => void;
}

export function DmsLinkVersionDialog({
  open,
  onOpenChange,
  documentId,
  documentNo,
  onSuccess,
}: DmsLinkVersionDialogProps) {
  const queryClient = useQueryClient();
  const [uploadSessionId, setUploadSessionId] = useState<number | null>(null);
  const [versionLabel, setVersionLabel] = useState("");
  const [changeNotes, setChangeNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { data: candidates = [], isLoading: loadingCandidates } = useQuery({
    queryKey: ["dms", "documents", documentId, "version-link-candidates"],
    queryFn: async () => {
      const result = await getEligibleUploadSessionsForVersionLink(documentId);
      if (!result.success) throw new Error(result.error);
      return result.data ?? [];
    },
    enabled: open,
    staleTime: 10_000,
  });

  const reset = () => {
    setUploadSessionId(null);
    setVersionLabel("");
    setChangeNotes("");
  };

  const handleClose = (v: boolean) => {
    if (!isSubmitting) {
      if (!v) reset();
      onOpenChange(v);
    }
  };

  const handleSubmit = async () => {
    if (!uploadSessionId) {
      toast.error("Select an uploaded file to link as the new version");
      return;
    }
    setIsSubmitting(true);
    try {
      const result = await attachUploadToExistingDocument({
        uploadSessionId,
        documentId,
        versionLabel: versionLabel || undefined,
        changeNotes: changeNotes || undefined,
        allowDuplicate: false,
      });

      if (!result.success) {
        toast.error(result.error ?? "Failed to link version");
        return;
      }

      toast.success("New version linked successfully");
      invalidateDmsDocumentFiles(queryClient, documentId);
      invalidateDmsDocumentVersions(queryClient, documentId);
      invalidateDmsDocumentFileStorage(queryClient, documentId);
      handleClose(false);
      onSuccess?.();
    } finally {
      setIsSubmitting(false);
    }
  };

  const options: ERPComboboxOption[] = candidates.map((c: EligibleVersionLinkCandidate) => {
    const badge =
      c.type_match === "mismatch"
        ? "Type mismatch"
        : c.is_expired_suggestion
        ? "Expired"
        : c.type_match === "match"
        ? "Type verified"
        : undefined;
    return {
      value: c.id,
      label: c.original_filename,
      description: [
        new Date(c.uploaded_at).toLocaleDateString(),
        c.suggested_document_type_name ? `AI type: ${c.suggested_document_type_name}` : null,
        c.ineligible_reason,
      ]
        .filter(Boolean)
        .join(" · "),
      badge,
      disabled: !c.eligible,
    };
  });

  return (
    <ERPChildDialogForm
      open={open}
      onOpenChange={handleClose}
      title="Link New Version"
      subtitle={`Pick an already-uploaded, AI-reviewed file to become the new version of ${documentNo}`}
      icon={<GitBranchPlus className="h-5 w-5" />}
      mode="add"
      size="md"
      isSubmitting={isSubmitting}
      onSubmit={handleSubmit}
      submitLabel="Link Version"
    >
      <div className="space-y-4">
        <div className="rounded-md bg-muted/20 border border-border p-3 text-xs text-muted-foreground">
          <p>
            Files must be uploaded and completed <span className="font-medium">AI Fill</span> in the Inbox
            first — this ensures the document type and expiry date are checked before it becomes the
            current version.
          </p>
        </div>

        <div>
          <Label className="mb-1.5 block">
            Uploaded File <span className="text-destructive">*</span>
          </Label>
          <ERPCombobox
            value={uploadSessionId}
            onValueChange={(v) => setUploadSessionId(v as number | null)}
            options={options}
            placeholder="Search AI-reviewed inbox files…"
            searchPlaceholder="Search by filename…"
            loading={loadingCandidates}
            allowClear
            emptyText="No AI-reviewed files available yet."
            noResultsText="No matching files found"
          />
        </div>

        {!loadingCandidates && candidates.length === 0 && (
          <div className="flex flex-col items-center gap-2 py-6 text-muted-foreground rounded-md border border-dashed border-muted-foreground/30">
            <InboxIcon className="h-6 w-6 opacity-40" />
            <p className="text-sm text-center">
              No AI-reviewed files waiting to be linked.
              <br />
              Upload the file to the Inbox and run &ldquo;Upload &amp; AI Fill&rdquo; first.
            </p>
            <Link
              href="/dms/inbox"
              target="_blank"
              className="text-xs text-primary hover:underline flex items-center gap-1 mt-1"
            >
              Go to Inbox <ExternalLink className="h-3 w-3" />
            </Link>
          </div>
        )}

        <div>
          <Label htmlFor="version-label" className="mb-1.5 block">
            Version Label <span className="text-xs text-muted-foreground">(optional)</span>
          </Label>
          <Input
            id="version-label"
            value={versionLabel}
            onChange={(e) => setVersionLabel(e.target.value)}
            placeholder="e.g. 2026 Renewal"
            maxLength={100}
          />
        </div>

        <div>
          <Label htmlFor="change-notes" className="mb-1.5 block">
            Change Notes <span className="text-xs text-muted-foreground">(optional)</span>
          </Label>
          <Textarea
            id="change-notes"
            value={changeNotes}
            onChange={(e) => setChangeNotes(e.target.value)}
            placeholder="What changed in this version?"
            rows={3}
            maxLength={2000}
          />
        </div>
      </div>
    </ERPChildDialogForm>
  );
}
