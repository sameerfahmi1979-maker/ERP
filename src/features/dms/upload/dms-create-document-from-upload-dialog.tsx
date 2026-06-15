"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ERPChildDialogForm } from "@/components/erp/erp-child-dialog-form";
import { ERPCombobox } from "@/components/erp/combobox/erp-combobox";
import { RequiredLabel } from "@/components/erp/required-label";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FilePlus } from "lucide-react";
import type { DmsUploadSessionRow } from "@/server/actions/dms/upload-sessions";
import { createDocumentFromUpload } from "@/server/actions/dms/document-upload-attach";
import { linkDmsDocumentToEntity } from "@/server/actions/dms/entity-documents";
import { FileTypeIcon } from "./dms-file-type-icon";
import { FileSize } from "./dms-file-size";

export interface DmsDocumentTypeOption {
  id: number;
  type_code: string;
  name_en: string;
}

export type DmsEntityContext = {
  entityType: string;
  entityId: number;
};

interface DmsCreateDocumentFromUploadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  session: DmsUploadSessionRow | null;
  documentTypes: DmsDocumentTypeOption[];
  entityContext?: DmsEntityContext | null;
  onSuccess?: (documentId: number, documentNo: string) => void;
}

export function DmsCreateDocumentFromUploadDialog({
  open,
  onOpenChange,
  session,
  documentTypes,
  entityContext,
  onSuccess,
}: DmsCreateDocumentFromUploadDialogProps) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [documentTypeId, setDocumentTypeId] = useState<number | null>(null);
  const [description, setDescription] = useState("");
  const [issueDate, setIssueDate] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const typeOptions = documentTypes.map((t) => ({
    value: t.id,
    label: `${t.type_code} — ${t.name_en}`,
  }));

  const handleSubmit = async () => {
    if (!session) return;
    if (!title.trim()) { toast.error("Title is required"); return; }
    if (!documentTypeId) { toast.error("Document type is required"); return; }
    if (issueDate && expiryDate && expiryDate < issueDate) {
      toast.error("Expiry date must be on or after issue date");
      return;
    }
    setIsSubmitting(true);
    try {
      const result = await createDocumentFromUpload({
        uploadSessionId: session.id,
        title: title.trim(),
        document_type_id: documentTypeId,
        description: description || undefined,
        issue_date: issueDate || undefined,
        expiry_date: expiryDate || undefined,
        allowDuplicate: session.is_duplicate,
      });
      if (!result.success) {
        toast.error(result.error ?? "Failed to create document");
        return;
      }
      const newDocId = result.data!.documentId;
      const newDocNo = result.data!.documentNo;

      // Auto-link to entity context if provided (generic — works for any module)
      if (entityContext) {
        await linkDmsDocumentToEntity(newDocId, entityContext.entityType, entityContext.entityId, {
          is_primary: true,
        });
      }

      toast.success(`Document ${newDocNo} created successfully`);
      onOpenChange(false);
      resetForm();
      onSuccess?.(newDocId, newDocNo);
      router.push(`/dms/documents/record/${newDocId}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetForm = () => {
    setTitle("");
    setDocumentTypeId(null);
    setDescription("");
    setIssueDate("");
    setExpiryDate("");
  };

  const handleClose = (open: boolean) => {
    if (!isSubmitting) {
      onOpenChange(open);
      if (!open) resetForm();
    }
  };

  return (
    <ERPChildDialogForm
      open={open}
      onOpenChange={handleClose}
      title="Create New Document from Upload"
      subtitle="Fill in the document metadata. A DMS record will be created and the file attached."
      icon={<FilePlus className="h-5 w-5" />}
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
          <RequiredLabel required htmlFor="doc-title">Document Title</RequiredLabel>
          <Input
            id="doc-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Trade License 2026 — Alliance Gulf Transport"
            maxLength={500}
            autoFocus
          />
        </div>

        <div>
          <RequiredLabel required>Document Type</RequiredLabel>
          <ERPCombobox
            options={typeOptions}
            value={documentTypeId}
            onValueChange={(v) => setDocumentTypeId(v as number | null)}
            placeholder="Select document type…"
            searchPlaceholder="Search types…"
          />
        </div>

        <div>
          <Label htmlFor="doc-description">Description</Label>
          <Textarea
            id="doc-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Optional description"
            rows={2}
            maxLength={2000}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="issue-date">Issue Date</Label>
            <Input
              id="issue-date"
              type="date"
              value={issueDate}
              onChange={(e) => setIssueDate(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="expiry-date">Expiry Date</Label>
            <Input
              id="expiry-date"
              type="date"
              value={expiryDate}
              onChange={(e) => setExpiryDate(e.target.value)}
              min={issueDate || undefined}
            />
          </div>
        </div>

        {session?.is_duplicate && (
          <div className="rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/20 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
            ⚠ This file is a duplicate. A new document will be created with admin override.
          </div>
        )}
      </div>
    </ERPChildDialogForm>
  );
}
