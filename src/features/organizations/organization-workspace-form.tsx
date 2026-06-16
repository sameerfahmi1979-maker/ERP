"use client";

import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import type { OwnerCompany } from "@/types/database";
import { createOrganization, updateOrganization } from "@/server/actions/organizations";
import { RequiredLabel } from "@/components/erp/required-label";
import { useFormDirty } from "@/hooks/use-form-dirty";
import { CountrySelect } from "@/components/erp/geography/country-select";
import { EmirateSelect } from "@/components/erp/geography/emirate-select";
import { CitySelect } from "@/components/erp/geography/city-select";
import { AreaZoneSelect } from "@/components/erp/geography/area-zone-select";
import { CurrencySelect } from "@/components/erp/finance-basics/currency-select";
import { createClient } from "@/lib/supabase/client";
import { Building2, MapPin, ShieldCheck, FileCode2, ScrollText, Briefcase, Files, PlusCircle, Pencil, Trash2 } from "lucide-react";
import type { AuthContext } from "@/lib/rbac/check";
import { useWorkspace } from "@/hooks/use-workspace";
import { useWorkspaceFormDraft } from "@/hooks/use-workspace-form-draft";
import {
  ERPRecordWorkspaceForm,
  ERPRecordSectionPanel,
} from "@/components/workspace/erp-record-workspace-form";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { queryKeys } from "@/lib/query/query-keys";
import { listCompanySignatories, createCompanySignatory, updateCompanySignatory, softDeleteCompanySignatory } from "@/server/actions/common-master-data/owner-company-signatories";
import { DmsEntityDocumentsTab } from "@/features/dms/entity-documents";

type OrganizationWorkspaceFormProps = {
  organization?: OwnerCompany | null;
  mode: "add" | "edit" | "view";
  authContext: AuthContext;
};

const FORM_ID = "organization-workspace-form";

