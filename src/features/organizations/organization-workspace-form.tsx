"use client";

import { CurrencySelect } from "@/components/erp/finance-basics/currency-select";
import { AreaZoneSelect } from "@/components/erp/geography/area-zone-select";
import { CitySelect } from "@/components/erp/geography/city-select";
import { CountrySelect } from "@/components/erp/geography/country-select";
import { EmirateSelect } from "@/components/erp/geography/emirate-select";
import { RequiredLabel } from "@/components/erp/required-label";

import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  ERPRecordSectionPanel,
  ERPRecordWorkspaceForm,
} from "@/components/workspace/erp-record-workspace-form";
import { ComplianceFindingAlert } from "@/features/ai/common/compliance-checker";
import { DuplicateCandidateAlert } from "@/features/ai/common/duplicate-detection";
import { AiFieldSuggestionsPanel } from "@/features/ai/common/field-suggestions";
import { RiskScoreAlert } from "@/features/ai/common/risk-scoring";
import { DmsEntityDocumentsTab } from "@/features/dms/entity-documents";
import { useWorkspaceFormDirty as useFormDirty } from "@/hooks/use-workspace-form-dirty";
import { useWorkspaceFormNavigation as useWorkspace } from "@/hooks/use-workspace-form-navigation";
import { useWorkspaceFormSection } from "@/hooks/use-workspace-form-section";
import { useWorkspaceFormDraft } from "@/hooks/use-workspace-form-draft";
import { administrationSaveReceiptSchema, useAdministrationSaveSession } from "@/hooks/use-administration-save-session";
import { reportWorkspaceFieldErrors, workspaceValidationFailure } from "@/lib/workspace/field-errors";
import { useRouter } from "next/navigation";
import { queryKeys } from "@/lib/query/query-keys";
import { invalidateOrganizations } from "@/lib/query/invalidation";
import { savedSelection } from "@/lib/master-data/saved-selection";
import type { AuthContext } from "@/lib/rbac/check";
import {hasGlobalPermission, hasPermissionInScope} from "@/lib/rbac/scope";
import { createClient } from "@/lib/supabase/client";
import { createOrganization, updateOrganization } from "@/server/actions/organizations";
import {createOrganizationSchema, updateOrganizationSchema, type CreateOrganizationInput, type UpdateOrganizationInput} from './organization-schema';
import type { OwnerCompany } from "@/types/domain";
import { useQueryClient } from "@tanstack/react-query";
import { Brain, Briefcase, Building2, FileCode2, Files, MapPin, Palette, Pencil, ScrollText, ShieldCheck } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { OrganizationBrandingSection } from "./organization-branding-section";
import { CompanySignatoriesSection } from "./company-signatories-section";

type OrganizationWorkspaceFormProps = {
  organization?: OwnerCompany | null;
  mode: "add" | "edit" | "view";
  authContext: AuthContext;
};

export function OrganizationWorkspaceForm(props: OrganizationWorkspaceFormProps) {
  return <OrganizationWorkspaceFormFields key={`${props.authContext.profile?.id ?? "none"}:${props.organization?.id ?? "new"}:${props.mode}`} {...props} />;
}

