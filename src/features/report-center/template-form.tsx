"use client";

/**
 * Report Template Form
 * Phase REPORT.3 — Template / Branding / Output Adapter Engine
 *
 * Uses ERPChildDialogForm — ERP standard for Add/Edit child config records.
 */

import { useState, useEffect } from "react";
import { FileText } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { ERPCombobox } from "@/components/erp/combobox";
import { ERPChildDialogForm } from "@/components/erp/erp-child-dialog-form";
import { createReportTemplate, updateReportTemplate } from "@/server/actions/reports/templates";
import type { ReportBrandingProfile, ReportTemplate, ReportTemplateType } from "@/lib/report-center/types";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  template: ReportTemplate | null;
  profiles: ReportBrandingProfile[];
  onSaved: (template: ReportTemplate, isNew: boolean) => void;
}

const defaultForm = {
  template_code: "",
  template_name: "",
  template_type: "report",
  branding_profile_id: null as number | null,
  default_orientation: "portrait" as "portrait" | "landscape",
  page_size: "a4" as "a4" | "letter" | "legal",
  font_family: "helvetica",
  language_mode: "en" as "en" | "ar" | "bilingual",
  show_logo: true,
  show_small_logo: false,
  show_address: true,
  show_trn: true,
  show_license: true,
  show_signatory: false,
  show_stamp: false,
  show_watermark: false,
  watermark_text: "" as string | null,
  is_default: false,
  is_active: true,
};

const typeOptions = [
  "report", "letter", "certificate", "form", "checklist", "badge", "external_submission", "group_summary",
].map((t) => ({ value: t, label: t.charAt(0).toUpperCase() + t.slice(1).replace(/_/g, " ") }));

const orientationOptions = [
  { value: "portrait", label: "Portrait" },
  { value: "landscape", label: "Landscape" },
];

const pageSizeOptions = [
  { value: "a4", label: "A4" },
  { value: "letter", label: "Letter" },
  { value: "legal", label: "Legal" },
];

const languageOptions = [
  { value: "en", label: "English (EN)" },
  { value: "ar", label: "Arabic (AR)" },
  { value: "bilingual", label: "Bilingual (EN/AR)" },
];

const displayOptions: [keyof typeof defaultForm, string][] = [
  ["show_logo", "Show Logo"],
  ["show_small_logo", "Show Small Logo"],
  ["show_address", "Show Address"],
  ["show_trn", "Show TRN"],
  ["show_license", "Show License"],
  ["show_signatory", "Show Signatory"],
  ["show_stamp", "Show Stamp"],
  ["show_watermark", "Show Watermark"],
];

