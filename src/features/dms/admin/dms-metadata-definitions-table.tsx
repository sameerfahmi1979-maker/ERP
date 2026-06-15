"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ERPChildDialogForm } from "@/components/erp/erp-child-dialog-form";
import { RequiredLabel } from "@/components/erp/required-label";
import { ListTree, PlusCircle, Pencil, Power, Brain } from "lucide-react";
import { toast } from "sonner";
import {
  createDmsMetadataDefinition,
  updateDmsMetadataDefinition,
  activateDmsMetadataDefinition,
  deactivateDmsMetadataDefinition,
  type DmsMetadataDefinitionRow,
} from "@/server/actions/dms/metadata-definitions";
import { ALLOWED_FIELD_TYPES } from "@/features/dms/admin/dms-constants";
import type { DmsCategoryRow } from "@/server/actions/dms/categories";
import type { DmsDocumentTypeRow } from "@/server/actions/dms/document-types";
import type { AuthContext } from "@/lib/rbac/check";

type Props = {
  rows: DmsMetadataDefinitionRow[];
  categories: DmsCategoryRow[];
  documentTypes: DmsDocumentTypeRow[];
  authContext: AuthContext;
};

type FormState = {
  document_type_id: string;
  field_code: string;
  field_label_en: string;
  field_label_ar: string;
  field_type: string;
  is_required: boolean;
  is_ai_extractable: boolean;
  ai_field_hint: string;
  options_json_text: string;
  sort_order: number;
  is_active: boolean;
};

const emptyForm: FormState = {
  document_type_id: "",
  field_code: "",
  field_label_en: "",
  field_label_ar: "",
  field_type: "text",
  is_required: false,
  is_ai_extractable: false,
  ai_field_hint: "",
  options_json_text: "",
  sort_order: 0,
  is_active: true,
};

const FIELD_TYPE_LABELS: Record<string, string> = {
  text: "Text",
  textarea: "Textarea",
  number: "Number",
  date: "Date",
  datetime: "Date & Time",
  boolean: "Boolean (Yes/No)",
  select: "Select (Single)",
  multi_select: "Multi-Select",
  party_ref: "Party Reference",
  employee_ref: "Employee Reference",
  vehicle_ref: "Vehicle Reference",
  equipment_ref: "Equipment Reference",
  project_ref: "Project Reference",
  currency: "Currency",
  country_ref: "Country Reference",
  region_ref: "Region/Emirate Reference",
  city_ref: "City Reference",
  area_ref: "Area/Zone Reference",
  json: "JSON",
};

function canManage(ctx: AuthContext) {
  return (
    ctx.permissionCodes?.includes("dms.documents.manage_types") ||
    ctx.permissionCodes?.includes("dms.admin") ||
    ctx.roleCodes?.includes("system_admin") ||
    ctx.roleCodes?.includes("group_admin")
  );
}