function OrganizationWorkspaceFormFields({ organization, mode, authContext }: OrganizationWorkspaceFormProps) {
  const FORM_ID = "organization-workspace-form";
  const navigation = useWorkspace();
  const { closeTab, activeTab, markDirty } = navigation;
  const router = useRouter();
  const session = useAdministrationSaveSession<CreateOrganizationInput | UpdateOrganizationInput>(FORM_ID, organization?.id ?? null, organization?.workspace_revision, (payload, id) => {
    const parsed = id === null ? createOrganizationSchema.safeParse(payload) : updateOrganizationSchema.safeParse(payload);
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
    { id: "address", label: "Address & Contact", icon: MapPin },
    { id: "legal", label: "Legal & Licensing", icon: ShieldCheck },
    { id: "tax", label: "Tax & Compliance", icon: FileCode2 },
    { id: "extended", label: "Extended Profile", icon: Briefcase },
    { id: "notes", label: "Internal Notes", icon: ScrollText },
    { id: "report_branding", label: "Report Branding", icon: Palette },
    { id: "signatories", label: "Signatories", icon: Pencil },
    { id: "documents", label: "Documents", icon: Files },
    { id: "ai_review", label: "AI Review & Update", icon: Brain },
  ];
  const [activeSection, setActiveSection] = useWorkspaceFormSection(FORM_ID, "basic", sections.map(section => section.id));
  const [signatoryOpen, setSignatoryOpen] = useState(false);
  const queryClient = useQueryClient();

  const isEditing = session.savedId !== null;
  const canManage = organization
    ? hasPermissionInScope(authContext, "organizations.manage", organization.id)
    : hasGlobalPermission(authContext, "organizations.manage");
  const isViewing = mode === "view" || !canManage;
  const readOnly = useRef(isViewing);
  useLayoutEffect(() => { readOnly.current = isViewing; }, [isViewing]);
  const canManageReportBranding = !!organization && hasPermissionInScope(authContext,"reports.manage",organization.id) && hasPermissionInScope(authContext,"organizations.manage",organization.id);

  const { isDirty, resetDirty } = useFormDirty({ formId: FORM_ID, enabled: !isViewing });

  useEffect(() => {
    if (activeTab?.id) markDirty(activeTab.id, localOutcome !== "confirmed" && (isDirty || session.uncertain));
  }, [isDirty, session.uncertain, localOutcome, activeTab?.id, markDirty]);

  // ── Draft preservation (UI.4E.2) ──────────────────────────────────────────
  const { getDraftDefault, getDraftNullableId, getDraftBoolean, hasDraftField, syncDraft, writeDraftField: writeField, clearDraft } = useWorkspaceFormDraft({
    formId: FORM_ID,
    enabled: !isViewing,
  });
  const geographyFields = ["country_id", "emirate_id", "city_id", "area_zone_id"];
  const geographyEdited = useRef(new Set(geographyFields.filter(hasDraftField)));
  const writeDraftField: typeof writeField = (name, value) => {
    if (geographyFields.includes(name)) geographyEdited.current.add(name);
    writeField(name, value);
  };
  const [countryId, setCountryId] = useState(() => getDraftNullableId("country_id", organization?.country_id));
  const [emirateId, setEmirateId] = useState(() => getDraftNullableId("emirate_id", organization?.emirate_id));
  const [cityId, setCityId] = useState(() => getDraftNullableId("city_id", organization?.city_id));
  const [areaZoneId, setAreaZoneId] = useState(() => getDraftNullableId("area_zone_id", organization?.area_zone_id));
  const [officeEmirateId, setOfficeEmirateId] = useState(() => getDraftNullableId("office_emirate_id", (organization as Record<string, unknown>)?.office_emirate_id as number | null));
  const [officeCityId, setOfficeCityId] = useState(() => getDraftNullableId("office_city_id", (organization as Record<string, unknown>)?.office_city_id as number | null));
  const [currencyId, setCurrencyId] = useState(() => getDraftNullableId("currency_id"));
  const [currencyLoading, setCurrencyLoading] = useState(false);
  const [currencyLookupMessage, setCurrencyLookupMessage] = useState<string | null>(null);
  const currencyEdited = useRef(hasDraftField("currency_id"));
  const saving = useRef(false);

  // Initialize currency
  useEffect(() => {
    if (hasDraftField("currency_id")) return;
    let cancelled = false;
    async function loadCurrency() {
      const code = organization?.default_currency ?? "AED";
      const supabase = createClient();
      setCurrencyLoading(true);
      setCurrencyLookupMessage(null);
      try {
        const { data, error } = await supabase.from("currencies").select("id, currency_code").eq("currency_code", code).eq("is_active", true).maybeSingle();
        if (!cancelled && !currencyEdited.current) {
          if (error) setCurrencyLookupMessage("The default currency could not be loaded. Choose an available currency or reload this record.");
          else if (data) setCurrencyId(data.id);
          else setCurrencyLookupMessage("The default currency is unavailable. Choose an active currency before saving.");
        }
      } catch { if (!cancelled && !currencyEdited.current) setCurrencyLookupMessage("The default currency could not be loaded. Choose an available currency or reload this record."); }
      finally { if (!cancelled) setCurrencyLoading(false); }
    }
    void loadCurrency();
    return () => { cancelled = true; };
  }, [organization?.default_currency, hasDraftField]);

  const handleCountryChange = (id: number | null) => { setCountryId(id); setEmirateId(null); setCityId(null); setAreaZoneId(null); writeDraftField("country_id", id ?? ""); writeDraftField("emirate_id", ""); writeDraftField("city_id", ""); writeDraftField("area_zone_id", ""); };

  const handleEmirateChange = (id: number | null) => {
    setEmirateId(id); setCityId(null); setAreaZoneId(null); writeDraftField("emirate_id", id ?? ""); writeDraftField("city_id", ""); writeDraftField("area_zone_id", "");
  };

  const handleCityChange = (id: number | null) => { setCityId(id); setAreaZoneId(null); writeDraftField("city_id", id ?? ""); writeDraftField("area_zone_id", ""); };

  const handleCurrencyChange = (id: number | null) => {
    currencyEdited.current = true;
    setCurrencyLookupMessage(null);
    setCurrencyId(id); writeDraftField("currency_id", id ?? "");
  };


  const companyId = session.savedId ?? 0;

  const handleRequestClose = () => {
    if (saving.current || (session.uncertain && !session.recoveryError && localOutcome !== "confirmed")) return;
    closeTab(activeTab?.id ?? "");
  };

  const handleSave = async (closeAfter = false): Promise<boolean> => {
    if (isViewing || terminal.current || saving.current || (currencyLoading && !session.uncertain)) return false;
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
        const supabase = createClient();
        let currencyCode = organization?.default_currency ?? "AED";
        if (currencyId) {
          const { data: currency, error } = await supabase.from("currencies").select("currency_code").eq("id", currencyId).eq("is_active", true).single();
          if (!isCurrent() || readOnly.current) return false;
          if (error || !currency) { toast.error("Could not verify the selected currency. Your draft is retained; please retry."); return false; }
          currencyCode = currency.currency_code;
        } else if (currencyEdited.current || !organization?.default_currency) {
          toast.error("Please select a currency"); return false;
        }
        const geographyText = async (table: "countries" | "emirates" | "cities" | "areas_zones", field: string, id: number | null, fallback?: string | null) => {
          if (!id) return geographyEdited.current.has(field) ? null : fallback ?? null;
          const { data: place, error } = await supabase.from(table).select("name_en").eq("id", id).single();
          if (error || !place) throw new Error("Selected geography could not be verified");
          return place.name_en;
        };
        const [countryName, emirateName, cityName, areaName] = await Promise.all([
          geographyText("countries", "country_id", countryId, organization?.country),
          geographyText("emirates", "emirate_id", emirateId, organization?.emirate),
          geographyText("cities", "city_id", cityId, organization?.city),
          geographyText("areas_zones", "area_zone_id", areaZoneId, organization?.area),
        ]);
        const data = {
          legal_name_en: formData.get("legal_name_en") as string,
          legal_name_ar: (formData.get("legal_name_ar") as string) || null,
          short_name: (formData.get("short_name") as string) || null,
          ...(isEditing ? {} : { company_code: formData.get("company_code") as string }),
          legal_form: (formData.get("legal_form") as string) || null,
          country: countryName,
          status: (formData.get("status") as "active" | "inactive" | "suspended") || "active",
          default_currency: currencyCode,
          country_id: countryId,
          emirate_id: emirateId,
          city_id: cityId,
          area_zone_id: areaZoneId,
          emirate: emirateName,
          city: cityName,
          area: areaName,
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
          compliance_status: formData.get("compliance_status") || "compliant",
          office_address_line_1: (formData.get("office_address_line_1") as string) || null,
          office_address_line_2: (formData.get("office_address_line_2") as string) || null,
          office_emirate_id: officeEmirateId,
          office_city_id: officeCityId,
        };
        if (!isCurrent() || readOnly.current) return false;
        const parsed = isEditing
          ? updateOrganizationSchema.safeParse({ ...data, id: session.savedId })
          : createOrganizationSchema.safeParse({ ...data, company_code: formData.get("company_code") as string });
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
        ? await createOrganization(pending.payload as CreateOrganizationInput, pending.contract)
        : await updateOrganization(pending.payload as UpdateOrganizationInput, pending.contract);
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
        toast.error(result.error ?? "Organization save could not be confirmed. Retry the same save.");
        return false;
      }
      const receipt = administrationSaveReceiptSchema.parse(result.data);
      if (pending.id !== null && receipt.id !== pending.id) throw new Error("Save response does not match the record.");
      // This server result is confirmed before any local acknowledgement/display work.
      confirmed = true;
      session.accept(receipt);
      setRecoveryNotice(null);
      clearDraft(); resetDirty();
      toast.success(receipt.changed === false ? "No changes to save" : wasNew ? "Organization created" : "Organization updated");
      if (result.warning) toast.warning(result.warning);
      invalidateOrganizations(queryClient);
      const route = `/admin/organizations/record/${receipt.id}?mode=edit`;
      if (activeTab?.id) {
        markDirty(activeTab.id, false);
        navigation.updateTabRoute(activeTab.id, route, receipt.id, "edit");
        navigation.renameTab(activeTab.id, pending.payload.legal_name_en ?? organization?.legal_name_en ?? "Organization", organization?.company_code ?? (pending.payload as CreateOrganizationInput).company_code);
        if (closeAfter) closeTab(activeTab.id, { force: true });
        else if (wasNew && navigation.isTabActive(activeTab.id)) router.replace(route);
      } else if (wasNew) router.replace(route);
      void queryClient.invalidateQueries({ queryKey: queryKeys.commonMd.companySignatories(receipt.id) });
      router.refresh();
      return true;
    } catch {
      if (!isCurrent()) return false;
      if (confirmed || rejected) {
        terminal.current = true;
        session.setUncertain(false);
        setLocalOutcome(confirmed ? "confirmed" : "rejected");
        setRecoveryNotice(confirmed
          ? "Organization saved, but its local confirmation or display could not finish. Close and reopen the record before continuing."
          : "Organization change was rejected, but local recovery could not finish. Your draft is retained. Close and reopen the record before continuing.");
        return confirmed;
      }
      if (dispatched) session.setUncertain(true);
      if (session.recoveryError) { terminal.current = true; setLocalOutcome("blocked"); }
      const message = dispatched ? "Organization save is unconfirmed. Retry the same save to recover its result." : "Organization could not be prepared for saving. Your draft is retained; check its fields and current revision.";
      setRecoveryNotice(session.recoveryError ?? message);
      try { toast.error(message); } catch { /* The retained result remains authoritative. */ }
      return false;
    }
    finally { if (isCurrent()) setIsSubmitting(false); saving.current = false; }
  };

  const handleSaveAndClose = async () => {
    await handleSave(true);
  };

  const disabled = isViewing || isSubmitting || session.uncertain || localOutcome !== null;


  return (
    <ERPRecordWorkspaceForm
      mode={isViewing ? "view" : isEditing ? "edit" : "add"}
      title={isViewing ? "View Organization" : isEditing ? "Edit Organization" : "New Organization"}
      subtitle={organization ? `${organization.legal_name_en} (${organization.company_code})` : "Register a new legal corporate company"}
      recordCode={organization?.company_code}
      sections={sections}
      activeSection={activeSection}
      onSectionChange={setActiveSection}
      isDirty={localOutcome !== "confirmed" && (isDirty || session.uncertain)}
      onSave={isViewing || localOutcome !== null ? undefined : () => handleSave()}
      onSaveAndClose={isViewing || localOutcome !== null ? undefined : handleSaveAndClose}
      onRequestClose={handleRequestClose}
      isSubmitting={isSubmitting}
      isChildDialogOpen={signatoryOpen}
    >
      <form id={FORM_ID} onSubmit={(e) => { e.preventDefault(); handleSaveAndClose(); }} onInput={syncDraft} onChange={syncDraft}>
        {(recoveryNotice || session.uncertain) && <p role="status" className="mb-4 text-sm text-muted-foreground">{recoveryNotice ?? session.recoveryError ?? "The last save is unconfirmed. Click Save again to recover the same submitted change."}</p>}
        {companyId > 0 ? (
          <>
            <DuplicateCandidateAlert entityType="company" entityId={companyId} />
            <ComplianceFindingAlert entityType="company" entityId={companyId} />
            <RiskScoreAlert entityType="company" entityId={companyId} />
          </>
        ) : null}
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
              {currencyLookupMessage && <p role="status" className="text-sm text-muted-foreground">{currencyLookupMessage}</p>}
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
              <CountrySelect value={countryId} savedSelection={savedSelection(organization?.country_id, organization?.country || `Country #${organization?.country_id}`)} onValueChange={handleCountryChange} placeholder="Select Country" disabled={disabled} />
              {organization?.country && !countryId && <p className="text-[9px] text-amber-600">Legacy Country: {organization.country}</p>}
            </div>
            <div className="col-span-6 space-y-1.5">
              <Label className="text-muted-foreground text-xs">Region / Emirate</Label>
              <EmirateSelect value={emirateId} savedSelection={savedSelection(organization?.emirate_id, organization?.emirate || `Emirate #${organization?.emirate_id}`)} onValueChange={handleEmirateChange} countryId={countryId} placeholder="Select Region / Emirate" disabled={disabled || !countryId} />
              {organization?.emirate && !emirateId && <p className="text-[9px] text-amber-600">Legacy: {organization.emirate}</p>}
            </div>
            <div className="col-span-6 space-y-1.5">
              <Label className="text-muted-foreground text-xs">City</Label>
              <CitySelect value={cityId} savedSelection={savedSelection(organization?.city_id, organization?.city || `City #${organization?.city_id}`)} onValueChange={handleCityChange} emirateId={emirateId} placeholder="Select City" disabled={disabled || !emirateId} />
              {organization?.city && !cityId && <p className="text-[9px] text-amber-600">Legacy: {organization.city}</p>}
            </div>
            <div className="col-span-6 space-y-1.5">
              <Label className="text-muted-foreground text-xs">Area / Zone</Label>
                  <AreaZoneSelect value={areaZoneId} savedSelection={savedSelection(organization?.area_zone_id, organization?.area || `Area / Zone #${organization?.area_zone_id}`)} onValueChange={(v) => { setAreaZoneId(v); writeDraftField("area_zone_id", v ?? ""); }} cityId={cityId} placeholder="Select Area / Zone" disabled={disabled || !cityId} />
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
              <Checkbox id="vat_registered" name="vat_registered" defaultChecked={getDraftBoolean("vat_registered", organization?.vat_registered ?? true)} disabled={disabled} />
              <Label htmlFor="vat_registered" className="cursor-pointer text-muted-foreground text-xs font-normal">VAT Registered</Label>
            </div>
            <div className="col-span-6 space-y-1.5">
              <Label htmlFor="corporate_tax_no" className="text-muted-foreground text-xs">Corporate Tax Number</Label>
              <Input id="corporate_tax_no" name="corporate_tax_no" defaultValue={getDraftDefault("corporate_tax_no", organization?.corporate_tax_no ?? "")} disabled={disabled} />
            </div>
            <div className="col-span-6 flex items-center space-x-2 pt-6">
              <Checkbox id="corporate_tax_registered" name="corporate_tax_registered" defaultChecked={getDraftBoolean("corporate_tax_registered", organization?.corporate_tax_registered ?? false)} disabled={disabled} />
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
              <EmirateSelect value={officeEmirateId} savedSelection={savedSelection(organization?.office_emirate_id, `Emirate #${organization?.office_emirate_id}`)} onValueChange={(v) => { setOfficeEmirateId(v); setOfficeCityId(null); writeDraftField("office_emirate_id", v); writeDraftField("office_city_id", null); }} placeholder="Select Emirate" disabled={disabled} />
            </div>
            <div className="col-span-6 space-y-1.5">
              <Label className="text-muted-foreground text-xs">Office City</Label>
              <CitySelect value={officeCityId} savedSelection={savedSelection(organization?.office_city_id, `City #${organization?.office_city_id}`)} onValueChange={(v) => { setOfficeCityId(v); writeDraftField("office_city_id", v ?? ""); }} emirateId={officeEmirateId} placeholder="Select City" disabled={disabled || !officeEmirateId} />
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

      {/* BRANDING.3 — Report Branding section */}
      <ERPRecordSectionPanel id="report_branding" activeId={activeSection} title="Report Branding">
        <OrganizationBrandingSection
          companyId={companyId}
          canManage={canManageReportBranding}
        />
      </ERPRecordSectionPanel>

      {/* Signatories � child records, managed independently of main form */}
      <ERPRecordSectionPanel id="signatories" activeId={activeSection} title="Authorized Signatories">
        {!companyId ? <p className="text-sm text-muted-foreground">Save the organization first to manage signatories.</p> :
          <CompanySignatoriesSection companyId={companyId} authContext={authContext} enabled={activeSection === "signatories"}
            readOnly={mode === "view" || isSubmitting || session.uncertain} onChildOpen={setSignatoryOpen} />}
      </ERPRecordSectionPanel>

      {/* DMS Documents tab � entityType: company */}
      <ERPRecordSectionPanel id="documents" activeId={activeSection} title="Documents">
        {!companyId ? (
          <p className="text-sm text-muted-foreground">Save the organization first to manage documents.</p>
        ) : (
          <DmsEntityDocumentsTab
            authContext={authContext}
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

      {/* AI Review & Update � Stage 1 pilot (COMMON AI.1F) */}
      <ERPRecordSectionPanel id="ai_review" activeId={activeSection} title="AI Review & Update">
        {!companyId ? (
          <p className="text-sm text-muted-foreground">Save the organization first to use AI suggestions.</p>
        ) : (
          <AiFieldSuggestionsPanel
            entityType="company"
            entityId={companyId}
            entityLabel={(organization as Record<string, unknown>)?.trade_name as string | undefined ?? organization?.legal_name_en ?? "Organization"}
            canGenerate={!disabled}
            canApply={!disabled}
          />
        )}
      </ERPRecordSectionPanel>
    </ERPRecordWorkspaceForm>
  );
}