export function TemplateForm({ open, onOpenChange, template, profiles, onSaved }: Props) {
  const [form, setForm] = useState(defaultForm);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isEditing = !!template;

  useEffect(() => {
    if (!open) return;
    if (template) {
      setForm({
        template_code: template.template_code,
        template_name: template.template_name,
        template_type: template.template_type,
        branding_profile_id: template.branding_profile_id ?? null,
        default_orientation: template.default_orientation,
        page_size: template.page_size,
        font_family: template.font_family,
        language_mode: template.language_mode,
        show_logo: template.show_logo,
        show_small_logo: template.show_small_logo,
        show_address: template.show_address,
        show_trn: template.show_trn,
        show_license: template.show_license,
        show_signatory: template.show_signatory,
        show_stamp: template.show_stamp,
        show_watermark: template.show_watermark,
        watermark_text: template.watermark_text ?? null,
        is_default: template.is_default,
        is_active: template.is_active,
      });
    } else {
      setForm(defaultForm);
    }
  }, [open, template]);

  const handleSubmit = async () => {
    if (!form.template_name.trim()) { toast.error("Template name is required"); return; }
    if (!isEditing && !form.template_code.trim()) { toast.error("Template code is required"); return; }

    setIsSubmitting(true);
    try {
      let result;
      if (isEditing && template) {
        result = await updateReportTemplate({ id: template.id, ...form, watermark_text: form.watermark_text || null });
      } else {
        result = await createReportTemplate({ ...form, watermark_text: form.watermark_text || null });
      }

      if (!result.success) { toast.error(result.error ?? "Save failed"); return; }

      toast.success(isEditing ? "Template updated" : "Template created");

      const saved: ReportTemplate = {
        ...(template ?? ({} as ReportTemplate)),
        ...form,
        template_type: form.template_type as ReportTemplateType,
        id: isEditing ? template!.id : (result.data?.id ?? 0),
        watermark_text: form.watermark_text || null,
        branding_profile_id: form.branding_profile_id ?? null,
        header_layout_json: template?.header_layout_json ?? {},
        footer_layout_json: template?.footer_layout_json ?? {},
        body_layout_json: template?.body_layout_json ?? {},
        style_json: template?.style_json ?? {},
        body_html_en: template?.body_html_en ?? null,
        body_html_ar: template?.body_html_ar ?? null,
        custom_css: template?.custom_css ?? null,
        requires_stamp_permission: template?.requires_stamp_permission ?? false,
        version_no: template?.version_no ?? 1,
        created_at: template?.created_at ?? new Date().toISOString(),
        updated_at: new Date().toISOString(),
        created_by: template?.created_by ?? null,
        updated_by: null,
        deleted_at: null,
        deleted_by: null,
      };
      onSaved(saved, !isEditing);
    } finally {
      setIsSubmitting(false);
    }
  };

  const profileOptions = profiles.map((p) => ({
    value: p.id,
    label: `${p.profile_name} (${p.profile_type})`,
  }));

  return (
    <ERPChildDialogForm
      open={open}
      onOpenChange={onOpenChange}
      title={isEditing ? "Edit Report Template" : "New Report Template"}
      subtitle="Configure template layout, orientation, and display options"
      icon={<FileText className="h-5 w-5" />}
      mode={isEditing ? "edit" : "add"}
      size="lg"
      isSubmitting={isSubmitting}
      onSubmit={handleSubmit}
    >
      <div className="grid grid-cols-12 gap-4">
        {/* ── Basic Info ─────────────────────────────────────────────────── */}
        <div className="col-span-12">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">
            Basic Info
          </p>
          <div className="h-px bg-border mb-4" />
        </div>

        {!isEditing && (
          <div className="col-span-4">
            <Label className="text-xs font-medium">
              Code <span className="text-destructive">*</span>
            </Label>
            <Input
              className="mt-1 uppercase h-9 text-sm"
              placeholder="COMPANY_1_REPORT"
              value={form.template_code}
              onChange={(e) => setForm((f) => ({ ...f, template_code: e.target.value.toUpperCase() }))}
            />
          </div>
        )}

        <div className={`col-span-${isEditing ? "8" : "8"}`}>
          <Label className="text-xs font-medium">
            Name <span className="text-destructive">*</span>
          </Label>
          <Input
            className="mt-1 h-9 text-sm"
            placeholder="Company Default Report"
            value={form.template_name}
            onChange={(e) => setForm((f) => ({ ...f, template_name: e.target.value }))}
          />
        </div>

        {isEditing && <div className="col-span-4" />}

        <div className="col-span-6">
          <Label className="text-xs font-medium">Branding Profile</Label>
          <div className="mt-1">
            <ERPCombobox
              value={form.branding_profile_id}
              onValueChange={(v) => setForm((f) => ({ ...f, branding_profile_id: v ? Number(v) : null }))}
              options={profileOptions}
              placeholder="Select branding profile..."
            />
          </div>
        </div>

        <div className="col-span-6">
          <Label className="text-xs font-medium">Template Type</Label>
          <div className="mt-1">
            <ERPCombobox
              value={form.template_type}
              onValueChange={(v) => setForm((f) => ({ ...f, template_type: String(v) }))}
              options={typeOptions}
              placeholder="Select type..."
            />
          </div>
        </div>

        {/* ── Layout ──────────────────────────────────────────────────────── */}
        <div className="col-span-12 mt-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">
            Layout
          </p>
          <div className="h-px bg-border mb-4" />
        </div>

        <div className="col-span-3">
          <Label className="text-xs font-medium">Orientation</Label>
          <div className="mt-1">
            <ERPCombobox
              value={form.default_orientation}
              onValueChange={(v) => setForm((f) => ({ ...f, default_orientation: String(v) as "portrait" | "landscape" }))}
              options={orientationOptions}
              placeholder="Select..."
            />
          </div>
        </div>

        <div className="col-span-3">
          <Label className="text-xs font-medium">Page Size</Label>
          <div className="mt-1">
            <ERPCombobox
              value={form.page_size}
              onValueChange={(v) => setForm((f) => ({ ...f, page_size: String(v) as "a4" | "letter" | "legal" }))}
              options={pageSizeOptions}
              placeholder="Select..."
            />
          </div>
        </div>

        <div className="col-span-3">
          <Label className="text-xs font-medium">Language Mode</Label>
          <div className="mt-1">
            <ERPCombobox
              value={form.language_mode}
              onValueChange={(v) => setForm((f) => ({ ...f, language_mode: String(v) as "en" | "ar" | "bilingual" }))}
              options={languageOptions}
              placeholder="Select..."
            />
          </div>
        </div>

        <div className="col-span-3">
          <Label className="text-xs font-medium">Font Family</Label>
          <Input
            className="mt-1 h-9 text-sm"
            value={form.font_family}
            onChange={(e) => setForm((f) => ({ ...f, font_family: e.target.value }))}
          />
        </div>

        {/* ── Display Options ─────────────────────────────────────────────── */}
        <div className="col-span-12 mt-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">
            Display Options
          </p>
          <div className="h-px bg-border mb-4" />
        </div>

        {displayOptions.map(([key, label]) => (
          <div key={key} className="col-span-3 flex items-center gap-2">
            <Switch
              checked={!!form[key]}
              onCheckedChange={(v) => setForm((f) => ({ ...f, [key]: v }))}
              id={key}
            />
            <Label htmlFor={key} className="text-sm cursor-pointer">{label}</Label>
          </div>
        ))}

        {form.show_watermark && (
          <div className="col-span-6">
            <Label className="text-xs font-medium">Watermark Text</Label>
            <Input
              className="mt-1 h-9 text-sm"
              placeholder="CONFIDENTIAL"
              value={form.watermark_text ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, watermark_text: e.target.value }))}
            />
          </div>
        )}

        {/* ── Status ──────────────────────────────────────────────────────── */}
        <div className="col-span-12 mt-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">
            Status
          </p>
          <div className="h-px bg-border mb-4" />
        </div>

        <div className="col-span-3 flex items-center gap-2">
          <Switch
            checked={form.is_active}
            onCheckedChange={(v) => setForm((f) => ({ ...f, is_active: v }))}
            id="tpl_is_active"
          />
          <Label htmlFor="tpl_is_active" className="text-sm cursor-pointer">Active</Label>
        </div>

        <div className="col-span-3 flex items-center gap-2">
          <Switch
            checked={form.is_default}
            onCheckedChange={(v) => setForm((f) => ({ ...f, is_default: v }))}
            id="tpl_is_default"
          />
          <Label htmlFor="tpl_is_default" className="text-sm cursor-pointer">Default template</Label>
        </div>
      </div>
    </ERPChildDialogForm>
  );
}
