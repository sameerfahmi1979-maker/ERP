"use client";

/**
 * Report Template Form
 * Phase REPORT.3 — Template / Branding / Output Adapter Engine
 *
 * Uses ERPChildDialogForm — ERP standard for Add/Edit child config records.
 */

import { ERPCombobox } from "@/components/erp/combobox";
import { ERPChildDialogForm } from "@/components/erp/erp-child-dialog-form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import type { ReportBrandingProfile, ReportTemplate, ReportTemplateType } from "@/lib/report-center/types";
import { createReportTemplate, updateReportTemplate, getReportTemplate } from "@/server/actions/reports/templates";
import { createWorkspaceSaveAttempt, type WorkspaceSaveContract } from "@/lib/workspace/save-contract";
import { useReadCacheOwner } from "@/components/layout/read-cache-boundary";
import { templateConfigurationReceipt } from "@/lib/report-center/template-save-receipt";
import { FileText } from "lucide-react";
import { useState, useRef, useLayoutEffect } from "react";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  template: ReportTemplate | null;
  profiles: ReportBrandingProfile[];
  canSignGlobal?: boolean;
  onSaved: (template: ReportTemplate, isNew: boolean) => void;
}

const defaultForm = {
  template_code: "",
  template_name: "",
  template_type: "report" as ReportTemplateType,
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

export function TemplateForm(props: Props) {
  return props.open ? <TemplateFormSession key={props.template?.id ?? "new"} {...props} /> : null;
}

function TemplateFormSession({ open, onOpenChange, template, profiles, onSaved,canSignGlobal=false }: Props) {
  const [form, setForm] = useState(() => template ? {
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
      } : defaultForm);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loadedRevision]=useState(template?.workspace_revision==null?null:String(template.workspace_revision));
  const [initial]=useState(()=>JSON.stringify(form));
  const [saveError,setSaveError]=useState('');
  const [committedId,setCommittedId]=useState<number|null>(null);
  const committed=useRef<{id:number;changed:boolean}|null>(null);
  const flight=useRef(false);
  const attempt=useRef(createWorkspaceSaveAttempt());
  const pending=useRef<{input:Parameters<typeof createReportTemplate>[0]|Parameters<typeof updateReportTemplate>[0];contract:WorkspaceSaveContract;fingerprint:string;hadUnknown:boolean}|null>(null);
  const owner=useReadCacheOwner(),activation=useRef<{live:boolean}|null>(null);
  useLayoutEffect(()=>{const token={live:true};activation.current=token;return()=>{token.live=false;};},[owner]);
  const isEditing = !!template;
  const selectedProfile=profiles.find(p=>p.id===form.branding_profile_id);
  const canSign=form.branding_profile_id===null?canSignGlobal:selectedProfile?.can_sign===true&&selectedProfile.is_active&&!selectedProfile.deleted_at;

  const handleSubmit = async () => {
    const token=activation.current,current=()=>!!token?.live&&activation.current===token&&owner?.isLive()!==false;
    if(flight.current||!current())return;
    if (!form.template_name.trim()) { toast.error("Template name is required"); return; }
    if (!isEditing && !form.template_code.trim()) { toast.error("Template code is required"); return; }

    flight.current=true;setIsSubmitting(true);setSaveError('');
    try {
      if(!committed.current){
        const {template_code,...fields}=form;
        const payload={...fields,template_name:form.template_name.trim(),watermark_text:form.watermark_text?.trim()||null};
        const input=template?{id:template.id,...payload}:{template_code:template_code.trim(),...payload};
        const fingerprint=JSON.stringify(form);
        if(pending.current&&pending.current.fingerprint!==fingerprint)throw Error('A previous save is unconfirmed. Restore its submitted values and retry.');
        pending.current??={input:structuredClone(input),contract:attempt.current.begin(input,loadedRevision),fingerprint,hadUnknown:false};
        const request=pending.current;
        let result:Awaited<ReturnType<typeof createReportTemplate>>;
        try{result=template?await updateReportTemplate(request.input as Parameters<typeof updateReportTemplate>[0],request.contract):await createReportTemplate(request.input as Parameters<typeof createReportTemplate>[0],request.contract);}catch{request.hadUnknown=true;throw Error('Save unconfirmed. Retry the unchanged entries.');}
        if(!current())return;
        if(!result||typeof result.success!=='boolean'){request.hadUnknown=true;setSaveError('Save response incomplete. Retry the unchanged entries.');return;}
        if(!result.success){const earlier=request.hadUnknown;request.hadUnknown ||= result.uncertain===true;if(!request.hadUnknown){attempt.current.resolved();pending.current=null;}setSaveError(earlier?'The earlier save is still unconfirmed. Retry the unchanged entries.':result.error??'Save unconfirmed. Retry the unchanged entries.');return;}
        const receipt=templateConfigurationReceipt.safeParse(result.data);
        if(!receipt.success||(template&&receipt.data.id!==template.id)){request.hadUnknown=true;setSaveError('Save response incomplete. Retry the unchanged entries.');return;}
        committed.current={id:receipt.data.id,changed:receipt.data.changed};setCommittedId(receipt.data.id);attempt.current.resolved();pending.current=null;
      }
      const refreshed=await getReportTemplate(committed.current.id);
      if(!current())return;
      if(!refreshed.success||!refreshed.data||refreshed.data.id!==committed.current.id){setSaveError('Saved, but the current template could not be loaded. Reload saved template; it will not create another record.');return;}
      let displayFailed=false;
      try{toast.success(!committed.current.changed?'No changes to save':isEditing?'Template updated':'Template created');}catch{displayFailed=true;}
      if(current())try{onSaved(refreshed.data,!isEditing);}catch{displayFailed=true;}
      if(current()&&displayFailed)setSaveError('Saved, but the display could not be refreshed. Reload saved template.');
    }catch(e){
      if(!current())return;
      setSaveError(committed.current?'Saved, but the display could not be refreshed. Reload saved template.':e instanceof Error&&e.message.startsWith('A previous save is unconfirmed')?e.message:'Save unconfirmed. Retry the unchanged entries.');
    } finally {
      if(current()){flight.current=false;setIsSubmitting(false);}
    }
  };

  const profileOptions = profiles.filter(p=>(p.is_active&&p.can_manage)||p.id===form.branding_profile_id).map((p) => ({
    value: p.id,
    label: `${p.profile_name} (${p.profile_type})${!p.is_active?' — inactive':''}`,
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
      isDirty={!committedId&&JSON.stringify(form)!==initial}
      submitLabel={committedId?'Reload saved template':undefined}
      onSubmit={handleSubmit}
    >
      {saveError&&<div role="alert" className="mb-4 text-destructive">{saveError}</div>}
      <fieldset disabled={Boolean(committedId)} className="grid grid-cols-12 gap-4">
        {/* ── Basic Info ─────────────────────────────────────────────────── */}
        <div className="col-span-12">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">
            Basic Info
          </p>
          <div className="h-px bg-border mb-4" />
        </div>

        {!isEditing && (
          <div className="col-span-12 sm:col-span-4">
            <Label className="text-xs font-medium">
              Code <span className="text-destructive">*</span>
            </Label>
            <Input aria-label="Code" required minLength={2} maxLength={100} pattern="[A-Z0-9_]+"
              className="mt-1 uppercase h-9 text-sm"
              placeholder="COMPANY_1_REPORT"
              value={form.template_code}
              onChange={(e) => setForm((f) => ({ ...f, template_code: e.target.value.toUpperCase() }))}
            />
          </div>
        )}

        <div className="col-span-12 sm:col-span-8">
          <Label className="text-xs font-medium">
            Name <span className="text-destructive">*</span>
          </Label>
          <Input aria-label="Name" required minLength={2} maxLength={200} pattern=".*\S.*"
            className="mt-1 h-9 text-sm"
            placeholder="Company Default Report"
            value={form.template_name}
            onChange={(e) => setForm((f) => ({ ...f, template_name: e.target.value }))}
          />
        </div>

        {isEditing && <div className="hidden sm:block sm:col-span-4" />}

        <div className="col-span-12 sm:col-span-6">
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

        <div className="col-span-12 sm:col-span-6">
          <Label className="text-xs font-medium">Template Type</Label>
          <div className="mt-1">
            <ERPCombobox
              value={form.template_type}
              onValueChange={(v) => setForm((f) => ({ ...f, template_type: String(v) as ReportTemplateType }))}
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

        <div className="col-span-12 sm:col-span-6 lg:col-span-3">
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

        <div className="col-span-12 sm:col-span-6 lg:col-span-3">
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

        <div className="col-span-12 sm:col-span-6 lg:col-span-3">
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

        <div className="col-span-12 sm:col-span-6 lg:col-span-3">
          <Label className="text-xs font-medium">Font Family</Label>
          <Input aria-label="Font Family" required minLength={1} maxLength={100}
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
          <div key={key} className="col-span-12 sm:col-span-6 lg:col-span-3 flex items-center gap-2">
            <Switch
              disabled={(key==='show_stamp'||key==='show_signatory')&&!canSign}
              checked={!!form[key]}
              onCheckedChange={(v) => setForm((f) => ({ ...f, [key]: v }))}
              id={key}
            />
            <Label htmlFor={key} className="text-sm cursor-pointer">{label}</Label>
          </div>
        ))}
        {!canSign&&<p className="col-span-12 text-xs text-muted-foreground">Stamp and signature changes require signing permission for the selected branding company.</p>}

        {form.show_watermark && (
          <div className="col-span-12 sm:col-span-6">
            <Label className="text-xs font-medium">Watermark Text</Label>
            <Input aria-label="Watermark Text" maxLength={100}
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

        <div className="col-span-12 sm:col-span-6 lg:col-span-3 flex items-center gap-2">
          <Switch
            checked={form.is_active}
            onCheckedChange={(v) => setForm((f) => ({ ...f, is_active: v }))}
            id="tpl_is_active"
          />
          <Label htmlFor="tpl_is_active" className="text-sm cursor-pointer">Active</Label>
        </div>

        <div className="col-span-12 sm:col-span-6 lg:col-span-3 flex items-center gap-2">
          <Switch
            checked={form.is_default}
            onCheckedChange={(v) => setForm((f) => ({ ...f, is_default: v }))}
            id="tpl_is_default"
          />
          <Label htmlFor="tpl_is_default" className="text-sm cursor-pointer">Default template</Label>
        </div>
      </fieldset>
    </ERPChildDialogForm>
  );
}
