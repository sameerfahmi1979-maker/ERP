"use client";

import { useState, useEffect, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import type { City } from "@/features/master-data/geography/types";
import { createCity, updateCity } from "@/features/master-data/geography/actions";
import { EmirateSelect, CountrySelect } from "@/components/erp/geography";
import { RequiredLabel } from "@/components/erp/required-label";
import { useQueryClient } from "@tanstack/react-query";
import { useFormDirty } from "@/hooks/use-form-dirty";
import { invalidateCities } from "@/lib/query/invalidation";
import { MapPin, Shield, Info } from "lucide-react";
import type { AuthContext } from "@/lib/rbac/check";
import { useWorkspace } from "@/hooks/use-workspace";
import { ERPRecordWorkspaceForm, ERPRecordSectionPanel } from "@/components/workspace/erp-record-workspace-form";
import { useWorkspaceFormDraft } from "@/hooks/use-workspace-form-draft";

type CityWorkspaceFormProps = {
  city?: City | null;
  mode: "add" | "edit" | "view";
  authContext: AuthContext;
};

const FORM_ID = "city-workspace-form";

export function CityWorkspaceForm({ city, mode }: CityWorkspaceFormProps) {
  const { closeTab, activeTab, markDirty } = useWorkspace();
  const queryClient = useQueryClient();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeSection, setActiveSection] = useState("basic");

  const isEditing = mode === "edit";
  const isViewing = mode === "view";

  const { isDirty, resetDirty } = useFormDirty({ formId: FORM_ID, enabled: !isViewing });
  const { getDraftDefault, getDraftBoolean, syncDraft, writeDraftField, clearDraft } = useWorkspaceFormDraft({ formId: FORM_ID, enabled: !isViewing });

  const [countryId, setCountryId] = useState<number | null>(() => {
    const d = getDraftDefault("country_id", "");
    return d ? Number(d) : city?.country_id ?? null;
  });
  const [emirateId, setEmirateId] = useState<number | null>(() => {
    const d = getDraftDefault("emirate_id", "");
    return d ? Number(d) : city?.emirate_id ?? null;
  });

  useEffect(() => {
    if (activeTab?.id) markDirty(activeTab.id, isDirty);
  }, [isDirty, activeTab?.id, markDirty]);

  const handleCountryChange = useCallback((newCountryId: number | null) => {
    setCountryId(newCountryId);
    writeDraftField("country_id", newCountryId ?? "");
    setEmirateId(null);
    writeDraftField("emirate_id", "");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [writeDraftField]);

  const sections = [
    { id: "basic", label: "Basic Info", icon: MapPin },
    { id: "status", label: "Status", icon: Shield },
    { id: "audit", label: "Audit Info", icon: Info },
  ];

  const handleRequestClose = () => closeTab(activeTab?.id ?? "");

  const handleSave = async (): Promise<boolean> => {
    if (isViewing) return false;
    if (!emirateId) { toast.error("Please select a Region / Emirate / Governorate"); return false; }
    const form = document.getElementById(FORM_ID) as HTMLFormElement;
    const formData = new FormData(form);
    setIsSubmitting(true);
    try {
      const shared = {
        name_en: formData.get("name_en") as string,
        name_ar: (formData.get("name_ar") as string) || null,
        emirate_id: emirateId,
        country_id: countryId,
        sort_order: parseInt(formData.get("sort_order") as string) || 0,
      };
      let result;
      if (isEditing && city) {
        result = await updateCity({ id: city.id, ...shared, is_active: formData.get("is_active") === "on" });
      } else {
        result = await createCity({ city_code: (formData.get("city_code") as string).toUpperCase(), ...shared });
      }
      if (result.success) {
        toast.success(`City ${isEditing ? "updated" : "created"} successfully`);
        clearDraft();
        resetDirty();
        invalidateCities(queryClient);
        return true;
      } else {
        toast.error(result.error ?? "Failed to save city");
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
    if (success) handleRequestClose();
  };

  return (
    <ERPRecordWorkspaceForm
      mode={mode}
      title={isViewing ? "View City" : isEditing ? "Edit City" : "New City"}
      subtitle={city ? `${city.name_en} (${city.city_code})` : "Create a new city record"}
      recordCode={city?.city_code}
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
              <Label className="text-muted-foreground text-xs">Country</Label>
              <CountrySelect value={countryId} onValueChange={handleCountryChange} disabled={isViewing || isEditing} placeholder="Select country" />
            </div>
            <div className="space-y-2 col-span-6">
              <Label className="text-muted-foreground text-xs">Region / Emirate *</Label>
              <EmirateSelect value={emirateId} onValueChange={(v) => { setEmirateId(v); writeDraftField("emirate_id", v ?? ""); }} countryId={countryId ?? undefined} disabled={isViewing || isEditing} required placeholder="Select region" />
            </div>
            <div className="space-y-2 col-span-6">
              <RequiredLabel htmlFor="city_code">City Code</RequiredLabel>
              <Input id="city_code" name="city_code" required defaultValue={getDraftDefault("city_code", city?.city_code ?? "")} disabled={isViewing || isEditing} className="uppercase" placeholder="DXB" maxLength={10} />
            </div>
            <div className="space-y-2 col-span-6">
              <Label htmlFor="sort_order" className="text-muted-foreground text-xs">Sort Order</Label>
              <Input id="sort_order" name="sort_order" type="number" min={0} defaultValue={getDraftDefault("sort_order", city?.sort_order ?? 0)} disabled={isViewing} />
            </div>
            <div className="space-y-2 col-span-6">
              <RequiredLabel htmlFor="name_en">English Name</RequiredLabel>
              <Input id="name_en" name="name_en" required defaultValue={getDraftDefault("name_en", city?.name_en ?? "")} disabled={isViewing} placeholder="Dubai" />
            </div>
            <div className="space-y-2 col-span-6">
              <Label htmlFor="name_ar" className="text-muted-foreground text-xs">Arabic Name</Label>
              <Input id="name_ar" name="name_ar" defaultValue={getDraftDefault("name_ar", city?.name_ar ?? "")} disabled={isViewing} dir="rtl" placeholder="دبي" />
            </div>
          </div>
        </ERPRecordSectionPanel>

        <ERPRecordSectionPanel id="status" activeId={activeSection} title="Status">
          <div className="grid grid-cols-12 gap-4">
            {(isEditing || isViewing) && (
              <div className="space-y-3 col-span-6">
                <div className="flex items-center space-x-2">
                  <Checkbox id="is_active" name="is_active" defaultChecked={getDraftBoolean("is_active", city?.is_active ?? true)} disabled={isViewing} />
                  <Label htmlFor="is_active" className="text-sm font-normal cursor-pointer">Active</Label>
                </div>
              </div>
            )}
          </div>
        </ERPRecordSectionPanel>

        <ERPRecordSectionPanel id="audit" activeId={activeSection} title="Audit Information" lazyMount>
          {city ? (
            <div className="grid grid-cols-12 gap-4">
              <div className="space-y-2 col-span-6">
                <Label className="text-muted-foreground text-xs">Created At</Label>
                <Input value={new Date(city.created_at).toLocaleString()} disabled className="text-xs" />
              </div>
              <div className="space-y-2 col-span-6">
                <Label className="text-muted-foreground text-xs">Updated At</Label>
                <Input value={new Date(city.updated_at).toLocaleString()} disabled className="text-xs" />
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
