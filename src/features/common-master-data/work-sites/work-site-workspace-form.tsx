"use client";

import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { MapPin, Contact, ScrollText, Files } from "lucide-react";
import type { AuthContext } from "@/lib/rbac/check";
import { useWorkspace } from "@/hooks/use-workspace";
import { useFormDirty } from "@/hooks/use-form-dirty";
import { useWorkspaceFormDraft } from "@/hooks/use-workspace-form-draft";
import { ERPRecordWorkspaceForm, ERPRecordSectionPanel } from "@/components/workspace/erp-record-workspace-form";
import { RequiredLabel } from "@/components/erp/required-label";
import { CountrySelect } from "@/components/erp/geography/country-select";
import { EmirateSelect } from "@/components/erp/geography/emirate-select";
import { CitySelect } from "@/components/erp/geography/city-select";
import type { WorkSiteRow } from "@/server/actions/common-master-data/work-sites";
import { createWorkSite, updateWorkSite } from "@/server/actions/common-master-data/work-sites";
import { DmsEntityDocumentsTab } from "@/features/dms/entity-documents";

type Props = {
  site?: WorkSiteRow | null;
  mode: "add" | "edit" | "view";
  authContext: AuthContext;
  companies?: { id: number; legal_name_en: string; company_code: string }[];
};

const FORM_ID = "work-site-workspace-form";
const SITE_TYPES = ['office','yard','workshop','camp','warehouse','project_site','client_site','weighbridge','fuel_point','storage_area','other'];

