"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ERPCombobox } from "@/components/erp/combobox";
import { RequiredLabel } from "@/components/erp/required-label";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, Brain } from "lucide-react";
import { ALLOWED_FIELD_TYPES } from "@/features/dms/admin/dms-constants";
import { jsonStringArrayToLines } from "@/lib/dms/metadata/metadata-definition-shared";
import type { DmsMetadataDefinitionRow } from "@/server/actions/dms/metadata-definitions";

export type MetadataDefinitionFormState = {
  document_type_id: string;
  field_code: string;
  field_label_en: string;
  field_label_ar: string;
  field_type: string;
  is_required: boolean;
  is_ai_extractable: boolean;
  ai_field_hint: string;
  options_json_text: string;
  validation_json_text: string;
  sort_order: number;
  is_active: boolean;
  field_group: string;
  field_section: string;
  show_in_review: boolean;
  show_in_detail: boolean;
  show_in_list: boolean;
  show_in_upload_review: boolean;
  is_searchable: boolean;
  is_filterable: boolean;
  is_unique: boolean;
  placeholder_en: string;
  placeholder_ar: string;
  help_text_en: string;
  help_text_ar: string;
  ai_possible_labels_en_text: string;
  ai_possible_labels_ar_text: string;
  ai_keywords_text: string;
  ai_negative_keywords_text: string;
  ai_expected_format: string;
  ai_example_values_text: string;
  ai_confidence_threshold: string;
  normalization_rule: string;
  review_required_if_missing: boolean;
  review_required_if_low_confidence: boolean;
  ai_rules_json_text: string;
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

function Section({
  title,
  defaultOpen = false,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Collapsible defaultOpen={defaultOpen} className="col-span-12 border rounded-md">
      <CollapsibleTrigger className="flex w-full items-center justify-between px-4 py-2 text-sm font-medium hover:bg-muted/50">
        {title}
        <ChevronDown className="h-4 w-4 text-muted-foreground" />
      </CollapsibleTrigger>
      <CollapsibleContent className="px-4 pb-4 pt-2">
        <div className="grid grid-cols-12 gap-4">{children}</div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function ToggleRow({
  label,
  checked,
  onCheckedChange,
}: {
  label: string;
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
}) {
  return (
    <div className="col-span-6 flex items-center gap-2">
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
      <Label className="text-sm font-normal">{label}</Label>
    </div>
  );
}

type Props = {
  form: MetadataDefinitionFormState;
  setForm: React.Dispatch<React.SetStateAction<MetadataDefinitionFormState>>;
  editing: boolean;
  documentTypes: Array<{ id: number; name_en: string }>;
};

export function DmsMetadataDefinitionFormBody({ form, setForm, editing, documentTypes }: Props) {
  return (
    <>
      {editing && (
        <div className="col-span-12 flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/20 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
          <span className="mt-0.5">⚠</span>
          <span>
            All fields are editable. Changing <strong>Document Type</strong> or <strong>Field Code</strong> on a
            field that already has stored values may break AI extraction rules and existing data lookups — only do
            this if the field has no values yet.
          </span>
        </div>
      )}
      <Section title="Basic" defaultOpen>
        <div className="col-span-6">
          <RequiredLabel required>Document Type</RequiredLabel>
          <ERPCombobox
            options={documentTypes.map((dt) => ({ value: dt.id, label: dt.name_en }))}
            value={form.document_type_id ? Number(form.document_type_id) : null}
            onValueChange={(v) =>
              setForm((f) => ({ ...f, document_type_id: v != null ? String(v) : "" }))
            }
            placeholder="Select document type"
            searchPlaceholder="Search types..."
          />
        </div>
        <div className="col-span-3">
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
                <SelectItem key={t} value={t}>
                  {FIELD_TYPE_LABELS[t] ?? t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="col-span-3">
          <Label>Order</Label>
          <Input
            type="number"
            value={form.sort_order}
            onChange={(e) => setForm((f) => ({ ...f, sort_order: parseInt(e.target.value) || 0 }))}
            min={0}
          />
        </div>
        <div className="col-span-4">
          <RequiredLabel required>Field Code</RequiredLabel>
          <Input
            value={form.field_code}
            onChange={(e) => setForm((f) => ({ ...f, field_code: e.target.value.toLowerCase() }))}
            placeholder="e.g. license_number"
            className="font-mono"
          />
        </div>
        <div className="col-span-4">
          <Label>Field Group</Label>
          <Input
            value={form.field_group}
            onChange={(e) => setForm((f) => ({ ...f, field_group: e.target.value }))}
            placeholder="e.g. Identity"
          />
        </div>
        <div className="col-span-4">
          <Label>Field Section</Label>
          <Input
            value={form.field_section}
            onChange={(e) => setForm((f) => ({ ...f, field_section: e.target.value }))}
            placeholder="e.g. Document Details"
          />
        </div>
        <div className="col-span-6">
          <RequiredLabel required>Label (English)</RequiredLabel>
          <Input
            value={form.field_label_en}
            onChange={(e) => setForm((f) => ({ ...f, field_label_en: e.target.value }))}
          />
        </div>
        <div className="col-span-6">
          <Label>Label (Arabic)</Label>
          <Input
            value={form.field_label_ar}
            onChange={(e) => setForm((f) => ({ ...f, field_label_ar: e.target.value }))}
            dir="rtl"
          />
        </div>
        <div className="col-span-12 flex flex-wrap items-center gap-6">
          <ToggleRow label="Required" checked={form.is_required} onCheckedChange={(v) => setForm((f) => ({ ...f, is_required: v }))} />
          <ToggleRow label="Active" checked={form.is_active} onCheckedChange={(v) => setForm((f) => ({ ...f, is_active: v }))} />
        </div>
      </Section>

      <Section title="Visibility">
        <ToggleRow label="Show in review" checked={form.show_in_review} onCheckedChange={(v) => setForm((f) => ({ ...f, show_in_review: v }))} />
        <ToggleRow label="Show in detail" checked={form.show_in_detail} onCheckedChange={(v) => setForm((f) => ({ ...f, show_in_detail: v }))} />
        <ToggleRow label="Show in list" checked={form.show_in_list} onCheckedChange={(v) => setForm((f) => ({ ...f, show_in_list: v }))} />
        <ToggleRow label="Show in upload review" checked={form.show_in_upload_review} onCheckedChange={(v) => setForm((f) => ({ ...f, show_in_upload_review: v }))} />
        <ToggleRow label="Searchable" checked={form.is_searchable} onCheckedChange={(v) => setForm((f) => ({ ...f, is_searchable: v }))} />
        <ToggleRow label="Filterable" checked={form.is_filterable} onCheckedChange={(v) => setForm((f) => ({ ...f, is_filterable: v }))} />
        <ToggleRow label="Unique value" checked={form.is_unique} onCheckedChange={(v) => setForm((f) => ({ ...f, is_unique: v }))} />
      </Section>

      <Section title="AI Extraction">
        <div className="col-span-12 flex items-center gap-2">
          <Switch checked={form.is_ai_extractable} onCheckedChange={(v) => setForm((f) => ({ ...f, is_ai_extractable: v }))} />
          <Label className="flex items-center gap-1">
            <Brain className="h-3.5 w-3.5 text-purple-500" />
            AI Extractable
          </Label>
        </div>
        <div className="col-span-12">
          <Label>AI Field Hint</Label>
          <Input
            value={form.ai_field_hint}
            onChange={(e) => setForm((f) => ({ ...f, ai_field_hint: e.target.value }))}
            placeholder="Hint for AI extraction"
          />
        </div>
        <div className="col-span-6">
          <Label>AI Possible Labels (EN) — one per line</Label>
          <Textarea
            value={form.ai_possible_labels_en_text}
            onChange={(e) => setForm((f) => ({ ...f, ai_possible_labels_en_text: e.target.value }))}
            rows={3}
            className="text-xs font-mono"
          />
        </div>
        <div className="col-span-6">
          <Label>AI Possible Labels (AR) — one per line</Label>
          <Textarea
            value={form.ai_possible_labels_ar_text}
            onChange={(e) => setForm((f) => ({ ...f, ai_possible_labels_ar_text: e.target.value }))}
            rows={3}
            className="text-xs font-mono"
            dir="rtl"
          />
        </div>
        <div className="col-span-6">
          <Label>AI Keywords — one per line</Label>
          <Textarea
            value={form.ai_keywords_text}
            onChange={(e) => setForm((f) => ({ ...f, ai_keywords_text: e.target.value }))}
            rows={2}
            className="text-xs font-mono"
          />
        </div>
        <div className="col-span-6">
          <Label>AI Negative Keywords — one per line</Label>
          <Textarea
            value={form.ai_negative_keywords_text}
            onChange={(e) => setForm((f) => ({ ...f, ai_negative_keywords_text: e.target.value }))}
            rows={2}
            className="text-xs font-mono"
          />
        </div>
        <div className="col-span-6">
          <Label>Expected Format</Label>
          <Input
            value={form.ai_expected_format}
            onChange={(e) => setForm((f) => ({ ...f, ai_expected_format: e.target.value }))}
            placeholder="e.g. 784-YYYY-NNNNNNN-N"
          />
        </div>
        <div className="col-span-3">
          <Label>Confidence Threshold (0–1)</Label>
          <Input
            type="number"
            step="0.01"
            min={0}
            max={1}
            value={form.ai_confidence_threshold}
            onChange={(e) => setForm((f) => ({ ...f, ai_confidence_threshold: e.target.value }))}
            placeholder="e.g. 0.85"
          />
        </div>
        <div className="col-span-3">
          <Label>Normalization Rule</Label>
          <Input
            value={form.normalization_rule}
            onChange={(e) => setForm((f) => ({ ...f, normalization_rule: e.target.value }))}
            placeholder="trim, uppercase, date_iso"
          />
        </div>
        <div className="col-span-12">
          <Label>AI Example Values — one per line</Label>
          <Textarea
            value={form.ai_example_values_text}
            onChange={(e) => setForm((f) => ({ ...f, ai_example_values_text: e.target.value }))}
            rows={2}
            className="text-xs font-mono"
          />
        </div>
      </Section>

      <Section title="Validation & Review">
        <div className="col-span-12">
          <Label>Validation JSON</Label>
          <Textarea
            value={form.validation_json_text}
            onChange={(e) => setForm((f) => ({ ...f, validation_json_text: e.target.value }))}
            placeholder='{"pattern": "^[0-9]+$", "min": 1, "max": 100}'
            rows={3}
            className="font-mono text-xs"
          />
        </div>
        <ToggleRow
          label="Review required if missing"
          checked={form.review_required_if_missing}
          onCheckedChange={(v) => setForm((f) => ({ ...f, review_required_if_missing: v }))}
        />
        <ToggleRow
          label="Review required if low confidence"
          checked={form.review_required_if_low_confidence}
          onCheckedChange={(v) => setForm((f) => ({ ...f, review_required_if_low_confidence: v }))}
        />
        <div className="col-span-6">
          <Label>Placeholder (EN)</Label>
          <Input value={form.placeholder_en} onChange={(e) => setForm((f) => ({ ...f, placeholder_en: e.target.value }))} />
        </div>
        <div className="col-span-6">
          <Label>Placeholder (AR)</Label>
          <Input value={form.placeholder_ar} onChange={(e) => setForm((f) => ({ ...f, placeholder_ar: e.target.value }))} dir="rtl" />
        </div>
        <div className="col-span-6">
          <Label>Help Text (EN)</Label>
          <Textarea value={form.help_text_en} onChange={(e) => setForm((f) => ({ ...f, help_text_en: e.target.value }))} rows={2} />
        </div>
        <div className="col-span-6">
          <Label>Help Text (AR)</Label>
          <Textarea value={form.help_text_ar} onChange={(e) => setForm((f) => ({ ...f, help_text_ar: e.target.value }))} rows={2} dir="rtl" />
        </div>
        {(form.field_type === "select" || form.field_type === "multi_select") && (
          <div className="col-span-12">
            <RequiredLabel required>Options JSON</RequiredLabel>
            <Textarea
              value={form.options_json_text}
              onChange={(e) => setForm((f) => ({ ...f, options_json_text: e.target.value }))}
              rows={4}
              className="font-mono text-xs"
            />
          </div>
        )}
      </Section>

      <Section title="Advanced">
        <div className="col-span-12">
          <Label>AI Rules JSON (optional overflow)</Label>
          <Textarea
            value={form.ai_rules_json_text}
            onChange={(e) => setForm((f) => ({ ...f, ai_rules_json_text: e.target.value }))}
            rows={3}
            className="font-mono text-xs"
            placeholder='{"custom_rule": "value"}'
          />
        </div>
      </Section>
    </>
  );
}

export const emptyMetadataDefinitionForm: MetadataDefinitionFormState = {
  document_type_id: "",
  field_code: "",
  field_label_en: "",
  field_label_ar: "",
  field_type: "text",
  is_required: false,
  is_ai_extractable: false,
  ai_field_hint: "",
  options_json_text: "",
  validation_json_text: "",
  sort_order: 0,
  is_active: true,
  field_group: "",
  field_section: "",
  show_in_review: true,
  show_in_detail: true,
  show_in_list: false,
  show_in_upload_review: true,
  is_searchable: false,
  is_filterable: false,
  is_unique: false,
  placeholder_en: "",
  placeholder_ar: "",
  help_text_en: "",
  help_text_ar: "",
  ai_possible_labels_en_text: "",
  ai_possible_labels_ar_text: "",
  ai_keywords_text: "",
  ai_negative_keywords_text: "",
  ai_expected_format: "",
  ai_example_values_text: "",
  ai_confidence_threshold: "",
  normalization_rule: "",
  review_required_if_missing: false,
  review_required_if_low_confidence: false,
  ai_rules_json_text: "",
};

export function metadataDefinitionRowToForm(row: DmsMetadataDefinitionRow): MetadataDefinitionFormState {
  return {
    document_type_id: String(row.document_type_id),
    field_code: row.field_code,
    field_label_en: row.field_label_en,
    field_label_ar: row.field_label_ar ?? "",
    field_type: row.field_type,
    is_required: row.is_required,
    is_ai_extractable: row.is_ai_extractable,
    ai_field_hint: row.ai_field_hint ?? "",
    options_json_text: row.options_json ? JSON.stringify(row.options_json, null, 2) : "",
    validation_json_text: row.validation_json ? JSON.stringify(row.validation_json, null, 2) : "",
    sort_order: row.sort_order,
    is_active: row.is_active,
    field_group: row.field_group ?? "",
    field_section: row.field_section ?? "",
    show_in_review: row.show_in_review,
    show_in_detail: row.show_in_detail,
    show_in_list: row.show_in_list,
    show_in_upload_review: row.show_in_upload_review,
    is_searchable: row.is_searchable,
    is_filterable: row.is_filterable,
    is_unique: row.is_unique,
    placeholder_en: row.placeholder_en ?? "",
    placeholder_ar: row.placeholder_ar ?? "",
    help_text_en: row.help_text_en ?? "",
    help_text_ar: row.help_text_ar ?? "",
    ai_possible_labels_en_text: jsonStringArrayToLines(row.ai_possible_labels_en),
    ai_possible_labels_ar_text: jsonStringArrayToLines(row.ai_possible_labels_ar),
    ai_keywords_text: jsonStringArrayToLines(row.ai_keywords),
    ai_negative_keywords_text: jsonStringArrayToLines(row.ai_negative_keywords),
    ai_expected_format: row.ai_expected_format ?? "",
    ai_example_values_text: jsonStringArrayToLines(row.ai_example_values),
    ai_confidence_threshold: row.ai_confidence_threshold != null ? String(row.ai_confidence_threshold) : "",
    normalization_rule: row.normalization_rule ?? "",
    review_required_if_missing: row.review_required_if_missing,
    review_required_if_low_confidence: row.review_required_if_low_confidence,
    ai_rules_json_text: row.ai_rules_json ? JSON.stringify(row.ai_rules_json, null, 2) : "",
  };
}
