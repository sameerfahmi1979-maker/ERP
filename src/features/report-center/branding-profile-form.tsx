"use client";

/**
 * Branding Profile Form
 * Phase REPORT.3 — Template / Branding / Output Adapter Engine
 *
 * Uses ERPChildDialogForm — ERP standard for Add/Edit config records.
 */

import { ERPCombobox } from "@/components/erp/combobox";
import { ERPChildDialogForm } from "@/components/erp/erp-child-dialog-form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ReportBrandingAssetsSection } from "@/features/branding/report-branding-assets-section";
import type { ReportBrandingProfile } from "@/lib/report-center/types";
import { createBrandingProfile, updateBrandingProfile, getBrandingProfile, getBrandingEditorChoices } from "@/server/actions/reports/templates";
import { createWorkspaceSaveAttempt, type WorkspaceSaveContract } from "@/lib/workspace/save-contract";
import { useReadCacheOwner } from "@/components/layout/read-cache-boundary";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Palette } from "lucide-react";
import { useState, useRef, useEffect, useLayoutEffect } from "react";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  profile: ReportBrandingProfile | null;
  onSaved: (profile: ReportBrandingProfile, isNew: boolean) => void;
  canUpload: boolean;
}

const defaultForm = {
  profile_code: "",
  profile_name: "",
  profile_type: "company" as "company" | "group" | "neutral" | "custom",
  owner_company_id: "",
  watermark_text: "",
  theme_primary_color: "#1e293b",
  theme_secondary_color: "#64748b",
  theme_header_bg_color: "#1e293b",
  theme_header_text_color: "#ffffff",
  legal_name_en: "",
  legal_name_ar: "",
  trade_name_en: "",
  trade_name_ar: "",
  address_block_en: "",
  address_block_ar: "",
  phone: "",
  email: "",
  website: "",
  po_box: "",
  trn: "",
  trade_license_no: "",
  footer_text_en: "",
  footer_text_ar: "",
  signatory_name: "",
  signatory_title_en: "",
  signatory_title_ar: "",
  is_default_for_company: false,
  is_group_profile: false,
  is_neutral_profile: false,
  is_active: true,
};
const profileReceipt=z.object({id:z.number().int().positive(),revision:z.string().regex(/^[1-9]\d*$/),changed:z.boolean(),replayed:z.boolean()});

const profileTypeOptions = [
  { value: "company", label: "Company" },
  { value: "group", label: "Group" },
  { value: "neutral", label: "Neutral" },
  { value: "custom", label: "Custom" },
];

export function BrandingProfileForm(props: Props) {
  return props.open ? <BrandingProfileFormSession key={props.profile?.id ?? "new"} {...props} /> : null;
}

