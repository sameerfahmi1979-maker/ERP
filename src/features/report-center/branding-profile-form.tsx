"use client";

/**
 * Branding Profile Form
 * Phase REPORT.3 — Template / Branding / Output Adapter Engine
 *
 * Uses ERPChildDialogForm — ERP standard for Add/Edit config records.
 */

import { useState, useEffect } from "react";
import { Palette } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ERPCombobox } from "@/components/erp/combobox";
import { ERPChildDialogForm } from "@/components/erp/erp-child-dialog-form";
import { toast } from "sonner";
import { createBrandingProfile, updateBrandingProfile } from "@/server/actions/reports/templates";
import { ReportBrandingAssetsSection } from "@/features/branding/report-branding-assets-section";
import type { ReportBrandingProfile } from "@/lib/report-center/types";

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

const profileTypeOptions = [
  { value: "company", label: "Company" },
  { value: "group", label: "Group" },
  { value: "neutral", label: "Neutral" },
  { value: "custom", label: "Custom" },
];

export function BrandingProfileForm({
  open,
  onOpenChange,
  profile,
  onSaved,
  canUpload,
}: Props) {
  const [form, setForm] = useState(defaultForm);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isEditing = !!profile;

  useEffect(() => {
    if (!open) return;
    if (profile) {
      setForm({
        profile_code: profile.profile_code,
        profile_name: profile.profile_name,
        profile_type: profile.profile_type as typeof defaultForm.profile_type,
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
      });
    } else {
      setForm(defaultForm);
    }
  }, [open, profile]);

  const handleSubmit = async () => {
    if (!form.profile_name.trim()) { toast.error("Profile name is required"); return; }
    if (!isEditing && !form.profile_code.trim()) { toast.error("Profile code is required"); return; }

    setIsSubmitting(true);
    try {
      let result;
      const payload = {
        ...form,
        watermark_text: form.watermark_text || null,
        email: form.email || null,
      };

      if (isEditing && profile) {
        result = await updateBrandingProfile({ id: profile.id, ...payload } as Parameters<typeof updateBrandingProfile>[0]);
      } else {
        result = await createBrandingProfile(payload as Parameters<typeof createBrandingProfile>[0]);
      }

      if (!result.success) { toast.error(result.error ?? "Save failed"); return; }

      toast.success(isEditing ? "Branding profile updated" : "Branding profile created");

      const saved: ReportBrandingProfile = {
        ...(profile ?? ({} as ReportBrandingProfile)),
        ...form,
        id: isEditing ? profile!.id : (result.data?.id ?? 0),
        logo_url: profile?.logo_url ?? null,
        small_logo_url: profile?.small_logo_url ?? null,
        stamp_url: profile?.stamp_url ?? null,
        signature_url: profile?.signature_url ?? null,
        watermark_url: null,
        watermark_text: form.watermark_text || null,
        email: form.email || null,
        website: form.website || null,
        po_box: form.po_box || null,
        phone: form.phone || null,
        address_block_en: form.address_block_en || null,
        address_block_ar: form.address_block_ar || null,
        legal_name_en: form.legal_name_en || null,
        legal_name_ar: form.legal_name_ar || null,
        trade_name_en: form.trade_name_en || null,
        trade_name_ar: form.trade_name_ar || null,
        trn: form.trn || null,
        trade_license_no: form.trade_license_no || null,
        footer_text_en: form.footer_text_en || null,
        footer_text_ar: form.footer_text_ar || null,
        signatory_name: form.signatory_name || null,
        signatory_title_en: form.signatory_title_en || null,
        signatory_title_ar: form.signatory_title_ar || null,
        owner_company_id: profile?.owner_company_id ?? null,
        created_at: profile?.created_at ?? new Date().toISOString(),
        updated_at: new Date().toISOString(),
        created_by: profile?.created_by ?? null,
        updated_by: null,
        deleted_at: null,
        deleted_by: null,
      };
      onSaved(saved, !isEditing);
    } finally {
      setIsSubmitting(false);
    }
  };

  const tf = (key: keyof typeof defaultForm) => ({
    value: String(form[key] ?? ""),
    onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((f) => ({ ...f, [key]: e.target.value })),
  });

  const colorField = (key: keyof typeof defaultForm) => (
    <div className="flex items-center gap-2 mt-1">
      <input
        type="color"
        value={String(form[key])}
        onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
        className="h-9 w-10 rounded border cursor-pointer shrink-0 p-0.5"
      />
      <Input
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
      onSubmit={handleSubmit}
    >
      <div className="grid grid-cols-12 gap-4">
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
            <Input
              className="mt-1 h-9 text-sm uppercase"
              placeholder="COMPANY_1_DEFAULT"
              {...tf("profile_code")}
              onChange={(e) => setForm((f) => ({ ...f, profile_code: e.target.value.toUpperCase() }))}
            />
          </div>
        )}

        <div className={`col-span-${isEditing ? "8" : "8"}`}>
          <Label className="text-xs font-medium">
            Profile Name <span className="text-destructive">*</span>
          </Label>
          <Input className="mt-1 h-9 text-sm" placeholder="Company Default" {...tf("profile_name")} />
        </div>

        <div className="col-span-4">
          <Label className="text-xs font-medium">Profile Type</Label>
          <div className="mt-1">
            <ERPCombobox
              value={form.profile_type}
              onValueChange={(v) => setForm((f) => ({ ...f, profile_type: String(v) as typeof defaultForm.profile_type }))}
              options={profileTypeOptions}
              placeholder="Select type..."
            />
          </div>
        </div>

        <div className="col-span-6">
          <Label className="text-xs font-medium">Legal Name (EN)</Label>
          <Input className="mt-1 h-9 text-sm" {...tf("legal_name_en")} />
        </div>
        <div className="col-span-6">
          <Label className="text-xs font-medium">Legal Name (AR)</Label>
          <Input className="mt-1 h-9 text-sm text-right" dir="rtl" {...tf("legal_name_ar")} />
        </div>
        <div className="col-span-6">
          <Label className="text-xs font-medium">Trade Name (EN)</Label>
          <Input className="mt-1 h-9 text-sm" {...tf("trade_name_en")} />
        </div>
        <div className="col-span-6">
          <Label className="text-xs font-medium">Trade Name (AR)</Label>
          <Input className="mt-1 h-9 text-sm text-right" dir="rtl" {...tf("trade_name_ar")} />
        </div>

        {/* ── Contact & Address ───────────────────────────────────────────── */}
        <div className="col-span-12 mt-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Contact &amp; Address</p>
          <div className="h-px bg-border mb-4" />
        </div>

        <div className="col-span-12">
          <Label className="text-xs font-medium">Address (EN)</Label>
          <Input className="mt-1 h-9 text-sm" placeholder="123 Business Bay, Dubai, UAE" {...tf("address_block_en")} />
        </div>
        <div className="col-span-12">
          <Label className="text-xs font-medium">Address (AR)</Label>
          <Input className="mt-1 h-9 text-sm text-right" dir="rtl" {...tf("address_block_ar")} />
        </div>
        <div className="col-span-4">
          <Label className="text-xs font-medium">Phone</Label>
          <Input className="mt-1 h-9 text-sm" {...tf("phone")} />
        </div>
        <div className="col-span-4">
          <Label className="text-xs font-medium">Email</Label>
          <Input className="mt-1 h-9 text-sm" type="email" {...tf("email")} />
        </div>
        <div className="col-span-4">
          <Label className="text-xs font-medium">Website</Label>
          <Input className="mt-1 h-9 text-sm" {...tf("website")} />
        </div>
        <div className="col-span-3">
          <Label className="text-xs font-medium">PO Box</Label>
          <Input className="mt-1 h-9 text-sm" {...tf("po_box")} />
        </div>
        <div className="col-span-4">
          <Label className="text-xs font-medium">TRN</Label>
          <Input className="mt-1 h-9 text-sm font-mono" {...tf("trn")} />
        </div>
        <div className="col-span-5">
          <Label className="text-xs font-medium">Trade License No.</Label>
          <Input className="mt-1 h-9 text-sm font-mono" {...tf("trade_license_no")} />
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
              canUpload={canUpload}
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
          <Input className="mt-1 h-9 text-sm" placeholder="Confidential — For internal use only" {...tf("footer_text_en")} />
        </div>
        <div className="col-span-6">
          <Label className="text-xs font-medium">Footer Text (AR)</Label>
          <Input className="mt-1 h-9 text-sm text-right" dir="rtl" {...tf("footer_text_ar")} />
        </div>
        <div className="col-span-4">
          <Label className="text-xs font-medium">Signatory Name</Label>
          <Input className="mt-1 h-9 text-sm" {...tf("signatory_name")} />
        </div>
        <div className="col-span-4">
          <Label className="text-xs font-medium">Signatory Title (EN)</Label>
          <Input className="mt-1 h-9 text-sm" {...tf("signatory_title_en")} />
        </div>
        <div className="col-span-4">
          <Label className="text-xs font-medium">Watermark Text</Label>
          <Input className="mt-1 h-9 text-sm" placeholder="CONFIDENTIAL" {...tf("watermark_text")} />
        </div>

        {/* ── Flags ───────────────────────────────────────────────────────── */}
        <div className="col-span-12 mt-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Flags</p>
          <div className="h-px bg-border mb-4" />
        </div>

        <div className="col-span-3 flex items-center gap-2">
          <Switch checked={form.is_active} onCheckedChange={(v) => setForm((f) => ({ ...f, is_active: v }))} id="bp_is_active" />
          <Label htmlFor="bp_is_active" className="text-sm cursor-pointer">Active</Label>
        </div>
        <div className="col-span-3 flex items-center gap-2">
          <Switch checked={form.is_default_for_company} onCheckedChange={(v) => setForm((f) => ({ ...f, is_default_for_company: v }))} id="bp_is_default" />
          <Label htmlFor="bp_is_default" className="text-sm cursor-pointer">Default for company</Label>
        </div>
        <div className="col-span-3 flex items-center gap-2">
          <Switch checked={form.is_group_profile} onCheckedChange={(v) => setForm((f) => ({ ...f, is_group_profile: v }))} id="bp_is_group" />
          <Label htmlFor="bp_is_group" className="text-sm cursor-pointer">Group profile</Label>
        </div>
        <div className="col-span-3 flex items-center gap-2">
          <Switch checked={form.is_neutral_profile} onCheckedChange={(v) => setForm((f) => ({ ...f, is_neutral_profile: v }))} id="bp_is_neutral" />
          <Label htmlFor="bp_is_neutral" className="text-sm cursor-pointer">Neutral profile</Label>
        </div>
      </div>
    </ERPChildDialogForm>
  );
}
