"use client";

import { useState, useCallback } from "react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { AlertTriangle, Lock } from "lucide-react";
import type { Party, DuplicateMatch } from "@/features/master-data/parties/party-types";
import type { AuthContext } from "@/lib/rbac/check";

function hasPerm(ctx: AuthContext, code: string) {
  return ctx.permissionCodes?.includes(code) || ctx.roleCodes?.includes("system_admin") || ctx.roleCodes?.includes("group_admin");
}
import { createParty, updateParty, detectPartyDuplicates } from "@/server/actions/master-data/parties";
import { CountrySelect, EmirateSelect, CitySelect, AreaZoneSelect } from "@/components/erp/geography";
import { CurrencySelect, PaymentTermSelect } from "@/components/erp/finance-basics";
import { RequiredLabel } from "@/components/erp/required-label";
import { ERPFormFooter } from "@/components/erp/erp-form-footer";
import {
  ERPDrawerForm,
  ERPDrawerSectionNav,
  ERPDrawerBody,
  ERPDrawerSection,
  ERPFieldGrid,
} from "@/components/erp/erp-drawer-form";
import {
  Building2,
  Users,
  FileText,
  DollarSign,
  MapPin,
  Shield,
  Tag,
  Landmark,
} from "lucide-react";
import { useFormDirty } from "@/hooks/use-form-dirty";
import { PartyTypesTab } from "./party-types-tab";
import { PartyLicensesTab } from "./party-licenses-tab";
import { PartyTaxFinanceTab } from "./party-tax-finance-tab";
import { PartyContactsTab } from "./party-contacts-tab";
import { PartyAddressesTab } from "./party-addresses-tab";
import { PartyBankDetailsTab } from "./party-bank-details-tab";
import { PartyDmsDocumentsTab } from "./party-dms-documents-tab";
import { PartyServicesTab } from "./party-services-tab";
import { PartyNotesTab } from "./party-notes-tab";
import { PartyAuditTab } from "./party-audit-tab";

// Dynamic ID-backed selects for party-specific lookups
import { useQuery } from "@tanstack/react-query";
import { getPartyNatures, getPartyStatuses } from "@/server/actions/master-data/parties";
import { PartySelect } from "@/components/erp/party-select";
import { ERPCombobox } from "@/components/erp/combobox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

type PartyFormDrawerProps = {
  party?: Party | null;
  mode: "add" | "edit" | "view";
  open: boolean;
  onOpenChange: (open: boolean) => void;
  authContext: AuthContext;
  defaultTypeCode?: string | null;
};

export function PartyFormDrawer(props: PartyFormDrawerProps) {
  if (!props.open) return null;
  return (
    <PartyFormDrawerInner
      key={`${props.mode}-${props.party?.id ?? "new"}`}
      {...props}
    />
  );
}