function BrandingProfileFormSession({
  open,
  onOpenChange,
  profile,
  onSaved,
  canUpload,
}: Props) {
  const [form, setForm] = useState(() => profile ? {
        profile_code: profile.profile_code,
        profile_name: profile.profile_name,
        profile_type: profile.profile_type as typeof defaultForm.profile_type,
        owner_company_id: profile.owner_company_id?.toString() ?? "",
        watermark_text: profile.watermark_text ?? "",
        theme_primary_color: profile.theme_primary_color,
        theme_secondary_color: profile.theme_secondary_color,
        theme_header_bg_color: profile.theme_header_bg_color,
        theme_header_text_color: profile.theme_header_text_color,
        legal_name_en: profile.legal_name_en ?? "",
        legal_name_ar: profile.legal_name_ar ?? "",
        trade_name_en: profile.trade_name_en ?? "",
        trade_name_ar: profile.trade_name_ar ?? "",
        address_block_en: profile.address_block_en ?? "",
        address_block_ar: profile.address_block_ar ?? "",
        phone: profile.phone ?? "",
        email: profile.email ?? "",
        website: profile.website ?? "",
        po_box: profile.po_box ?? "",
        trn: profile.trn ?? "",
        trade_license_no: profile.trade_license_no ?? "",
        footer_text_en: profile.footer_text_en ?? "",
        footer_text_ar: profile.footer_text_ar ?? "",
        signatory_name: profile.signatory_name ?? "",
        signatory_title_en: profile.signatory_title_en ?? "",
        signatory_title_ar: profile.signatory_title_ar ?? "",
        is_default_for_company: profile.is_default_for_company,
        is_group_profile: profile.is_group_profile,
        is_neutral_profile: profile.is_neutral_profile,
        is_active: profile.is_active,
      } : defaultForm);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [assetPending, setAssetPending] = useState(false);
  const attempt = useRef(createWorkspaceSaveAttempt());
  const [loadedRevision, setLoadedRevision] = useState(profile?.workspace_revision == null ? null : String(profile.workspace_revision));
  const flight = useRef(false);
  const [saveError, setSaveError] = useState("");
  const [committedId, setCommittedId] = useState<number | null>(null);
  const committedChanged = useRef(true);
  const committed=useRef<number|null>(null);
  const pending=useRef<{input:Parameters<typeof createBrandingProfile>[0]|Parameters<typeof updateBrandingProfile>[0];contract:WorkspaceSaveContract;fingerprint:string;hadUnknown:boolean}|null>(null);
  const owner=useReadCacheOwner(),activation=useRef<{live:boolean}|null>(null);
  useLayoutEffect(()=>{const token={live:true};activation.current=token;return()=>{token.live=false;};},[owner]);
  const [initial] = useState(() => JSON.stringify(form));
  const dirty = !committedId && JSON.stringify(form) !== initial;
  type Choices = NonNullable<Awaited<ReturnType<typeof getBrandingEditorChoices>>["data"]>;
  const [choices, setChoices] = useState<Choices | null>(null);
  const [choiceError, setChoiceError] = useState("");
  const [choiceRefresh, setChoiceRefresh] = useState(0);
  useEffect(() => {
    let current = true;
    void getBrandingEditorChoices().then(result => {
      if (!current) return;
      if (result.success && result.data) { setChoices(result.data); setChoiceError(""); }
      else setChoiceError(result.error ?? "Issuing companies could not be loaded.");
    }).catch(() => { if (current) setChoiceError("Issuing companies could not be loaded."); });
    return () => { current = false; };
  }, [choiceRefresh]);
  const isEditing = !!profile;
  const canSign = profile ? profile.can_sign === true : form.owner_company_id
    ? choices?.companies.find(company => String(company.id) === form.owner_company_id)?.can_sign === true
    : choices?.canSignGlobal === true;

  const handleSubmit = async () => {
    const token=activation.current,current=()=>!!token?.live&&activation.current===token&&owner?.isLive()!==false;
    if (!current() || flight.current || assetPending || !choices || choiceError || profile&&profile.can_manage!==true) return;
    if (!form.profile_name.trim()) { toast.error("Profile name is required"); return; }
    if (!isEditing && !form.profile_code.trim()) { toast.error("Profile code is required"); return; }

    flight.current = true;
    setIsSubmitting(true); setSaveError("");
    try {
      let savedId = committed.current;
      if (!savedId) {
        const {profile_code, signatory_name, signatory_title_en, signatory_title_ar, ...fields} = form;
        const payload = {
          ...fields,
          profile_name: form.profile_name.trim(),
          owner_company_id: form.owner_company_id ? Number(form.owner_company_id) : null,
          is_group_profile: form.profile_type === "group",
          is_neutral_profile: form.profile_type === "neutral",
          watermark_text: form.watermark_text.trim() || null,
          email: form.email.trim() || null,
          ...(canSign ? {signatory_name, signatory_title_en, signatory_title_ar} : {}),
        };
        const input = profile ? {id:profile.id,...payload} : {profile_code:profile_code.trim(),...payload};
        const fingerprint=JSON.stringify(form);
        if(pending.current&&pending.current.fingerprint!==fingerprint)throw Error('A previous save is unconfirmed. Restore its submitted values and retry.');
        pending.current??={input:structuredClone(input),contract:attempt.current.begin(input,loadedRevision),fingerprint,hadUnknown:false};
        const request=pending.current;
        let result:Awaited<ReturnType<typeof createBrandingProfile>>;
        try{result=profile?await updateBrandingProfile(request.input as Parameters<typeof updateBrandingProfile>[0],request.contract):await createBrandingProfile(request.input as Parameters<typeof createBrandingProfile>[0],request.contract);}catch{request.hadUnknown=true;throw Error('Save unconfirmed.');}
        if(!current())return;
        if(!result||typeof result.success!=='boolean'){request.hadUnknown=true;setSaveError('Save response incomplete. Retry the unchanged entries.');return;}
        if(!result.success){const earlier=request.hadUnknown;request.hadUnknown ||= result.uncertain===true;if(!request.hadUnknown){attempt.current.resolved();pending.current=null;}setSaveError(earlier?'The earlier save is still unconfirmed. Retry the unchanged entries.':result.error??'Save unconfirmed. Retry the unchanged entries.');return;}
        const receipt=profileReceipt.safeParse(result.data);
        if(!receipt.success||(profile&&receipt.data.id!==profile.id)){request.hadUnknown=true;setSaveError('Save response incomplete. Retry the unchanged entries.');return;}
        savedId=receipt.data.id;committed.current=savedId;committedChanged.current=receipt.data.changed;setCommittedId(savedId);attempt.current.resolved();pending.current=null;
      }
      // Read the authoritative row, never manufacture a profile from form data.
      const refreshed = await getBrandingProfile(savedId);
      if(!current())return;
      if (!refreshed.success || !refreshed.data || refreshed.data.id!==savedId) {setSaveError("Saved, but the current profile could not be loaded. Retry Reload saved profile; it will not create another record.");return;}
      let displayFailed=false;
      try{toast.success(!committedChanged.current ? "No changes to save" : isEditing ? "Branding profile updated" : "Branding profile created");}catch{displayFailed=true;}
      if(current())try{onSaved(refreshed.data, !isEditing);}catch{displayFailed=true;}
      if(current()&&displayFailed)setSaveError('Saved, but the display could not be refreshed. Reload saved profile.');
    } catch {
      if(current())setSaveError(committed.current?'Saved, but the current profile could not be loaded or displayed. Reload saved profile.':"Save or reload unconfirmed. Retry the unchanged entries, or reopen the current record to reconcile it.");
    } finally {
      if(current()){flight.current = false;setIsSubmitting(false);}
    }
  };

  const tf = (key: keyof typeof defaultForm) => ({
    value: String(form[key] ?? ""),
    name: key,
    disabled: assetPending,
    maxLength: key === "watermark_text" ? 100 : key === "email" ? 254 : key === "phone" || key === "po_box" || key === "trn" ? 50 : key === "trade_license_no" ? 100 : key.startsWith("address_") || key.startsWith("footer_") ? 500 : key.startsWith("legal_") || key.startsWith("trade_") ? 300 : 200,
    onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((f) => ({ ...f, [key]: e.target.value })),
  });

  const colorField = (key: keyof typeof defaultForm) => (
    <div className="flex items-center gap-2 mt-1">
      <input
        type="color" disabled={assetPending} aria-label={`${key.replaceAll("_", " ")} picker`}
        value={String(form[key])}
        onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
        className="h-9 w-10 rounded border cursor-pointer shrink-0 p-0.5"
      />
      <Input
        aria-label={key.replaceAll("_", " ")} name={key} required pattern="#[0-9a-fA-F]{6}" disabled={assetPending}
        value={String(form[key])}
        onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
        className="h-9 text-sm font-mono"
        maxLength={7}
      />
    </div>
  );

  return (
    <ERPChildDialogForm
      open={open}
      onOpenChange={onOpenChange}
      title={isEditing ? "Edit Branding Profile" : "New Branding Profile"}
      subtitle="Configure company identity, theme colors, and contact details"
      icon={<Palette className="h-5 w-5" />}
      mode={isEditing ? "edit" : "add"}
      size="xl"
      isSubmitting={isSubmitting}
      submitDisabled={assetPending || !choices || !!choiceError || !!profile && profile.can_manage !== true}
      closeDisabled={assetPending}
      submitLabel={committedId ? "Reload saved profile" : undefined}
      isDirty={dirty}
      onSubmit={handleSubmit}
    >
      {saveError && <p role="alert" className="text-destructive">{saveError}</p>}
      {assetPending && <p role="status">Finish or retry the current asset operation before editing or closing this profile.</p>}
      {choiceError ? <div role="alert">{choiceError} <Button type="button" variant="outline" onClick={() => setChoiceRefresh(value => value + 1)}>Retry company choices</Button></div> : !choices ? <p role="status">Loading authorized issuing companies…</p> : null}
      <fieldset disabled={!!committedId} className="grid grid-cols-12 gap-4">
        {/* ── Basic Info ─────────────────────────────────────────────────── */}
        <div className="col-span-12">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Basic Info</p>
          <div className="h-px bg-border mb-4" />
        </div>

        {!isEditing && (
          <div className="col-span-4">
            <Label className="text-xs font-medium">
              Code <span className="text-destructive">*</span>
            </Label>
            <Input aria-label="Code" required pattern="[A-Z0-9_]{2,100}"
              className="mt-1 h-9 text-sm uppercase"
              placeholder="COMPANY_1_DEFAULT"
              {...tf("profile_code")}
              maxLength={100}
              onChange={(e) => setForm((f) => ({ ...f, profile_code: e.target.value.toUpperCase() }))}
            />
          </div>
        )}

        <div className={`col-span-${isEditing ? "8" : "8"}`}>
          <Label className="text-xs font-medium">
            Profile Name <span className="text-destructive">*</span>
          </Label>
          <Input aria-label="Profile Name" required minLength={2} pattern={".*\\S.*"} className="mt-1 h-9 text-sm" placeholder="Company Default" {...tf("profile_name")} />
        </div>

        <div className="col-span-4">
          <Label className="text-xs font-medium">Profile Type</Label>
          <div className="mt-1">
            <ERPCombobox
              aria-label="Profile Type"
              value={form.profile_type}
              onValueChange={(v) => setForm((f) => ({ ...f, profile_type: String(v) as typeof defaultForm.profile_type, owner_company_id: v === "group" || v === "neutral" ? "" : f.owner_company_id, is_default_for_company: v === "group" || v === "neutral" ? false : f.is_default_for_company }))}
              options={profileTypeOptions.filter(option => choices?.canCreateGlobal || option.value === "company" || option.value === "custom" || option.value === form.profile_type)}
              disabled={isEditing || assetPending}
              placeholder="Select type..."
            />
          </div>
        </div>

        <div className="col-span-8">
          <Label htmlFor="bp_company" className="text-xs font-medium">Issuing Company</Label>
          <select id="bp_company" name="owner_company_id" required={form.profile_type === "company" || !choices?.canCreateGlobal}
            disabled={assetPending || isEditing || form.profile_type === "group" || form.profile_type === "neutral"}
            className="mt-1 w-full rounded-sm border border-input bg-background p-2 text-sm"
            value={form.owner_company_id} onChange={event => setForm(f => ({...f,owner_company_id:event.target.value}))}>
            <option value="">{form.profile_type === "group" || form.profile_type === "neutral" ? "Global branding — no issuing company" : "Choose an authorized issuing company"}</option>
            {choices?.companies.map(company => <option key={company.id} value={company.id}>{company.company_code} — {company.legal_name_en}</option>)}
            {isEditing && form.owner_company_id && !choices?.companies.some(company => String(company.id) === form.owner_company_id) && <option value={form.owner_company_id}>Assigned company {form.owner_company_id} — unavailable for new selection</option>}
          </select>
          <p className="text-xs text-muted-foreground">Ownership is fixed after creation. Group and neutral profiles require global authority.</p>
        </div>

        <div className="col-span-6">
          <Label className="text-xs font-medium">Legal Name (EN)</Label>
          <Input aria-label="Legal Name (EN)" className="mt-1 h-9 text-sm" {...tf("legal_name_en")} />
        </div>
        <div className="col-span-6">
          <Label className="text-xs font-medium">Legal Name (AR)</Label>
          <Input aria-label="Legal Name (AR)" className="mt-1 h-9 text-sm text-right" dir="rtl" {...tf("legal_name_ar")} />
        </div>
        <div className="col-span-6">
          <Label className="text-xs font-medium">Trade Name (EN)</Label>
          <Input aria-label="Trade Name (EN)" className="mt-1 h-9 text-sm" {...tf("trade_name_en")} />
        </div>
        <div className="col-span-6">
          <Label className="text-xs font-medium">Trade Name (AR)</Label>
          <Input aria-label="Trade Name (AR)" className="mt-1 h-9 text-sm text-right" dir="rtl" {...tf("trade_name_ar")} />
        </div>

        {/* ── Contact & Address ───────────────────────────────────────────── */}
        <div className="col-span-12 mt-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Contact &amp; Address</p>
          <div className="h-px bg-border mb-4" />
        </div>

        <div className="col-span-12">
          <Label className="text-xs font-medium">Address (EN)</Label>
          <Input aria-label="Address (EN)" className="mt-1 h-9 text-sm" placeholder="123 Business Bay, Dubai, UAE" {...tf("address_block_en")} />
        </div>
        <div className="col-span-12">
          <Label className="text-xs font-medium">Address (AR)</Label>
          <Input aria-label="Address (AR)" className="mt-1 h-9 text-sm text-right" dir="rtl" {...tf("address_block_ar")} />
        </div>
        <div className="col-span-4">
          <Label className="text-xs font-medium">Phone</Label>
          <Input aria-label="Phone" className="mt-1 h-9 text-sm" {...tf("phone")} />
        </div>
        <div className="col-span-4">
          <Label className="text-xs font-medium">Email</Label>
          <Input aria-label="Email" className="mt-1 h-9 text-sm" type="email" {...tf("email")} />
        </div>
        <div className="col-span-4">
          <Label className="text-xs font-medium">Website</Label>
          <Input aria-label="Website" className="mt-1 h-9 text-sm" {...tf("website")} />
        </div>
        <div className="col-span-3">
          <Label className="text-xs font-medium">PO Box</Label>
          <Input aria-label="PO Box" className="mt-1 h-9 text-sm" {...tf("po_box")} />
        </div>
        <div className="col-span-4">
          <Label className="text-xs font-medium">TRN</Label>
          <Input aria-label="TRN" className="mt-1 h-9 text-sm font-mono" {...tf("trn")} />
        </div>
        <div className="col-span-5">
          <Label className="text-xs font-medium">Trade License No.</Label>
          <Input aria-label="Trade License No." className="mt-1 h-9 text-sm font-mono" {...tf("trade_license_no")} />
        </div>

        {/* ── Branding & Theme ─────────────────────────────────────────────── */}
        <div className="col-span-12 mt-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Branding &amp; Theme</p>
          <div className="h-px bg-border mb-4" />
        </div>

        <div className="col-span-12">
          <p className="text-xs font-medium mb-2">Report Logo &amp; Assets</p>
          {isEditing && profile ? (
            <ReportBrandingAssetsSection
              brandingProfileId={profile.id}
              ownerCompanyId={profile.owner_company_id}
              canUpload={canUpload && profile.can_upload_assets === true}
              disabled={!profile.is_active || dirty || isSubmitting || !!committedId}
              disabledReason={!profile.is_active ? "Reactivate and save this profile before changing its images." : "Save or cancel the profile changes before changing its images."}
              canSign={profile.can_sign === true}
              parentRevision={loadedRevision ?? undefined}
              onChanged={receipt => setLoadedRevision(receipt.parent_revision)}
              onPendingChange={setAssetPending}
            />
          ) : (
            <p className="text-xs text-muted-foreground rounded-md border border-dashed border-border/80 bg-muted/20 px-3 py-4">
              Save the profile first, then edit it to upload report logo, stamp, and signature
              images.
            </p>
          )}
        </div>

        <div className="col-span-3">
          <Label className="text-xs font-medium">Primary Color</Label>
          {colorField("theme_primary_color")}
        </div>
        <div className="col-span-3">
          <Label className="text-xs font-medium">Secondary Color</Label>
          {colorField("theme_secondary_color")}
        </div>
        <div className="col-span-3">
          <Label className="text-xs font-medium">Header BG Color</Label>
          {colorField("theme_header_bg_color")}
        </div>
        <div className="col-span-3">
          <Label className="text-xs font-medium">Header Text Color</Label>
          {colorField("theme_header_text_color")}
        </div>

        {/* ── Footer & Signatory ──────────────────────────────────────────── */}
        <div className="col-span-12 mt-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Footer &amp; Signatory</p>
          <div className="h-px bg-border mb-4" />
        </div>

        <div className="col-span-6">
          <Label className="text-xs font-medium">Footer Text (EN)</Label>
          <Input aria-label="Footer Text (EN)" className="mt-1 h-9 text-sm" placeholder="Confidential — For internal use only" {...tf("footer_text_en")} />
        </div>
        <div className="col-span-6">
          <Label className="text-xs font-medium">Footer Text (AR)</Label>
          <Input aria-label="Footer Text (AR)" className="mt-1 h-9 text-sm text-right" dir="rtl" {...tf("footer_text_ar")} />
        </div>
        <div className="col-span-4">
          <Label className="text-xs font-medium">Signatory Name</Label>
          <Input aria-label="Signatory Name" className="mt-1 h-9 text-sm" {...tf("signatory_name")} disabled={!canSign || assetPending} />
        </div>
        <div className="col-span-4">
          <Label className="text-xs font-medium">Signatory Title (EN)</Label>
          <Input aria-label="Signatory Title (EN)" className="mt-1 h-9 text-sm" {...tf("signatory_title_en")} disabled={!canSign || assetPending} />
        </div>
        <div className="col-span-4">
          <Label className="text-xs font-medium">Watermark Text</Label>
          <Input aria-label="Watermark Text" className="mt-1 h-9 text-sm" placeholder="CONFIDENTIAL" {...tf("watermark_text")} />
        </div>

        {/* ── Flags ───────────────────────────────────────────────────────── */}
        <div className="col-span-12 mt-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Flags</p>
          <div className="h-px bg-border mb-4" />
        </div>

        <div className="col-span-3 flex items-center gap-2">
          <Switch disabled={assetPending} checked={form.is_active} onCheckedChange={(v) => setForm((f) => ({ ...f, is_active: v }))} id="bp_is_active" />
          <Label htmlFor="bp_is_active" className="text-sm cursor-pointer">Active</Label>
        </div>
        <div className="col-span-3 flex items-center gap-2">
          <Switch disabled={assetPending || !form.owner_company_id} checked={form.is_default_for_company} onCheckedChange={(v) => setForm((f) => ({ ...f, is_default_for_company: v }))} id="bp_is_default" />
          <Label htmlFor="bp_is_default" className="text-sm cursor-pointer">Default for company</Label>
        </div>
        <div className="col-span-3 flex items-center gap-2">
          <Switch checked={form.profile_type === "group"} disabled id="bp_is_group" />
          <Label htmlFor="bp_is_group" className="text-sm cursor-pointer">Group profile</Label>
        </div>
        <div className="col-span-3 flex items-center gap-2">
          <Switch checked={form.profile_type === "neutral"} disabled id="bp_is_neutral" />
          <Label htmlFor="bp_is_neutral" className="text-sm cursor-pointer">Neutral profile</Label>
        </div>
      </fieldset>
    </ERPChildDialogForm>
  );
}
