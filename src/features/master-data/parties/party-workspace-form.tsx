"use client";

/**
 * ERP GLOBAL UI.4D â€” PartyWorkspaceForm
 *
 * Full workspace record form for Party Master.
 * Replaces PartyFormDrawer for Add / Edit / View.
 * Uses ERPRecordWorkspaceForm (4C) instead of ERPDrawerForm.
 *
 * Logic ported from party-form-drawer.tsx:
 * - Same form fields, same sections, same business logic
 * - Same child-tab components (PartyContactsTab, etc.)
 * - Same duplicate detection
 * - Same server actions (createParty, updateParty)
 * - Same effectivePartyId pattern
 *
 * Key differences from drawer:
 * - No open/onOpenChange â€” workspace tabs don't have show/hide
 * - Close uses workspace.closeTab (4B dirty dialog)
 * - Save & Close uses workspace.closeTab after resetDirty
 * - After Addâ†’Save: tab renamed and route updated to /record/{id}?mode=edit
 * - isChildDialogOpen passed to ERPRecordWorkspaceForm (not manual inert div)
 * - ERPRecordSectionPanel instead of ERPDrawerSection
 */

import { useState, useCallback, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { AlertTriangle, Lock, Building2, Tag, Shield, DollarSign, Users, MapPin, Landmark, FileText, Brain } from "lucide-react";
import type { Party, DuplicateMatch } from "@/features/master-data/parties/party-types";
import type { AuthContext } from "@/lib/rbac/check";
import { createParty, updateParty, detectPartyDuplicates } from "@/server/actions/master-data/parties";
import { CountrySelect, EmirateSelect, CitySelect, AreaZoneSelect } from "@/components/erp/geography";
import { RequiredLabel } from "@/components/erp/required-label";
import { ERPFieldGrid } from "@/components/erp/erp-drawer-form";
import { ERPRecordWorkspaceForm, ERPRecordSectionPanel } from "@/components/workspace/erp-record-workspace-form";
import { useFormDirty } from "@/hooks/use-form-dirty";
import { useWorkspace } from "@/hooks/use-workspace";
import { useWorkspaceTabDirty } from "@/hooks/use-workspace-tab-dirty";
import { useWorkspaceFormDraft } from "@/hooks/use-workspace-form-draft";
import { useWorkspaceSectionState } from "@/hooks/use-workspace-section-state";
import { useWorkspaceScrollState } from "@/hooks/use-workspace-scroll-state";
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
import { AiFieldSuggestionsPanel } from "@/features/ai/common/field-suggestions";
import { DuplicateCandidateAlert } from "@/features/ai/common/duplicate-detection";
import { ComplianceFindingAlert } from "@/features/ai/common/compliance-checker";
import { RiskScoreAlert } from "@/features/ai/common/risk-scoring";
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
import type { ERPRecordSection } from "@/components/workspace/erp-record-section-nav";

function hasPerm(ctx: AuthContext, code: string) {
  return (
    ctx.permissionCodes?.includes(code) ||
    ctx.roleCodes?.includes("system_admin") ||
    ctx.roleCodes?.includes("group_admin")
  );
}

// â”€â”€ Props â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export type PartyWorkspaceFormProps = {
  /** Existing party for edit/view. Undefined for add mode. */
  party?: Party | null;
  mode: "add" | "edit" | "view";
  authContext: AuthContext;
  /** If opened from a filtered view, preselect this type code */
  defaultTypeCode?: string | null;
};

// â”€â”€ Component â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/** Outer guard: key resets inner on mode/id change */
export function PartyWorkspaceForm(props: PartyWorkspaceFormProps) {
  return (
    <PartyWorkspaceFormInner
      key={`${props.mode}-${props.party?.id ?? "new"}`}
      {...props}
    />
  );
}

