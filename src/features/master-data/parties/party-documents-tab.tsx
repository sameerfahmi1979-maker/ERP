"use client";

import { useState } from "react";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Edit, Trash2, FileText, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { format, isPast } from "date-fns";
import { ERPChildDialogForm } from "@/components/erp/erp-child-dialog-form";
import { ERPCombobox } from "@/components/erp/combobox";
import { RequiredLabel } from "@/components/erp/required-label";
import { usePartyDocumentsQuery } from "./hooks/use-party-child-queries";
import { invalidatePartyDocuments } from "@/lib/query/invalidation";
import {
  createPartyDocument,
  updatePartyDocument,
  deletePartyDocument,
} from "@/server/actions/master-data/party-documents";
import {
  getPartyDocumentTypes,
  getPartyDocumentStatuses,
} from "@/server/actions/master-data/parties";
import type { PartyDocument } from "./party-types";

type PartyDocumentsTabProps = {
  partyId: number;
  disabled?: boolean;
  onChildOpen?: (open: boolean) => void;
};

const emptyForm = {
  document_type_id: null as number | null,
  document_title: "",
  document_number: "",
  issue_date: "",
  expiry_date: "",
  expiry_required: false,
  renewal_notice_days: "" as string,
  document_status_id: null as number | null,
  remarks: "",
};

