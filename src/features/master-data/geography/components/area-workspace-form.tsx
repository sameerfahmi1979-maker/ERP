"use client";

import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import type { AreaZoneWithRelations } from "@/features/master-data/geography/types";
import { createAreaZone, updateAreaZone } from "@/features/master-data/geography/actions";
import { CitySelect } from "@/components/erp/geography";
import { LookupSelect } from "@/components/erp/lookup-select";
import { RequiredLabel } from "@/components/erp/required-label";
import { useQueryClient } from "@tanstack/react-query";
import { useFormDirty } from "@/hooks/use-form-dirty";
import { invalidateAreas } from "@/lib/query/invalidation";
import { Map, Shield, Info } from "lucide-react";
import type { AuthContext } from "@/lib/rbac/check";
import { useWorkspace } from "@/hooks/use-workspace";
import { ERPRecordWorkspaceForm, ERPRecordSectionPanel } from "@/components/workspace/erp-record-workspace-form";
import { useWorkspaceFormDraft } from "@/hooks/use-workspace-form-draft";

type AreaWorkspaceFormProps = {
  area?: AreaZoneWithRelations | null;
  mode: "add" | "edit" | "view";
  authContext: AuthContext;
};

const FORM_ID = "area-workspace-form";

export function AreaWorkspaceForm({ area, mode }: AreaWorkspaceFormProps) {
  const { closeTab, activeTab, markDirty, forceCloseActiveTab } = useWorkspace();
  const queryClient = useQueryClient();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeSection, setActiveSection] = useState("basic");

  const isEditing = mode === "edit";
  const isViewing = mode === "view";

  const { isDirty, resetDirty } = useFormDirty({ formId: FORM_ID, enabled: !isViewing });
  const { getDraftDefault, getDraftBoolean, syncDraft, writeDraftField, clearDraft } = useWorkspaceFormDraft({ formId: FORM_ID, enabled: !isViewing });

  const [cityId, setCityId] = useState<number | null>(() => {
    const d = getDraftDefault("city_id", "");
    return d ? Number(d) : area?.city_id ?? null;
  });
  const [areaTypeCode, setAreaTypeCode] = useState<string | null>(() =>
    getDraftDefault("area_type_code", area?.area_type_code ?? "") || null
  );

  useEffect(() => {
    if (activeTab?.id) markDirty(activeTab.id, isDirty);
  }, [isDirty, activeTab?.id, markDirty]);

  const sections = [
    { id: "basic", label: "Basic Info", icon: Map },
    { id: "status", label: "Status", icon: Shield },
    { id: "audit", label: "Audit Info", icon: Info },
  ];

  const handleRequestClose = () => closeTab(activeTab?.id ?? "");

  const handleSave = async (): Promise<boolean> => {
    if (isViewing) return false;
    if (!cityId) { toast.error("Please select a city"); return false; }
    const form = document.getElementById(FORM_ID) as HTMLFormElement;
    const formData = new FormData(form);
    setIsSubmitting(true);
    try {
      const shared = {
        name_en: formData.get("name_en") as string,
        name_ar: (formData.get("name_ar") as string) || null,
        city_id: cityId,
        area_type_code: areaTypeCode || null,
        sort_order: parseInt(formData.get("sort_order") as string) || 0,
      };
      let result;
      if (isEditing && area) {
        result = await updateAreaZone({ id: area.id, ...shared, is_active: formData.get("is_active") === "on" });
      } else {
        result = await createAreaZone({ area_code: (formData.get("area_code") as string).toUpperCase(), ...shared });
      }
      if (result.success) {
        toast.success(`Area ${isEditing ? "updated" : "created"} successfully`);
        clearDraft();
        resetDirty();
        invalidateAreas(queryClient);
        return true;
      } else {
        toast.error(result.error ?? "Failed to save area");
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
      title={isViewing ? "View Area / Zone" : isEditing ? "Edit Area / Zone" : "New Area / Zone"}
      subtitle={area ? `${area.name_en} (${area.area_code})` : "Create a new area or zone record"}
      recordCode={area?.area_code}
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
              <Label className="text-muted-foreground text-xs">City *</Label>
              <CitySelect value={cityId} onValueChange={(v) => { setCityId(v); writeDraftField("city_id", v ?? ""); }} disabled={isViewing || isEditing} required placeholder="Select city" />
            </div>
            <div className="space-y-2 col-span-6">
              <Label className="text-muted-foreground text-xs">Area Type</Label>
              <LookupSelect categoryCode="AREA_TYPES" value={areaTypeCode} onValueChange={(v) => { const s = v ? String(v) : null; setAreaTypeCode(s); writeDraftField("area_type_code", s ?? ""); }} disabled={isViewing} allowClear placeholder="Select type" />
            </div>
            <div className="space-y-2 col-span-6">
              <RequiredLabel htmlFor="area_code">Area Code</RequiredLabel>
              <Input id="area_code" name="area_code" required defaultValue={getDraftDefault("area_code", area?.area_code ?? "")} disabled={isViewing || isEditing} className="uppercase" placeholder="JBR" maxLength={10} />
            </div>
            <div className="space-y-2 col-span-6">
              <Label htmlFor="sort_order" className="text-muted-foreground text-xs">Sort Order</Label>
              <Input id="sort_order" name="sort_order" type="number" min={0} defaultValue={getDraftDefault("sort_order", area?.sort_order ?? 0)} disabled={isViewing} />
            </div>
            <div className="space-y-2 col-span-6">
              <RequiredLabel htmlFor="name_en">English Name</RequiredLabel>
              <Input id="name_en" name="name_en" required defaultValue={getDraftDefault("name_en", area?.name_en ?? "")} disabled={isViewing} />
            </div>
            <div className="space-y-2 col-span-6">
              <Label htmlFor="name_ar" className="text-muted-foreground text-xs">Arabic Name</Label>
              <Input id="name_ar" name="name_ar" defaultValue={getDraftDefault("name_ar", area?.name_ar ?? "")} disabled={isViewing} dir="rtl" />
            </div>
          </div>
        </ERPRecordSectionPanel>

        <ERPRecordSectionPanel id="status" activeId={activeSection} title="Status">
          <div className="grid grid-cols-12 gap-4">
            {(isEditing || isViewing) && (
              <div className="space-y-3 col-span-6">
                <div className="flex items-center space-x-2">
                  <Checkbox id="is_active" name="is_active" defaultChecked={getDraftBoolean("is_active", area?.is_active ?? true)} disabled={isViewing} />
                  <Label htmlFor="is_active" className="text-sm font-normal cursor-pointer">Active</Label>
                </div>
              </div>
            )}
          </div>
        </ERPRecordSectionPanel>

        <ERPRecordSectionPanel id="audit" activeId={activeSection} title="Audit Information" lazyMount>
          {area ? (
            <div className="grid grid-cols-12 gap-4">
              <div className="space-y-2 col-span-6">
                <Label className="text-muted-foreground text-xs">Created At</Label>
                <Input value={new Date(area.created_at).toLocaleString()} disabled className="text-xs" />
              </div>
              <div className="space-y-2 col-span-6">
                <Label className="text-muted-foreground text-xs">Updated At</Label>
                <Input value={new Date(area.updated_at).toLocaleString()} disabled className="text-xs" />
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