function PartyWorkspaceFormInner({
  party,
  mode,
  authContext,
  defaultTypeCode,
}: PartyWorkspaceFormProps) {
  const router = useRouter();
  const { closeTab, activeTab, renameTab, updateTabRoute, markDirty, forceCloseActiveTab } = useWorkspace();

  // â”€â”€ Mode state â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const [currentMode, setCurrentMode] = useState<"add" | "edit" | "view">(mode);
  const isViewing = currentMode === "view";
  const isEditing = currentMode === "edit";

  // â”€â”€ Form submission â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeSubmitAction, setActiveSubmitAction] = useState<"save" | "saveAndClose" | null>(null);

  // â”€â”€ Section nav â€” persists across workspace tab switches (UI.4E) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // Existing records: scope="record" keyed by party id.
  // New records:      scope="tab" keyed by the workspace tab id (transient).
  const [activeSection, setActiveSection] = useWorkspaceSectionState(
    party?.id
      ? {
          key: "active-section",
          initialSection: "basic",
          scope: "record",
          recordType: "party",
          recordId: party.id,
        }
      : {
          key: "active-section",
          initialSection: "basic",
          scope: "tab",
          identifier: activeTab?.id ?? "new-party",
        }
  );

  // â”€â”€ Scroll state â€” body scroll position persists across tab switches (UI.4E) â”€
  const bodyScrollRef = useRef<HTMLDivElement>(null);
  useWorkspaceScrollState(
    party?.id
      ? {
          key: "body-scroll",
          ref: bodyScrollRef,
          scope: "record",
          recordType: "party",
          recordId: party.id,
        }
      : {
          key: "body-scroll",
          ref: bodyScrollRef,
          scope: "tab",
          identifier: activeTab?.id ?? "new-party",
        }
  );

  // â”€â”€ Effective party id (unlocks child sections after Addâ†’Save) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const [createdPartyId, setCreatedPartyId] = useState<number | null>(null);
  const effectivePartyId = party?.id ?? createdPartyId;

  // â”€â”€ Dirty tracking â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const { isDirty, resetDirty } = useFormDirty({
    formId: "party-workspace-form",
    enabled: !isViewing,
  });
  useWorkspaceTabDirty({ isDirty, enabled: !isViewing });

  // â”€â”€ Draft preservation (UI.4E.2) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const { getDraftDefault, syncDraft, writeDraftField, clearDraft } = useWorkspaceFormDraft({
    formId: "party-workspace-form",
    enabled: !isViewing,
  });

  // â”€â”€ Geography state â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const [countryId, setCountryId] = useState<number | null>(() => { const d = getDraftDefault("country_id", ""); return d ? Number(d) : party?.country_id ?? null; });
  const [emirateId, setEmirateId] = useState<number | null>(() => { const d = getDraftDefault("emirate_id", ""); return d ? Number(d) : party?.emirate_id ?? null; });
  const [cityId, setCityId] = useState<number | null>(() => { const d = getDraftDefault("city_id", ""); return d ? Number(d) : party?.city_id ?? null; });
  const [areaZoneId, setAreaZoneId] = useState<number | null>(() => { const d = getDraftDefault("area_zone_id", ""); return d ? Number(d) : party?.area_zone_id ?? null; });

  // â”€â”€ Lookup state â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const [partyNatureId, setPartyNatureId] = useState<number | null>(() => { const d = getDraftDefault("party_nature_id", ""); return d ? Number(d) : party?.party_nature_id ?? null; });
  const [partyStatusId, setPartyStatusId] = useState<number | null>(() => { const d = getDraftDefault("party_status_id", ""); return d ? Number(d) : party?.party_status_id ?? null; });
  const [isActive, setIsActive] = useState<boolean>(() => { const d = getDraftDefault("is_active", ""); return d ? d === "true" : party?.is_active ?? true; });
  const [parentPartyId, setParentPartyId] = useState<number | null>(() => { const d = getDraftDefault("parent_party_id", ""); return d ? Number(d) : party?.parent_party_id ?? null; });

  // â”€â”€ Child dialog blocking â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const [childDialogOpen, setChildDialogOpen] = useState(false);
  const handleChildOpen = useCallback((open: boolean) => setChildDialogOpen(open), []);

  // â”€â”€ Duplicate detection state â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const [duplicates, setDuplicates] = useState<DuplicateMatch[]>([]);
  const [showDuplicateDialog, setShowDuplicateDialog] = useState(false);
  const [pendingSaveCallback, setPendingSaveCallback] = useState<(() => Promise<boolean>) | null>(null);

  const canOverrideDuplicate = authContext.permissionCodes?.includes(
    "master_data.parties.override_duplicate"
  );

  // â”€â”€ Fetch lookups â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

  // â”€â”€ Section list â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const childTabLocked = !effectivePartyId;

  const sections: ERPRecordSection[] = useMemo(() => [
    { id: "basic",      label: "Basic Information",    icon: <Building2 className="h-3.5 w-3.5" /> },
    { id: "types",      label: "Party Types",           icon: <Tag className="h-3.5 w-3.5" /> },
    { id: "licenses",   label: "Legal & Licenses",      icon: <Shield className="h-3.5 w-3.5" />, disabled: childTabLocked },
    { id: "tax",        label: "Tax & Finance",          icon: <DollarSign className="h-3.5 w-3.5" />, disabled: childTabLocked },
    { id: "contacts",   label: "Contacts",               icon: <Users className="h-3.5 w-3.5" />, disabled: childTabLocked },
    { id: "addresses",  label: "Addresses",              icon: <MapPin className="h-3.5 w-3.5" />, disabled: childTabLocked },
    { id: "bank",       label: "Bank Details",           icon: <Landmark className="h-3.5 w-3.5" />, disabled: childTabLocked },
    { id: "documents",  label: "Documents",              icon: <FileText className="h-3.5 w-3.5" />, disabled: childTabLocked },
    { id: "services",   label: "Services / Categories",  icon: <Tag className="h-3.5 w-3.5" />, disabled: childTabLocked },
    { id: "notes",      label: "Notes & Activity",       icon: <FileText className="h-3.5 w-3.5" />, disabled: childTabLocked },
    { id: "ai_review",  label: "AI Review & Update",     icon: <Brain className="h-3.5 w-3.5" />, disabled: childTabLocked },
    { id: "audit",      label: "Audit",                  icon: <Lock className="h-3.5 w-3.5" />, disabled: childTabLocked },
    { id: "compliance", label: "Compliance & Approval",  icon: <Shield className="h-3.5 w-3.5" />, disabled: true },
  ], [childTabLocked]);

  // â”€â”€ Workspace close â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const handleRequestClose = useCallback(() => {
    closeTab(activeTab?.id ?? "");
  }, [closeTab, activeTab?.id]);

  // â”€â”€ Core save logic â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const performSave = async (): Promise<boolean> => {
    if (isViewing) return false;

    const form = document.getElementById("party-workspace-form") as HTMLFormElement | null;
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
        clearDraft();
        resetDirty();
        if (activeTab?.id) markDirty(activeTab.id, false);

        if (!isEditing && result.data && "id" in result.data) {
          const newId = (result.data as { id: number }).id;
          const displayName = payload.display_name;
          const partyCode = (result.data as { party_code?: string }).party_code ?? "";
          setCreatedPartyId(newId);
          setCurrentMode("edit");

          // Rename the workspace tab and update its route to the saved record
          if (activeTab?.id) {
            renameTab(activeTab.id, `Party â€” ${displayName}`, partyCode);
            const newRoute = `/admin/master-data/parties/record/${newId}?mode=edit`;
            updateTabRoute(activeTab.id, newRoute, newId, "edit");
            router.replace(newRoute);
          }
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

  // â”€â”€ handleSave with duplicate detection â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const handleSave = async (): Promise<boolean> => {
    if (isViewing) return false;
    setIsSubmitting(true);
    setActiveSubmitAction("save");

    try {
      const form = document.getElementById("party-workspace-form") as HTMLFormElement | null;
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
      setActiveSubmitAction(null);
    }
  };

  // â”€â”€ handleSaveAndClose â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const handleSaveAndClose = async () => {
    setIsSubmitting(true);
    setActiveSubmitAction("saveAndClose");
    try {
      // Run duplicate check then save
      const form = document.getElementById("party-workspace-form") as HTMLFormElement | null;
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
        // Pending callback will only save, not save+close. User decides after dialog.
        setPendingSaveCallback(() => performSave);
        return;
      }

      const success = await performSave();
      if (success) {
        forceCloseActiveTab();
      }
    } finally {
      setIsSubmitting(false);
      setActiveSubmitAction(null);
    }
  };

  // â”€â”€ Type badges for header â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const typeBadges = party?.assigned_type_codes?.length
    ? [party.primary_type_name ?? party.assigned_type_codes[0]].filter(Boolean) as string[]
    : undefined;

  // â”€â”€ Status variant â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const statusVariant = party
    ? party.is_active
      ? ("success" as const)
      : ("muted" as const)
    : undefined;

  // â”€â”€ Render â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  return (
    <>
      <ERPRecordWorkspaceForm
        isDirty={isDirty}
        mode={currentMode}
        title={
          isViewing
            ? party?.display_name ?? "Party"
            : isEditing
            ? party?.display_name ?? "Party"
            : "New Party"
        }
        subtitle="Party Master"
        recordCode={party?.party_code ?? undefined}
        statusLabel={party ? (party.is_active ? "Active" : "Inactive") : undefined}
        statusVariant={statusVariant}
        typeBadges={typeBadges}
        sections={sections}
        activeSection={activeSection}
        onSectionChange={setActiveSection}
        isSubmitting={isSubmitting}
        activeSubmitAction={activeSubmitAction}
        onSave={isViewing ? undefined : () => void handleSave()}
        onSaveAndClose={isViewing ? undefined : handleSaveAndClose}
        onRequestClose={handleRequestClose}
        isChildDialogOpen={childDialogOpen}
        bodyScrollRef={bodyScrollRef}
      >
        {/* â”€â”€ Party form â”€â”€ */}
        <form
          id="party-workspace-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (isViewing) {
              handleRequestClose();
            } else {
              void handleSaveAndClose();
            }
          }}
          onInput={syncDraft}
          onChange={syncDraft}
          className="contents"
        >
          {effectivePartyId ? (
            <>
              <DuplicateCandidateAlert entityType="party" entityId={effectivePartyId} />
              <ComplianceFindingAlert entityType="party" entityId={effectivePartyId} />
              <RiskScoreAlert entityType="party" entityId={effectivePartyId} />
            </>
          ) : null}
          {/* â”€â”€â”€â”€â”€â”€â”€â”€ Section 1: Basic Information â”€â”€â”€â”€â”€â”€â”€â”€ */}
          <ERPRecordSectionPanel id="basic" activeId={activeSection}>
            {/* A. Identity */}
            <div className="mb-6">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">Identity</h3>
              <ERPFieldGrid>
                <div className="col-span-6">
                  <Label htmlFor="party_code">Party Code</Label>
                  <Input
                    id="party_code"
                    name="party_code"
                    defaultValue={getDraftDefault("party_code", party?.party_code ?? "")}
                    disabled
                    placeholder={isEditing ? party?.party_code : "Auto-generated on save"}
                    className="font-mono"
                  />
                  {!isEditing && !isViewing && (
                    <p className="text-xs text-muted-foreground mt-1">Auto-generated on save</p>
                  )}
                </div>

                <div className="col-span-6">
                  <RequiredLabel htmlFor="display_name" required>Display Name</RequiredLabel>
                  <Input id="display_name" name="display_name" defaultValue={getDraftDefault("display_name", party?.display_name ?? "")} required disabled={isViewing} />
                </div>

                <div className="col-span-6">
                  <RequiredLabel htmlFor="legal_name_en" required>Legal Name (English)</RequiredLabel>
                  <Input id="legal_name_en" name="legal_name_en" defaultValue={getDraftDefault("legal_name_en", party?.legal_name_en ?? "")} required disabled={isViewing} />
                </div>

                <div className="col-span-6">
                  <Label htmlFor="legal_name_ar">Legal Name (Arabic)</Label>
                  <Input id="legal_name_ar" name="legal_name_ar" defaultValue={getDraftDefault("legal_name_ar", party?.legal_name_ar ?? "")} disabled={isViewing} dir="rtl" />
                </div>

                <div className="col-span-6">
                  <Label htmlFor="trade_name_en">Trade Name (English)</Label>
                  <Input id="trade_name_en" name="trade_name_en" defaultValue={getDraftDefault("trade_name_en", party?.trade_name_en ?? "")} disabled={isViewing} />
                </div>

                <div className="col-span-6">
                  <Label htmlFor="trade_name_ar">Trade Name (Arabic)</Label>
                  <Input id="trade_name_ar" name="trade_name_ar" defaultValue={getDraftDefault("trade_name_ar", party?.trade_name_ar ?? "")} disabled={isViewing} dir="rtl" />
                </div>

                <div className="col-span-6">
                  <Label htmlFor="short_name">Short Name</Label>
                  <Input id="short_name" name="short_name" defaultValue={getDraftDefault("short_name", party?.short_name ?? "")} disabled={isViewing} />
                </div>

                <div className="col-span-6">
                  <RequiredLabel htmlFor="party_nature_id" required>Party Nature</RequiredLabel>
                  <ERPCombobox
                    value={partyNatureId}
                    onValueChange={(v) => { const n = v !== null ? Number(v) : null; setPartyNatureId(n); writeDraftField("party_nature_id", n ?? ""); }}
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
                    onValueChange={(v) => { setParentPartyId(v); writeDraftField("parent_party_id", v ?? ""); }}
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
                  <Input id="main_phone" name="main_phone" defaultValue={getDraftDefault("main_phone", party?.main_phone ?? "")} disabled={isViewing} />
                </div>
                <div className="col-span-4">
                  <Label htmlFor="main_mobile">Main Mobile</Label>
                  <Input id="main_mobile" name="main_mobile" defaultValue={getDraftDefault("main_mobile", party?.main_mobile ?? "")} disabled={isViewing} />
                </div>
                <div className="col-span-4">
                  <Label htmlFor="whatsapp">WhatsApp</Label>
                  <Input id="whatsapp" name="whatsapp" defaultValue={getDraftDefault("whatsapp", party?.whatsapp ?? "")} disabled={isViewing} />
                </div>
                <div className="col-span-6">
                  <Label htmlFor="main_email">Main Email</Label>
                  <Input id="main_email" name="main_email" type="email" defaultValue={getDraftDefault("main_email", party?.main_email ?? "")} disabled={isViewing} />
                </div>
                <div className="col-span-6">
                  <Label htmlFor="alternate_email">Alternate Email</Label>
                  <Input id="alternate_email" name="alternate_email" type="email" defaultValue={getDraftDefault("alternate_email", party?.alternate_email ?? "")} disabled={isViewing} />
                </div>
                <div className="col-span-12">
                  <Label htmlFor="website">Website</Label>
                  <Input id="website" name="website" type="url" defaultValue={getDraftDefault("website", party?.website ?? "")} disabled={isViewing} placeholder="https://example.com" />
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
                    onValueChange={(v) => { setCountryId(v); setEmirateId(null); setCityId(null); setAreaZoneId(null); writeDraftField("country_id", v ?? ""); writeDraftField("emirate_id", ""); writeDraftField("city_id", ""); writeDraftField("area_zone_id", ""); }}
                    disabled={isViewing}
                  />
                </div>
                <div className="col-span-6">
                  <Label htmlFor="emirate_id">Emirate / Region</Label>
                  <EmirateSelect
                    countryId={countryId}
                    value={emirateId}
                    onValueChange={(v) => { setEmirateId(v); setCityId(null); setAreaZoneId(null); writeDraftField("emirate_id", v ?? ""); writeDraftField("city_id", ""); writeDraftField("area_zone_id", ""); }}
                    disabled={isViewing || !countryId}
                  />
                </div>
                <div className="col-span-6">
                  <Label htmlFor="city_id">City</Label>
                  <CitySelect
                    emirateId={emirateId}
                    value={cityId}
                    onValueChange={(v) => { setCityId(v); setAreaZoneId(null); writeDraftField("city_id", v ?? ""); writeDraftField("area_zone_id", ""); }}
                    disabled={isViewing || !emirateId}
                  />
                </div>
                <div className="col-span-6">
                  <Label htmlFor="area_zone_id">Area / Zone</Label>
                  <AreaZoneSelect cityId={cityId} value={areaZoneId} onValueChange={(v) => { setAreaZoneId(v); writeDraftField("area_zone_id", v ?? ""); }} disabled={isViewing || !cityId} />
                </div>
                <div className="col-span-4">
                  <Label htmlFor="po_box">PO Box</Label>
                  <Input id="po_box" name="po_box" defaultValue={getDraftDefault("po_box", party?.po_box ?? "")} disabled={isViewing} />
                </div>
                <div className="col-span-8">
                  <Label htmlFor="full_address_text">Full Address</Label>
                  <Input id="full_address_text" name="full_address_text" defaultValue={getDraftDefault("full_address_text", party?.full_address_text ?? "")} disabled={isViewing} />
                </div>
                <div className="col-span-12">
                  <Label htmlFor="google_map_url">Google Maps URL</Label>
                  <Input id="google_map_url" name="google_map_url" defaultValue={getDraftDefault("google_map_url", party?.google_map_url ?? "")} disabled={isViewing} placeholder="https://maps.google.com/..." />
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
                    onValueChange={(v) => { const n = v !== null ? Number(v) : null; setPartyStatusId(n); writeDraftField("party_status_id", n ?? ""); }}
                    options={(statuses ?? []).map((s) => ({ value: s.id, label: s.name_en }))}
                    placeholder="Select status..."
                    disabled={isViewing}
                    required
                  />
                </div>
                <div className="col-span-6 flex items-end gap-3 pb-1">
                  <Label htmlFor="is_active">Active</Label>
                  <Switch id="is_active" name="is_active" checked={isActive} onCheckedChange={(v) => { setIsActive(v); writeDraftField("is_active", String(v)); }} disabled={isViewing} />
                  <span className="text-sm text-muted-foreground">{isActive ? "Yes" : "No"}</span>
                </div>
                <div className="col-span-12">
                  <Label htmlFor="remarks">Remarks</Label>
                  <Textarea id="remarks" name="remarks" defaultValue={getDraftDefault("remarks", party?.remarks ?? "")} disabled={isViewing} rows={3} />
                </div>
              </ERPFieldGrid>
            </div>

            {childTabLocked && !isViewing && (
              <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800 p-3 text-sm text-amber-800 dark:text-amber-300 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                Contacts, Addresses, Bank Details, and other sections unlock after the party is saved.
              </div>
            )}
          </ERPRecordSectionPanel>

          {/* â”€â”€â”€â”€â”€â”€â”€â”€ Section 2: Party Types â”€â”€â”€â”€â”€â”€â”€â”€ */}
          <ERPRecordSectionPanel id="types" activeId={activeSection} lazyMount>
            <PartyTypesTab
              partyId={effectivePartyId}
              disabled={isViewing}
              authContext={authContext}
              defaultTypeCode={mode === "add" ? defaultTypeCode : undefined}
            />
          </ERPRecordSectionPanel>

          {/* â”€â”€â”€â”€â”€â”€â”€â”€ Section 3: Legal & Licenses â”€â”€â”€â”€â”€â”€â”€â”€ */}
          <ERPRecordSectionPanel id="licenses" activeId={activeSection} lazyMount>
            {childTabLocked ? <LockedTabMessage /> : (
              <PartyLicensesTab partyId={effectivePartyId!} disabled={isViewing} onChildOpen={handleChildOpen} />
            )}
          </ERPRecordSectionPanel>

          {/* â”€â”€â”€â”€â”€â”€â”€â”€ Section 4: Tax & Finance â”€â”€â”€â”€â”€â”€â”€â”€ */}
          <ERPRecordSectionPanel id="tax" activeId={activeSection} lazyMount>
            {childTabLocked ? <LockedTabMessage /> : (
              <PartyTaxFinanceTab partyId={effectivePartyId!} disabled={isViewing} onChildOpen={handleChildOpen} />
            )}
          </ERPRecordSectionPanel>

          {/* â”€â”€â”€â”€â”€â”€â”€â”€ Section 5: Contacts â”€â”€â”€â”€â”€â”€â”€â”€ */}
          <ERPRecordSectionPanel id="contacts" activeId={activeSection} lazyMount>
            {childTabLocked ? <LockedTabMessage /> : (
              <PartyContactsTab partyId={effectivePartyId!} disabled={isViewing} onChildOpen={handleChildOpen} />
            )}
          </ERPRecordSectionPanel>

          {/* â”€â”€â”€â”€â”€â”€â”€â”€ Section 6: Addresses â”€â”€â”€â”€â”€â”€â”€â”€ */}
          <ERPRecordSectionPanel id="addresses" activeId={activeSection} lazyMount>
            {childTabLocked ? <LockedTabMessage /> : (
              <PartyAddressesTab partyId={effectivePartyId!} disabled={isViewing} onChildOpen={handleChildOpen} />
            )}
          </ERPRecordSectionPanel>

          {/* â”€â”€â”€â”€â”€â”€â”€â”€ Section 7: Bank Details â”€â”€â”€â”€â”€â”€â”€â”€ */}
          <ERPRecordSectionPanel id="bank" activeId={activeSection} lazyMount>
            {childTabLocked ? <LockedTabMessage /> : (
              <PartyBankDetailsTab partyId={effectivePartyId!} disabled={isViewing} authContext={authContext} onChildOpen={handleChildOpen} />
            )}
          </ERPRecordSectionPanel>

          {/* â”€â”€â”€â”€â”€â”€â”€â”€ Section 8: Documents â”€â”€â”€â”€â”€â”€â”€â”€ */}
          <ERPRecordSectionPanel id="documents" activeId={activeSection} lazyMount>
            {childTabLocked ? <LockedTabMessage /> : (
              <PartyDmsDocumentsTab partyId={effectivePartyId!} disabled={isViewing} onChildOpen={handleChildOpen} />
            )}
          </ERPRecordSectionPanel>

          {/* â”€â”€â”€â”€â”€â”€â”€â”€ Section 9: Services / Categories â”€â”€â”€â”€â”€â”€â”€â”€ */}
          <ERPRecordSectionPanel id="services" activeId={activeSection} lazyMount>
            {childTabLocked ? <LockedTabMessage /> : (
              <PartyServicesTab
                partyId={effectivePartyId!}
                canManage={hasPerm(authContext, "master_data.parties.manage_services")}
                onChildOpen={handleChildOpen}
              />
            )}
          </ERPRecordSectionPanel>

          {/* â”€â”€â”€â”€â”€â”€â”€â”€ Section 10: Notes & Activity â”€â”€â”€â”€â”€â”€â”€â”€ */}
          <ERPRecordSectionPanel id="notes" activeId={activeSection} lazyMount>
            {childTabLocked ? <LockedTabMessage /> : (
              <PartyNotesTab
                partyId={effectivePartyId!}
                canManage={!isViewing && hasPerm(authContext, "master_data.parties.edit")}
                currentUserProfileId={authContext?.profile?.id ?? null}
                onChildOpen={handleChildOpen}
              />
            )}
          </ERPRecordSectionPanel>

          {/* â”€â”€â”€â”€â”€â”€â”€â”€ Section 11: Audit â”€â”€â”€â”€â”€â”€â”€â”€ */}
          <ERPRecordSectionPanel id="audit" activeId={activeSection} lazyMount>
            {childTabLocked ? <LockedTabMessage /> : (
              <PartyAuditTab
                partyId={effectivePartyId!}
                canViewAudit={hasPerm(authContext, "master_data.parties.view_audit")}
              />
            )}
          </ERPRecordSectionPanel>

          {/* â”€â”€â”€â”€â”€â”€â”€â”€ Section 12: Compliance (deferred) â”€â”€â”€â”€â”€â”€â”€â”€ */}
          <ERPRecordSectionPanel id="compliance" activeId={activeSection} lazyMount>
            <DeferredTabMessage phase="5A.4" />
          </ERPRecordSectionPanel>

          {/* AI Review & Update — COMMON AI.1F Stage 1 pilot */}
          <ERPRecordSectionPanel id="ai_review" activeId={activeSection} lazyMount>
            {childTabLocked ? <LockedTabMessage /> : (
              <AiFieldSuggestionsPanel
                entityType="party"
                entityId={effectivePartyId ?? 0}
                entityLabel={party?.display_name ?? "Party"}
                canGenerate={!isViewing}
                canApply={!isViewing}
              />
            )}
          </ERPRecordSectionPanel>
        </form>
      </ERPRecordWorkspaceForm>

      {/* â”€â”€ Duplicate Detection Dialog â”€â”€ */}
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
                  Match: {d.match_type} â€” Score: {d.match_score}
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
                Override & Save Anyway
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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
