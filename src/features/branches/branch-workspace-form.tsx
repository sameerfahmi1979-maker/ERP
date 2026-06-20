"use client";

import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import type { BranchWithCompany, OwnerCompany } from "@/types/database";
import { createBranch, updateBranch } from "@/server/actions/branches";
import { RequiredLabel } from "@/components/erp/required-label";
import { useFormDirty } from "@/hooks/use-form-dirty";
import { CountrySelect } from "@/components/erp/geography/country-select";
import { EmirateSelect } from "@/components/erp/geography/emirate-select";
import { CitySelect } from "@/components/erp/geography/city-select";
import { AreaZoneSelect } from "@/components/erp/geography/area-zone-select";
import { Building2, MapPin, Contact, Wrench, ScrollText, Files } from "lucide-react";
import type { AuthContext } from "@/lib/rbac/check";
import { useWorkspace } from "@/hooks/use-workspace";
import { useWorkspaceFormDraft } from "@/hooks/use-workspace-form-draft";
import {
  ERPRecordWorkspaceForm,
  ERPRecordSectionPanel,
} from "@/components/workspace/erp-record-workspace-form";
import { DmsEntityDocumentsTab } from "@/features/dms/entity-documents";

type BranchWorkspaceFormProps = {
  branch?: BranchWithCompany | null;
  companies?: OwnerCompany[];
  mode: "add" | "edit" | "view";
  authContext: AuthContext;
};

const FORM_ID = "branch-workspace-form";