function PartyFormDrawerInner({ party, mode, open, onOpenChange, authContext, defaultTypeCode }: PartyFormDrawerProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeSection, setActiveSection] = useState("basic");
  const [mountedSections, setMountedSections] = useState<Set<string>>(
    () => new Set(["basic"])
  );

  const [currentMode, setCurrentMode] = useState<"add" | "edit" | "view">(mode);
  const [createdPartyId, setCreatedPartyId] = useState<number | null>(null);
  const isEditing = currentMode === "edit";
  const isViewing = currentMode === "view";

  const effectivePartyId = party?.id ?? createdPartyId;

  const { isDirty, resetDirty } = useFormDirty({
    formId: "party-form",
    enabled: !isViewing,
  });

  // Geography state
  const [countryId, setCountryId] = useState<number | null>(party?.country_id ?? null);
  const [emirateId, setEmirateId] = useState<number | null>(party?.emirate_id ?? null);
  const [cityId, setCityId] = useState<number | null>(party?.city_id ?? null);
  const [areaZoneId, setAreaZoneId] = useState<number | null>(party?.area_zone_id ?? null);

  // Lookup state
  const [partyNatureId, setPartyNatureId] = useState<number | null>(party?.party_nature_id ?? null);
  const [partyStatusId, setPartyStatusId] = useState<number | null>(party?.party_status_id ?? null);
  const [isActive, setIsActive] = useState<boolean>(party?.is_active ?? true);
  const [parentPartyId, setParentPartyId] = useState<number | null>(party?.parent_party_id ?? null);

  // Child dialog blocking — when any child tab dialog is open, the drawer content becomes inert
  const [childDialogOpen, setChildDialogOpen] = useState(false);
  const handleChildOpen = useCallback((open: boolean) => setChildDialogOpen(open), []);

  // Duplicate detection state
  const [duplicates, setDuplicates] = useState<DuplicateMatch[]>([]);
  const [showDuplicateDialog, setShowDuplicateDialog] = useState(false);
  const [pendingSaveCallback, setPendingSaveCallback] = useState<(() => Promise<boolean>) | null>(null);

  const canOverrideDuplicate = authContext.permissionCodes?.includes("master_data.parties.override_duplicate");

  // Fetch lookups
  const { data: natures } = useQuery({
    queryKey: ["party_natures"],
    queryFn: async () => {
      const r = await getPartyNatures();
      return r.data ?? [];
    },
    staleTime: 5 * 60 * 1000,
  });

  const { data: statuses } = useQuery({
    queryKey: ["party_statuses"],
    queryFn: async () => {
      const r = await getPartyStatuses();
      return r.data ?? [];
    },
    staleTime: 5 * 60 * 1000,
  });

  const handleSectionChange = useCallback((id: string) => {
    setActiveSection(id);
    setMountedSections((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  }, []);

  const sections = [
    { id: "basic", label: "Basic Info", icon: Building2 },
    { id: "types", label: "Party Types", icon: Tag },
    { id: "licenses", label: "Legal & Licenses", icon: Shield },
    { id: "tax", label: "Tax & Finance", icon: DollarSign },
    { id: "contacts", label: "Contacts", icon: Users },
    { id: "addresses", label: "Addresses", icon: MapPin },
    { id: "bank", label: "Bank Details", icon: Landmark },
    { id: "documents", label: "Documents", icon: FileText },
    { id: "services", label: "Services", icon: Tag },
    { id: "notes", label: "Notes", icon: FileText },
    { id: "audit", label: "Audit", icon: Lock },
    { id: "compliance", label: "Compliance", icon: Lock, disabled: true },
  ];

  const childTabLocked = !effectivePartyId;
  const lockedMessage = "Save the party first to unlock this section.";

  const performSave = async (): Promise<boolean> => {
    if (isViewing) return false;

    const form = document.getElementById("party-form") as HTMLFormElement | null;
    if (!form) return false;

    const fd = new FormData(form);

    const payload = {
      display_name: (fd.get("display_name") as string) || "",
      legal_name_en: (fd.get("legal_name_en") as string) || "",
      legal_name_ar: (fd.get("legal_name_ar") as string) || null,
      trade_name_en: (fd.get("trade_name_en") as string) || null,
      trade_name_ar: (fd.get("trade_name_ar") as string) || null,
      short_name: (fd.get("short_name") as string) || null,
      party_nature_id: partyNatureId ?? 0,
      primary_party_type_id: party?.primary_party_type_id ?? null,
      parent_party_id: parentPartyId,
      main_phone: (fd.get("main_phone") as string) || null,
      main_mobile: (fd.get("main_mobile") as string) || null,
      whatsapp: (fd.get("whatsapp") as string) || null,
      main_email: (fd.get("main_email") as string) || null,
      alternate_email: (fd.get("alternate_email") as string) || null,
      website: (fd.get("website") as string) || null,
      country_id: countryId ?? 0,
      emirate_id: emirateId,
      city_id: cityId,
      area_zone_id: areaZoneId,
      po_box: (fd.get("po_box") as string) || null,
      full_address_text: (fd.get("full_address_text") as string) || null,
      google_map_url: (fd.get("google_map_url") as string) || null,
      latitude: fd.get("latitude") ? parseFloat(fd.get("latitude") as string) : null,
      longitude: fd.get("longitude") ? parseFloat(fd.get("longitude") as string) : null,
      party_status_id: partyStatusId ?? 0,
      is_active: isActive,
      remarks: (fd.get("remarks") as string) || null,
    };

    try {
      let result;
      if (isEditing && (party || createdPartyId)) {
        const id = party?.id ?? createdPartyId!;
        result = await updateParty({ id, ...payload });
      } else {
        result = await createParty(payload);
      }

      if (result.success) {
        toast.success(`Party ${isEditing ? "updated" : "created"} successfully`);
        resetDirty();
        if (!isEditing && result.data && "id" in result.data) {
          setCreatedPartyId(result.data.id);
          setCurrentMode("edit");
        }
        return true;
      } else {
        toast.error(result.error ?? "Failed to save party");
        return false;
      }
    } catch {
      toast.error("An unexpected error occurred");
      return false;
    }
  };

  const handleSave = async (): Promise<boolean> => {
    if (isViewing) return false;
    setIsSubmitting(true);

    try {
      // Run duplicate detection before save
      const form = document.getElementById("party-form") as HTMLFormElement | null;
      const fd = form ? new FormData(form) : null;

      const dupResult = await detectPartyDuplicates({
        legal_name_en: (fd?.get("legal_name_en") as string) || null,
        trade_name_en: (fd?.get("trade_name_en") as string) || null,
        main_email: (fd?.get("main_email") as string) || null,
        main_mobile: (fd?.get("main_mobile") as string) || null,
        main_phone: (fd?.get("main_phone") as string) || null,
        website: (fd?.get("website") as string) || null,
        exclude_party_id: party?.id ?? createdPartyId ?? null,
      });

      if (dupResult.success && (dupResult.data?.length ?? 0) > 0) {
        setDuplicates(dupResult.data ?? []);
        setShowDuplicateDialog(true);
        setPendingSaveCallback(() => performSave);
        return false;
      }

      return await performSave();
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSaveAndClose = async () => {
    const success = await handleSave();
    if (success) onOpenChange(false);
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (isViewing) {
      onOpenChange(false);
      return;
    }
    await handleSaveAndClose();
  };

  return (
    <>
      <ERPDrawerForm
        open={open}
        onOpenChange={onOpenChange}
        title={isViewing ? "View Party" : isEditing ? "Edit Party" : "New Party"}
        subtitle={party?.party_code ?? undefined}
        mode={currentMode}
        status={party ? (party.is_active ? "Active" : "Inactive") : undefined}
        recordNumber={party?.party_code}
        isDirty={isDirty}
      >
        {/* When any child dialog is open, make the entire drawer content inert so the
            user cannot interact with tabs, fields, or footer buttons behind the dialog.
            Child dialogs render via DialogPortal to document.body (outside this div)
            so they remain fully interactive. The opacity dims the drawer visually. */}
        <div
          inert={childDialogOpen || undefined}
          className={cn(
            "flex flex-row flex-1 overflow-hidden min-h-0",
            "transition-opacity duration-200",
            childDialogOpen && "opacity-50"
          )}
        >

        <ERPDrawerSectionNav
          sections={sections}
          activeSection={activeSection}
          setActiveSection={handleSectionChange}
        />

        <form id="party-form" onSubmit={handleSubmit} className="flex-1 flex flex-col overflow-hidden">
          <ERPDrawerBody>
            {/* ──────────── Tab 1: Basic Information ──────────── */}
            <ERPDrawerSection id="basic" activeId={activeSection} title="Basic Information">
              {/* A. Identity */}
              <div className="mb-6">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">Identity</h3>
                <ERPFieldGrid>
                  <div className="col-span-6">
                    <Label htmlFor="party_code">Party Code</Label>
                    <Input
                      id="party_code"
                      name="party_code"
                      defaultValue={party?.party_code}
                      disabled
                      placeholder={isEditing ? party?.party_code : "Auto-generated on save"}
                      className="font-mono"
                    />
                    {!isEditing && (
                      <p className="text-xs text-muted-foreground mt-1">Auto-generated on save</p>
                    )}
                  </div>

                  <div className="col-span-6">
                    <RequiredLabel htmlFor="display_name" required>Display Name</RequiredLabel>
                    <Input
                      id="display_name"
                      name="display_name"
                      defaultValue={party?.display_name}
                      required
                      disabled={isViewing}
                    />
                  </div>

                  <div className="col-span-6">
                    <RequiredLabel htmlFor="legal_name_en" required>Legal Name (English)</RequiredLabel>
                    <Input
                      id="legal_name_en"
                      name="legal_name_en"
                      defaultValue={party?.legal_name_en}
                      required
                      disabled={isViewing}
                    />
                  </div>

                  <div className="col-span-6">
                    <Label htmlFor="legal_name_ar">Legal Name (Arabic)</Label>
                    <Input
                      id="legal_name_ar"
                      name="legal_name_ar"
                      defaultValue={party?.legal_name_ar ?? ""}
                      disabled={isViewing}
                      dir="rtl"
                    />
                  </div>

                  <div className="col-span-6">
                    <Label htmlFor="trade_name_en">Trade Name (English)</Label>
                    <Input
                      id="trade_name_en"
                      name="trade_name_en"
                      defaultValue={party?.trade_name_en ?? ""}
                      disabled={isViewing}
                    />
                  </div>

                  <div className="col-span-6">
                    <Label htmlFor="trade_name_ar">Trade Name (Arabic)</Label>
                    <Input
                      id="trade_name_ar"
                      name="trade_name_ar"
                      defaultValue={party?.trade_name_ar ?? ""}
                      disabled={isViewing}
                      dir="rtl"
                    />
                  </div>

                  <div className="col-span-6">
                    <Label htmlFor="short_name">Short Name</Label>
                    <Input
                      id="short_name"
                      name="short_name"
                      defaultValue={party?.short_name ?? ""}
                      disabled={isViewing}
                    />
                  </div>

                  <div className="col-span-6">
                    <RequiredLabel htmlFor="party_nature_id" required>Party Nature</RequiredLabel>
                    <ERPCombobox
                      value={partyNatureId}
                      onValueChange={(v) => setPartyNatureId(v !== null ? Number(v) : null)}
                      options={(natures ?? []).map((n) => ({ value: n.id, label: n.name_en }))}
                      placeholder="Select nature..."
                      disabled={isViewing}
                      required
                    />
                  </div>

                  <div className="col-span-12">
                    <Label htmlFor="parent_party_id">Parent Party</Label>
                    <PartySelect
                      value={parentPartyId}
                      onValueChange={setParentPartyId}
                      excludePartyId={party?.id ?? createdPartyId ?? undefined}
                      placeholder="Select parent party (optional)..."
                      disabled={isViewing}
                      allowClear
                    />
                  </div>
                </ERPFieldGrid>
              </div>

              {/* B. Communication */}
              <div className="mb-6">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">Communication</h3>
                <ERPFieldGrid>
                  <div className="col-span-4">
                    <Label htmlFor="main_phone">Main Phone</Label>
                    <Input
                      id="main_phone"
                      name="main_phone"
                      defaultValue={party?.main_phone ?? ""}
                      disabled={isViewing}
                    />
                  </div>

                  <div className="col-span-4">
                    <Label htmlFor="main_mobile">Main Mobile</Label>
                    <Input
                      id="main_mobile"
                      name="main_mobile"
                      defaultValue={party?.main_mobile ?? ""}
                      disabled={isViewing}
                    />
                  </div>

                  <div className="col-span-4">
                    <Label htmlFor="whatsapp">WhatsApp</Label>
                    <Input
                      id="whatsapp"
                      name="whatsapp"
                      defaultValue={party?.whatsapp ?? ""}
                      disabled={isViewing}
                    />
                  </div>

                  <div className="col-span-6">
                    <Label htmlFor="main_email">Main Email</Label>
                    <Input
                      id="main_email"
                      name="main_email"
                      type="email"
                      defaultValue={party?.main_email ?? ""}
                      disabled={isViewing}
                    />
                  </div>

                  <div className="col-span-6">
                    <Label htmlFor="alternate_email">Alternate Email</Label>
                    <Input
                      id="alternate_email"
                      name="alternate_email"
                      type="email"
                      defaultValue={party?.alternate_email ?? ""}
                      disabled={isViewing}
                    />
                  </div>

                  <div className="col-span-12">
                    <Label htmlFor="website">Website</Label>
                    <Input
                      id="website"
                      name="website"
                      type="url"
                      defaultValue={party?.website ?? ""}
                      disabled={isViewing}
                      placeholder="https://example.com"
                    />
                  </div>
                </ERPFieldGrid>
              </div>

              {/* C. Primary Location */}
              <div className="mb-6">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">Primary Location</h3>
                <ERPFieldGrid>
                  <div className="col-span-6">
                    <RequiredLabel htmlFor="country_id" required>Country</RequiredLabel>
                    <CountrySelect
                      value={countryId}
                      onValueChange={(v) => {
                        setCountryId(v);
                        setEmirateId(null);
                        setCityId(null);
                        setAreaZoneId(null);
                      }}
                      disabled={isViewing}
                    />
                  </div>

                  <div className="col-span-6">
                    <Label htmlFor="emirate_id">Emirate / Region</Label>
                    <EmirateSelect
                      countryId={countryId}
                      value={emirateId}
                      onValueChange={(v) => {
                        setEmirateId(v);
                        setCityId(null);
                        setAreaZoneId(null);
                      }}
                      disabled={isViewing || !countryId}
                    />
                  </div>

                  <div className="col-span-6">
                    <Label htmlFor="city_id">City</Label>
                    <CitySelect
                      emirateId={emirateId}
                      value={cityId}
                      onValueChange={(v) => {
                        setCityId(v);
                        setAreaZoneId(null);
                      }}
                      disabled={isViewing || !emirateId}
                    />
                  </div>

                  <div className="col-span-6">
                    <Label htmlFor="area_zone_id">Area / Zone</Label>
                    <AreaZoneSelect
                      cityId={cityId}
                      value={areaZoneId}
                      onValueChange={setAreaZoneId}
                      disabled={isViewing || !cityId}
                    />
                  </div>

                  <div className="col-span-4">
                    <Label htmlFor="po_box">PO Box</Label>
                    <Input
                      id="po_box"
                      name="po_box"
                      defaultValue={party?.po_box ?? ""}
                      disabled={isViewing}
                    />
                  </div>

                  <div className="col-span-8">
                    <Label htmlFor="full_address_text">Full Address</Label>
                    <Input
                      id="full_address_text"
                      name="full_address_text"
                      defaultValue={party?.full_address_text ?? ""}
                      disabled={isViewing}
                    />
                  </div>

                  <div className="col-span-12">
                    <Label htmlFor="google_map_url">Google Maps URL</Label>
                    <Input
                      id="google_map_url"
                      name="google_map_url"
                      defaultValue={party?.google_map_url ?? ""}
                      disabled={isViewing}
                      placeholder="https://maps.google.com/..."
                    />
                  </div>
                </ERPFieldGrid>
              </div>

              {/* D. Status & Remarks */}
              <div className="mb-2">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">Status & Remarks</h3>
                <ERPFieldGrid>
                  <div className="col-span-6">
                    <RequiredLabel htmlFor="party_status_id" required>Party Status</RequiredLabel>
                    <ERPCombobox
                      value={partyStatusId}
                      onValueChange={(v) => setPartyStatusId(v !== null ? Number(v) : null)}
                      options={(statuses ?? []).map((s) => ({ value: s.id, label: s.name_en }))}
                      placeholder="Select status..."
                      disabled={isViewing}
                      required
                    />
                  </div>

                  <div className="col-span-6 flex items-end gap-3 pb-1">
                    <Label htmlFor="is_active">Active</Label>
                    <Switch
                      id="is_active"
                      name="is_active"
                      checked={isActive}
                      onCheckedChange={setIsActive}
                      disabled={isViewing}
                    />
                    <span className="text-sm text-muted-foreground">{isActive ? "Yes" : "No"}</span>
                  </div>

                  <div className="col-span-12">
                    <Label htmlFor="remarks">Remarks</Label>
                    <Textarea
                      id="remarks"
                      name="remarks"
                      defaultValue={party?.remarks ?? ""}
                      disabled={isViewing}
                      rows={3}
                    />
                  </div>
                </ERPFieldGrid>
              </div>

              {childTabLocked && !isViewing && (
                <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  Contacts, Addresses, Bank Details, Documents, and other sections unlock after the party is saved.
                </div>
              )}
            </ERPDrawerSection>

            {/* ──────────── Tab 2: Party Types ──────────── */}
            <ERPDrawerSection id="types" activeId={activeSection} title="Party Types" lazyMount>
              <PartyTypesTab
                partyId={effectivePartyId}
                disabled={isViewing}
                authContext={authContext}
                defaultTypeCode={mode === "add" ? defaultTypeCode : undefined}
              />
            </ERPDrawerSection>

            {/* ──────────── Tab 3: Legal & Licenses ──────────── */}
            <ERPDrawerSection id="licenses" activeId={activeSection} title="Legal &amp; Licenses" lazyMount>
              {childTabLocked ? (
                <LockedTabMessage />
              ) : (
                <PartyLicensesTab partyId={effectivePartyId!} disabled={isViewing} onChildOpen={handleChildOpen} />
              )}
            </ERPDrawerSection>

            {/* ──────────── Tab 4: Tax & Finance ──────────── */}
            <ERPDrawerSection id="tax" activeId={activeSection} title="Tax &amp; Finance" lazyMount>
              {childTabLocked ? (
                <LockedTabMessage />
              ) : (
                <PartyTaxFinanceTab partyId={effectivePartyId!} disabled={isViewing} onChildOpen={handleChildOpen} />
              )}
            </ERPDrawerSection>

            {/* ──────────── Tab 5: Contacts ──────────── */}
            <ERPDrawerSection id="contacts" activeId={activeSection} title="Contacts" lazyMount>
              {childTabLocked ? (
                <LockedTabMessage />
              ) : (
                <PartyContactsTab partyId={effectivePartyId!} disabled={isViewing} onChildOpen={handleChildOpen} />
              )}
            </ERPDrawerSection>

            {/* ──────────── Tab 6: Addresses ──────────── */}
            <ERPDrawerSection id="addresses" activeId={activeSection} title="Addresses" lazyMount>
              {childTabLocked ? (
                <LockedTabMessage />
              ) : (
                <PartyAddressesTab partyId={effectivePartyId!} disabled={isViewing} onChildOpen={handleChildOpen} />
              )}
            </ERPDrawerSection>

            {/* ──────────── Tab 7: Bank Details ──────────── */}
            <ERPDrawerSection id="bank" activeId={activeSection} title="Bank Details" lazyMount>
              {childTabLocked ? (
                <LockedTabMessage />
              ) : (
                <PartyBankDetailsTab partyId={effectivePartyId!} disabled={isViewing} authContext={authContext} onChildOpen={handleChildOpen} />
              )}
            </ERPDrawerSection>

            {/* ──────────── Tab 8: Documents ──────────── */}
            <ERPDrawerSection id="documents" activeId={activeSection} title="Documents" lazyMount>
              {childTabLocked ? (
                <LockedTabMessage />
              ) : (
                <PartyDmsDocumentsTab partyId={effectivePartyId!} disabled={isViewing} onChildOpen={handleChildOpen} />
              )}
            </ERPDrawerSection>

            {/* ──────────── Tab 9: Services / Categories ──────────── */}
            <ERPDrawerSection id="services" activeId={activeSection} title="Services &amp; Categories" lazyMount>
              {childTabLocked ? (
                <LockedTabMessage />
              ) : (
                <PartyServicesTab
                  partyId={effectivePartyId!}
                  canManage={hasPerm(authContext, "master_data.parties.manage_services")}
                  onChildOpen={handleChildOpen}
                />
              )}
            </ERPDrawerSection>

            {/* ──────────── Tab 10: Notes & Activity ──────────── */}
            <ERPDrawerSection id="notes" activeId={activeSection} title="Notes &amp; Activity" lazyMount>
              {childTabLocked ? (
                <LockedTabMessage />
              ) : (
                <PartyNotesTab
                  partyId={effectivePartyId!}
                  canManage={!isViewing && hasPerm(authContext, "master_data.parties.edit")}
                  currentUserProfileId={authContext?.profile?.id ?? null}
                  onChildOpen={handleChildOpen}
                />
              )}
            </ERPDrawerSection>

            {/* ──────────── Tab 11: Audit ──────────── */}
            <ERPDrawerSection id="audit" activeId={activeSection} title="Audit Log" lazyMount>
              {childTabLocked ? (
                <LockedTabMessage />
              ) : (
                <PartyAuditTab
                  partyId={effectivePartyId!}
                  canViewAudit={hasPerm(authContext, "master_data.parties.view_audit")}
                />
              )}
            </ERPDrawerSection>

            {/* ──────────── Tab 12: Compliance (deferred) ──────────── */}
            <ERPDrawerSection id="compliance" activeId={activeSection} title="Compliance" lazyMount>
              <DeferredTabMessage phase="5A.4" />
            </ERPDrawerSection>
          </ERPDrawerBody>

          <ERPFormFooter
            mode={currentMode}
            onCancel={() => onOpenChange(false)}
            onSave={isViewing ? undefined : () => handleSave()}
            onSaveAndClose={isViewing ? undefined : () => handleSaveAndClose()}
            isSubmitting={isSubmitting}
            hasUnsavedChanges={isDirty}
          />
        </form>
        </div>{/* end inert wrapper */}
      </ERPDrawerForm>

      {/* Duplicate Detection Dialog */}
      <Dialog open={showDuplicateDialog} onOpenChange={setShowDuplicateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Possible Duplicate Detected
            </DialogTitle>
            <DialogDescription>
              The following existing parties may be duplicates. Review before proceeding.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {duplicates.map((d) => (
              <div key={d.party_id} className="rounded-md border p-3 text-sm">
                <div className="font-medium">{d.display_name}</div>
                <div className="text-muted-foreground font-mono">{d.party_code}</div>
                <div className="text-xs text-muted-foreground">
                  Match: {d.match_type} — Score: {d.match_score}
                </div>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDuplicateDialog(false)}>
              Go Back
            </Button>
            {canOverrideDuplicate && (
              <Button
                variant="destructive"
                onClick={async () => {
                  setShowDuplicateDialog(false);
                  setIsSubmitting(true);
                  try {
                    if (pendingSaveCallback) {
                      await pendingSaveCallback();
                    }
                  } finally {
                    setIsSubmitting(false);
                    setPendingSaveCallback(null);
                  }
                }}
              >
                Override &amp; Save Anyway
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function LockedTabMessage() {
  return (
    <div className="flex items-center gap-2 rounded-md border border-muted p-4 text-sm text-muted-foreground">
      <Lock className="h-4 w-4 shrink-0" />
      Save the party first to unlock this section.
    </div>
  );
}

function DeferredTabMessage({ phase }: { phase: string }) {
  return (
    <div className="rounded-md border border-dashed border-muted-foreground/30 p-8 text-center text-sm text-muted-foreground">
      <Lock className="mx-auto h-8 w-8 mb-3 text-muted-foreground/40" />
      <p>Available in Phase {phase}</p>
    </div>
  );
}
