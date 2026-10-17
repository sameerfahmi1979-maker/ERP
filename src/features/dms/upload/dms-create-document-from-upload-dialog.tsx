"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ERPChildDialogForm } from "@/features/dms/documents/section-read-boundary";
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
import { useUploadCreationSession } from "./use-upload-creation-session";

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

export function DmsCreateDocumentFromUploadDialog(props: DmsCreateDocumentFromUploadDialogProps) {
  return props.open && props.session ? <CreateDocumentSession key={`${props.session.id}:${props.entityContext?.entityType ?? ""}:${props.entityContext?.entityId ?? ""}`} {...props} /> : null;
}

function CreateDocumentSession({
  open,
  onOpenChange,
  session,
  documentTypes,
  entityContext,
  onSuccess,
}: DmsCreateDocumentFromUploadDialogProps) {
  const router = useRouter();
  const creation = useUploadCreationSession(session!.id, `${entityContext?.entityType ?? "inbox"}:${entityContext?.entityId ?? ""}`);
  const {title, documentTypeId, description, issueDate, expiryDate} = creation.draft;
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const locked = !!creation.pending || !!creation.receipt || !!creation.recoveryError;
  const edit = (patch: Partial<typeof creation.draft>) => {
    if (locked || isSubmitting) return;
    creation.edit({...creation.draft, ...patch});
    setMessage(null);
  };
  const typeOptions = documentTypes.map((t) => ({value: t.id, label: `${t.type_code} — ${t.name_en}`}));

  const handleSubmit = async () => {
    if (!session || isSubmitting || creation.recoveryError) return;
    if (!creation.pending && (!title.trim() || !documentTypeId)) { setMessage("Title and document type are required"); return; }
    setMessage(null);
    setIsSubmitting(true);
    try {
      const result = await creation.run({
        uploadSessionId: session.id, title: title.trim(), document_type_id: documentTypeId!,
        description: description || undefined, issue_date: issueDate || undefined,
        expiry_date: expiryDate || undefined, allowDuplicate: session.is_duplicate,
      }, createDocumentFromUpload);
      if (!creation.isCurrent()) return;
      if (!result.success) { setMessage(result.error ?? "The creation request could not be completed. Retry its retained values."); return; }
      const {documentId, documentNo} = result.data;
      setMessage(`Document ${documentNo} and its attachment are confirmed.`);
      // Completion is already retained. Link/toast/navigation errors cannot cause
      // another document creation or turn the receipt back into uncertainty.
      try {
        if (creation.claimEffects()) {
          if (entityContext && !session.origin_entity_type) {
            try {
              const link = await linkDmsDocumentToEntity(documentId, entityContext.entityType, entityContext.entityId, {is_primary:true});
              if (!creation.isCurrent()) return;
              if (!link.success) toast.warning("The document was created, but its record link was not saved. Open the document and check its links; do not create it again.");
            } catch {
              if (!creation.isCurrent()) return;
              toast.warning("The document was created, but its record link could not be confirmed. Open the document and check its links; do not create it again.");
            }
          }
          if (!creation.isCurrent()) return;
          toast.success(`Document ${documentNo} created. Complete any required Metadata and expiry date before activating or submitting it.`);
          onSuccess?.(documentId, documentNo);
        }
        if (!creation.isCurrent()) return;
        onOpenChange(false);
        router.push(`/dms/documents/record/${documentId}`);
      } catch { if (creation.isCurrent()) setMessage(`Document ${documentNo} is confirmed. Open it from the document list; do not create it again.`); }
    } finally { if (creation.isCurrent()) setIsSubmitting(false); }
  };

  const handleClose = (nextOpen: boolean) => {
    if (!isSubmitting && !creation.pending) {
      if (!nextOpen && !creation.receipt) creation.discard();
      onOpenChange(nextOpen);
    }
  };
  return (
    <ERPChildDialogForm
      open={open}
      onOpenChange={handleClose}
      title="Create New Document from Upload"
      subtitle="Fill in the document metadata. A DMS record will be created and the file attached."
      icon={<FilePlus className="h-5 w-5" />}
      mode={creation.receipt ? "view" : "add"}
      size="lg"
      isSubmitting={isSubmitting}
      submitDisabled={!!creation.recoveryError}
      closeDisabled={!!creation.pending}
      submitLabel={creation.pending ? "Retry original request" : "Create document"}
      isDirty={!creation.receipt && (title !== "" || documentTypeId !== null || description !== "" || issueDate !== "" || expiryDate !== "" || !!creation.pending)}
      onSubmit={handleSubmit}
    >
      <div className="space-y-4">
        {(creation.recoveryError || message) && <p role="alert" className="text-sm">{creation.recoveryError || message}</p>}
        {creation.pending && <p role="status" className="text-sm">The original request is retained in this account and tab&apos;s memory. Retry it unchanged. Reloading or signing out loses this recovery state; check the upload and document list before creating again.</p>}
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
            required
            value={title}
            disabled={locked}
            onChange={(e) => edit({title:e.target.value})}
            placeholder="e.g. Trade License 2026 — Alliance Gulf Transport"
            maxLength={500}
            autoFocus
          />
        </div>

        <div>
          <RequiredLabel required>Document Type</RequiredLabel>
          <ERPCombobox name="document_type_id" ariaLabel="Document Type" required
            options={typeOptions}
            value={documentTypeId}
            disabled={locked}
            onValueChange={(v) => edit({documentTypeId:v as number | null})}
            placeholder="Select document type…"
            searchPlaceholder="Search types…"
          />
        </div>

        <div>
          <Label htmlFor="doc-description">Description</Label>
          <Textarea
            id="doc-description"
            value={description}
            disabled={locked}
            onChange={(e) => edit({description:e.target.value})}
            placeholder="Optional description"
            rows={2}
            maxLength={2000}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="issue-date">Issue Date</Label>
            <Input
              id="issue-date"
              type="date"
              value={issueDate}
              disabled={locked}
              onChange={(e) => edit({issueDate:e.target.value})}
            />
          </div>
          <div>
            <Label htmlFor="expiry-date">Expiry Date</Label>
            <Input
              id="expiry-date"
              type="date"
              value={expiryDate}
              disabled={locked}
              onChange={(e) => edit({expiryDate:e.target.value})}
              min={issueDate || undefined}
            />
          </div>
        </div>

        {session?.is_duplicate && (
          <div className="rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/20 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
            This upload is marked as a duplicate. This request creates a separate document; it does not grant an administration override.
          </div>
        )}
      </div>
    </ERPChildDialogForm>
  );
}
