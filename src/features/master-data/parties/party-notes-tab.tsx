"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { ERPChildDialogForm } from "@/components/erp/erp-child-dialog-form";
import { ERPCombobox } from "@/components/erp/combobox";
import { PlusCircle, Pencil, Trash2, AlertCircle, Lock, MessageSquare } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import {
  getPartyNotes,
  getPartyNoteTypes,
  createPartyNote,
  updatePartyNote,
  deletePartyNote,
} from "@/server/actions/master-data/party-notes";
import { useChildTableQuery } from "@/hooks/child-tables/use-child-table-query";
import { useQuery } from "@tanstack/react-query";
import type { PartyNote } from "@/server/actions/master-data/party-notes";

type Props = {
  partyId: number;
  canManage: boolean;
  currentUserProfileId?: number | null;
  onChildOpen?: (open: boolean) => void;
};

type FormState = {
  note_type_id: number | null;
  note_title: string;
  note_body: string;
  is_private: boolean;
  follow_up_date: string;
};

const emptyForm: FormState = {
  note_type_id: null,
  note_title: "",
  note_body: "",
  is_private: false,
  follow_up_date: "",
};

export function PartyNotesTab({ partyId, canManage, currentUserProfileId, onChildOpen }: Props) {
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const setDialogOpen = (open: boolean) => { setIsDialogOpen(open); onChildOpen?.(open); };
  const [editing, setEditing] = useState<PartyNote | null>(null);
  const [form, setForm] = useState<FormState>({ ...emptyForm });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { data: notes, isLoading } = useChildTableQuery({
    tableName: "party_notes",
    parentId: partyId,
    fetcher: getPartyNotes,
  });

  const { data: noteTypesResult } = useQuery({
    queryKey: ["party_note_types"],
    queryFn: () => getPartyNoteTypes(),
    staleTime: 5 * 60 * 1000,
  });
  const noteTypes = noteTypesResult?.success ? noteTypesResult.data ?? [] : [];

  const noteTypeOptions = noteTypes.map((t) => ({
    value: t.id,
    label: t.name_en,
    code: t.note_type_code,
  }));

  const openAdd = () => {
    setEditing(null);
    setForm({ ...emptyForm });
    setDialogOpen(true);
  };

  const openEdit = (note: PartyNote) => {
    setEditing(note);
    setForm({
      note_type_id: note.note_type_id,
      note_title: note.note_title ?? "",
      note_body: note.note_body,
      is_private: note.is_private,
      follow_up_date: note.follow_up_date ?? "",
    });
    setDialogOpen(true);
  };

  const handleSubmit = async () => {
    if (!form.note_body.trim()) {
      toast.error("Note body is required");
      return;
    }
    setIsSubmitting(true);
    const payload = {
      party_id: partyId,
      note_type_id: form.note_type_id,
      note_title: form.note_title || null,
      note_body: form.note_body,
      is_private: form.is_private,
      follow_up_date: form.follow_up_date || null,
    };

    const result = editing
      ? await updatePartyNote({ id: editing.id, ...payload })
      : await createPartyNote(payload);

    setIsSubmitting(false);
    if (!result.success) {
      toast.error(result.error ?? "Failed to save note");
      return;
    }
    toast.success(editing ? "Note updated" : "Note added");
    setDialogOpen(false);
    queryClient.invalidateQueries({ queryKey: ["child", "party_notes", partyId] });
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Delete this note?")) return;
    const result = await deletePartyNote(id);
    if (!result.success) {
      toast.error(result.error ?? "Failed to delete");
      return;
    }
    toast.success("Note deleted");
    queryClient.invalidateQueries({ queryKey: ["child", "party_notes", partyId] });
  };

  if (isLoading) return <div className="flex items-center justify-center h-32 text-muted-foreground">Loading notes…</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-medium text-sm">Notes &amp; Activity</h3>
          <p className="text-xs text-muted-foreground">{(notes ?? []).length} note(s)</p>
        </div>
        {canManage && (
          <Button size="sm" variant="outline" onClick={openAdd}>
            <PlusCircle className="mr-2 h-4 w-4" />
            Add Note
          </Button>
        )}
      </div>

      {(!notes || notes.length === 0) ? (
        <div className="flex flex-col items-center justify-center h-24 border border-dashed rounded-md text-muted-foreground text-sm gap-2">
          <AlertCircle className="h-4 w-4" />
          No notes yet
        </div>
      ) : (
        <div className="grid gap-3">
          {(notes as PartyNote[]).map((note) => {
            const isOwner = currentUserProfileId && note.created_by === currentUserProfileId;
            return (
              <div key={note.id} className="border rounded-md px-4 py-3 space-y-1">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    {note.is_private && (
                      <Badge variant="secondary" className="text-xs gap-1">
                        <Lock className="h-3 w-3" /> Private
                      </Badge>
                    )}
                    {note.note_type_name && (
                      <Badge variant="outline" className="text-xs">{note.note_type_name}</Badge>
                    )}
                    {note.note_title && <span className="font-medium text-sm">{note.note_title}</span>}
                  </div>
                  {(canManage && isOwner) && (
                    <div className="flex gap-1">
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(note)}>
                        <Pencil className="h-3 w-3" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => handleDelete(note.id)}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  )}
                </div>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">{note.note_body}</p>
                <div className="flex items-center gap-4 text-xs text-muted-foreground mt-2">
                  <span>{format(new Date(note.created_at), "dd MMM yyyy HH:mm")}</span>
                  {note.follow_up_date && (
                    <span className="text-amber-600">Follow-up: {format(new Date(note.follow_up_date), "dd MMM yyyy")}</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <ERPChildDialogForm
        open={isDialogOpen}
        onOpenChange={setDialogOpen}
        title={editing ? "Edit Note" : "Add Note"}
        subtitle="Add an internal note for this party"
        icon={<MessageSquare className="h-5 w-5" />}
        mode={editing ? "edit" : "add"}
        size="md"
        isSubmitting={isSubmitting}
        onSubmit={handleSubmit}
        submitLabel={editing ? "Save" : "Add"}
      >
        <div className="grid grid-cols-12 gap-4">
          <div className="col-span-12">
            <Label>Note Type</Label>
            <ERPCombobox
              value={form.note_type_id}
              onValueChange={(v) => setForm((f) => ({ ...f, note_type_id: v !== null ? Number(v) : null }))}
              options={noteTypeOptions}
              placeholder="Select note type..."
              allowClear
            />
          </div>
          <div className="col-span-12">
            <Label>Title</Label>
            <Input value={form.note_title} onChange={(e) => setForm((f) => ({ ...f, note_title: e.target.value }))} placeholder="Optional title..." />
          </div>
          <div className="col-span-12">
            <Label>Note *</Label>
            <Textarea value={form.note_body} onChange={(e) => setForm((f) => ({ ...f, note_body: e.target.value }))} rows={5} placeholder="Enter note..." />
          </div>
          <div className="col-span-6">
            <Label>Follow-up Date</Label>
            <Input type="date" value={form.follow_up_date} onChange={(e) => setForm((f) => ({ ...f, follow_up_date: e.target.value }))} />
          </div>
          <div className="col-span-6 flex items-end gap-3 pb-1">
            <Switch id="is_private" checked={form.is_private} onCheckedChange={(v) => setForm((f) => ({ ...f, is_private: v }))} />
            <Label htmlFor="is_private">Private note</Label>
          </div>
        </div>
      </ERPChildDialogForm>
    </div>
  );
}
