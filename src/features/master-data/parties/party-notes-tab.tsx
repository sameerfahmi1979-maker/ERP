"use client";
import { ERPDataTable } from "@/components/erp/table/erp-data-table";
import type { ColumnDef } from "@tanstack/react-table";

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
import { PlusCircle, Pencil, Trash2, Lock, MessageSquare } from "lucide-react";
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

  const { data: notes, isLoading, error, refetch } = useChildTableQuery({
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
    void queryClient.invalidateQueries({ queryKey: ["child", "party_notes", partyId] });
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Delete this note?")) return;
    const result = await deletePartyNote(id);
    if (!result.success) {
      toast.error(result.error ?? "Failed to delete");
      return;
    }
    toast.success("Note deleted");
    void queryClient.invalidateQueries({ queryKey: ["child", "party_notes", partyId] });
  };

  const columns: ColumnDef<PartyNote>[] = [
{ id:"note",header:"Note",size:340,accessorFn:note=>[note.note_title,note.note_body].filter(Boolean).join(" "),cell:({row})=><div><p className="font-medium">{row.original.note_title || "Note"}</p><p className="whitespace-pre-wrap">{row.original.note_body}</p>{row.original.is_private&&<Badge variant="secondary"><Lock className="h-3 w-3"/>Private</Badge>}</div>},
{accessorKey:"note_type_name",header:"Type"},
{accessorKey:"created_at",header:"Created",meta:{filter:{type:"date"}},cell:({row})=>format(new Date(row.original.created_at),"dd MMM yyyy HH:mm")},
{accessorKey:"follow_up_date",header:"Follow-up",meta:{filter:{type:"date"}}},
{id:"actions",header:"Actions",enableHiding:false,enableSorting:false,cell:({row})=>canManage&&currentUserProfileId&&row.original.created_by===currentUserProfileId?<div className="flex"><Button type="button" aria-label="Edit note" variant="ghost" onClick={()=>openEdit(row.original)}><Pencil className="h-4 w-4"/></Button><Button type="button" aria-label="Delete note" variant="ghost" onClick={()=>handleDelete(row.original.id)}><Trash2 className="h-4 w-4"/></Button></div>:null}];
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

      {error ? <div role="alert"><p>Notes could not be loaded.</p><Button type="button" onClick={refetch}>Try again</Button></div> : <ERPDataTable tableId={`party.notes:${partyId}`} resultsLabel="Notes" data={notes ?? []} columns={columns} enableRowSelection={false}/>}

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
            <ERPCombobox ariaLabel="Note Type"
              value={form.note_type_id}
              onValueChange={(v) => setForm((f) => ({ ...f, note_type_id: v !== null ? Number(v) : null }))}
              options={noteTypeOptions}
              placeholder="Select note type..."
              allowClear
            />
          </div>
          <div className="col-span-12">
            <Label>Title</Label>
            <Input aria-label="Title" value={form.note_title} onChange={(e) => setForm((f) => ({ ...f, note_title: e.target.value }))} placeholder="Optional title..." />
          </div>
          <div className="col-span-12">
            <Label>Note *</Label>
            <Textarea aria-label="Note" value={form.note_body} onChange={(e) => setForm((f) => ({ ...f, note_body: e.target.value }))} rows={5} placeholder="Enter note..." />
          </div>
          <div className="col-span-6">
            <Label>Follow-up Date</Label>
            <Input aria-label="Follow-up Date" type="date" value={form.follow_up_date} onChange={(e) => setForm((f) => ({ ...f, follow_up_date: e.target.value }))} />
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
