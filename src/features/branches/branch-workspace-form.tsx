"use client";

import { useState, useEffect, useLayoutEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { invalidateOrganizations } from "@/lib/query/invalidation";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import type { BranchWithCompany } from "@/types/domain";
import type { BranchCompanyChoice } from "@/lib/administration/branch-company-choices";
import { savedSelection } from "@/lib/master-data/saved-selection";
import { createBranch, updateBranch } from "@/server/actions/branches";
import { RequiredLabel } from "@/components/erp/required-label";
import { useWorkspaceFormDirty as useFormDirty } from "@/hooks/use-workspace-form-dirty";
import { CountrySelect } from "@/components/erp/geography/country-select";
import { EmirateSelect } from "@/components/erp/geography/emirate-select";
import { CitySelect } from "@/components/erp/geography/city-select";
import { AreaZoneSelect } from "@/components/erp/geography/area-zone-select";
import { Building2, MapPin, Contact, Wrench, ScrollText, Files } from "lucide-react";
import type { AuthContext } from "@/lib/rbac/check";
import { hasPermissionInScope } from "@/lib/rbac/scope";
import { useWorkspaceFormNavigation as useWorkspace } from "@/hooks/use-workspace-form-navigation";
import { useWorkspaceFormSection } from "@/hooks/use-workspace-form-section";
import { useWorkspaceFormDraft } from "@/hooks/use-workspace-form-draft";
import { administrationSaveReceiptSchema, useAdministrationSaveSession } from "@/hooks/use-administration-save-session";
import { createBranchSchema, updateBranchSchema, type CreateBranchInput, type UpdateBranchInput } from "./branch-schema";
import { reportWorkspaceFieldErrors, workspaceValidationFailure } from "@/lib/workspace/field-errors";
import {
  ERPRecordWorkspaceForm,
  ERPRecordSectionPanel,
} from "@/components/workspace/erp-record-workspace-form";
import { DmsEntityDocumentsTab } from "@/features/dms/entity-documents";

type BranchWorkspaceFormProps = {
  branch?: BranchWithCompany | null;
  companies?: BranchCompanyChoice[];
  mode: "add" | "edit" | "view";
  authContext: AuthContext;
};

const FORM_ID = "branch-workspace-form";

export function BranchWorkspaceForm(props: BranchWorkspaceFormProps) {
  return <BranchWorkspaceFormFields key={`${props.authContext.profile?.id ?? "none"}:${props.branch?.id ?? "new"}:${props.mode}`} {...props} />;
}

function BranchWorkspaceFormFields({ branch, companies = [], mode, authContext }: BranchWorkspaceFormProps) {
  const navigation = useWorkspace();
  const { closeTab, activeTab, markDirty } = navigation;
  const router = useRouter();
  const queryClient = useQueryClient();
  const session = useAdministrationSaveSession<CreateBranchInput | UpdateBranchInput>(FORM_ID, branch?.id ?? null, branch?.workspace_revision, (payload, id) => {
    const parsed = id === null ? createBranchSchema.safeParse(payload) : updateBranchSchema.safeParse(payload);
    return parsed.success && (id === null || ('id' in parsed.data && parsed.data.id === id));
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [localOutcome, setLocalOutcome] = useState<"confirmed" | "rejected" | "blocked" | null>(null);
  const [recoveryNotice, setRecoveryNotice] = useState<string | null>(null);
  const terminal = useRef(false);
  const dispatchLease = useRef<{ active: boolean } | null>(null);
  useLayoutEffect(() => () => { if (dispatchLease.current) dispatchLease.current.active = false; }, []);
  const sections = [
    { id: "basic", label: "Basic Info", icon: Building2 },
    { id: "location", label: "Location", icon: MapPin },
    { id: "contact", label: "Contact Details", icon: Contact },
    { id: "operations", label: "Operations Flags", icon: Wrench },
    { id: "notes", label: "Internal Notes", icon: ScrollText },
    { id: "documents", label: "Documents", icon: Files },
  ];
  const [activeSection, setActiveSection] = useWorkspaceFormSection(FORM_ID, "basic", sections.map(section => section.id));

  const isEditing = session.savedId !== null;
  const writableCompanies = companies.filter(company => hasPermissionInScope(authContext, "branches.manage", company.id));
  const displayedCompanies = branch && !companies.some(company => company.id === branch.owner_company_id)
    ? [...companies, branch.owner_company?.id === branch.owner_company_id ? branch.owner_company : { id: branch.owner_company_id, legal_name_en: `Organization #${branch.owner_company_id}`, company_code: "saved" }]
    : companies;
  const canManage = branch
    ? hasPermissionInScope(authContext, "branches.manage", branch.owner_company_id, branch.id)
    : writableCompanies.length > 0;
  const isViewing = mode === "view" || !canManage;
  const readOnly = useRef(isViewing);
  useLayoutEffect(() => { readOnly.current = isViewing; }, [isViewing]);
  const disabled = isViewing || isSubmitting || session.uncertain || localOutcome !== null;

  const { isDirty, resetDirty } = useFormDirty({ formId: FORM_ID, enabled: !isViewing });

  useEffect(() => {
    if (activeTab?.id) markDirty(activeTab.id, localOutcome !== "confirmed" && (isDirty || session.uncertain));
  }, [isDirty, session.uncertain, localOutcome, activeTab?.id, markDirty]);

  // ── Draft preservation (UI.4E.2) ──────────────────────────────────────────
  const { getDraftDefault, getDraftNullableId, getDraftBoolean, hasDraftField, syncDraft, writeDraftField: writeField, clearDraft } = useWorkspaceFormDraft({
    formId: FORM_ID,
    enabled: !isViewing,
  });
  const [countryId, setCountryId] = useState(() => getDraftNullableId("country_id"));
  const [emirateId, setEmirateId] = useState(() => getDraftNullableId("emirate_id", branch?.emirate_id));
  const [cityId, setCityId] = useState(() => getDraftNullableId("city_id", branch?.city_id));
  const [areaZoneId, setAreaZoneId] = useState(() => getDraftNullableId("area_zone_id", branch?.area_zone_id));
  const geographyEdited = useRef(new Set(["country_id", "emirate_id", "city_id", "area_zone_id"].filter(hasDraftField)));
  const saving = useRef(false);
  const savedOwnerCompanyId = useRef(branch?.owner_company_id ?? null);
  const writeDraftField: typeof writeField = (name, value) => {
    if (["country_id", "emirate_id", "city_id", "area_zone_id"].includes(name)) geographyEdited.current.add(name);
    writeField(name, value);
  };

  // Initialize geography selects from legacy text fields when editing
  useEffect(() => {
    if (!branch) return;
    let cancelled = false;
    async function initGeography() {
      const supabase = createClient();
      let resolvedCountryId: number | null = null;
      let resolvedEmirateId: number | null = null;
      let resolvedCityId: number | null = null;
      let resolvedAreaZoneId: number | null = null;

      // Stored relationships are authoritative, including inactive historical
      // selections. Legacy text resolution is only for records without IDs.
      const stored = branch as BranchWithCompany & {emirate_id?:number|null;city_id?:number|null;area_zone_id?:number|null};
      if (stored.emirate_id != null || stored.city_id != null || stored.area_zone_id != null) {
        if (stored.emirate_id != null) {
          const {data,error}=await supabase.from('emirates').select('country_id').eq('id',stored.emirate_id).maybeSingle();
          if (error || !data) throw new Error('Geography unavailable');
          resolvedCountryId=data.country_id;
        }
        return {resolvedCountryId,resolvedEmirateId:stored.emirate_id??null,resolvedCityId:stored.city_id??null,resolvedAreaZoneId:stored.area_zone_id??null};
      }

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

      return { resolvedCountryId, resolvedEmirateId, resolvedCityId, resolvedAreaZoneId };
    }
    void initGeography().then((ids) => {
      if (cancelled) return;
      if (!geographyEdited.current.has("country_id")) setCountryId(ids.resolvedCountryId);
      if (!geographyEdited.current.has("emirate_id")) setEmirateId(ids.resolvedEmirateId);
      if (!geographyEdited.current.has("city_id")) setCityId(ids.resolvedCityId);
      if (!geographyEdited.current.has("area_zone_id")) setAreaZoneId(ids.resolvedAreaZoneId);
    }).catch(() => { if (!cancelled) toast.error("Could not load branch geography."); });
    return () => { cancelled = true; };
  }, [branch]);

  const handleCountryChange = (id: number | null) => { setCountryId(id); setEmirateId(null); setCityId(null); setAreaZoneId(null); writeDraftField("country_id", id ?? ""); writeDraftField("emirate_id", ""); writeDraftField("city_id", ""); writeDraftField("area_zone_id", ""); };
  const handleEmirateChange = (id: number | null) => { setEmirateId(id); setCityId(null); setAreaZoneId(null); writeDraftField("emirate_id", id ?? ""); writeDraftField("city_id", ""); writeDraftField("area_zone_id", ""); };
  const handleCityChange = (id: number | null) => { setCityId(id); setAreaZoneId(null); writeDraftField("city_id", id ?? ""); writeDraftField("area_zone_id", ""); };

  async function resolveGeographyText() {
    const supabase = createClient();
    let emirateText = geographyEdited.current.has("emirate_id") ? null : branch?.emirate ?? null;
    let cityText = geographyEdited.current.has("city_id") ? null : branch?.city ?? null;
    let areaText = geographyEdited.current.has("area_zone_id") ? null : branch?.area ?? null;
    if (emirateId) { const { data, error } = await supabase.from("emirates").select("name_en").eq("id", emirateId).maybeSingle(); if (error || !data) throw new Error("Geography unavailable"); emirateText = data.name_en; }
    if (cityId) { const { data, error } = await supabase.from("cities").select("name_en").eq("id", cityId).maybeSingle(); if (error || !data) throw new Error("Geography unavailable"); cityText = data.name_en; }
    if (areaZoneId) { const { data, error } = await supabase.from("areas_zones").select("name_en").eq("id", areaZoneId).maybeSingle(); if (error || !data) throw new Error("Geography unavailable"); areaText = data.name_en; }
    return { emirateText, cityText, areaText };
  }


  const handleRequestClose = () => {
    if (saving.current || (session.uncertain && !session.recoveryError && localOutcome !== "confirmed")) return;
    closeTab(activeTab?.id ?? "");
  };

  const handleSave = async (closeAfter = false): Promise<boolean> => {
    if (isViewing || terminal.current || saving.current) return false;
    saving.current = true;
    const lease = { active: true };
    dispatchLease.current = lease;
    const isCurrent = () => lease.active && session.isCurrent();
    setIsSubmitting(true);
    const form = document.getElementById(FORM_ID) as HTMLFormElement;
    let dispatched = false;
    let confirmed = false;
    let rejected = false;
    try {
      let pending = session.getPending();
      const recovering = pending !== null;
      if (!pending) {
        syncDraft();
        const formData = new FormData(form);
        const { emirateText, cityText, areaText } = await resolveGeographyText();
        const data = {
          owner_company_id: isEditing ? savedOwnerCompanyId.current : Number(formData.get("owner_company_id")),
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
          // Do not silently assign inferred IDs to historical text-only records.
          ...(!isEditing || geographyEdited.current.has('emirate_id') ? {emirate_id:emirateId} : {}),
          ...(!isEditing || geographyEdited.current.has('city_id') ? {city_id:cityId} : {}),
          ...(!isEditing || geographyEdited.current.has('area_zone_id') ? {area_zone_id:areaZoneId} : {}),
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
        if (!isCurrent() || readOnly.current) return false;
        const parsed = isEditing
          ? updateBranchSchema.safeParse({ ...data, id: session.savedId })
          : createBranchSchema.safeParse({ ...data, branch_code: formData.get("branch_code") as string });
        if (!parsed.success) {
          const failure = workspaceValidationFailure(parsed.error.issues);
          reportWorkspaceFieldErrors(form, failure.fieldErrors);
          toast.error(failure.error);
          return false;
        }
        pending = session.prepare(parsed.data);
      }
      if (!isCurrent() || readOnly.current) return false;
      const wasNew = pending.id === null;
      dispatched = true;
      const result = wasNew
        ? await createBranch(pending.payload as CreateBranchInput, pending.contract)
        : await updateBranch(pending.payload as UpdateBranchInput, pending.contract);
      if (!isCurrent()) return false;
      if (!result.success) {
        // A later rejection cannot settle an earlier unconfirmed dispatch.
        // Preserve a first-known outcome before any fallible local witness read.
        rejected = !recovering && !result.uncertain;
        session.getPending();
        if (recovering || result.uncertain) {
          session.setUncertain(true);
          setRecoveryNotice("The earlier save is still unconfirmed. Retry the same submitted change to recover its result.");
          try { toast.error("The save is still unconfirmed. Retry the same submitted change to recover its result."); } catch { /* Keep the original request available. */ }
          return false;
        }
        session.rejected();
        reportWorkspaceFieldErrors(form, result.fieldErrors);
        toast.error(result.error ?? "Branch save could not be confirmed. Retry the same save.");
        return false;
      }
      const receipt = administrationSaveReceiptSchema.parse(result.data);
      if (pending.id !== null && receipt.id !== pending.id) throw new Error("Save response does not match the record.");
      // This server result is confirmed before any local acknowledgement/display work.
      confirmed = true;
      session.accept(receipt);
      setRecoveryNotice(null);
      savedOwnerCompanyId.current = pending.payload.owner_company_id ?? savedOwnerCompanyId.current;
      clearDraft(); resetDirty();
      toast.success(receipt.changed === false ? "No changes to save" : wasNew ? "Branch created" : "Branch updated");
      invalidateOrganizations(queryClient);
      const route = `/admin/branches/record/${receipt.id}?mode=edit`;
      if (activeTab?.id) {
        markDirty(activeTab.id, false);
        navigation.updateTabRoute(activeTab.id, route, receipt.id, "edit");
        navigation.renameTab(activeTab.id, pending.payload.branch_name_en ?? branch?.branch_name_en ?? "Branch", branch?.branch_code ?? (pending.payload as CreateBranchInput).branch_code);
        if (closeAfter) closeTab(activeTab.id, { force: true });
        else if (wasNew && navigation.isTabActive(activeTab.id)) router.replace(route);
      } else if (wasNew) router.replace(route);
      router.refresh();
      return true;
    } catch {
      if (!isCurrent()) return false;
      if (confirmed || rejected) {
        terminal.current = true;
        session.setUncertain(false);
        setLocalOutcome(confirmed ? "confirmed" : "rejected");
        setRecoveryNotice(confirmed
          ? "Branch saved, but its local confirmation or display could not finish. Close and reopen the record before continuing."
          : "Branch change was rejected, but local recovery could not finish. Your draft is retained. Close and reopen the record before continuing.");
        return confirmed;
      }
      if (dispatched) session.setUncertain(true);
      if (session.recoveryError) { terminal.current = true; setLocalOutcome("blocked"); }
      const message = dispatched ? "Branch save is unconfirmed. Retry the same save to recover its result." : "Branch could not be prepared for saving. Your draft is retained; check its fields and current revision.";
      setRecoveryNotice(session.recoveryError ?? message);
      try { toast.error(message); } catch { /* The retained result remains authoritative. */ }
      return false;
    }
    finally { if (isCurrent()) setIsSubmitting(false); saving.current = false; }
  };

  const handleSaveAndClose = async () => {
    await handleSave(true);
  };

  return (
    <ERPRecordWorkspaceForm
      mode={isViewing ? "view" : isEditing ? "edit" : "add"}
      title={isViewing ? "View Branch" : isEditing ? "Edit Branch" : "New Branch"}
      subtitle={branch ? `${branch.branch_name_en} (${branch.branch_code})` : "Register a new company physical office or operations yard"}
      recordCode={branch?.branch_code}
      sections={sections}
      activeSection={activeSection}
      onSectionChange={setActiveSection}
      isDirty={localOutcome !== "confirmed" && (isDirty || session.uncertain)}
      onSave={isViewing || localOutcome !== null ? undefined : () => handleSave()}
      onSaveAndClose={isViewing || localOutcome !== null ? undefined : handleSaveAndClose}
      onRequestClose={handleRequestClose}
      isSubmitting={isSubmitting}
    >
      <form id={FORM_ID} onSubmit={(e) => { e.preventDefault(); handleSaveAndClose(); }} onInput={syncDraft} onChange={syncDraft}>
        {(recoveryNotice || session.uncertain) && <p role="status" className="mb-4 text-sm text-muted-foreground">{recoveryNotice ?? session.recoveryError ?? "The last save is unconfirmed. Click Save again to recover the same submitted change."}</p>}
        <ERPRecordSectionPanel id="basic" activeId={activeSection} title="Basic Branch Details">
          <div className="grid grid-cols-12 gap-4">
            <div className="col-span-6 space-y-1.5">
              <RequiredLabel htmlFor="owner_company_id">Owner Organization</RequiredLabel>
              <select id="owner_company_id" name="owner_company_id" defaultValue={branch?.owner_company_id ?? getDraftDefault("owner_company_id", "")} required disabled={disabled || isEditing} className="flex h-9 w-full rounded-md border border-input bg-background text-foreground px-3 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-40">
                <option value="">Select organization...</option>
                {(branch ? displayedCompanies : writableCompanies).map(c => <option key={c.id} value={c.id}>{c.legal_name_en} ({c.company_code})</option>)}
              </select>
            </div>
            <div className="col-span-6 space-y-1.5">
              <RequiredLabel htmlFor="branch_code">Branch Code</RequiredLabel>
              <Input id="branch_code" name="branch_code" className="uppercase" defaultValue={getDraftDefault("branch_code", branch?.branch_code ?? "")} disabled={disabled || isEditing} required placeholder="e.g., AUH, DXB, SHJ, ICAD" />
              <span className="text-[9px] text-muted-foreground">Short location/facility code used across the ERP</span>
            </div>
            <div className="col-span-6 space-y-1.5">
              <RequiredLabel htmlFor="branch_name_en">Branch Name (English)</RequiredLabel>
              <Input id="branch_name_en" name="branch_name_en" defaultValue={getDraftDefault("branch_name_en", branch?.branch_name_en ?? "")} disabled={disabled} required />
            </div>
            <div className="col-span-6 space-y-1.5">
              <Label htmlFor="branch_name_ar" className="text-muted-foreground text-xs">Branch Name (Arabic)</Label>
              <Input id="branch_name_ar" name="branch_name_ar" defaultValue={getDraftDefault("branch_name_ar", branch?.branch_name_ar ?? "")} disabled={disabled} dir="rtl" />
            </div>
            <div className="col-span-4 space-y-1.5">
              <Label htmlFor="branch_type" className="text-muted-foreground text-xs">Branch Type</Label>
              <select id="branch_type" name="branch_type" defaultValue={getDraftDefault("branch_type", branch?.branch_type ?? "")} disabled={disabled} className="flex h-9 w-full rounded-md border border-input bg-background text-foreground px-3 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-40">
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
              <select id="status" name="status" defaultValue={getDraftDefault("status", branch?.status || "active")} disabled={disabled} className="flex h-9 w-full rounded-md border border-input bg-background text-foreground px-3 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-40">
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
                <option value="suspended">Suspended</option>
              </select>
            </div>
            <div className="col-span-4 space-y-1.5">
              <Label htmlFor="operating_status" className="text-muted-foreground text-xs">Operating Status</Label>
              <select id="operating_status" name="operating_status" defaultValue={getDraftDefault("operating_status", branch?.operating_status || "active")} disabled={disabled} className="flex h-9 w-full rounded-md border border-input bg-background text-foreground px-3 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-40">
                <option value="active">Active</option>
                <option value="maintenance">Maintenance</option>
                <option value="suspended">Suspended</option>
                <option value="closed">Closed</option>
              </select>
            </div>
            <div className="col-span-12 flex items-center space-x-2 pt-2">
              <Checkbox id="is_main_branch" name="is_main_branch" defaultChecked={getDraftBoolean("is_main_branch", branch?.is_main_branch ?? false)} disabled={disabled} />
              <Label htmlFor="is_main_branch" className="cursor-pointer text-muted-foreground text-xs font-normal">Main Branch (Head Office)</Label>
            </div>
          </div>
        </ERPRecordSectionPanel>

        <ERPRecordSectionPanel id="location" activeId={activeSection} title="Geographic Office Location">
          <div className="grid grid-cols-12 gap-4">
            <div className="col-span-6 space-y-1.5">
              <Label className="text-muted-foreground text-xs">Country</Label>
              <CountrySelect value={countryId} savedSelection={savedSelection(countryId, `Country #${countryId}`)} onValueChange={handleCountryChange} placeholder="Select Country" disabled={disabled} />
            </div>
            <div className="col-span-6 space-y-1.5">
              <Label className="text-muted-foreground text-xs">Region / Emirate</Label>
              <EmirateSelect value={emirateId} savedSelection={savedSelection(branch?.emirate_id, branch?.emirate || `Emirate #${branch?.emirate_id}`)} onValueChange={handleEmirateChange} countryId={countryId} placeholder="Select Region / Emirate" disabled={disabled || !countryId} />
              {branch?.emirate && !emirateId && <p className="text-[9px] text-amber-600">{branch.emirate} (legacy)</p>}
            </div>
            <div className="col-span-6 space-y-1.5">
              <Label className="text-muted-foreground text-xs">City</Label>
              <CitySelect value={cityId} savedSelection={savedSelection(branch?.city_id, branch?.city || `City #${branch?.city_id}`)} onValueChange={handleCityChange} emirateId={emirateId} placeholder="Select City" disabled={disabled || !emirateId} />
              {branch?.city && !cityId && <p className="text-[9px] text-amber-600">{branch.city} (legacy)</p>}
            </div>
            <div className="col-span-6 space-y-1.5">
              <Label className="text-muted-foreground text-xs">Area / Zone</Label>
              <AreaZoneSelect value={areaZoneId} savedSelection={savedSelection(branch?.area_zone_id, branch?.area || `Area / Zone #${branch?.area_zone_id}`)} onValueChange={(v) => { setAreaZoneId(v); writeDraftField("area_zone_id", v ?? ""); }} cityId={cityId} placeholder="Select Area / Zone" disabled={disabled || !cityId} />
              {branch?.area && !areaZoneId && <p className="text-[9px] text-amber-600">{branch.area} (legacy)</p>}
            </div>
            <div className="col-span-6 space-y-1.5">
              <Label htmlFor="po_box" className="text-muted-foreground text-xs">PO Box</Label>
              <Input id="po_box" name="po_box" defaultValue={getDraftDefault("po_box", branch?.po_box ?? "")} disabled={disabled} />
            </div>
            <div className="col-span-12 space-y-1.5">
              <Label htmlFor="address_line_1" className="text-muted-foreground text-xs">Address Line 1</Label>
              <Input id="address_line_1" name="address_line_1" defaultValue={getDraftDefault("address_line_1", branch?.address_line_1 ?? "")} disabled={disabled} />
            </div>
            <div className="col-span-12 space-y-1.5">
              <Label htmlFor="address_line_2" className="text-muted-foreground text-xs">Address Line 2</Label>
              <Input id="address_line_2" name="address_line_2" defaultValue={getDraftDefault("address_line_2", branch?.address_line_2 ?? "")} disabled={disabled} />
            </div>
            <div className="col-span-4 space-y-1.5">
              <Label htmlFor="makani_number" className="text-muted-foreground text-xs">Makani Number</Label>
              <Input id="makani_number" name="makani_number" defaultValue={getDraftDefault("makani_number", branch?.makani_number ?? "")} placeholder="UAE Makani address" disabled={disabled} />
            </div>
            <div className="col-span-4 space-y-1.5">
              <Label htmlFor="latitude" className="text-muted-foreground text-xs">Latitude</Label>
              <Input type="number" id="latitude" name="latitude" step="0.0000001" min="-90" max="90" defaultValue={getDraftDefault("latitude", branch?.latitude ?? "")} placeholder="25.276987" disabled={disabled} />
            </div>
            <div className="col-span-4 space-y-1.5">
              <Label htmlFor="longitude" className="text-muted-foreground text-xs">Longitude</Label>
              <Input type="number" id="longitude" name="longitude" step="0.0000001" min="-180" max="180" defaultValue={getDraftDefault("longitude", branch?.longitude ?? "")} placeholder="55.296249" disabled={disabled} />
            </div>
          </div>
        </ERPRecordSectionPanel>

        <ERPRecordSectionPanel id="contact" activeId={activeSection} title="Branch Contacts & Representative">
          <div className="grid grid-cols-12 gap-4">
            <div className="col-span-6 space-y-1.5">
              <Label htmlFor="phone" className="text-muted-foreground text-xs">Branch Phone</Label>
              <Input id="phone" name="phone" defaultValue={getDraftDefault("phone", branch?.phone ?? "")} disabled={disabled} />
            </div>
            <div className="col-span-6 space-y-1.5">
              <Label htmlFor="email" className="text-muted-foreground text-xs">Branch Email</Label>
              <Input type="email" id="email" name="email" defaultValue={getDraftDefault("email", branch?.email ?? "")} disabled={disabled} />
            </div>
            <div className="col-span-6 space-y-1.5">
              <Label htmlFor="contact_person_name" className="text-muted-foreground text-xs">Contact Person Name</Label>
              <Input id="contact_person_name" name="contact_person_name" defaultValue={getDraftDefault("contact_person_name", branch?.contact_person_name ?? "")} disabled={disabled} />
            </div>
            <div className="col-span-6 space-y-1.5">
              <Label htmlFor="contact_phone" className="text-muted-foreground text-xs">Contact Person Phone</Label>
              <Input id="contact_phone" name="contact_phone" defaultValue={getDraftDefault("contact_phone", branch?.contact_phone ?? "")} disabled={disabled} />
            </div>
            <div className="col-span-12 space-y-1.5">
              <Label htmlFor="contact_email" className="text-muted-foreground text-xs">Contact Person Email</Label>
              <Input type="email" id="contact_email" name="contact_email" defaultValue={getDraftDefault("contact_email", branch?.contact_email ?? "")} disabled={disabled} />
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
                  <Checkbox id={id} name={id} defaultChecked={getDraftBoolean(id, checked)} disabled={disabled} />
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
                <Input id="legal_branch_name" name="legal_branch_name" defaultValue={getDraftDefault("legal_branch_name", ((branch as Record<string, unknown>)?.legal_branch_name as string) ?? "")} disabled={disabled} placeholder="Official legal name" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="trade_license_branch_ref" className="text-muted-foreground text-xs">Trade License Branch Ref</Label>
                <Input id="trade_license_branch_ref" name="trade_license_branch_ref" defaultValue={getDraftDefault("trade_license_branch_ref", ((branch as Record<string, unknown>)?.trade_license_branch_ref as string) ?? "")} disabled={disabled} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="opening_date" className="text-muted-foreground text-xs">Opening Date</Label>
                <Input type="date" id="opening_date" name="opening_date" defaultValue={getDraftDefault("opening_date", ((branch as Record<string, unknown>)?.opening_date as string) ?? "")} disabled={disabled} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="closing_date" className="text-muted-foreground text-xs">Closing Date</Label>
                <Input type="date" id="closing_date" name="closing_date" defaultValue={getDraftDefault("closing_date", ((branch as Record<string, unknown>)?.closing_date as string) ?? "")} disabled={disabled} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="notes" className="text-muted-foreground text-xs">Notes & Comments</Label>
              <Textarea id="notes" name="notes" defaultValue={getDraftDefault("notes", branch?.notes ?? "")} rows={5} placeholder="Internal notes about this branch..." disabled={disabled} />
            </div>
          </div>
        </ERPRecordSectionPanel>
      </form>

      {/* DMS Documents tab � entityType: branch */}
      <ERPRecordSectionPanel id="documents" activeId={activeSection} title="Documents">
        {!session.savedId ? (
          <p className="text-sm text-muted-foreground">Save the branch first to manage documents.</p>
        ) : (
          <DmsEntityDocumentsTab
            entityType="branch"
            entityId={session.savedId}
            entityLabel="Branch"
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