export function DmsMetadataDefinitionsTable({ rows, documentTypes, authContext }: Props) {
  const router = useRouter();
  const manage = canManage(authContext);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<DmsMetadataDefinitionRow | null>(null);
  const [form, setForm] = useState<FormState>({ ...emptyForm });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [filterTypeId, setFilterTypeId] = useState<string>("all");

  const openAdd = () => {
    setEditing(null);
    setForm({ ...emptyForm });
    setDialogOpen(true);
  };

  const openEdit = (row: DmsMetadataDefinitionRow) => {
    setEditing(row);
    setForm({
      document_type_id: String(row.document_type_id),
      field_code: row.field_code,
      field_label_en: row.field_label_en,
      field_label_ar: row.field_label_ar ?? "",
      field_type: row.field_type,
      is_required: row.is_required,
      is_ai_extractable: row.is_ai_extractable,
      ai_field_hint: row.ai_field_hint ?? "",
      options_json_text: row.options_json ? JSON.stringify(row.options_json, null, 2) : "",
      sort_order: row.sort_order,
      is_active: row.is_active,
    });
    setDialogOpen(true);
  };

  const handleSubmit = async () => {
    if (!form.document_type_id || !form.field_code || !form.field_label_en || !form.field_type) {
      toast.error("Document type, field code, label, and field type are required");
      return;
    }
    const needsOptions = form.field_type === "select" || form.field_type === "multi_select";
    let options_json = undefined;
    if (form.options_json_text.trim()) {
      try {
        options_json = JSON.parse(form.options_json_text);
      } catch {
        toast.error("options_json is not valid JSON");
        return;
      }
    } else if (needsOptions) {
      toast.error("options_json is required for select and multi_select field types");
      return;
    }
    setIsSubmitting(true);
    const payload = {
      document_type_id: parseInt(form.document_type_id),
      field_code: form.field_code.toLowerCase(),
      field_label_en: form.field_label_en,
      field_label_ar: form.field_label_ar || null,
      field_type: form.field_type as typeof ALLOWED_FIELD_TYPES[number],
      is_required: form.is_required,
      is_ai_extractable: form.is_ai_extractable,
      ai_field_hint: form.ai_field_hint || null,
      options_json: options_json ?? null,
      sort_order: form.sort_order,
      is_active: form.is_active,
    };
    const result = editing
      ? await updateDmsMetadataDefinition(editing.id, payload)
      : await createDmsMetadataDefinition(payload);
    setIsSubmitting(false);
    if (!result.success) { toast.error(result.error ?? "Failed to save"); return; }
    toast.success(editing ? "Metadata field updated" : "Metadata field created");
    setDialogOpen(false);
    router.refresh();
  };

  const handleToggle = async (row: DmsMetadataDefinitionRow) => {
    const result = row.is_active
      ? await deactivateDmsMetadataDefinition(row.id)
      : await activateDmsMetadataDefinition(row.id);
    if (!result.success) { toast.error(result.error ?? "Failed"); return; }
    toast.success(row.is_active ? "Field deactivated" : "Field activated");
    router.refresh();
  };

  const filteredRows = filterTypeId === "all"
    ? rows
    : rows.filter((r) => String(r.document_type_id) === filterTypeId);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <p className="text-sm text-muted-foreground">
            {filteredRows.length} of {rows.length} fields
          </p>
          <Select value={filterTypeId} onValueChange={(v) => setFilterTypeId(v ?? "all")}>
            <SelectTrigger className="w-56 h-8 text-xs">
              <SelectValue placeholder="Filter by document type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All document types</SelectItem>
              {documentTypes.map((dt) => (
                <SelectItem key={dt.id} value={String(dt.id)}>
                  {dt.name_en}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {manage && (
          <Button onClick={openAdd} size="sm">
            <PlusCircle className="mr-2 h-4 w-4" />
            Add Field
          </Button>
        )}
      </div>

      <div className="rounded-md border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 border-b">
            <tr>
              <th className="text-left px-4 py-2.5 font-medium text-xs uppercase tracking-wide text-muted-foreground">Document Type</th>
              <th className="text-left px-4 py-2.5 font-medium text-xs uppercase tracking-wide text-muted-foreground">Field Code</th>
              <th className="text-left px-4 py-2.5 font-medium text-xs uppercase tracking-wide text-muted-foreground">Label</th>
              <th className="text-center px-4 py-2.5 font-medium text-xs uppercase tracking-wide text-muted-foreground">Type</th>
              <th className="text-center px-4 py-2.5 font-medium text-xs uppercase tracking-wide text-muted-foreground">Req.</th>
              <th className="text-center px-4 py-2.5 font-medium text-xs uppercase tracking-wide text-muted-foreground">AI</th>
              <th className="text-center px-4 py-2.5 font-medium text-xs uppercase tracking-wide text-muted-foreground">Status</th>
              {manage && <th className="px-4 py-2.5 w-24" />}
            </tr>
          </thead>
          <tbody className="divide-y divide-border/50">
            {filteredRows.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-muted-foreground text-sm">No metadata fields found</td>
              </tr>
            )}
            {filteredRows.map((row) => (
              <tr key={row.id} className="hover:bg-muted/25 transition-colors">
                <td className="px-4 py-2.5 text-xs">
                  <div className="font-medium">{row.document_type?.name_en ?? `Type #${row.document_type_id}`}</div>
                  <div className="font-mono text-muted-foreground text-[10px]">{row.document_type?.type_code}</div>
                </td>
                <td className="px-4 py-2.5 font-mono text-xs">{row.field_code}</td>
                <td className="px-4 py-2.5">
                  <div className="text-sm">{row.field_label_en}</div>
                  {row.field_label_ar && <div className="text-xs text-muted-foreground" dir="rtl">{row.field_label_ar}</div>}
                </td>
                <td className="px-4 py-2.5 text-center">
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-mono">
                    {row.field_type}
                  </Badge>
                </td>
                <td className="px-4 py-2.5 text-center">
                  {row.is_required ? (
                    <Badge className="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 text-[10px] px-1.5 py-0">Req</Badge>
                  ) : <span className="text-muted-foreground text-xs">—</span>}
                </td>
                <td className="px-4 py-2.5 text-center">
                  {row.is_ai_extractable ? (
                    <span title="AI Extractable"><Brain className="h-3.5 w-3.5 mx-auto text-purple-500" /></span>
                  ) : <span className="text-muted-foreground text-xs">—</span>}
                </td>
                <td className="px-4 py-2.5 text-center">
                  <Badge className={`text-[10px] px-1.5 py-0 ${row.is_active ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400" : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"}`}>
                    {row.is_active ? "Active" : "Inactive"}
                  </Badge>
                </td>
                {manage && (
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-1 justify-end">
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(row)} title="Edit">
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => handleToggle(row)} title={row.is_active ? "Deactivate" : "Activate"}>
                        <Power className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ERPChildDialogForm
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        title={editing ? "Edit Metadata Field" : "Add Metadata Field"}
        subtitle="Define a dynamic metadata field for a document type"
        icon={<ListTree className="h-5 w-5" />}
        mode={editing ? "edit" : "add"}
        size="lg"
        isSubmitting={isSubmitting}
        onSubmit={handleSubmit}
      >
        <div className="grid grid-cols-12 gap-4">
          <div className="col-span-6">
            <RequiredLabel required>Document Type</RequiredLabel>
            <Select
              value={form.document_type_id}
              onValueChange={(v) => setForm((f) => ({ ...f, document_type_id: v ?? "" }))}
              disabled={!!editing}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select document type" />
              </SelectTrigger>
              <SelectContent>
                {documentTypes.map((dt) => (
                  <SelectItem key={dt.id} value={String(dt.id)}>
                    {dt.name_en}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-4">
            <RequiredLabel required>Field Type</RequiredLabel>
            <Select
              value={form.field_type}
              onValueChange={(v) => setForm((f) => ({ ...f, field_type: v ?? "text" }))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ALLOWED_FIELD_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>{FIELD_TYPE_LABELS[t] ?? t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-2">
            <Label>Order</Label>
            <Input
              type="number"
              value={form.sort_order}
              onChange={(e) => setForm((f) => ({ ...f, sort_order: parseInt(e.target.value) || 0 }))}
              min={0}
            />
          </div>
          <div className="col-span-5">
            <RequiredLabel required>Field Code</RequiredLabel>
            <Input
              value={form.field_code}
              onChange={(e) => setForm((f) => ({ ...f, field_code: e.target.value.toLowerCase() }))}
              placeholder="e.g. license_number"
              className="font-mono"
              disabled={!!editing}
            />
            <p className="text-[10px] text-muted-foreground mt-1">Lowercase letters, numbers, underscores</p>
          </div>
          <div className="col-span-7">
            <RequiredLabel required>Label (English)</RequiredLabel>
            <Input
              value={form.field_label_en}
              onChange={(e) => setForm((f) => ({ ...f, field_label_en: e.target.value }))}
              placeholder="e.g. License Number"
            />
          </div>
          <div className="col-span-12">
            <Label>Label (Arabic)</Label>
            <Input
              value={form.field_label_ar}
              onChange={(e) => setForm((f) => ({ ...f, field_label_ar: e.target.value }))}
              placeholder="التسمية بالعربي"
              dir="rtl"
            />
          </div>
          {(form.field_type === "select" || form.field_type === "multi_select") && (
            <div className="col-span-12">
              <RequiredLabel required>Options JSON</RequiredLabel>
              <Textarea
                value={form.options_json_text}
                onChange={(e) => setForm((f) => ({ ...f, options_json_text: e.target.value }))}
                placeholder='{"options": [{"value": "opt1", "label": "Option 1"}, {"value": "opt2", "label": "Option 2"}]}'
                rows={4}
                className="font-mono text-xs"
              />
              <p className="text-[10px] text-muted-foreground mt-1">Required for select and multi_select field types</p>
            </div>
          )}
          <div className="col-span-12">
            <Label className="flex items-center gap-1">
              <Brain className="h-3.5 w-3.5 text-purple-500" />
              AI Field Hint
            </Label>
            <Input
              value={form.ai_field_hint}
              onChange={(e) => setForm((f) => ({ ...f, ai_field_hint: e.target.value }))}
              placeholder="Hint for AI extraction, e.g. 'The license number at the top of the document'"
            />
            <p className="text-[10px] text-muted-foreground mt-1">Used by future AI extraction (DMS.9+)</p>
          </div>
          <div className="col-span-12 flex flex-wrap items-center gap-6">
            <div className="flex items-center gap-2">
              <Switch checked={form.is_required} onCheckedChange={(v) => setForm((f) => ({ ...f, is_required: v }))} />
              <Label>Required Field</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={form.is_ai_extractable} onCheckedChange={(v) => setForm((f) => ({ ...f, is_ai_extractable: v }))} />
              <Label>AI Extractable</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={form.is_active} onCheckedChange={(v) => setForm((f) => ({ ...f, is_active: v }))} />
              <Label>Active</Label>
            </div>
          </div>
        </div>
      </ERPChildDialogForm>
    </div>
  );
}