export function WorkSiteWorkspaceForm({ site, mode, companies = [] }: Props) {
  const { closeTab, activeTab, markDirty } = useWorkspace();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeSection, setActiveSection] = useState("basic");
  const [countryId, setCountryId] = useState<number | null>(site?.country_id ?? null);
  const [emirateId, setEmirateId] = useState<number | null>(site?.emirate_id ?? null);
  const [cityId, setCityId] = useState<number | null>(site?.city_id ?? null);
  const isEditing = mode === "edit";
  const isViewing = mode === "view";
  const disabled = isViewing;

  const { isDirty, resetDirty } = useFormDirty({ formId: FORM_ID, enabled: !isViewing });
  useEffect(() => { if (activeTab?.id) markDirty(activeTab.id, isDirty); }, [isDirty, activeTab?.id, markDirty]);
  const { getDraftDefault, syncDraft, writeDraftField, clearDraft } = useWorkspaceFormDraft({ formId: FORM_ID, enabled: !isViewing });

  const sections = [
    { id: "basic", label: "Site Info", icon: MapPin },
    { id: "contact", label: "Contact", icon: Contact },
    { id: "notes", label: "Notes", icon: ScrollText },
    { id: "documents", label: "Documents", icon: Files },
  ];

  const handleRequestClose = () => closeTab(activeTab?.id ?? "");

  const handleSave = async (): Promise<boolean> => {
    if (isViewing) return false;
    setIsSubmitting(true);
    const form = document.getElementById(FORM_ID) as HTMLFormElement;
    const fd = new FormData(form);
    const data = {
      site_code: fd.get("site_code") as string,
      site_name: fd.get("site_name") as string,
      site_type: fd.get("site_type") as "office" | "yard" | "workshop" | "camp" | "warehouse" | "project_site" | "client_site" | "weighbridge" | "fuel_point" | "storage_area" | "other",
      owner_company_id: parseInt(fd.get("owner_company_id") as string),
      country_id: countryId,
      emirate_id: emirateId,
      city_id: cityId,
      address_line_1: (fd.get("address_line_1") as string) || null,
      address_line_2: (fd.get("address_line_2") as string) || null,
      po_box: (fd.get("po_box") as string) || null,
      makani_number: (fd.get("makani_number") as string) || null,
      latitude: fd.get("latitude") ? Number(fd.get("latitude")) : null,
      longitude: fd.get("longitude") ? Number(fd.get("longitude")) : null,
      site_contact_name: (fd.get("site_contact_name") as string) || null,
      site_contact_phone: (fd.get("site_contact_phone") as string) || null,
      site_contact_email: (fd.get("site_contact_email") as string) || null,
      is_restricted_area: fd.get("is_restricted_area") === "on",
      cicpa_required: fd.get("cicpa_required") === "on",
      adnoc_required: fd.get("adnoc_required") === "on",
      access_notes: (fd.get("access_notes") as string) || null,
      status: (fd.get("status") as "active" | "inactive" | "closed" | "decommissioned") || "active",
      opening_date: (fd.get("opening_date") as string) || null,
      closing_date: (fd.get("closing_date") as string) || null,
      description: (fd.get("description") as string) || null,
    };
    try {
      const result = isEditing && site
        ? await updateWorkSite({ ...data, id: site.id })
        : await createWorkSite(data);
      if (result.success) { toast.success(isEditing ? "Work site updated" : "Work site created"); clearDraft(); resetDirty(); return true; }
      toast.error(result.error ?? "Failed to save"); return false;
    } catch { toast.error("An unexpected error occurred"); return false; }
    finally { setIsSubmitting(false); }
  };

  const handleSaveAndClose = async () => { const ok = await handleSave(); if (ok) handleRequestClose(); };

  return (
    <ERPRecordWorkspaceForm
      mode={mode}
      title={isViewing ? "View Work Site" : isEditing ? "Edit Work Site" : "New Work Site"}
      subtitle={site ? `${site.site_name} (${site.site_code})` : "Create a new operational work site"}
      recordCode={site?.site_code}
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
        <ERPRecordSectionPanel id="basic" activeId={activeSection} title="Work Site Details">
          <div className="grid grid-cols-12 gap-4">
            <div className="col-span-6 space-y-1.5">
              <RequiredLabel htmlFor="owner_company_id">Organization</RequiredLabel>
              <select id="owner_company_id" name="owner_company_id" defaultValue={getDraftDefault("owner_company_id", site?.owner_company_id ?? "")} required disabled={disabled} className="flex h-9 w-full rounded-md border border-input bg-background text-foreground px-3 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-40">
                <option value="">Select organization...</option>
                {companies.map(c => <option key={c.id} value={c.id}>{c.legal_name_en} ({c.company_code})</option>)}
              </select>
            </div>
            <div className="col-span-6 space-y-1.5">
              <RequiredLabel htmlFor="site_code">Site Code</RequiredLabel>
              <Input id="site_code" name="site_code" className="uppercase" defaultValue={getDraftDefault("site_code", site?.site_code ?? "")} disabled={disabled || isEditing} required placeholder="e.g., SITE-001" />
            </div>
            <div className="col-span-6 space-y-1.5">
              <RequiredLabel htmlFor="site_name">Site Name</RequiredLabel>
              <Input id="site_name" name="site_name" defaultValue={getDraftDefault("site_name", site?.site_name ?? "")} disabled={disabled} required />
            </div>
            <div className="col-span-6 space-y-1.5">
              <RequiredLabel htmlFor="site_type">Site Type</RequiredLabel>
              <select id="site_type" name="site_type" defaultValue={getDraftDefault("site_type", site?.site_type ?? "office")} required disabled={disabled} className="flex h-9 w-full rounded-md border border-input bg-background text-foreground px-3 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-40">
                {SITE_TYPES.map(t => <option key={t} value={t}>{t.replace("_", " ")}</option>)}
              </select>
            </div>
            <div className="col-span-6 space-y-1.5">
              <Label htmlFor="status" className="text-muted-foreground text-xs">Status</Label>
              <select id="status" name="status" defaultValue={getDraftDefault("status", site?.status ?? "active")} disabled={disabled} className="flex h-9 w-full rounded-md border border-input bg-background text-foreground px-3 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-40">
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
                <option value="closed">Closed</option>
                <option value="decommissioned">Decommissioned</option>
              </select>
            </div>
            <div className="col-span-3 space-y-1.5">
              <Label htmlFor="opening_date" className="text-muted-foreground text-xs">Opening Date</Label>
              <Input type="date" id="opening_date" name="opening_date" defaultValue={getDraftDefault("opening_date", site?.opening_date ?? "")} disabled={disabled} />
            </div>
            <div className="col-span-3 space-y-1.5">
              <Label htmlFor="closing_date" className="text-muted-foreground text-xs">Closing Date</Label>
              <Input type="date" id="closing_date" name="closing_date" defaultValue={getDraftDefault("closing_date", site?.closing_date ?? "")} disabled={disabled} />
            </div>
            <div className="col-span-12 border-t pt-3">
              <p className="text-xs font-medium text-muted-foreground mb-3">Location</p>
            </div>
            <div className="col-span-6 space-y-1.5">
              <Label className="text-muted-foreground text-xs">Country</Label>
              <CountrySelect value={countryId} onValueChange={(v) => { setCountryId(v); setEmirateId(null); setCityId(null); writeDraftField("country_id", v ?? ""); }} placeholder="Select Country" disabled={disabled} />
            </div>
            <div className="col-span-6 space-y-1.5">
              <Label className="text-muted-foreground text-xs">Emirate / Region</Label>
              <EmirateSelect value={emirateId} onValueChange={(v) => { setEmirateId(v); setCityId(null); writeDraftField("emirate_id", v ?? ""); }} countryId={countryId} placeholder="Select Emirate" disabled={disabled || !countryId} />
            </div>
            <div className="col-span-6 space-y-1.5">
              <Label className="text-muted-foreground text-xs">City</Label>
              <CitySelect value={cityId} onValueChange={(v) => { setCityId(v); writeDraftField("city_id", v ?? ""); }} emirateId={emirateId} placeholder="Select City" disabled={disabled || !emirateId} />
            </div>
            <div className="col-span-6 space-y-1.5">
              <Label htmlFor="makani_number" className="text-muted-foreground text-xs">Makani Number</Label>
              <Input id="makani_number" name="makani_number" defaultValue={getDraftDefault("makani_number", site?.makani_number ?? "")} disabled={disabled} />
            </div>
            <div className="col-span-12 space-y-1.5">
              <Label htmlFor="address_line_1" className="text-muted-foreground text-xs">Address Line 1</Label>
              <Input id="address_line_1" name="address_line_1" defaultValue={getDraftDefault("address_line_1", site?.address_line_1 ?? "")} disabled={disabled} />
            </div>
            <div className="col-span-12 space-y-1.5">
              <Label htmlFor="address_line_2" className="text-muted-foreground text-xs">Address Line 2</Label>
              <Input id="address_line_2" name="address_line_2" defaultValue={getDraftDefault("address_line_2", site?.address_line_2 ?? "")} disabled={disabled} />
            </div>
            <div className="col-span-4 space-y-1.5">
              <Label htmlFor="po_box" className="text-muted-foreground text-xs">PO Box</Label>
              <Input id="po_box" name="po_box" defaultValue={getDraftDefault("po_box", site?.po_box ?? "")} disabled={disabled} />
            </div>
            <div className="col-span-4 space-y-1.5">
              <Label htmlFor="latitude" className="text-muted-foreground text-xs">Latitude</Label>
              <Input type="number" step="0.0000001" id="latitude" name="latitude" defaultValue={getDraftDefault("latitude", site?.latitude ?? "")} disabled={disabled} placeholder="25.2048" />
            </div>
            <div className="col-span-4 space-y-1.5">
              <Label htmlFor="longitude" className="text-muted-foreground text-xs">Longitude</Label>
              <Input type="number" step="0.0000001" id="longitude" name="longitude" defaultValue={getDraftDefault("longitude", site?.longitude ?? "")} disabled={disabled} placeholder="55.2708" />
            </div>
            <div className="col-span-12 grid grid-cols-3 gap-2 pt-1">
              {[
                { id: "is_restricted_area", label: "Restricted Area", checked: site?.is_restricted_area ?? false },
                { id: "cicpa_required", label: "CICPA Pass Required", checked: site?.cicpa_required ?? false },
                { id: "adnoc_required", label: "ADNOC Pass Required", checked: site?.adnoc_required ?? false },
              ].map(f => (
                <div key={f.id} className="flex items-center space-x-2">
                  <Checkbox id={f.id} name={f.id} defaultChecked={f.checked} disabled={disabled} />
                  <Label htmlFor={f.id} className="text-xs cursor-pointer">{f.label}</Label>
                </div>
              ))}
            </div>
          </div>
        </ERPRecordSectionPanel>
        <ERPRecordSectionPanel id="contact" activeId={activeSection} title="Site Contact">
          <div className="grid grid-cols-12 gap-4">
            <div className="col-span-12 space-y-1.5">
              <Label htmlFor="site_contact_name" className="text-muted-foreground text-xs">Contact Name</Label>
              <Input id="site_contact_name" name="site_contact_name" defaultValue={getDraftDefault("site_contact_name", site?.site_contact_name ?? "")} disabled={disabled} />
            </div>
            <div className="col-span-6 space-y-1.5">
              <Label htmlFor="site_contact_phone" className="text-muted-foreground text-xs">Contact Phone</Label>
              <Input id="site_contact_phone" name="site_contact_phone" defaultValue={getDraftDefault("site_contact_phone", site?.site_contact_phone ?? "")} disabled={disabled} />
            </div>
            <div className="col-span-6 space-y-1.5">
              <Label htmlFor="site_contact_email" className="text-muted-foreground text-xs">Contact Email</Label>
              <Input type="email" id="site_contact_email" name="site_contact_email" defaultValue={getDraftDefault("site_contact_email", site?.site_contact_email ?? "")} disabled={disabled} />
            </div>
            <div className="col-span-12 space-y-1.5">
              <Label htmlFor="access_notes" className="text-muted-foreground text-xs">Access Notes</Label>
              <Textarea id="access_notes" name="access_notes" defaultValue={getDraftDefault("access_notes", site?.access_notes ?? "")} rows={4} disabled={disabled} placeholder="Instructions for accessing this site..." />
            </div>
          </div>
        </ERPRecordSectionPanel>
        <ERPRecordSectionPanel id="notes" activeId={activeSection} title="Description">
          <Textarea id="description" name="description" defaultValue={getDraftDefault("description", site?.description ?? "")} rows={8} disabled={disabled} />
        </ERPRecordSectionPanel>
      </form>

      <ERPRecordSectionPanel id="documents" activeId={activeSection} title="Documents">
        {!site?.id ? (
          <p className="text-sm text-muted-foreground">Save the work site first to manage documents.</p>
        ) : (
          <DmsEntityDocumentsTab entityType="site" entityId={site.id} entityLabel="Work Site" canUpload={!disabled} canLinkExisting={!disabled} canUnlink={!disabled} showComplianceCards />
        )}
      </ERPRecordSectionPanel>
    </ERPRecordWorkspaceForm>
  );
}