export function BranchWorkspaceForm({ branch, companies = [], mode }: BranchWorkspaceFormProps) {
  const { closeTab, activeTab, markDirty, forceCloseActiveTab } = useWorkspace();

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeSection, setActiveSection] = useState("basic");
  const [countryId, setCountryId] = useState<number | null>(null);
  const [emirateId, setEmirateId] = useState<number | null>(null);
  const [cityId, setCityId] = useState<number | null>(null);
  const [areaZoneId, setAreaZoneId] = useState<number | null>(null);

  const isEditing = mode === "edit";
  const isViewing = mode === "view";

  const { isDirty, resetDirty } = useFormDirty({ formId: FORM_ID, enabled: !isViewing });

  useEffect(() => {
    if (activeTab?.id) markDirty(activeTab.id, isDirty);
  }, [isDirty, activeTab?.id, markDirty]);

  // ── Draft preservation (UI.4E.2) ──────────────────────────────────────────
  const { getDraftDefault, syncDraft, writeDraftField, clearDraft } = useWorkspaceFormDraft({
    formId: FORM_ID,
    enabled: !isViewing,
  });

  // Initialize geography selects from legacy text fields when editing
  useEffect(() => {
    if (!branch) {
      setCountryId(null); setEmirateId(null); setCityId(null); setAreaZoneId(null);
      return;
    }
    async function initGeography() {
      const supabase = createClient();
      let resolvedCountryId: number | null = null;
      let resolvedEmirateId: number | null = null;
      let resolvedCityId: number | null = null;
      let resolvedAreaZoneId: number | null = null;

      if (branch!.emirate) {
        const { data: emirates } = await supabase.from("emirates").select("id, country_id, name_en, emirate_code").eq("is_active", true);
        const match = emirates?.find(e => e.name_en.toLowerCase() === branch!.emirate!.trim().toLowerCase() || e.emirate_code.toLowerCase() === branch!.emirate!.trim().toLowerCase());
        if (match) { resolvedEmirateId = match.id; resolvedCountryId = match.country_id; }
      }
      if (branch!.city) {
        let q = supabase.from("cities").select("id, emirate_id, country_id, name_en, city_code").eq("is_active", true);
        if (resolvedEmirateId) q = q.eq("emirate_id", resolvedEmirateId);
        const { data: cities } = await q;
        const match = cities?.find(c => c.name_en.toLowerCase() === branch!.city!.trim().toLowerCase() || c.city_code.toLowerCase() === branch!.city!.trim().toLowerCase());
        if (match) { resolvedCityId = match.id; if (!resolvedEmirateId) resolvedEmirateId = match.emirate_id; if (!resolvedCountryId) resolvedCountryId = match.country_id; }
      }
      if (branch!.area) {
        let q = supabase.from("areas_zones").select("id, city_id, name_en, area_code").eq("is_active", true);
        if (resolvedCityId) q = q.eq("city_id", resolvedCityId);
        const { data: areas } = await q;
        const match = areas?.find(a => a.name_en.toLowerCase() === branch!.area!.trim().toLowerCase() || a.area_code.toLowerCase() === branch!.area!.trim().toLowerCase());
        if (match) { resolvedAreaZoneId = match.id; if (!resolvedCityId) resolvedCityId = match.city_id; }
      }

      setCountryId(resolvedCountryId); setEmirateId(resolvedEmirateId); setCityId(resolvedCityId); setAreaZoneId(resolvedAreaZoneId);
    }
    initGeography();
  }, [branch]);

  const handleCountryChange = (id: number | null) => { setCountryId(id); setEmirateId(null); setCityId(null); setAreaZoneId(null); writeDraftField("country_id", id ?? ""); writeDraftField("emirate_id", ""); writeDraftField("city_id", ""); writeDraftField("area_zone_id", ""); };
  const handleEmirateChange = (id: number | null) => { setEmirateId(id); setCityId(null); setAreaZoneId(null); writeDraftField("emirate_id", id ?? ""); writeDraftField("city_id", ""); writeDraftField("area_zone_id", ""); };
  const handleCityChange = (id: number | null) => { setCityId(id); setAreaZoneId(null); writeDraftField("city_id", id ?? ""); writeDraftField("area_zone_id", ""); };

  async function resolveGeographyText() {
    const supabase = createClient();
    let emirateText = branch?.emirate ?? null;
    let cityText = branch?.city ?? null;
    let areaText = branch?.area ?? null;
    if (emirateId) { const { data } = await supabase.from("emirates").select("name_en").eq("id", emirateId).maybeSingle(); if (data) emirateText = data.name_en; }
    if (cityId) { const { data } = await supabase.from("cities").select("name_en").eq("id", cityId).maybeSingle(); if (data) cityText = data.name_en; }
    if (areaZoneId) { const { data } = await supabase.from("areas_zones").select("name_en").eq("id", areaZoneId).maybeSingle(); if (data) areaText = data.name_en; }
    return { emirateText, cityText, areaText };
  }

  const sections = [
    { id: "basic", label: "Basic Info", icon: Building2 },
    { id: "location", label: "Location", icon: MapPin },
    { id: "contact", label: "Contact Details", icon: Contact },
    { id: "operations", label: "Operations Flags", icon: Wrench },
    { id: "notes", label: "Internal Notes", icon: ScrollText },
    { id: "documents", label: "Documents", icon: Files },
  ];

  const handleRequestClose = () => closeTab(activeTab?.id ?? "");

  const handleSave = async (): Promise<boolean> => {
    if (isViewing) return false;
    setIsSubmitting(true);
    const form = document.getElementById(FORM_ID) as HTMLFormElement;
    const formData = new FormData(form);
    const { emirateText, cityText, areaText } = await resolveGeographyText();
    const data = {
      owner_company_id: parseInt(formData.get("owner_company_id") as string),
      ...(isEditing ? {} : { branch_code: formData.get("branch_code") as string }),
      branch_name_en: formData.get("branch_name_en") as string,
      branch_name_ar: (formData.get("branch_name_ar") as string) || null,
      status: (formData.get("status") as "active" | "inactive" | "suspended") || "active",
      branch_type: (formData.get("branch_type") as string) || null,
      is_main_branch: formData.get("is_main_branch") === "on",
      operating_status: (formData.get("operating_status") as "active" | "maintenance" | "suspended" | "closed") || "active",
      emirate: emirateText,
      city: cityText,
      area: areaText,
      address_line_1: (formData.get("address_line_1") as string) || null,
      address_line_2: (formData.get("address_line_2") as string) || null,
      po_box: (formData.get("po_box") as string) || null,
      makani_number: (formData.get("makani_number") as string) || null,
      latitude: formData.get("latitude") ? Number(formData.get("latitude")) : null,
      longitude: formData.get("longitude") ? Number(formData.get("longitude")) : null,
      phone: (formData.get("phone") as string) || null,
      email: (formData.get("email") as string) || null,
      contact_person_name: (formData.get("contact_person_name") as string) || null,
      contact_phone: (formData.get("contact_phone") as string) || null,
      contact_email: (formData.get("contact_email") as string) || null,
      has_workshop: formData.get("has_workshop") === "on",
      has_warehouse: formData.get("has_warehouse") === "on",
      has_yard: formData.get("has_yard") === "on",
      has_weighbridge: formData.get("has_weighbridge") === "on",
      notes: (formData.get("notes") as string) || null,
      opening_date: (formData.get("opening_date") as string) || null,
      closing_date: (formData.get("closing_date") as string) || null,
      legal_branch_name: (formData.get("legal_branch_name") as string) || null,
      trade_license_branch_ref: (formData.get("trade_license_branch_ref") as string) || null,
    };
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = isEditing && branch ? await updateBranch({ ...data, id: branch.id } as any) : await createBranch({ ...data, branch_code: formData.get("branch_code") as string });
      if (result.success) { toast.success(isEditing ? "Branch updated" : "Branch created"); clearDraft(); resetDirty(); if (activeTab?.id) markDirty(activeTab.id, false); return true; }
      else { toast.error(result.error ?? "Failed to save branch"); return false; }
    } catch { toast.error("An unexpected error occurred"); return false; }
    finally { setIsSubmitting(false); }
  };

  const handleSaveAndClose = async () => {
    const success = await handleSave();
    if (success) forceCloseActiveTab();
  };

  return (
    <ERPRecordWorkspaceForm
      mode={mode}
      title={isViewing ? "View Branch" : isEditing ? "Edit Branch" : "New Branch"}
      subtitle={branch ? `${branch.branch_name_en} (${branch.branch_code})` : "Register a new company physical office or operations yard"}
      recordCode={branch?.branch_code}
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
        <ERPRecordSectionPanel id="basic" activeId={activeSection} title="Basic Branch Details">
          <div className="grid grid-cols-12 gap-4">
            <div className="col-span-6 space-y-1.5">
              <RequiredLabel htmlFor="owner_company_id">Owner Organization</RequiredLabel>
              <select id="owner_company_id" name="owner_company_id" defaultValue={getDraftDefault("owner_company_id", branch?.owner_company_id ?? "")} required disabled={isViewing} className="flex h-9 w-full rounded-md border border-input bg-background text-foreground px-3 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-40">
                <option value="">Select organization...</option>
                {companies.map(c => <option key={c.id} value={c.id}>{c.legal_name_en} ({c.company_code})</option>)}
              </select>
            </div>
            <div className="col-span-6 space-y-1.5">
              <RequiredLabel htmlFor="branch_code">Branch Code</RequiredLabel>
              <Input id="branch_code" name="branch_code" className="uppercase" defaultValue={getDraftDefault("branch_code", branch?.branch_code ?? "")} disabled={isViewing || isEditing} required placeholder="e.g., AUH, DXB, SHJ, ICAD" />
              <span className="text-[9px] text-muted-foreground">Short location/facility code used across the ERP</span>
            </div>
            <div className="col-span-6 space-y-1.5">
              <RequiredLabel htmlFor="branch_name_en">Branch Name (English)</RequiredLabel>
              <Input id="branch_name_en" name="branch_name_en" defaultValue={getDraftDefault("branch_name_en", branch?.branch_name_en ?? "")} disabled={isViewing} required />
            </div>
            <div className="col-span-6 space-y-1.5">
              <Label htmlFor="branch_name_ar" className="text-muted-foreground text-xs">Branch Name (Arabic)</Label>
              <Input id="branch_name_ar" name="branch_name_ar" defaultValue={getDraftDefault("branch_name_ar", branch?.branch_name_ar ?? "")} disabled={isViewing} dir="rtl" />
            </div>
            <div className="col-span-4 space-y-1.5">
              <Label htmlFor="branch_type" className="text-muted-foreground text-xs">Branch Type</Label>
              <select id="branch_type" name="branch_type" defaultValue={getDraftDefault("branch_type", branch?.branch_type ?? "")} disabled={isViewing} className="flex h-9 w-full rounded-md border border-input bg-background text-foreground px-3 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-40">
                <option value="">Select Type</option>
                <option value="Head Office">Head Office</option>
                <option value="Branch Office">Branch Office</option>
                <option value="Yard">Yard</option>
                <option value="Workshop">Workshop</option>
                <option value="Warehouse">Warehouse</option>
                <option value="Camp">Camp</option>
                <option value="Project Site">Project Site</option>
                <option value="Weighbridge">Weighbridge</option>
                <option value="Other">Other</option>
              </select>
            </div>
            <div className="col-span-4 space-y-1.5">
              <Label htmlFor="status" className="text-muted-foreground text-xs">Status</Label>
              <select id="status" name="status" defaultValue={getDraftDefault("status", branch?.status || "active")} disabled={isViewing} className="flex h-9 w-full rounded-md border border-input bg-background text-foreground px-3 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-40">
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
                <option value="suspended">Suspended</option>
              </select>
            </div>
            <div className="col-span-4 space-y-1.5">
              <Label htmlFor="operating_status" className="text-muted-foreground text-xs">Operating Status</Label>
              <select id="operating_status" name="operating_status" defaultValue={getDraftDefault("operating_status", branch?.operating_status || "active")} disabled={isViewing} className="flex h-9 w-full rounded-md border border-input bg-background text-foreground px-3 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-40">
                <option value="active">Active</option>
                <option value="maintenance">Maintenance</option>
                <option value="suspended">Suspended</option>
                <option value="closed">Closed</option>
              </select>
            </div>
            <div className="col-span-12 flex items-center space-x-2 pt-2">
              <Checkbox id="is_main_branch" name="is_main_branch" defaultChecked={branch?.is_main_branch ?? false} disabled={isViewing} />
              <Label htmlFor="is_main_branch" className="cursor-pointer text-muted-foreground text-xs font-normal">Main Branch (Head Office)</Label>
            </div>
          </div>
        </ERPRecordSectionPanel>

        <ERPRecordSectionPanel id="location" activeId={activeSection} title="Geographic Office Location">
          <div className="grid grid-cols-12 gap-4">
            <div className="col-span-6 space-y-1.5">
              <Label className="text-muted-foreground text-xs">Country</Label>
              <CountrySelect value={countryId} onValueChange={handleCountryChange} placeholder="Select Country" disabled={isViewing} />
            </div>
            <div className="col-span-6 space-y-1.5">
              <Label className="text-muted-foreground text-xs">Region / Emirate</Label>
              <EmirateSelect value={emirateId} onValueChange={handleEmirateChange} countryId={countryId} placeholder="Select Region / Emirate" disabled={isViewing || !countryId} />
              {branch?.emirate && !emirateId && <p className="text-[9px] text-amber-600">{branch.emirate} (legacy)</p>}
            </div>
            <div className="col-span-6 space-y-1.5">
              <Label className="text-muted-foreground text-xs">City</Label>
              <CitySelect value={cityId} onValueChange={handleCityChange} emirateId={emirateId} placeholder="Select City" disabled={isViewing || !emirateId} />
              {branch?.city && !cityId && <p className="text-[9px] text-amber-600">{branch.city} (legacy)</p>}
            </div>
            <div className="col-span-6 space-y-1.5">
              <Label className="text-muted-foreground text-xs">Area / Zone</Label>
              <AreaZoneSelect value={areaZoneId} onValueChange={(v) => { setAreaZoneId(v); writeDraftField("area_zone_id", v ?? ""); }} cityId={cityId} placeholder="Select Area / Zone" disabled={isViewing || !cityId} />
              {branch?.area && !areaZoneId && <p className="text-[9px] text-amber-600">{branch.area} (legacy)</p>}
            </div>
            <div className="col-span-6 space-y-1.5">
              <Label htmlFor="po_box" className="text-muted-foreground text-xs">PO Box</Label>
              <Input id="po_box" name="po_box" defaultValue={getDraftDefault("po_box", branch?.po_box ?? "")} disabled={isViewing} />
            </div>
            <div className="col-span-12 space-y-1.5">
              <Label htmlFor="address_line_1" className="text-muted-foreground text-xs">Address Line 1</Label>
              <Input id="address_line_1" name="address_line_1" defaultValue={getDraftDefault("address_line_1", branch?.address_line_1 ?? "")} disabled={isViewing} />
            </div>
            <div className="col-span-12 space-y-1.5">
              <Label htmlFor="address_line_2" className="text-muted-foreground text-xs">Address Line 2</Label>
              <Input id="address_line_2" name="address_line_2" defaultValue={getDraftDefault("address_line_2", branch?.address_line_2 ?? "")} disabled={isViewing} />
            </div>
            <div className="col-span-4 space-y-1.5">
              <Label htmlFor="makani_number" className="text-muted-foreground text-xs">Makani Number</Label>
              <Input id="makani_number" name="makani_number" defaultValue={getDraftDefault("makani_number", branch?.makani_number ?? "")} placeholder="UAE Makani address" disabled={isViewing} />
            </div>
            <div className="col-span-4 space-y-1.5">
              <Label htmlFor="latitude" className="text-muted-foreground text-xs">Latitude</Label>
              <Input type="number" id="latitude" name="latitude" step="0.0000001" min="-90" max="90" defaultValue={getDraftDefault("latitude", branch?.latitude ?? "")} placeholder="25.276987" disabled={isViewing} />
            </div>
            <div className="col-span-4 space-y-1.5">
              <Label htmlFor="longitude" className="text-muted-foreground text-xs">Longitude</Label>
              <Input type="number" id="longitude" name="longitude" step="0.0000001" min="-180" max="180" defaultValue={getDraftDefault("longitude", branch?.longitude ?? "")} placeholder="55.296249" disabled={isViewing} />
            </div>
          </div>
        </ERPRecordSectionPanel>

        <ERPRecordSectionPanel id="contact" activeId={activeSection} title="Branch Contacts & Representative">
          <div className="grid grid-cols-12 gap-4">
            <div className="col-span-6 space-y-1.5">
              <Label htmlFor="phone" className="text-muted-foreground text-xs">Branch Phone</Label>
              <Input id="phone" name="phone" defaultValue={getDraftDefault("phone", branch?.phone ?? "")} disabled={isViewing} />
            </div>
            <div className="col-span-6 space-y-1.5">
              <Label htmlFor="email" className="text-muted-foreground text-xs">Branch Email</Label>
              <Input type="email" id="email" name="email" defaultValue={getDraftDefault("email", branch?.email ?? "")} disabled={isViewing} />
            </div>
            <div className="col-span-6 space-y-1.5">
              <Label htmlFor="contact_person_name" className="text-muted-foreground text-xs">Contact Person Name</Label>
              <Input id="contact_person_name" name="contact_person_name" defaultValue={getDraftDefault("contact_person_name", branch?.contact_person_name ?? "")} disabled={isViewing} />
            </div>
            <div className="col-span-6 space-y-1.5">
              <Label htmlFor="contact_phone" className="text-muted-foreground text-xs">Contact Person Phone</Label>
              <Input id="contact_phone" name="contact_phone" defaultValue={getDraftDefault("contact_phone", branch?.contact_phone ?? "")} disabled={isViewing} />
            </div>
            <div className="col-span-12 space-y-1.5">
              <Label htmlFor="contact_email" className="text-muted-foreground text-xs">Contact Person Email</Label>
              <Input type="email" id="contact_email" name="contact_email" defaultValue={getDraftDefault("contact_email", branch?.contact_email ?? "")} disabled={isViewing} />
            </div>
          </div>
        </ERPRecordSectionPanel>

        <ERPRecordSectionPanel id="operations" activeId={activeSection} title="Operational Capabilities">
          <div className="space-y-4">
            <p className="text-xs text-muted-foreground">Select the operational units and features active at this physical branch:</p>
            <div className="flex flex-col space-y-3 pt-2">
              {[
                { id: "has_workshop", label: "Has Workshop (Vehicle/Equipment Service Center)", checked: branch?.has_workshop ?? false },
                { id: "has_warehouse", label: "Has Warehouse (Inventory Storage)", checked: branch?.has_warehouse ?? false },
                { id: "has_yard", label: "Has Yard (Vehicle/Equipment Parking & Staging)", checked: branch?.has_yard ?? false },
                { id: "has_weighbridge", label: "Has Weighbridge (Cargo/Truck Scale)", checked: branch?.has_weighbridge ?? false },
              ].map(({ id, label, checked }) => (
                <div key={id} className="flex items-center space-x-2.5">
                  <Checkbox id={id} name={id} defaultChecked={checked} disabled={isViewing} />
                  <Label htmlFor={id} className="cursor-pointer text-muted-foreground text-xs font-normal">{label}</Label>
                </div>
              ))}
            </div>
          </div>
        </ERPRecordSectionPanel>

        <ERPRecordSectionPanel id="notes" activeId={activeSection} title="Branch Internal Notes">
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="legal_branch_name" className="text-muted-foreground text-xs">Legal Branch Name</Label>
                <Input id="legal_branch_name" name="legal_branch_name" defaultValue={getDraftDefault("legal_branch_name", ((branch as Record<string, unknown>)?.legal_branch_name as string) ?? "")} disabled={isViewing} placeholder="Official legal name" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="trade_license_branch_ref" className="text-muted-foreground text-xs">Trade License Branch Ref</Label>
                <Input id="trade_license_branch_ref" name="trade_license_branch_ref" defaultValue={getDraftDefault("trade_license_branch_ref", ((branch as Record<string, unknown>)?.trade_license_branch_ref as string) ?? "")} disabled={isViewing} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="opening_date" className="text-muted-foreground text-xs">Opening Date</Label>
                <Input type="date" id="opening_date" name="opening_date" defaultValue={getDraftDefault("opening_date", ((branch as Record<string, unknown>)?.opening_date as string) ?? "")} disabled={isViewing} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="closing_date" className="text-muted-foreground text-xs">Closing Date</Label>
                <Input type="date" id="closing_date" name="closing_date" defaultValue={getDraftDefault("closing_date", ((branch as Record<string, unknown>)?.closing_date as string) ?? "")} disabled={isViewing} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="notes" className="text-muted-foreground text-xs">Notes & Comments</Label>
              <Textarea id="notes" name="notes" defaultValue={getDraftDefault("notes", branch?.notes ?? "")} rows={5} placeholder="Internal notes about this branch..." disabled={isViewing} />
            </div>
          </div>
        </ERPRecordSectionPanel>
      </form>

      {/* DMS Documents tab � entityType: branch */}
      <ERPRecordSectionPanel id="documents" activeId={activeSection} title="Documents">
        {!branch?.id ? (
          <p className="text-sm text-muted-foreground">Save the branch first to manage documents.</p>
        ) : (
          <DmsEntityDocumentsTab
            entityType="branch"
            entityId={branch.id}
            entityLabel="Branch"
            canUpload={!isViewing}
            canLinkExisting={!isViewing}
            canUnlink={!isViewing}
            showComplianceCards
          />
        )}
      </ERPRecordSectionPanel>
    </ERPRecordWorkspaceForm>
  );
}
