"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ERPChildDialogForm } from "@/components/erp/erp-child-dialog-form";
import { ERPCombobox } from "@/components/erp/combobox/erp-combobox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Paperclip } from "lucide-react";
import type { DmsUploadSessionRow } from "@/server/actions/dms/upload-sessions";
import type { DmsDocumentRow } from "@/server/actions/dms/documents";
import { attachUploadToExistingDocument } from "@/server/actions/dms/document-upload-attach";
import { FileTypeIcon } from "./dms-file-type-icon";
import { FileSize } from "./dms-file-size";

interface DmsUploadAttachDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  session: DmsUploadSessionRow | null;
  documents: DmsDocumentRow[];
  onSuccess?: (documentId: number) => void;
}

export function DmsUploadAttachDialog({
  open,
  onOpenChange,
  session,
  documents,
  onSuccess,
}: DmsUploadAttachDialogProps) {
  const router = useRouter();
  const [documentId, setDocumentId] = useState<number | null>(null);
  const [changeNotes, setChangeNotes] = useState("");
  const [versionLabel, setVersionLabel] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const documentOptions = documents.map((d) => ({
    value: d.id,
    label: `${d.document_no} — ${d.title}`,
  }));

  const handleSubmit = async () => {
    if (!session) return;
    if (!documentId) {
      toast.error("Please select a document");
      return;
    }
    setIsSubmitting(true);
    try {
      const result = await attachUploadToExistingDocument({
        uploadSessionId: session.id,
        documentId,
        changeNotes: changeNotes || undefined,
        versionLabel: versionLabel || undefined,
        allowDuplicate: session.is_duplicate,
      });
      if (!result.success) {
        toast.error(result.error ?? "Failed to attach file");
        return;
      }
      toast.success("File attached to document successfully");
      onOpenChange(false);
      setDocumentId(null);
      setChangeNotes("");
      setVersionLabel("");
      onSuccess?.(documentId);
      router.refresh();
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = (open: boolean) => {
    if (!isSubmitting) {
      onOpenChange(open);
      if (!open) {
        setDocumentId(null);
        setChangeNotes("");
        setVersionLabel("");
      }
    }
  };

  return (
    <ERPChildDialogForm
      open={open}
      onOpenChange={handleClose}
      title="Attach to Existing Document"
      subtitle="Select a DMS document to attach this uploaded file to as a new version"
      icon={<Paperclip className="h-5 w-5" />}
      mode="add"
      size="lg"
      isSubmitting={isSubmitting}
      onSubmit={handleSubmit}
    >
      <div className="space-y-4">
        {session && (
          <div className="flex items-center gap-3 p-3 rounded-md border border-border bg-muted/10">
            <FileTypeIcon mimeType={session.mime_type} className="h-5 w-5" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{session.original_filename}</p>
              <p className="text-xs text-muted-foreground">
                <FileSize bytes={session.file_size_bytes} /> · {session.mime_type}
              </p>
            </div>
          </div>
        )}

        <div>
          <Label className="mb-1.5 block">
            Target Document <span className="text-destructive">*</span>
          </Label>
          <ERPCombobox
            options={documentOptions}
            value={documentId}
            onValueChange={(v) => setDocumentId(v as number | null)}
            placeholder="Search and select a document…"
            searchPlaceholder="Search by document number or title…"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
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
          <div className="col-span-2">
            <Label htmlFor="change-notes" className="mb-1.5 block">
              Change Notes <span className="text-xs text-muted-foreground">(optional)</span>
            </Label>
            <Textarea
              id="change-notes"
              value={changeNotes}
              onChange={(e) => setChangeNotes(e.target.value)}
              placeholder="What changed in this version?"
              rows={2}
              maxLength={2000}
            />
          </div>
        </div>

        {session?.is_duplicate && (
          <div className="rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/20 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
            ⚠ This file is a duplicate. The attach will proceed with admin override.
          </div>
        )}
      </div>
    </ERPChildDialogForm>
  );
}
