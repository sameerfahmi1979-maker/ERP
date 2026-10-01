"use client";

import { useId, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { ERPChildDialogForm } from "@/components/erp/erp-child-dialog-form";
import { FormErrorSummary, useInlineFieldFeedback } from "@/components/workspace/form-feedback";
import { DmsLoadError } from "@/features/dms/dms-load-error";
import type { WorkspaceFieldIssue } from "@/lib/workspace/form-validation";
import { getMetadataDefinitionsForType, getDmsDocumentMetadataValues, saveDmsDocumentMetadataValues,
  type DmsMetadataDefinitionRow, type DmsMetadataValueRow, type DmsMetadataValueInput } from "@/server/actions/dms/document-metadata-values";
import { queryKeys } from "@/lib/query/query-keys";

type Props = { documentId: number | null; documentTypeId: number | null; isViewing: boolean };
type EditSnapshot = { definitions: DmsMetadataDefinitionRow[]; values: DmsMetadataValueRow[] };

/** Parent identity changes cannot carry a metadata draft into another document. */
export function DmsDocumentMetadataSection(props: Props) {
  return <MetadataSection key={`${props.documentId}:${props.documentTypeId}:${props.isViewing}`} {...props} />;
}

function MetadataSection({ documentId, documentTypeId, isViewing }: Props) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<EditSnapshot | null>(null);
  const definitions = useQuery({
    queryKey: [...queryKeys.dms.documentMetadataDefs(documentTypeId ?? 0), "detail", documentId],
    queryFn: async () => {
      const r = await getMetadataDefinitionsForType(documentTypeId!, "detail", documentId ?? undefined);
      if (!r.success || !r.data) throw new Error("Metadata definitions unavailable");
      return r.data;
    }, enabled: !!documentTypeId, staleTime: 300_000,
  });
  const values = useQuery({
    queryKey: queryKeys.dms.documentMetadata(documentId ?? 0),
    queryFn: async () => {
      const r = await getDmsDocumentMetadataValues(documentId!);
      if (!r.success || !r.data) throw new Error("Metadata values unavailable");
      return r.data;
    }, enabled: !!documentId, staleTime: 30_000,
  });
  if (!documentTypeId) return <p className="py-6 text-sm text-muted-foreground">Select a document type to see its metadata fields.</p>;
  if (definitions.isLoading || values.isLoading) return <p role="status" className="py-6 text-sm text-muted-foreground">Loading metadata…</p>;
  if (definitions.isError || values.isError) return <DmsLoadError subject="document metadata" pending={definitions.isFetching || values.isFetching} retry={() => Promise.all([definitions.refetch(), documentId ? values.refetch() : Promise.resolve()])} />;
  const defs = definitions.data ?? [];
  if (!defs.length) return <p className="py-6 text-sm text-muted-foreground">No metadata fields are configured for this document type.</p>;
  const current = initialMetadata(defs, values.data ?? []);
  return <div className="space-y-4">
    <p className="text-sm text-muted-foreground">Metadata is saved separately from the document details. Dates with a time use this device’s timezone.</p>
    <dl className="grid min-w-0 gap-4 sm:grid-cols-2">
      {defs.map(def => <div key={def.id} className="min-w-0 border-b border-border pb-3">
        <dt className="text-sm text-muted-foreground">{def.field_label_en}</dt>
        <dd dir="auto" className="mt-1 whitespace-pre-wrap break-words text-sm">{def.field_type === "boolean" ? current[def.id] === "true" ? "Yes" : "No" : current[def.id] || "Not provided"}</dd>
      </div>)}
    </dl>
    {!isViewing && documentId && <Button type="button" variant="outline" onClick={() => setEditing({ definitions: defs, values: values.data ?? [] })}>Edit metadata</Button>}
    {!documentId && <p className="text-sm text-muted-foreground">Save the document first to add metadata.</p>}
    {editing && documentId && <MetadataEditor documentId={documentId} snapshot={editing} onClose={() => setEditing(null)} onSaved={() => {
      setEditing(null);
      void queryClient.invalidateQueries({ queryKey: queryKeys.dms.documentMetadata(documentId) });
    }} />}
  </div>;
}

