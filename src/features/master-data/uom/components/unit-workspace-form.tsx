"use client";

import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import type { UnitOfMeasureWithCategory } from "@/features/master-data/uom/types";
import { createUnitOfMeasure, updateUnitOfMeasure } from "@/features/master-data/uom/actions";
import { UomCategorySelect } from "@/components/erp/uom/uom-category-select";
import { RequiredLabel } from "@/components/erp/required-label";
import { useQueryClient } from "@tanstack/react-query";
import { useFormDirty } from "@/hooks/use-form-dirty";
import { invalidateUom } from "@/lib/query/invalidation";
import { Ruler, Tag, Shield, Info } from "lucide-react";
import type { AuthContext } from "@/lib/rbac/check";
import { useWorkspace } from "@/hooks/use-workspace";
import { ERPRecordWorkspaceForm, ERPRecordSectionPanel } from "@/components/workspace/erp-record-workspace-form";
import { useWorkspaceFormDraft } from "@/hooks/use-workspace-form-draft";

type UnitWorkspaceFormProps = {
  unit?: UnitOfMeasureWithCategory | null;
  mode: "add" | "edit" | "view";
  authContext: AuthContext;
};

const FORM_ID = "unit-workspace-form";

export function UnitWorkspaceForm({ unit, mode }: UnitWorkspaceFormProps) {
  const { closeTab, activeTab, markDirty } = useWorkspace();
  const queryClient = useQueryClient();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeSection, setActiveSection] = useState("basic");

  const isEditing = mode === "edit";
  const isViewing = mode === "view";

  const { isDirty, resetDirty } = useFormDirty({ formId: FORM_ID, enabled: !isViewing });
  const { getDraftDefault, getDraftBoolean, syncDraft, writeDraftField, clearDraft } = useWorkspaceFormDraft({ formId: FORM_ID, enabled: !isViewing });

  const [categoryId, setCategoryId] = useState<number | null>(() => {
    const d = getDraftDefault("uom_category_id", "");
    return d ? Number(d) : unit?.uom_category_id ?? null;
  });

  useEffect(() => {
    if (activeTab?.id) markDirty(activeTab.id, isDirty);
  }, [isDirty, activeTab?.id, markDirty]);

  const sections = [
    { id: "basic", label: "Basic Info", icon: Ruler },
    { id: "conversion", label: "Conversion", icon: Tag },
    { id: "status", label: "Status", icon: Shield },
    { id: "audit", label: "Audit Info", icon: Info },
  ];

  const handleRequestClose = () => closeTab(activeTab?.id ?? "");

  const handleSave = async (): Promise<boolean> => {
    if (isViewing) return false;
    const form = document.getElementById(FORM_ID) as HTMLFormElement;
    const formData = new FormData(form);

    if (!isEditing && !categoryId) {
      toast.error("Please select a category");
      return false;
    }

    setIsSubmitting(true);
    try {
      const shared = {
        unit_name_en: formData.get("unit_name_en") as string,
        unit_name_ar: (formData.get("unit_name_ar") as string) || null,
        symbol: (formData.get("symbol") as string) || null,
        conversion_factor_to_base: parseFloat(formData.get("conversion_factor_to_base") as string) || 1,
        is_base_unit: formData.get("is_base_unit") === "on",
        decimal_places: parseInt(formData.get("decimal_places") as string) || 2,
        allow_fraction: formData.get("allow_fraction") === "on",
        description_en: (formData.get("description_en") as string) || null,
        description_ar: (formData.get("description_ar") as string) || null,
        notes: (formData.get("notes") as string) || null,
        sort_order: parseInt(formData.get("sort_order") as string) || 0,
      };
      let result;
      if (isEditing && unit) {
        result = await updateUnitOfMeasure({ id: unit.id, ...shared, is_active: formData.get("is_active") === "on" });
      } else {
        result = await createUnitOfMeasure({ uom_category_id: categoryId!, unit_code: (formData.get("unit_code") as string).toUpperCase(), ...shared });
      }
      if (result.success) {
        toast.success(`Unit ${isEditing ? "updated" : "created"} successfully`);
        clearDraft();
        resetDirty();
        invalidateUom(queryClient);
        return true;
      } else {
        toast.error(result.error ?? "Failed to save unit");
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
      title={isViewing ? "View Unit of Measure" : isEditing ? "Edit Unit of Measure" : "New Unit of Measure"}
      subtitle={unit ? `${unit.unit_name_en} (${unit.unit_code})` : "Create a new unit of measure"}
      recordCode={unit?.unit_code}
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
              <RequiredLabel htmlFor="category">Category</RequiredLabel>
              {isEditing || isViewing ? (
                <Input value={unit?.category?.category_name_en ?? ""} disabled />
              ) : (
                <UomCategorySelect value={categoryId} onValueChange={(v) => { setCategoryId(v); writeDraftField("uom_category_id", v ?? ""); }} required />
              )}
            </div>
            <div className="space-y-2 col-span-6">
              <RequiredLabel htmlFor="unit_code">Unit Code</RequiredLabel>
              <Input id="unit_code" name="unit_code" required defaultValue={getDraftDefault("unit_code", unit?.unit_code ?? "")} disabled={isViewing || isEditing} placeholder="KG" className="uppercase" />
            </div>
            <div className="space-y-2 col-span-6">
              <RequiredLabel htmlFor="unit_name_en">English Name</RequiredLabel>
              <Input id="unit_name_en" name="unit_name_en" required defaultValue={getDraftDefault("unit_name_en", unit?.unit_name_en ?? "")} disabled={isViewing} placeholder="Kilogram" />
            </div>
            <div className="space-y-2 col-span-6">
              <Label htmlFor="unit_name_ar" className="text-muted-foreground text-xs">Arabic Name</Label>
              <Input id="unit_name_ar" name="unit_name_ar" defaultValue={getDraftDefault("unit_name_ar", unit?.unit_name_ar ?? "")} disabled={isViewing} dir="rtl" />
            </div>
            <div className="space-y-2 col-span-6">
              <Label htmlFor="symbol" className="text-muted-foreground text-xs">Symbol</Label>
              <Input id="symbol" name="symbol" defaultValue={getDraftDefault("symbol", unit?.symbol ?? "")} disabled={isViewing} placeholder="kg" />
            </div>
            <div className="space-y-2 col-span-6">
              <Label htmlFor="sort_order" className="text-muted-foreground text-xs">Sort Order</Label>
              <Input id="sort_order" name="sort_order" type="number" min={0} defaultValue={getDraftDefault("sort_order", unit?.sort_order ?? 0)} disabled={isViewing} />
            </div>
            <div className="space-y-2 col-span-6">
              <Label htmlFor="description_en" className="text-muted-foreground text-xs">Description (EN)</Label>
              <Textarea id="description_en" name="description_en" defaultValue={getDraftDefault("description_en", unit?.description_en ?? "")} disabled={isViewing} rows={2} />
            </div>
            <div className="space-y-2 col-span-6">
              <Label htmlFor="description_ar" className="text-muted-foreground text-xs">Description (AR)</Label>
              <Textarea id="description_ar" name="description_ar" defaultValue={getDraftDefault("description_ar", unit?.description_ar ?? "")} disabled={isViewing} dir="rtl" rows={2} />
            </div>
          </div>
        </ERPRecordSectionPanel>

        <ERPRecordSectionPanel id="conversion" activeId={activeSection} title="Conversion Settings">
          <div className="grid grid-cols-12 gap-4">
            <div className="space-y-2 col-span-6">
              <RequiredLabel htmlFor="conversion_factor_to_base">Conversion Factor to Base</RequiredLabel>
              <Input id="conversion_factor_to_base" name="conversion_factor_to_base" type="number" step="any" min={0.0000000001} required defaultValue={getDraftDefault("conversion_factor_to_base", unit?.conversion_factor_to_base ?? 1)} disabled={isViewing} />
            </div>
            <div className="space-y-2 col-span-6">
              <Label htmlFor="decimal_places" className="text-muted-foreground text-xs">Decimal Places</Label>
              <Input id="decimal_places" name="decimal_places" type="number" min={0} max={6} defaultValue={getDraftDefault("decimal_places", unit?.decimal_places ?? 2)} disabled={isViewing} />
            </div>
            <div className="space-y-3 col-span-6">
              <div className="flex items-center space-x-2">
                <Checkbox id="is_base_unit" name="is_base_unit" defaultChecked={getDraftBoolean("is_base_unit", unit?.is_base_unit ?? false)} disabled={isViewing} />
                <Label htmlFor="is_base_unit" className="text-sm font-normal cursor-pointer">Base Unit (Factor = 1)</Label>
              </div>
            </div>
            <div className="space-y-3 col-span-6">
              <div className="flex items-center space-x-2">
                <Checkbox id="allow_fraction" name="allow_fraction" defaultChecked={getDraftBoolean("allow_fraction", unit?.allow_fraction ?? true)} disabled={isViewing} />
                <Label htmlFor="allow_fraction" className="text-sm font-normal cursor-pointer">Allow Fractions</Label>
              </div>
            </div>
            <div className="space-y-2 col-span-12">
              <Label htmlFor="notes" className="text-muted-foreground text-xs">Notes</Label>
              <Textarea id="notes" name="notes" defaultValue={getDraftDefault("notes", unit?.notes ?? "")} disabled={isViewing} rows={3} />
            </div>
          </div>
        </ERPRecordSectionPanel>

        <ERPRecordSectionPanel id="status" activeId={activeSection} title="Status">
          <div className="grid grid-cols-12 gap-4">
            <div className="space-y-3 col-span-6">
              <div className="flex items-center space-x-2">
                <Checkbox id="is_active" name="is_active" defaultChecked={getDraftBoolean("is_active", unit?.is_active ?? true)} disabled={isViewing} />
                <Label htmlFor="is_active" className="text-sm font-normal cursor-pointer">Active</Label>
              </div>
            </div>
            {unit?.is_system && (
              <div className="col-span-12">
                <p className="text-sm text-muted-foreground">This is a system unit and cannot be deleted.</p>
              </div>
            )}
            {unit?.is_locked && (
              <div className="col-span-12">
                <p className="text-sm text-amber-600">This unit is locked and can only be modified by system administrators.</p>
              </div>
            )}
          </div>
        </ERPRecordSectionPanel>

        <ERPRecordSectionPanel id="audit" activeId={activeSection} title="Audit Information" lazyMount>
          {unit ? (
            <div className="grid grid-cols-12 gap-4">
              <div className="space-y-2 col-span-6">
                <Label className="text-muted-foreground text-xs">Created At</Label>
                <Input value={new Date(unit.created_at).toLocaleString()} disabled className="text-xs" />
              </div>
              <div className="space-y-2 col-span-6">
                <Label className="text-muted-foreground text-xs">Updated At</Label>
                <Input value={new Date(unit.updated_at).toLocaleString()} disabled className="text-xs" />
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
