"use client";

/**
 * Branding Profile Form (Drawer)
 * Phase REPORT.3 — Template / Branding / Output Adapter Engine
 *
 * Create / edit erp_report_branding_profiles.
 * Uses Sheet (drawer) pattern since this is a config record, not a primary business entity.
 */

import { useState, useEffect } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Loader2, Palette } from "lucide-react";
import { toast } from "sonner";
import { createBrandingProfile, updateBrandingProfile } from "@/server/actions/reports/templates";
import type { ReportBrandingProfile } from "@/lib/report-center/types";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  profile: ReportBrandingProfile | null;
  onSaved: (profile: ReportBrandingProfile, isNew: boolean) => void;
}

const defaultForm = {
  profile_code: "",
  profile_name: "",
  profile_type: "company" as const,
  logo_url: "",
  small_logo_url: "",
  stamp_url: "",
  signature_url: "",
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

export function BrandingProfileForm({ open, onOpenChange, profile, onSaved }: Props) {
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
        logo_url: profile.logo_url ?? "",
        small_logo_url: profile.small_logo_url ?? "",
        stamp_url: profile.stamp_url ?? "",
        signature_url: profile.signature_url ?? "",
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

  const field = (key: keyof typeof defaultForm) => ({
    value: String(form[key] ?? ""),
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [key]: e.target.value })),
  });

  const handleSubmit = async () => {
    if (!form.profile_name.trim()) {
      toast.error("Profile name is required");
      return;
    }

    setIsSubmitting(true);
    try {
      let result;
      if (isEditing && profile) {
        result = await updateBrandingProfile({
          id: profile.id,
          ...form,
          logo_url: form.logo_url || null,
          small_logo_url: form.small_logo_url || null,
          stamp_url: form.stamp_url || null,
          signature_url: form.signature_url || null,
          watermark_text: form.watermark_text || null,
          email: form.email || null,
        } as Parameters<typeof updateBrandingProfile>[0]);
      } else {
        if (!form.profile_code.trim()) {
          toast.error("Profile code is required");
          return;
        }
        result = await createBrandingProfile({
          ...form,
          logo_url: form.logo_url || null,
          small_logo_url: form.small_logo_url || null,
          stamp_url: form.stamp_url || null,
          signature_url: form.signature_url || null,
          watermark_text: form.watermark_text || null,
          email: form.email || null,
        } as Parameters<typeof createBrandingProfile>[0]);
      }

      if (!result.success) {
        toast.error(result.error ?? "Save failed");
        return;
      }

      toast.success(isEditing ? "Branding profile updated" : "Branding profile created");
      // Build a partial profile object for the optimistic update
      const saved: ReportBrandingProfile = {
        ...(profile ?? ({} as ReportBrandingProfile)),
        ...form,
        id: isEditing ? profile!.id : (result.data?.id ?? 0),
        logo_url: form.logo_url || null,
        small_logo_url: form.small_logo_url || null,
        stamp_url: form.stamp_url || null,
        signature_url: form.signature_url || null,
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

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-2xl flex flex-col">
        <SheetHeader className="shrink-0">
          <SheetTitle className="flex items-center gap-2">
            <Palette className="h-5 w-5 text-primary" />
            {isEditing ? "Edit Branding Profile" : "New Branding Profile"}
          </SheetTitle>
        </SheetHeader>

        <ScrollArea className="flex-1 min-h-0 -mx-6 px-6">
          <div className="grid grid-cols-2 gap-4 pb-6">
            {/* Basic Info */}
            <div className="col-span-2">
              <Separator className="my-1" />
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mt-2 mb-3">Basic Info</p>
            </div>

            {!isEditing && (
              <div>
                <Label className="text-xs font-medium" htmlFor="profile_code">Code <span className="text-red-500">*</span></Label>
                <Input id="profile_code" className="mt-1 uppercase" placeholder="COMPANY_1_DEFAULT" {...field("profile_code")} />
              </div>
            )}

            <div className={isEditing ? "col-span-2" : ""}>
              <Label className="text-xs font-medium" htmlFor="profile_name">Profile Name <span className="text-red-500">*</span></Label>
              <Input id="profile_name" className="mt-1" placeholder="Company Default" {...field("profile_name")} />
            </div>

            <div>
              <Label className="text-xs font-medium" htmlFor="legal_name_en">Legal Name (EN)</Label>
              <Input id="legal_name_en" className="mt-1" {...field("legal_name_en")} />
            </div>
            <div>
              <Label className="text-xs font-medium" htmlFor="legal_name_ar">Legal Name (AR)</Label>
              <Input id="legal_name_ar" className="mt-1 text-right" dir="rtl" {...field("legal_name_ar")} />
            </div>
            <div>
              <Label className="text-xs font-medium" htmlFor="trade_name_en">Trade Name (EN)</Label>
              <Input id="trade_name_en" className="mt-1" {...field("trade_name_en")} />
            </div>
            <div>
              <Label className="text-xs font-medium" htmlFor="trade_name_ar">Trade Name (AR)</Label>
              <Input id="trade_name_ar" className="mt-1 text-right" dir="rtl" {...field("trade_name_ar")} />
            </div>

            {/* Contact */}
            <div className="col-span-2">
              <Separator className="my-1" />
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mt-2 mb-3">Contact & Address</p>
            </div>
            <div className="col-span-2">
              <Label className="text-xs font-medium" htmlFor="address_block_en">Address (EN)</Label>
              <Input id="address_block_en" className="mt-1" {...field("address_block_en")} />
            </div>
            <div className="col-span-2">
              <Label className="text-xs font-medium" htmlFor="address_block_ar">Address (AR)</Label>
              <Input id="address_block_ar" className="mt-1 text-right" dir="rtl" {...field("address_block_ar")} />
            </div>
            <div>
              <Label className="text-xs font-medium" htmlFor="phone">Phone</Label>
              <Input id="phone" className="mt-1" {...field("phone")} />
            </div>
            <div>
              <Label className="text-xs font-medium" htmlFor="email">Email</Label>
              <Input id="email" type="email" className="mt-1" {...field("email")} />
            </div>
            <div>
              <Label className="text-xs font-medium" htmlFor="website">Website</Label>
              <Input id="website" className="mt-1" {...field("website")} />
            </div>
            <div>
              <Label className="text-xs font-medium" htmlFor="po_box">PO Box</Label>
              <Input id="po_box" className="mt-1" {...field("po_box")} />
            </div>
            <div>
              <Label className="text-xs font-medium" htmlFor="trn">TRN</Label>
              <Input id="trn" className="mt-1" {...field("trn")} />
            </div>
            <div>
              <Label className="text-xs font-medium" htmlFor="trade_license_no">Trade License No.</Label>
              <Input id="trade_license_no" className="mt-1" {...field("trade_license_no")} />
            </div>

            {/* Branding */}
            <div className="col-span-2">
              <Separator className="my-1" />
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mt-2 mb-3">Branding & Theme</p>
            </div>
            <div>
              <Label className="text-xs font-medium" htmlFor="logo_url">Logo URL</Label>
              <Input id="logo_url" className="mt-1" placeholder="https://..." {...field("logo_url")} />
            </div>
            <div>
              <Label className="text-xs font-medium" htmlFor="small_logo_url">Small Logo URL</Label>
              <Input id="small_logo_url" className="mt-1" placeholder="https://..." {...field("small_logo_url")} />
            </div>
            <div>
              <Label className="text-xs font-medium" htmlFor="stamp_url">Stamp URL</Label>
              <Input id="stamp_url" className="mt-1" placeholder="https://..." {...field("stamp_url")} />
            </div>
            <div>
              <Label className="text-xs font-medium" htmlFor="signature_url">Signature URL</Label>
              <Input id="signature_url" className="mt-1" placeholder="https://..." {...field("signature_url")} />
            </div>

            <div className="flex flex-col gap-1">
              <Label className="text-xs font-medium" htmlFor="theme_primary_color">Primary Color</Label>
              <div className="flex items-center gap-2 mt-1">
                <input type="color" id="theme_primary_color" value={form.theme_primary_color} onChange={(e) => setForm((f) => ({ ...f, theme_primary_color: e.target.value }))} className="h-9 w-14 rounded border cursor-pointer" />
                <Input value={form.theme_primary_color} onChange={(e) => setForm((f) => ({ ...f, theme_primary_color: e.target.value }))} className="font-mono text-xs" />
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <Label className="text-xs font-medium" htmlFor="theme_header_bg_color">Header BG Color</Label>
              <div className="flex items-center gap-2 mt-1">
                <input type="color" id="theme_header_bg_color" value={form.theme_header_bg_color} onChange={(e) => setForm((f) => ({ ...f, theme_header_bg_color: e.target.value }))} className="h-9 w-14 rounded border cursor-pointer" />
                <Input value={form.theme_header_bg_color} onChange={(e) => setForm((f) => ({ ...f, theme_header_bg_color: e.target.value }))} className="font-mono text-xs" />
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <Label className="text-xs font-medium" htmlFor="theme_secondary_color">Secondary Color</Label>
              <div className="flex items-center gap-2 mt-1">
                <input type="color" id="theme_secondary_color" value={form.theme_secondary_color} onChange={(e) => setForm((f) => ({ ...f, theme_secondary_color: e.target.value }))} className="h-9 w-14 rounded border cursor-pointer" />
                <Input value={form.theme_secondary_color} onChange={(e) => setForm((f) => ({ ...f, theme_secondary_color: e.target.value }))} className="font-mono text-xs" />
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <Label className="text-xs font-medium" htmlFor="theme_header_text_color">Header Text Color</Label>
              <div className="flex items-center gap-2 mt-1">
                <input type="color" id="theme_header_text_color" value={form.theme_header_text_color} onChange={(e) => setForm((f) => ({ ...f, theme_header_text_color: e.target.value }))} className="h-9 w-14 rounded border cursor-pointer" />
                <Input value={form.theme_header_text_color} onChange={(e) => setForm((f) => ({ ...f, theme_header_text_color: e.target.value }))} className="font-mono text-xs" />
              </div>
            </div>

            {/* Footer & Signatory */}
            <div className="col-span-2">
              <Separator className="my-1" />
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mt-2 mb-3">Footer & Signatory</p>
            </div>
            <div className="col-span-2">
              <Label className="text-xs font-medium" htmlFor="footer_text_en">Footer Text (EN)</Label>
              <Input id="footer_text_en" className="mt-1" placeholder="Confidential — For internal use only" {...field("footer_text_en")} />
            </div>
            <div className="col-span-2">
              <Label className="text-xs font-medium" htmlFor="footer_text_ar">Footer Text (AR)</Label>
              <Input id="footer_text_ar" className="mt-1 text-right" dir="rtl" {...field("footer_text_ar")} />
            </div>
            <div>
              <Label className="text-xs font-medium" htmlFor="signatory_name">Signatory Name</Label>
              <Input id="signatory_name" className="mt-1" {...field("signatory_name")} />
            </div>
            <div>
              <Label className="text-xs font-medium" htmlFor="signatory_title_en">Signatory Title (EN)</Label>
              <Input id="signatory_title_en" className="mt-1" {...field("signatory_title_en")} />
            </div>
            <div>
              <Label className="text-xs font-medium" htmlFor="watermark_text">Watermark Text</Label>
              <Input id="watermark_text" className="mt-1" placeholder="CONFIDENTIAL" {...field("watermark_text")} />
            </div>

            {/* Flags */}
            <div className="col-span-2">
              <Separator className="my-1" />
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mt-2 mb-3">Flags</p>
            </div>
            <div className="flex items-center gap-3">
              <Switch checked={form.is_active} onCheckedChange={(v) => setForm((f) => ({ ...f, is_active: v }))} id="is_active" />
              <Label htmlFor="is_active" className="text-sm cursor-pointer">Active</Label>
            </div>
            <div className="flex items-center gap-3">
              <Switch checked={form.is_default_for_company} onCheckedChange={(v) => setForm((f) => ({ ...f, is_default_for_company: v }))} id="is_default_for_company" />
              <Label htmlFor="is_default_for_company" className="text-sm cursor-pointer">Default for company</Label>
            </div>
            <div className="flex items-center gap-3">
              <Switch checked={form.is_group_profile} onCheckedChange={(v) => setForm((f) => ({ ...f, is_group_profile: v }))} id="is_group_profile" />
              <Label htmlFor="is_group_profile" className="text-sm cursor-pointer">Group profile</Label>
            </div>
            <div className="flex items-center gap-3">
              <Switch checked={form.is_neutral_profile} onCheckedChange={(v) => setForm((f) => ({ ...f, is_neutral_profile: v }))} id="is_neutral_profile" />
              <Label htmlFor="is_neutral_profile" className="text-sm cursor-pointer">Neutral profile</Label>
            </div>
          </div>
        </ScrollArea>

        {/* Footer */}
        <div className="shrink-0 flex justify-end gap-2 pt-4 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {isEditing ? "Save Changes" : "Create Profile"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