export function PartyDocumentsTab({ partyId, disabled, onChildOpen }: PartyDocumentsTabProps) {
  const queryClient = useQueryClient();
  const { items: documents, isLoading } = usePartyDocumentsQuery(partyId);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const setDialogOpen = (open: boolean) => { setIsDialogOpen(open); onChildOpen?.(open); };
  const [editing, setEditing] = useState<PartyDocument | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [form, setForm] = useState({ ...emptyForm });

  const { data: docTypes } = useQuery({
    queryKey: ["party_document_types"],
    queryFn: async () => (await getPartyDocumentTypes()).data ?? [],
    staleTime: 5 * 60 * 1000,
  });

  const { data: docStatuses } = useQuery({
    queryKey: ["party_document_statuses"],
    queryFn: async () => (await getPartyDocumentStatuses()).data ?? [],
    staleTime: 5 * 60 * 1000,
  });

  const openAdd = () => {
    setEditing(null);
    setForm({ ...emptyForm });
    setDialogOpen(true);
  };

  const openEdit = (item: PartyDocument) => {
    setEditing(item);
    setForm({
      document_type_id: item.document_type_id,
      document_title: item.document_title,
      document_number: item.document_number ?? "",
      issue_date: item.issue_date ?? "",
      expiry_date: item.expiry_date ?? "",
      expiry_required: item.expiry_required,
      renewal_notice_days: item.renewal_notice_days ? String(item.renewal_notice_days) : "",
      document_status_id: item.document_status_id,
      remarks: item.remarks ?? "",
    });
    setDialogOpen(true);
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Delete this document record?")) return;
    const result = await deletePartyDocument(id);
    if (result.success) {
      toast.success("Document deleted");
      invalidatePartyDocuments(queryClient, partyId);
    } else {
      toast.error(result.error ?? "Failed to delete");
    }
  };

  const handleSubmit = async () => {
    if (!form.document_type_id || !form.document_title || !form.document_status_id) {
      toast.error("Document type, title, and status are required");
      return;
    }
    setIsSubmitting(true);
    try {
      const payload = {
        party_id: partyId,
        document_type_id: form.document_type_id!,
        document_title: form.document_title,
        document_number: form.document_number || null,
        issue_date: form.issue_date || null,
        expiry_date: form.expiry_date || null,
        issuing_authority_party_id: null,
        expiry_required: form.expiry_required,
        renewal_notice_days: form.renewal_notice_days ? parseInt(form.renewal_notice_days) : null,
        document_status_id: form.document_status_id!,
        remarks: form.remarks || null,
      };

      const result = editing
        ? await updatePartyDocument({ id: editing.id, ...payload })
        : await createPartyDocument(payload);

      if (result.success) {
        toast.success(`Document ${editing ? "updated" : "added"}`);
        setDialogOpen(false);
        invalidatePartyDocuments(queryClient, partyId);
      } else {
        toast.error(result.error ?? "Failed to save document");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) return <Skeleton className="h-32 w-full" />;

  return (
    <div className="space-y-4">
      <div className="rounded-md border border-dashed border-muted-foreground/30 bg-muted/20 px-3 py-2 text-xs text-muted-foreground flex items-center gap-2">
        <FileText className="h-3.5 w-3.5 shrink-0" />
        Document metadata only. File upload will be added in the DMS phase.
      </div>

      {!disabled && (
        <div className="flex justify-end">
          <Button type="button" size="sm" onClick={openAdd} className="gap-2">
            <Plus className="h-4 w-4" /> Add Document Record
          </Button>
        </div>
      )}

      {(documents ?? []).length === 0 ? (
        <p className="text-sm text-muted-foreground">No document records added yet.</p>
      ) : (
        <div className="space-y-2">
          {(documents ?? []).map((doc) => {
            const isExpired = doc.expiry_date && isPast(new Date(doc.expiry_date));
            return (
              <div key={doc.id} className="rounded-md border p-3 flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-xs text-muted-foreground">{doc.document_code}</span>
                    {doc.document_status_name && <Badge variant="outline" className="text-xs">{doc.document_status_name}</Badge>}
                    {isExpired && (
                      <Badge variant="destructive" className="text-xs flex items-center gap-1">
                        <AlertTriangle className="h-3 w-3" /> Expired
                      </Badge>
                    )}
                  </div>
                  <div className="font-medium text-sm">{doc.document_title}</div>
                  <div className="text-xs text-muted-foreground">
                    {doc.document_type_name && <span>{doc.document_type_name}</span>}
                    {doc.document_number && <span> · #{doc.document_number}</span>}
                    {doc.expiry_date && <span> · Expires: {format(new Date(doc.expiry_date), "dd MMM yyyy")}</span>}
                  </div>
                  {!doc.file_path && (
                    <div className="text-xs text-amber-600">No file attached (metadata only)</div>
                  )}
                </div>
                {!disabled && (
                  <div className="flex gap-1 shrink-0">
                    <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(doc)}>
                      <Edit className="h-3.5 w-3.5" />
                    </Button>
                    <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleDelete(doc.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <ERPChildDialogForm
        open={isDialogOpen}
        onOpenChange={setDialogOpen}
        title={editing ? "Edit Document Record" : "Add Document Record"}
        subtitle="Attach a document record to this party"
        icon={<FileText className="h-5 w-5" />}
        mode={editing ? "edit" : "add"}
        size="lg"
        isSubmitting={isSubmitting}
        onSubmit={handleSubmit}
      >
        <div className="grid grid-cols-12 gap-4">
          <div className="col-span-6">
            <RequiredLabel required>Document Type</RequiredLabel>
            <ERPCombobox
              value={form.document_type_id}
              onValueChange={(v) => setForm((f) => ({ ...f, document_type_id: v !== null ? Number(v) : null }))}
              options={(docTypes ?? []).map((t) => ({ value: t.id, label: t.name_en }))}
              placeholder="Select type..."
              required
            />
          </div>
          <div className="col-span-6">
            <RequiredLabel required>Document Status</RequiredLabel>
            <ERPCombobox
              value={form.document_status_id}
              onValueChange={(v) => setForm((f) => ({ ...f, document_status_id: v !== null ? Number(v) : null }))}
              options={(docStatuses ?? []).map((s) => ({ value: s.id, label: s.name_en }))}
              placeholder="Select status..."
              required
            />
          </div>
          <div className="col-span-12">
            <RequiredLabel required>Document Title</RequiredLabel>
            <Input value={form.document_title} onChange={(e) => setForm((f) => ({ ...f, document_title: e.target.value }))} />
          </div>
          <div className="col-span-12">
            <Label>Document Number</Label>
            <Input value={form.document_number} onChange={(e) => setForm((f) => ({ ...f, document_number: e.target.value }))} />
          </div>
          <div className="col-span-6">
            <Label>Issue Date</Label>
            <Input type="date" value={form.issue_date} onChange={(e) => setForm((f) => ({ ...f, issue_date: e.target.value }))} />
          </div>
          <div className="col-span-6">
            <Label>Expiry Date</Label>
            <Input type="date" value={form.expiry_date} onChange={(e) => setForm((f) => ({ ...f, expiry_date: e.target.value }))} />
          </div>
          <div className="col-span-12 flex items-center gap-2">
            <Checkbox id="doc_expiry_req" checked={form.expiry_required} onCheckedChange={(c) => setForm((f) => ({ ...f, expiry_required: !!c }))} />
            <Label htmlFor="doc_expiry_req">Expiry required / tracked</Label>
          </div>
          <div className="col-span-12">
            <Label>Remarks</Label>
            <Textarea value={form.remarks} onChange={(e) => setForm((f) => ({ ...f, remarks: e.target.value }))} rows={2} />
          </div>
        </div>
      </ERPChildDialogForm>
    </div>
  );
}