export function OrganizationWorkspaceForm({ organization, mode }: OrganizationWorkspaceFormProps) {
  const { closeTab, activeTab, markDirty } = useWorkspace();

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeSection, setActiveSection] = useState("basic");
  const [countryId, setCountryId] = useState<number | null>(organization?.country_id ?? null);
  const [emirateId, setEmirateId] = useState<number | null>(organization?.emirate_id ?? null);
  const [cityId, setCityId] = useState<number | null>(organization?.city_id ?? null);
  const [areaZoneId, setAreaZoneId] = useState<number | null>(organization?.area_zone_id ?? null);
  const [emirateName, setEmirateName] = useState<string | null>(null);
  const [currencyId, setCurrencyId] = useState<number | null>(null);
  const [currencyCode, setCurrencyCode] = useState<string | null>(null);
  const [currencyLoading, setCurrencyLoading] = useState(false);
  // Extended profile selects
  const [officeEmirateId, setOfficeEmirateId] = useState<number | null>((organization as Record<string, unknown>)?.office_emirate_id as number | null ?? null);
  const [officeCityId, setOfficeCityId] = useState<number | null>((organization as Record<string, unknown>)?.office_city_id as number | null ?? null);
  // Signatories dialog state
  const [signatoryDialog, setSignatoryDialog] = useState<{ open: boolean; editing: Record<string, unknown> | null }>({ open: false, editing: null });
  const [sigSaving, setSigSaving] = useState(false);
  const queryClient = useQueryClient();

  const isEditing = mode === "edit";
  const isViewing = mode === "view";

  const { isDirty, resetDirty } = useFormDirty({ formId: FORM_ID, enabled: !isViewing });

  useEffect(() => {
    if (activeTab?.id) markDirty(activeTab.id, isDirty);
  }, [isDirty, activeTab?.id, markDirty]);

  // â”€â”€ Draft preservation (UI.4E.2) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const { getDraftDefault, syncDraft, writeDraftField, clearDraft } = useWorkspaceFormDraft({
    formId: FORM_ID,
    enabled: !isViewing,
  });

  // Initialize currency
  useEffect(() => {
    async function loadCurrency() {
      const code = organization?.default_currency;
      const supabase = createClient();
      if (code) {
        setCurrencyLoading(true);
        try {
          const { data } = await supabase.from("currencies").select("id, currency_code").eq("currency_code", code).eq("is_active", true).single();
          if (data) { setCurrencyId(data.id); setCurrencyCode(data.currency_code); } else { setCurrencyCode(code); }
        } catch { setCurrencyCode(code); } finally { setCurrencyLoading(false); }
      } else {
        // Default to AED for new orgs
        setCurrencyLoading(true);
        try {
          const { data } = await supabase.from("currencies").select("id, currency_code").eq("currency_code", "AED").eq("is_active", true).single();
          if (data) { setCurrencyId(data.id); setCurrencyCode("AED"); }
        } catch { /* AED not found */ } finally { setCurrencyLoading(false); }
      }
    }
    loadCurrency();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organization?.id]);

  const handleCountryChange = (id: number | null) => { setCountryId(id); setEmirateId(null); setCityId(null); setAreaZoneId(null); writeDraftField("country_id", id ?? ""); writeDraftField("emirate_id", ""); writeDraftField("city_id", ""); writeDraftField("area_zone_id", ""); };

  const handleEmirateChange = async (id: number | null) => {
    setEmirateId(id); setCityId(null); setAreaZoneId(null); writeDraftField("emirate_id", id ?? ""); writeDraftField("city_id", ""); writeDraftField("area_zone_id", "");
    if (!id) { setEmirateName(null); return; }
    try {
      const { data } = await createClient().from("emirates").select("name_en").eq("id", id).single();
      if (data) setEmirateName(data.name_en);
    } catch { /* ignore */ }
  };

  const handleCityChange = (id: number | null) => { setCityId(id); setAreaZoneId(null); writeDraftField("city_id", id ?? ""); writeDraftField("area_zone_id", ""); };

  const handleCurrencyChange = async (id: number | null) => {
    setCurrencyId(id); writeDraftField("currency_id", id ?? "");
    if (!id) { setCurrencyCode(null); return; }
    try {
      const { data } = await createClient().from("currencies").select("currency_code").eq("id", id).single();
      if (data) setCurrencyCode(data.currency_code);
    } catch { /* ignore */ }
  };

  const sections = [
    { id: "basic", label: "Basic Info", icon: Building2 },
    { id: "address", label: "Address & Contact", icon: MapPin },
    { id: "legal", label: "Legal & Licensing", icon: ShieldCheck },
    { id: "tax", label: "Tax & Compliance", icon: FileCode2 },
    { id: "extended", label: "Extended Profile", icon: Briefcase },
    { id: "notes", label: "Internal Notes", icon: ScrollText },
    { id: "signatories", label: "Signatories", icon: Pencil },
    { id: "documents", label: "Documents", icon: Files },
  ];

  const companyId = organization?.id ?? 0;
  const { data: signatories, refetch: refetchSignatories } = useQuery({
    queryKey: queryKeys.commonMd.companySignatories(companyId),
    queryFn: async () => {
      if (!companyId) return [];
      const res = await listCompanySignatories(companyId);
      return res.data ?? [];
    },
    enabled: !!companyId && activeSection === "signatories",
  });

  const handleSaveSignatory = async (formData: FormData) => {
    setSigSaving(true);
    try {
      const full_name = formData.get("full_name") as string;
      const designation = (formData.get("designation") as string) || null;
      const signature_scope = (formData.get("signature_scope") as string) || null;
      const is_primary = formData.get("is_primary") === "on";
      const is_active = formData.get("is_active") !== "off";
      const effective_from = (formData.get("effective_from") as string) || null;
      const effective_to = (formData.get("effective_to") as string) || null;
      const notes = (formData.get("notes") as string) || null;
      if (signatoryDialog.editing) {
        const res = await updateCompanySignatory({ id: Number(signatoryDialog.editing.id), company_id: companyId, full_name, designation, signature_scope, is_primary, is_active, effective_from, effective_to, notes });
        if (!res.success) { toast.error(res.error ?? "Failed to update signatory"); return; }
        toast.success("Signatory updated");
      } else {
        const res = await createCompanySignatory({ company_id: companyId, full_name, designation, signature_scope, is_primary, is_active, effective_from, effective_to, notes });
        if (!res.success) { toast.error(res.error ?? "Failed to add signatory"); return; }
        toast.success("Signatory added");
      }
      setSignatoryDialog({ open: false, editing: null });
      queryClient.invalidateQueries({ queryKey: queryKeys.commonMd.companySignatories(companyId) });
    } finally {
      setSigSaving(false);
    }
  };

  const handleDeleteSignatory = async (id: number) => {
    if (!confirm("Remove this signatory?")) return;
    const res = await softDeleteCompanySignatory(id, companyId);
    if (!res.success) { toast.error(res.error ?? "Failed to remove"); return; }
    toast.success("Signatory removed");
    queryClient.invalidateQueries({ queryKey: queryKeys.commonMd.companySignatories(companyId) });
  };

  const handleRequestClose = () => closeTab(activeTab?.id ?? "");

  const handleSave = async (): Promise<boolean> => {
    if (isViewing) return false;
    setIsSubmitting(true);
    const form = document.getElementById(FORM_ID) as HTMLFormElement;
    const formData = new FormData(form);
    const data = {
      legal_name_en: formData.get("legal_name_en") as string,
      legal_name_ar: (formData.get("legal_name_ar") as string) || null,
      short_name: (formData.get("short_name") as string) || null,
      ...(isEditing ? {} : { company_code: formData.get("company_code") as string }),
      legal_form: (formData.get("legal_form") as string) || null,
      country: isEditing ? (organization?.country ?? null) : null,
      status: (formData.get("status") as "active" | "inactive" | "suspended") || "active",
      default_currency: currencyCode || "AED",
      country_id: countryId,
      emirate_id: emirateId,
      city_id: cityId,
      area_zone_id: areaZoneId,
      emirate: emirateName || (isEditing ? (organization?.emirate ?? null) : null),
      city: isEditing ? (organization?.city ?? null) : null,
      area: isEditing ? (organization?.area ?? null) : null,
      address_line_1: (formData.get("address_line_1") as string) || null,
      address_line_2: (formData.get("address_line_2") as string) || null,
      po_box: (formData.get("po_box") as string) || null,
      makani_number: (formData.get("makani_number") as string) || null,
      primary_email: (formData.get("primary_email") as string) || null,
      primary_phone: (formData.get("primary_phone") as string) || null,
      website: (formData.get("website") as string) || null,
      trade_license_no: (formData.get("trade_license_no") as string) || null,
      trade_license_issue_date: (formData.get("trade_license_issue_date") as string) || null,
      trade_license_expiry_date: (formData.get("trade_license_expiry_date") as string) || null,
      licensing_authority: (formData.get("licensing_authority") as string) || null,
      chamber_membership_no: (formData.get("chamber_membership_no") as string) || null,
      chamber_membership_expiry_date: (formData.get("chamber_membership_expiry_date") as string) || null,
      trn: (formData.get("trn") as string) || null,
      vat_registered: formData.get("vat_registered") === "on",
      corporate_tax_no: (formData.get("corporate_tax_no") as string) || null,
      corporate_tax_registered: formData.get("corporate_tax_registered") === "on",
      icv_certificate_no: (formData.get("icv_certificate_no") as string) || null,
      icv_score: formData.get("icv_score") ? Number(formData.get("icv_score")) : null,
      icv_issue_date: (formData.get("icv_issue_date") as string) || null,
      icv_expiry_date: (formData.get("icv_expiry_date") as string) || null,
      adnoc_supplier_no: (formData.get("adnoc_supplier_no") as string) || null,
      logo_url: (formData.get("logo_url") as string) || null,
      notes: (formData.get("notes") as string) || null,
      trade_name: (formData.get("trade_name") as string) || null,
      main_activity: (formData.get("main_activity") as string) || null,
      established_date: (formData.get("established_date") as string) || null,
      compliance_status: (formData.get("compliance_status") as string) || "compliant",
      office_address_line_1: (formData.get("office_address_line_1") as string) || null,
      office_address_line_2: (formData.get("office_address_line_2") as string) || null,
      office_emirate_id: officeEmirateId,
      office_city_id: officeCityId,
    };
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = isEditing && organization ? await updateOrganization({ ...data, id: organization.id } as any) : await createOrganization({ ...data, company_code: formData.get("company_code") as string });
      if (result.success) { toast.success(isEditing ? "Organization updated" : "Organization created"); clearDraft(); resetDirty(); return true; }
      else { toast.error(result.error ?? "Failed to save organization"); return false; }
    } catch { toast.error("An unexpected error occurred"); return false; }
    finally { setIsSubmitting(false); }
  };

  const handleSaveAndClose = async () => {
    const success = await handleSave();
    if (success) handleRequestClose();
  };

  const disabled = isViewing;

  return (
    <ERPRecordWorkspaceForm
      mode={mode}
      title={isViewing ? "View Organization" : isEditing ? "Edit Organization" : "New Organization"}
      subtitle={organization ? `${organization.legal_name_en} (${organization.company_code})` : "Register a new legal corporate company"}
      recordCode={organization?.company_code}
      sections={sections}
      activeSection={activeSection}
      onSectionChange={setActiveSection}
      isDirty={isDirty}
      onSave={isViewing ? undefined : handleSave}
      onSaveAndClose={isViewing ? undefined : handleSaveAndClose}
      onRequestClose={handleRequestClose}
      isSubmitting={isSubmitting}
    >
      <form id={FORM_ID} onSubmit={(e) => { e.preventDefault(); handleSaveAndClose(); }} onInput={syncDraft} onChange={syncDraft}>
        <ERPRecordSectionPanel id="basic" activeId={activeSection} title="Basic Identification">
          <div className="grid grid-cols-12 gap-4">
            <div className="col-span-6 space-y-1.5">
              <RequiredLabel htmlFor="legal_name_en">Legal Name (English)</RequiredLabel>
              <Input id="legal_name_en" name="legal_name_en" defaultValue={getDraftDefault("legal_name_en", organization?.legal_name_en ?? "")} disabled={disabled} required />
            </div>
            <div className="col-span-6 space-y-1.5">
              <Label htmlFor="legal_name_ar" className="text-muted-foreground text-xs">Legal Name (Arabic)</Label>
              <Input id="legal_name_ar" name="legal_name_ar" defaultValue={getDraftDefault("legal_name_ar", organization?.legal_name_ar ?? "")} disabled={disabled} dir="rtl" />
            </div>
            <div className="col-span-4 space-y-1.5">
              <RequiredLabel htmlFor="company_code">Company Code</RequiredLabel>
              <Input id="company_code" name="company_code" className="uppercase" defaultValue={getDraftDefault("company_code", organization?.company_code ?? "")} disabled={disabled || isEditing} required placeholder="e.g., ALGT, ALS" />
              <span className="text-[9px] text-muted-foreground">Short business code used across the ERP</span>
            </div>
            <div className="col-span-4 space-y-1.5">
              <Label htmlFor="short_name" className="text-muted-foreground text-xs">Short Name</Label>
              <Input id="short_name" name="short_name" defaultValue={getDraftDefault("short_name", organization?.short_name ?? "")} disabled={disabled} />
            </div>
            <div className="col-span-4 space-y-1.5">
              <Label htmlFor="legal_form" className="text-muted-foreground text-xs">Legal Form</Label>
              <Input id="legal_form" name="legal_form" defaultValue={getDraftDefault("legal_form", organization?.legal_form ?? "")} disabled={disabled} placeholder="LLC, FZC, Branch" />
            </div>
            <div className="col-span-6 space-y-1.5">
              <Label className="text-muted-foreground text-xs">Default Currency</Label>
              <CurrencySelect value={currencyId} onValueChange={handleCurrencyChange} placeholder="Select currency..." showCode disabled={disabled || currencyLoading} />
              {organization?.default_currency && !currencyId && !currencyLoading && (
                <p className="text-[9px] text-amber-600">Legacy Currency: {organization.default_currency}</p>
              )}
            </div>
            <div className="col-span-4 space-y-1.5">
              <Label htmlFor="status" className="text-muted-foreground text-xs">Status</Label>
              <select id="status" name="status" defaultValue={getDraftDefault("status", organization?.status || "active")} disabled={disabled} className="flex h-9 w-full rounded-md border border-input bg-background text-foreground px-3 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-40">
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
                <option value="suspended">Suspended</option>
              </select>
            </div>
          </div>
        </ERPRecordSectionPanel>

        <ERPRecordSectionPanel id="address" activeId={activeSection} title="Address & Office Location">
          <div className="grid grid-cols-12 gap-4">
            <div className="col-span-6 space-y-1.5">
              <Label className="text-muted-foreground text-xs">Country</Label>
              <CountrySelect value={countryId} onValueChange={handleCountryChange} placeholder="Select Country" disabled={disabled} />
              {organization?.country && !countryId && <p className="text-[9px] text-amber-600">Legacy Country: {organization.country}</p>}
            </div>
            <div className="col-span-6 space-y-1.5">
              <Label className="text-muted-foreground text-xs">Region / Emirate</Label>
              <EmirateSelect value={emirateId} onValueChange={handleEmirateChange} countryId={countryId} placeholder="Select Region / Emirate" disabled={disabled || !countryId} />
              {organization?.emirate && !emirateId && <p className="text-[9px] text-amber-600">Legacy: {organization.emirate}</p>}
            </div>
            <div className="col-span-6 space-y-1.5">
              <Label className="text-muted-foreground text-xs">City</Label>
              <CitySelect value={cityId} onValueChange={handleCityChange} emirateId={emirateId} placeholder="Select City" disabled={disabled || !emirateId} />
              {organization?.city && !cityId && <p className="text-[9px] text-amber-600">Legacy: {organization.city}</p>}
            </div>
            <div className="col-span-6 space-y-1.5">
              <Label className="text-muted-foreground text-xs">Area / Zone</Label>
                  <AreaZoneSelect value={areaZoneId} onValueChange={(v) => { setAreaZoneId(v); writeDraftField("area_zone_id", v ?? ""); }} cityId={cityId} placeholder="Select Area / Zone" disabled={disabled || !cityId} />
              {organization?.area && !areaZoneId && <p className="text-[9px] text-amber-600">Legacy: {organization.area}</p>}
            </div>
            <div className="col-span-12 space-y-1.5">
              <Label htmlFor="address_line_1" className="text-muted-foreground text-xs">Address Line 1</Label>
              <Input id="address_line_1" name="address_line_1" defaultValue={getDraftDefault("address_line_1", organization?.address_line_1 ?? "")} disabled={disabled} />
            </div>
            <div className="col-span-12 space-y-1.5">
              <Label htmlFor="address_line_2" className="text-muted-foreground text-xs">Address Line 2</Label>
              <Input id="address_line_2" name="address_line_2" defaultValue={getDraftDefault("address_line_2", organization?.address_line_2 ?? "")} disabled={disabled} />
            </div>
            <div className="col-span-6 space-y-1.5">
              <Label htmlFor="po_box" className="text-muted-foreground text-xs">PO Box</Label>
              <Input id="po_box" name="po_box" defaultValue={getDraftDefault("po_box", organization?.po_box ?? "")} disabled={disabled} />
            </div>
            <div className="col-span-6 space-y-1.5">
              <Label htmlFor="makani_number" className="text-muted-foreground text-xs">Makani Number</Label>
              <Input id="makani_number" name="makani_number" defaultValue={getDraftDefault("makani_number", organization?.makani_number ?? "")} placeholder="UAE Makani address" disabled={disabled} />
            </div>
            <div className="col-span-4 space-y-1.5">
              <Label htmlFor="primary_email" className="text-muted-foreground text-xs">Primary Email</Label>
              <Input type="email" id="primary_email" name="primary_email" defaultValue={getDraftDefault("primary_email", organization?.primary_email ?? "")} disabled={disabled} />
            </div>
            <div className="col-span-4 space-y-1.5">
              <Label htmlFor="primary_phone" className="text-muted-foreground text-xs">Primary Phone</Label>
              <Input id="primary_phone" name="primary_phone" defaultValue={getDraftDefault("primary_phone", organization?.primary_phone ?? "")} disabled={disabled} />
            </div>
            <div className="col-span-4 space-y-1.5">
              <Label htmlFor="website" className="text-muted-foreground text-xs">Website</Label>
              <Input type="url" id="website" name="website" defaultValue={getDraftDefault("website", organization?.website ?? "")} placeholder="https://example.com" disabled={disabled} />
            </div>
          </div>
        </ERPRecordSectionPanel>

        <ERPRecordSectionPanel id="legal" activeId={activeSection} title="Trade Registration & Licensing">
          <div className="grid grid-cols-12 gap-4">
            <div className="col-span-6 space-y-1.5">
              <Label htmlFor="trade_license_no" className="text-muted-foreground text-xs">Trade License Number</Label>
              <Input id="trade_license_no" name="trade_license_no" defaultValue={getDraftDefault("trade_license_no", organization?.trade_license_no ?? "")} disabled={disabled} />
            </div>
            <div className="col-span-6 space-y-1.5">
              <Label htmlFor="licensing_authority" className="text-muted-foreground text-xs">Licensing Authority</Label>
              <Input id="licensing_authority" name="licensing_authority" defaultValue={getDraftDefault("licensing_authority", organization?.licensing_authority ?? "")} placeholder="DED, FTZ, etc." disabled={disabled} />
            </div>
            <div className="col-span-6 space-y-1.5">
              <Label htmlFor="trade_license_issue_date" className="text-muted-foreground text-xs">License Issue Date</Label>
              <Input type="date" id="trade_license_issue_date" name="trade_license_issue_date" defaultValue={getDraftDefault("trade_license_issue_date", organization?.trade_license_issue_date ?? "")} disabled={disabled} />
            </div>
            <div className="col-span-6 space-y-1.5">
              <Label htmlFor="trade_license_expiry_date" className="text-muted-foreground text-xs">License Expiry Date</Label>
              <Input type="date" id="trade_license_expiry_date" name="trade_license_expiry_date" defaultValue={getDraftDefault("trade_license_expiry_date", organization?.trade_license_expiry_date ?? "")} disabled={disabled} />
            </div>
            <div className="col-span-6 space-y-1.5">
              <Label htmlFor="chamber_membership_no" className="text-muted-foreground text-xs">Chamber Membership Number</Label>
              <Input id="chamber_membership_no" name="chamber_membership_no" defaultValue={getDraftDefault("chamber_membership_no", organization?.chamber_membership_no ?? "")} disabled={disabled} />
            </div>
            <div className="col-span-6 space-y-1.5">
              <Label htmlFor="chamber_membership_expiry_date" className="text-muted-foreground text-xs">Chamber Expiry Date</Label>
              <Input type="date" id="chamber_membership_expiry_date" name="chamber_membership_expiry_date" defaultValue={getDraftDefault("chamber_membership_expiry_date", organization?.chamber_membership_expiry_date ?? "")} disabled={disabled} />
            </div>
          </div>
        </ERPRecordSectionPanel>

        <ERPRecordSectionPanel id="tax" activeId={activeSection} title="Tax & ICV Compliance">
          <div className="grid grid-cols-12 gap-4">
            <div className="col-span-6 space-y-1.5">
              <Label htmlFor="trn" className="text-muted-foreground text-xs">Tax Registration Number (TRN)</Label>
              <Input id="trn" name="trn" defaultValue={getDraftDefault("trn", organization?.trn ?? "")} disabled={disabled} />
            </div>
            <div className="col-span-6 flex items-center space-x-2 pt-6">
              <Checkbox id="vat_registered" name="vat_registered" defaultChecked={organization?.vat_registered ?? true} disabled={disabled} />
              <Label htmlFor="vat_registered" className="cursor-pointer text-muted-foreground text-xs font-normal">VAT Registered</Label>
            </div>
            <div className="col-span-6 space-y-1.5">
              <Label htmlFor="corporate_tax_no" className="text-muted-foreground text-xs">Corporate Tax Number</Label>
              <Input id="corporate_tax_no" name="corporate_tax_no" defaultValue={getDraftDefault("corporate_tax_no", organization?.corporate_tax_no ?? "")} disabled={disabled} />
            </div>
            <div className="col-span-6 flex items-center space-x-2 pt-6">
              <Checkbox id="corporate_tax_registered" name="corporate_tax_registered" defaultChecked={organization?.corporate_tax_registered ?? false} disabled={disabled} />
              <Label htmlFor="corporate_tax_registered" className="cursor-pointer text-muted-foreground text-xs font-normal">Corporate Tax Registered</Label>
            </div>
            <div className="col-span-6 space-y-1.5">
              <Label htmlFor="icv_certificate_no" className="text-muted-foreground text-xs">ICV Certificate Number</Label>
              <Input id="icv_certificate_no" name="icv_certificate_no" defaultValue={getDraftDefault("icv_certificate_no", organization?.icv_certificate_no ?? "")} placeholder="In-Country Value certificate" disabled={disabled} />
            </div>
            <div className="col-span-6 space-y-1.5">
              <Label htmlFor="icv_score" className="text-muted-foreground text-xs">ICV Score (0-100)</Label>
              <Input type="number" id="icv_score" name="icv_score" min="0" max="100" step="0.01" defaultValue={getDraftDefault("icv_score", organization?.icv_score ?? "")} disabled={disabled} />
            </div>
            <div className="col-span-6 space-y-1.5">
              <Label htmlFor="icv_issue_date" className="text-muted-foreground text-xs">ICV Issue Date</Label>
              <Input type="date" id="icv_issue_date" name="icv_issue_date" defaultValue={getDraftDefault("icv_issue_date", organization?.icv_issue_date ?? "")} disabled={disabled} />
            </div>
            <div className="col-span-6 space-y-1.5">
              <Label htmlFor="icv_expiry_date" className="text-muted-foreground text-xs">ICV Expiry Date</Label>
              <Input type="date" id="icv_expiry_date" name="icv_expiry_date" defaultValue={getDraftDefault("icv_expiry_date", organization?.icv_expiry_date ?? "")} disabled={disabled} />
            </div>
            <div className="col-span-12 space-y-1.5">
              <Label htmlFor="adnoc_supplier_no" className="text-muted-foreground text-xs">ADNOC Supplier Number</Label>
              <Input id="adnoc_supplier_no" name="adnoc_supplier_no" defaultValue={getDraftDefault("adnoc_supplier_no", organization?.adnoc_supplier_no ?? "")} placeholder="ADNOC supplier registration number" disabled={disabled} />
            </div>
          </div>
        </ERPRecordSectionPanel>

        <ERPRecordSectionPanel id="extended" activeId={activeSection} title="Extended Business Profile">
          <div className="grid grid-cols-12 gap-4">
            <div className="col-span-6 space-y-1.5">
              <Label htmlFor="trade_name" className="text-muted-foreground text-xs">Trade Name</Label>
              <Input id="trade_name" name="trade_name" defaultValue={getDraftDefault("trade_name", ((organization as Record<string, unknown>)?.trade_name as string) ?? "")} disabled={disabled} placeholder="Common trading name" />
            </div>
            <div className="col-span-6 space-y-1.5">
              <Label htmlFor="main_activity" className="text-muted-foreground text-xs">Main Business Activity</Label>
              <Input id="main_activity" name="main_activity" defaultValue={getDraftDefault("main_activity", ((organization as Record<string, unknown>)?.main_activity as string) ?? "")} disabled={disabled} placeholder="e.g., General Contracting" />
            </div>
            <div className="col-span-6 space-y-1.5">
              <Label htmlFor="established_date" className="text-muted-foreground text-xs">Established Date</Label>
              <Input type="date" id="established_date" name="established_date" defaultValue={getDraftDefault("established_date", ((organization as Record<string, unknown>)?.established_date as string) ?? "")} disabled={disabled} />
            </div>
            <div className="col-span-6 space-y-1.5">
              <Label htmlFor="compliance_status" className="text-muted-foreground text-xs">Compliance Status</Label>
              <select id="compliance_status" name="compliance_status" defaultValue={getDraftDefault("compliance_status", ((organization as Record<string, unknown>)?.compliance_status as string) ?? "compliant")} disabled={disabled} className="flex h-9 w-full rounded-md border border-input bg-background text-foreground px-3 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-40">
                <option value="compliant">Compliant</option>
                <option value="non_compliant">Non-Compliant</option>
                <option value="under_review">Under Review</option>
                <option value="suspended">Suspended</option>
              </select>
            </div>
            <div className="col-span-12 border-t pt-3">
              <p className="text-xs font-medium text-muted-foreground mb-3">Office Address</p>
            </div>
            <div className="col-span-6 space-y-1.5">
              <Label className="text-muted-foreground text-xs">Office Emirate</Label>
              <EmirateSelect value={officeEmirateId} onValueChange={(v) => { setOfficeEmirateId(v); setOfficeCityId(null); writeDraftField("office_emirate_id", v ?? ""); }} placeholder="Select Emirate" disabled={disabled} />
            </div>
            <div className="col-span-6 space-y-1.5">
              <Label className="text-muted-foreground text-xs">Office City</Label>
              <CitySelect value={officeCityId} onValueChange={(v) => { setOfficeCityId(v); writeDraftField("office_city_id", v ?? ""); }} emirateId={officeEmirateId} placeholder="Select City" disabled={disabled || !officeEmirateId} />
            </div>
            <div className="col-span-12 space-y-1.5">
              <Label htmlFor="office_address_line_1" className="text-muted-foreground text-xs">Office Address Line 1</Label>
              <Input id="office_address_line_1" name="office_address_line_1" defaultValue={getDraftDefault("office_address_line_1", ((organization as Record<string, unknown>)?.office_address_line_1 as string) ?? "")} disabled={disabled} />
            </div>
            <div className="col-span-12 space-y-1.5">
              <Label htmlFor="office_address_line_2" className="text-muted-foreground text-xs">Office Address Line 2</Label>
              <Input id="office_address_line_2" name="office_address_line_2" defaultValue={getDraftDefault("office_address_line_2", ((organization as Record<string, unknown>)?.office_address_line_2 as string) ?? "")} disabled={disabled} />
            </div>
          </div>
        </ERPRecordSectionPanel>

        <ERPRecordSectionPanel id="notes" activeId={activeSection} title="Notes & Corporate Logo">
          <div className="grid grid-cols-12 gap-4">
            <div className="col-span-12 space-y-1.5">
              <Label htmlFor="logo_url" className="text-muted-foreground text-xs">Logo URL</Label>
              <Input type="url" id="logo_url" name="logo_url" defaultValue={getDraftDefault("logo_url", organization?.logo_url ?? "")} placeholder="https://example.com/logo.png" disabled={disabled} />
            </div>
            <div className="col-span-12 space-y-1.5">
              <Label htmlFor="notes" className="text-muted-foreground text-xs">Notes</Label>
              <Textarea id="notes" name="notes" defaultValue={getDraftDefault("notes", organization?.notes ?? "")} rows={6} placeholder="Internal notes about this organization..." disabled={disabled} />
            </div>
          </div>
        </ERPRecordSectionPanel>
      </form>

      {/* Signatories — child records, managed independently of main form */}
      <ERPRecordSectionPanel id="signatories" activeId={activeSection} title="Authorized Signatories">
        {!companyId ? (
          <p className="text-sm text-muted-foreground">Save the organization first to manage signatories.</p>
        ) : (
          <div className="space-y-3">
            {!disabled && (
              <div className="flex justify-end">
                <Button size="sm" variant="outline" onClick={() => setSignatoryDialog({ open: true, editing: null })}>
                  <PlusCircle className="h-4 w-4 mr-1" /> Add Signatory
                </Button>
              </div>
            )}
            {(signatories ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">No signatories added yet.</p>
            ) : (
              <div className="divide-y border rounded-md">
                {(signatories ?? []).map((s) => (
                  <div key={s.id} className="flex items-center justify-between px-4 py-3">
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2 text-sm font-medium">
                        {s.full_name}
                        {s.is_primary && <Badge variant="secondary" className="text-[10px]">Primary</Badge>}
                        {!s.is_active && <Badge variant="destructive" className="text-[10px]">Inactive</Badge>}
                      </div>
                      {s.designation && <p className="text-xs text-muted-foreground">{s.designation}</p>}
                      {s.signature_scope && <p className="text-xs text-muted-foreground">{s.signature_scope}</p>}
                    </div>
                    {!disabled && (
                      <div className="flex gap-1">
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setSignatoryDialog({ open: true, editing: s as unknown as Record<string, unknown> })}><Pencil className="h-3.5 w-3.5" /></Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => handleDeleteSignatory(s.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        {signatoryDialog.open && (
          <form onSubmit={async (e) => { e.preventDefault(); await handleSaveSignatory(new FormData(e.currentTarget)); }} className="mt-4 border rounded-md p-4 space-y-3 bg-muted/30">
            <p className="text-sm font-medium">{signatoryDialog.editing ? "Edit Signatory" : "Add Signatory"}</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="sig_full_name" className="text-xs">Full Name *</Label>
                <Input id="sig_full_name" name="full_name" defaultValue={(signatoryDialog.editing?.full_name as string) ?? ""} required />
              </div>
              <div className="space-y-1">
                <Label htmlFor="sig_designation" className="text-xs">Designation</Label>
                <Input id="sig_designation" name="designation" defaultValue={(signatoryDialog.editing?.designation as string) ?? ""} />
              </div>
              <div className="col-span-2 space-y-1">
                <Label htmlFor="sig_scope" className="text-xs">Signature Scope</Label>
                <Input id="sig_scope" name="signature_scope" defaultValue={(signatoryDialog.editing?.signature_scope as string) ?? ""} placeholder="e.g., Financial documents up to AED 500K" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="sig_from" className="text-xs">Effective From</Label>
                <Input type="date" id="sig_from" name="effective_from" defaultValue={(signatoryDialog.editing?.effective_from as string) ?? ""} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="sig_to" className="text-xs">Effective To</Label>
                <Input type="date" id="sig_to" name="effective_to" defaultValue={(signatoryDialog.editing?.effective_to as string) ?? ""} />
              </div>
              <div className="flex items-center gap-2 pt-2">
                <Checkbox id="sig_primary" name="is_primary" defaultChecked={(signatoryDialog.editing?.is_primary as boolean) ?? false} />
                <Label htmlFor="sig_primary" className="text-xs cursor-pointer">Primary Signatory</Label>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" size="sm" variant="ghost" onClick={() => setSignatoryDialog({ open: false, editing: null })}>Cancel</Button>
              <Button type="submit" size="sm" disabled={sigSaving}>{sigSaving ? "Saving..." : "Save"}</Button>
            </div>
          </form>
        )}
      </ERPRecordSectionPanel>

      {/* DMS Documents tab — entityType: company */}
      <ERPRecordSectionPanel id="documents" activeId={activeSection} title="Documents">
        {!companyId ? (
          <p className="text-sm text-muted-foreground">Save the organization first to manage documents.</p>
        ) : (
          <DmsEntityDocumentsTab
            entityType="company"
            entityId={companyId}
            entityLabel="Organization"
            canUpload={!disabled}
            canLinkExisting={!disabled}
            canUnlink={!disabled}
            showComplianceCards
          />
        )}
      </ERPRecordSectionPanel>
    </ERPRecordWorkspaceForm>
  );
}