function initialMetadata(defs: DmsMetadataDefinitionRow[], rows: DmsMetadataValueRow[]) {
  return Object.fromEntries(defs.map(def => {
    const row = rows.find(value => value.definition_id === def.id);
    let value = row?.value_text ?? "";
    if (def.field_type === "boolean") value = row?.value_boolean === true ? "true" : "false";
    else if (def.field_type === "json") value = row?.value_json == null ? "" : JSON.stringify(row.value_json, null, 2);
    else if (["number", "currency"].includes(def.field_type)) value = row?.value_number == null ? "" : String(row.value_number);
    else if (def.field_type === "date") value = row?.value_date ?? "";
    else if (def.field_type === "datetime" && row?.value_datetime) {
      const d = new Date(row.value_datetime), pad = (n: number) => String(n).padStart(2, "0");
      value = Number.isNaN(d.getTime()) ? "" : `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    }
    return [def.id, value];
  }));
}

function MetadataEditor({ documentId, snapshot, onClose, onSaved }: { documentId: number; snapshot: EditSnapshot; onClose: () => void; onSaved: () => void }) {
  const prefix = useId(), body = useRef<HTMLDivElement>(null);
  const [initial] = useState(() => initialMetadata(snapshot.definitions, snapshot.values));
  const [values, setValues] = useState(initial);
  const [issues, setIssues] = useState<WorkspaceFieldIssue[]>([]);
  const [failure, setFailure] = useState<string | null>(null);
  useInlineFieldFeedback(issues);
  const isDirty = Object.keys(values).some(id => values[Number(id)] !== initial[Number(id)]);
  const save = async () => {
    const invalid: WorkspaceFieldIssue[] = [];
    const payload: DmsMetadataValueInput[] = snapshot.definitions.map(def => {
      const raw = values[def.id] ?? "", value: DmsMetadataValueInput = { definition_id: def.id };
      if (def.field_type === "json") {
        try { value.value_json = raw.trim() ? JSON.parse(raw) : null; }
        catch { invalid.push({ label: def.field_label_en, message: def.is_required ? "Enter valid JSON." : "Enter valid JSON or clear this optional field.", section: null, control: body.current?.querySelector(`[data-metadata-id="${def.id}"]`) ?? null }); }
      } else if (["number","currency"].includes(def.field_type)) value.value_number = raw.trim() ? Number(raw) : null;
      else if (def.field_type === "boolean") value.value_boolean = raw === "true";
      else if (def.field_type === "date") value.value_date = raw || null;
      else if (def.field_type === "datetime") value.value_datetime = raw ? new Date(raw).toISOString() : null;
      else value.value_text = raw || null;
      return value;
    });
    setIssues(invalid); setFailure(null);
    if (invalid.length) { invalid[0].control?.focus(); return; }
    try {
      const result = await saveDmsDocumentMetadataValues(documentId, payload);
      if (!result.success) { setFailure("Metadata was not saved. Check your entries and document access, then try again."); return; }
      toast.success("Metadata saved"); onSaved();
    } catch { setFailure("The save could not be confirmed. Your entries are still here. Check the document before retrying."); }
  };
  return <ERPChildDialogForm open onOpenChange={open => { if (!open) onClose(); }} mode="edit" title="Edit document metadata" isDirty={isDirty} onSubmit={save}>
    <div ref={body} className="space-y-4">
      <FormErrorSummary issues={issues} onReveal={issue => issue.control?.focus()} />
      {failure && <p role="alert" className="text-sm text-destructive">{failure}</p>}
      {snapshot.definitions.map(def => <MetadataField key={def.id} id={`${prefix}-${def.id}`} def={def} value={values[def.id] ?? ""} onChange={value => {
        setValues(previous => ({...previous,[def.id]:value}));
        setIssues(previous => previous.filter(issue => issue.control?.getAttribute("data-metadata-id") !== String(def.id)));
      }} />)}
    </div>
  </ERPChildDialogForm>;
}

function MetadataField({ id, def, value, onChange }: { id: string; def: DmsMetadataDefinitionRow; value: string; onChange: (value: string) => void }) {
  const rawOptions = (def.options_json as { values?: unknown })?.values;
  const options = Array.isArray(rawOptions) ? [...new Set(rawOptions.filter((item): item is string => typeof item === "string" && !!item))] : [];
  const native = { id, name: `metadata_${def.id}`, "data-metadata-id": def.id, required: def.is_required, "aria-label": def.field_label_en };
  return <div className="space-y-1">
    <Label htmlFor={id}>{def.field_label_en}{def.is_required && <span aria-hidden="true"> *</span>}</Label>
    {def.help_text_en && <p className="text-sm text-muted-foreground">{def.help_text_en}</p>}
    {def.field_type === "boolean" ? <div className="flex items-center gap-2"><Switch id={id} aria-label={def.field_label_en} checked={value === "true"} onCheckedChange={checked => onChange(checked ? "true" : "false")} /><span className="text-sm">{value === "true" ? "Yes" : "No"}</span></div>
      : def.field_type === "select" && options.length ? <Select value={value} onValueChange={next => onChange(next ?? "")}><SelectTrigger id={id} aria-label={def.field_label_en} aria-required={def.is_required} data-workspace-field={`metadata_${def.id}`} data-workspace-required={def.is_required} data-workspace-empty={!value}><SelectValue placeholder="Select…" /></SelectTrigger><SelectContent>{options.map(option => <SelectItem key={option} value={option}>{option}</SelectItem>)}</SelectContent></Select>
      : def.field_type === "multi_select" && options.length ? <select {...native} multiple value={value.split(",").filter(Boolean)} onChange={event => onChange(Array.from(event.target.selectedOptions, option=>option.value).join(","))} className="w-full min-h-24 rounded-sm border border-input bg-background p-2 text-sm focus-visible:outline-2 focus-visible:outline-primary">{options.map(option => <option key={option} value={option}>{option}</option>)}</select>
      : ["textarea","json"].includes(def.field_type) ? <Textarea {...native} value={value} onChange={event => onChange(event.target.value)} rows={4} dir={def.field_type === "json" ? "ltr" : "auto"} />
      : <Input {...native} type={["number","currency"].includes(def.field_type) ? "number" : def.field_type === "datetime" ? "datetime-local" : def.field_type === "date" ? "date" : "text"} step="any" value={value} onChange={event => onChange(event.target.value)} dir="auto" />}
  </div>;
}
