"use client";

import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import type { Emirate } from "@/features/master-data/geography/types";
import { createEmirate, updateEmirate } from "@/features/master-data/geography/actions";
import { CountrySelect } from "@/components/erp/geography";
import { LookupSelect } from "@/components/erp/lookup-select";
import { RequiredLabel } from "@/components/erp/required-label";
import { useQueryClient } from "@tanstack/react-query";
import { useFormDirty } from "@/hooks/use-form-dirty";
import { invalidateEmirates } from "@/lib/query/invalidation";
import { MapPin, Shield, Info } from "lucide-react";
import type { AuthContext } from "@/lib/rbac/check";
import { useWorkspace } from "@/hooks/use-workspace";
import { ERPRecordWorkspaceForm, ERPRecordSectionPanel } from "@/components/workspace/erp-record-workspace-form";
import { useWorkspaceFormDraft } from "@/hooks/use-workspace-form-draft";

type EmirateWorkspaceFormProps = {
  emirate?: Emirate | null;
  mode: "add" | "edit" | "view";
  authContext: AuthContext;
};

const FORM_ID = "emirate-workspace-form";

export function EmirateWorkspaceForm({ emirate, mode }: EmirateWorkspaceFormProps) {
  const { closeTab, activeTab, markDirty, forceCloseActiveTab } = useWorkspace();
  const queryClient = useQueryClient();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeSection, setActiveSection] = useState("basic");

  const isEditing = mode === "edit";
  const isViewing = mode === "view";

  const { isDirty, resetDirty } = useFormDirty({ formId: FORM_ID, enabled: !isViewing });
  const { getDraftDefault, getDraftBoolean, syncDraft, writeDraftField, clearDraft } = useWorkspaceFormDraft({ formId: FORM_ID, enabled: !isViewing });

  const [countryId, setCountryId] = useState<number | null>(() => {
    const d = getDraftDefault("country_id", "");
    return d ? Number(d) : emirate?.country_id ?? null;
  });
  const [regionTypeCode, setRegionTypeCode] = useState<string | null>(() =>
    getDraftDefault("region_type_code", emirate?.region_type_code ?? "") || null
  );

  useEffect(() => {
    if (activeTab?.id) markDirty(activeTab.id, isDirty);
  }, [isDirty, activeTab?.id, markDirty]);

  const sections = [
    { id: "basic", label: "Basic Info", icon: MapPin },
    { id: "status", label: "Status", icon: Shield },
    { id: "audit", label: "Audit Info", icon: Info },
  ];

  const handleRequestClose = () => closeTab(activeTab?.id ?? "");

  const handleSave = async (): Promise<boolean> => {
    if (isViewing) return false;
    const form = document.getElementById(FORM_ID) as HTMLFormElement;
    const formData = new FormData(form);
    setIsSubmitting(true);
    try {
      const shared = {
        name_en: formData.get("name_en") as string,
        name_ar: (formData.get("name_ar") as string) || null,
        abbreviation_en: formData.get("abbreviation_en") as string,
        abbreviation_ar: (formData.get("abbreviation_ar") as string) || null,
        country_id: countryId,
        region_type_code: regionTypeCode,
        sort_order: parseInt(formData.get("sort_order") as string) || 0,
      };
      let result;
      if (isEditing && emirate) {
        result = await updateEmirate({ id: emirate.id, ...shared, is_active: formData.get("is_active") === "on" });
      } else {
        result = await createEmirate({ emirate_code: (formData.get("emirate_code") as string).toUpperCase(), ...shared });
      }
      if (result.success) {
        toast.success(`Region ${isEditing ? "updated" : "created"} successfully`);
        clearDraft();
        resetDirty();
        invalidateEmirates(queryClient);
        return true;
      } else {
        toast.error(result.error ?? "Failed to save region");
        return false;
      }
    } catch {
      toast.error("An unexpected error occurred");
      return false;
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSaveAndClose = async () => {
    const success = await handleSave();
    if (success) forceCloseActiveTab();
  };

  return (
    <ERPRecordWorkspaceForm
      mode={mode}
      title={isViewing ? "View Region / Emirate" : isEditing ? "Edit Region / Emirate" : "New Region / Emirate"}
      subtitle={emirate ? `${emirate.name_en} (${emirate.emirate_code})` : "Create a new administrative region"}
      recordCode={emirate?.emirate_code}
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
        <ERPRecordSectionPanel id="basic" activeId={activeSection} title="Basic Information">
          <div className="grid grid-cols-12 gap-4">
            <div className="space-y-2 col-span-6">
              <Label className="text-muted-foreground text-xs">Country *</Label>
              <CountrySelect value={countryId} onValueChange={(v) => { setCountryId(v); writeDraftField("country_id", v ?? ""); }} disabled={isViewing} required placeholder="Select country" />
            </div>
            <div className="space-y-2 col-span-6">
              <Label className="text-muted-foreground text-xs">Region Type *</Label>
              <LookupSelect categoryCode="REGION_TYPES" value={regionTypeCode} onValueChange={(v) => { const s = v ? String(v) : null; setRegionTypeCode(s); writeDraftField("region_type_code", s ?? ""); }} disabled={isViewing} required placeholder="Select type" />
            </div>
            <div className="space-y-2 col-span-6">
              <RequiredLabel htmlFor="emirate_code">Region Code</RequiredLabel>
              <Input id="emirate_code" name="emirate_code" required defaultValue={getDraftDefault("emirate_code", emirate?.emirate_code ?? "")} disabled={isViewing || isEditing} className="uppercase" placeholder="AUH" maxLength={3} />
            </div>
            <div className="space-y-2 col-span-6">
              <RequiredLabel htmlFor="abbreviation_en">Abbreviation</RequiredLabel>
              <Input id="abbreviation_en" name="abbreviation_en" required defaultValue={getDraftDefault("abbreviation_en", emirate?.abbreviation_en ?? "")} disabled={isViewing} className="uppercase" placeholder="AD" maxLength={10} />
            </div>
            <div className="space-y-2 col-span-6">
              <RequiredLabel htmlFor="name_en">English Name</RequiredLabel>
              <Input id="name_en" name="name_en" required defaultValue={getDraftDefault("name_en", emirate?.name_en ?? "")} disabled={isViewing} placeholder="Abu Dhabi" />
            </div>
            <div className="space-y-2 col-span-6">
              <Label htmlFor="name_ar" className="text-muted-foreground text-xs">Arabic Name</Label>
              <Input id="name_ar" name="name_ar" defaultValue={getDraftDefault("name_ar", emirate?.name_ar ?? "")} disabled={isViewing} dir="rtl" placeholder="أبو ظبي" />
            </div>
            <div className="space-y-2 col-span-6">
              <Label htmlFor="abbreviation_ar" className="text-muted-foreground text-xs">Arabic Abbreviation</Label>
              <Input id="abbreviation_ar" name="abbreviation_ar" defaultValue={getDraftDefault("abbreviation_ar", emirate?.abbreviation_ar ?? "")} disabled={isViewing} dir="rtl" maxLength={10} />
            </div>
            <div className="space-y-2 col-span-6">
              <Label htmlFor="sort_order" className="text-muted-foreground text-xs">Sort Order</Label>
              <Input id="sort_order" name="sort_order" type="number" min={0} defaultValue={getDraftDefault("sort_order", emirate?.sort_order ?? 0)} disabled={isViewing} />
            </div>
          </div>
        </ERPRecordSectionPanel>

        <ERPRecordSectionPanel id="status" activeId={activeSection} title="Status">
          <div className="grid grid-cols-12 gap-4">
            {(isEditing || isViewing) && (
              <div className="space-y-3 col-span-6">
                <div className="flex items-center space-x-2">
                  <Checkbox id="is_active" name="is_active" defaultChecked={getDraftBoolean("is_active", emirate?.is_active ?? true)} disabled={isViewing} />
                  <Label htmlFor="is_active" className="text-sm font-normal cursor-pointer">Active</Label>
                </div>
              </div>
            )}
          </div>
        </ERPRecordSectionPanel>

        <ERPRecordSectionPanel id="audit" activeId={activeSection} title="Audit Information" lazyMount>
          {emirate ? (
            <div className="grid grid-cols-12 gap-4">
              <div className="space-y-2 col-span-6">
                <Label className="text-muted-foreground text-xs">Created At</Label>
                <Input value={new Date(emirate.created_at).toLocaleString()} disabled className="text-xs" />
              </div>
              <div className="space-y-2 col-span-6">
                <Label className="text-muted-foreground text-xs">Updated At</Label>
                <Input value={new Date(emirate.updated_at).toLocaleString()} disabled className="text-xs" />
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Audit information will be available after saving</p>
          )}
        </ERPRecordSectionPanel>
      </form>
    </ERPRecordWorkspaceForm>
  );
}
