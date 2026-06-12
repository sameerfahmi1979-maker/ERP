"use client";

import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import type { UnitOfMeasureWithCategory } from "../types";
import { createUnitOfMeasure, updateUnitOfMeasure } from "../actions";
import { UomCategorySelect } from "@/components/erp/uom/uom-category-select";
import { RequiredLabel } from "@/components/erp/required-label";
import { ERPFormFooter } from "@/components/erp/erp-form-footer";
import {
  ERPDrawerForm,
  ERPDrawerSectionNav,
  ERPDrawerBody,
  ERPDrawerSection,
  ERPFieldGrid,
} from "@/components/erp/erp-drawer-form";
import { Ruler, Tag, Shield, Info } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useFormDirty } from "@/hooks/use-form-dirty";
import { invalidateUom } from "@/lib/query/invalidation";

type UnitFormDialogProps = {
  unit?: UnitOfMeasureWithCategory | null;
  mode: "add" | "edit" | "view";
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
};

function UnitFormDialogInner({
  unit,
  mode,
  open,
  onOpenChange,
  onSuccess,
}: UnitFormDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeSection, setActiveSection] = useState("basic");
  const [categoryId, setCategoryId] = useState<number | null>(unit?.uom_category_id ?? null);
  const isEditing = mode === "edit";
  const isViewing = mode === "view";
  const queryClient = useQueryClient();
  const { isDirty, resetDirty } = useFormDirty({
    formId: "drawer-form",
    enabled: !isViewing,
  });

  const sections = [
    { id: "basic", label: "Basic Info", icon: Ruler },
    { id: "conversion", label: "Conversion", icon: Tag },
    { id: "status", label: "Status", icon: Shield },
    { id: "audit", label: "Audit Info", icon: Info },
  ];

  const handleSave = async (e?: React.FormEvent<HTMLFormElement>) => {
    if (e) e.preventDefault();
    
    if (isViewing) return;

    const form = document.getElementById("drawer-form") as HTMLFormElement;
    const formData = new FormData(form);

    if (!isEditing && !categoryId) {
      toast.error("Please select a category");
      return false;
    }

    setIsSubmitting(true);
    try {
      let result;
      if (isEditing && unit) {
        result = await updateUnitOfMeasure({
          id: unit.id,
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
          is_active: formData.get("is_active") === "on",
        });
      } else {
        result = await createUnitOfMeasure({
          uom_category_id: categoryId!,
          unit_code: (formData.get("unit_code") as string).toUpperCase(),
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
        });
      }

      if (result.success) {
        toast.success(`Unit ${isEditing ? "updated" : "created"} successfully`);
        resetDirty();
        invalidateUom(queryClient);
        if (onSuccess) onSuccess();
        return true;
      } else {
        toast.error(result.error ?? "Failed to save unit");
        return false;
      }
    } catch (error) {
      console.error("Form submission error", error);
      toast.error("An unexpected error occurred");
      return false;
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSaveAndClose = async (e?: React.FormEvent<HTMLFormElement>) => {
    if (e) e.preventDefault();
    const success = await handleSave();
    if (success) {
      onOpenChange(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    await handleSaveAndClose();
  };

  return (
    <ERPDrawerForm
      open={open}
      onOpenChange={onOpenChange}
      title={isViewing ? "View Unit of Measure" : isEditing ? "Edit Unit of Measure" : "Add Unit of Measure"}
      subtitle={unit ? `Unit: ${unit.unit_name_en}` : "Create a new unit of measure"}
      recordNumber={unit?.unit_code}
      mode={mode}
      isDirty={isDirty}
    >
      <form id="drawer-form" onSubmit={handleSubmit} className="flex flex-1 overflow-hidden h-full">
        <ERPDrawerSectionNav sections={sections} activeSection={activeSection} setActiveSection={setActiveSection} />
        <div className="flex-grow flex flex-col justify-between overflow-hidden">
          <ERPDrawerBody>
            <ERPDrawerSection id="basic" activeId={activeSection} title="Basic Information">
              <ERPFieldGrid>
                <div className="space-y-2 col-span-6">
                  <RequiredLabel htmlFor="category">Category</RequiredLabel>
                  {isEditing || isViewing ? (
                    <Input value={unit?.category?.category_name_en ?? ""} disabled />
                  ) : (
                    <UomCategorySelect
                      value={categoryId}
                      onValueChange={setCategoryId}
                      required
                    />
                  )}
                </div>
                <div className="space-y-2 col-span-6">
                  <RequiredLabel htmlFor="unit_code">Unit Code</RequiredLabel>
                  <Input
                    id="unit_code"
                    name="unit_code"
                    required
                    defaultValue={unit?.unit_code}
                    disabled={isViewing || isEditing}
                    placeholder="KG"
                    className="uppercase"
                  />
                </div>
                <div className="space-y-2 col-span-6">
                  <RequiredLabel htmlFor="unit_name_en">English Name</RequiredLabel>
                  <Input
                    id="unit_name_en"
                    name="unit_name_en"
                    required
                    defaultValue={unit?.unit_name_en}
                    disabled={isViewing}
                    placeholder="Kilogram"
                  />
                </div>
                <div className="space-y-2 col-span-6">
                  <Label htmlFor="unit_name_ar" className="text-muted-foreground text-xs">Arabic Name</Label>
                  <Input
                    id="unit_name_ar"
                    name="unit_name_ar"
                    defaultValue={unit?.unit_name_ar ?? ""}
                    disabled={isViewing}
                    dir="rtl"
                  />
                </div>
                <div className="space-y-2 col-span-6">
                  <Label htmlFor="symbol" className="text-muted-foreground text-xs">Symbol</Label>
                  <Input
                    id="symbol"
                    name="symbol"
                    defaultValue={unit?.symbol ?? ""}
                    disabled={isViewing}
                    placeholder="kg"
                  />
                </div>
                <div className="space-y-2 col-span-6">
                  <Label htmlFor="sort_order" className="text-muted-foreground text-xs">Sort Order</Label>
                  <Input
                    id="sort_order"
                    name="sort_order"
                    type="number"
                    min={0}
                    defaultValue={unit?.sort_order ?? 0}
                    disabled={isViewing}
                  />
                </div>
                <div className="space-y-2 col-span-12">
                  <Label htmlFor="description_en" className="text-muted-foreground text-xs">English Description</Label>
                  <Textarea
                    id="description_en"
                    name="description_en"
                    defaultValue={unit?.description_en ?? ""}
                    disabled={isViewing}
                    rows={2}
                  />
                </div>
                <div className="space-y-2 col-span-12">
                  <Label htmlFor="description_ar" className="text-muted-foreground text-xs">Arabic Description</Label>
                  <Textarea
                    id="description_ar"
                    name="description_ar"
                    defaultValue={unit?.description_ar ?? ""}
                    disabled={isViewing}
                    dir="rtl"
                    rows={2}
                  />
                </div>
              </ERPFieldGrid>
            </ERPDrawerSection>

            <ERPDrawerSection id="conversion" activeId={activeSection} title="Conversion Settings">
              <ERPFieldGrid>
                <div className="space-y-2 col-span-6">
                  <Label htmlFor="conversion_factor_to_base" className="text-muted-foreground text-xs">Conversion Factor to Base *</Label>
                  <Input
                    id="conversion_factor_to_base"
                    name="conversion_factor_to_base"
                    type="number"
                    step="any"
                    min={0.0000000001}
                    required
                    defaultValue={unit?.conversion_factor_to_base ?? 1}
                    disabled={isViewing}
                  />
                </div>
                <div className="space-y-2 col-span-6">
                  <Label htmlFor="decimal_places" className="text-muted-foreground text-xs">Decimal Places *</Label>
                  <Input
                    id="decimal_places"
                    name="decimal_places"
                    type="number"
                    min={0}
                    max={6}
                    required
                    defaultValue={unit?.decimal_places ?? 2}
                    disabled={isViewing}
                  />
                </div>
                <div className="space-y-3 col-span-6">
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="is_base_unit"
                      name="is_base_unit"
                      defaultChecked={unit?.is_base_unit ?? false}
                      disabled={isViewing}
                    />
                    <Label htmlFor="is_base_unit" className="text-sm font-normal cursor-pointer">Base Unit (Factor = 1)</Label>
                  </div>
                </div>
                <div className="space-y-3 col-span-6">
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="allow_fraction"
                      name="allow_fraction"
                      defaultChecked={unit?.allow_fraction ?? true}
                      disabled={isViewing}
                    />
                    <Label htmlFor="allow_fraction" className="text-sm font-normal cursor-pointer">Allow Fractions</Label>
                  </div>
                </div>
                <div className="space-y-2 col-span-12">
                  <Label htmlFor="notes" className="text-muted-foreground text-xs">Notes</Label>
                  <Textarea
                    id="notes"
                    name="notes"
                    defaultValue={unit?.notes ?? ""}
                    disabled={isViewing}
                    rows={3}
                  />
                </div>
              </ERPFieldGrid>
            </ERPDrawerSection>

            <ERPDrawerSection id="status" activeId={activeSection} title="Status & Flags">
              <ERPFieldGrid>
                <div className="space-y-3 col-span-12">
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="is_active"
                      name="is_active"
                      defaultChecked={unit?.is_active ?? true}
                      disabled={isViewing}
                    />
                    <Label htmlFor="is_active" className="text-sm font-normal cursor-pointer">Active</Label>
                  </div>
                </div>
                {unit?.is_system && (
                  <div className="space-y-2 col-span-12">
                    <p className="text-sm text-muted-foreground">This is a system unit and cannot be deleted.</p>
                  </div>
                )}
                {unit?.is_locked && (
                  <div className="space-y-2 col-span-12">
                    <p className="text-sm text-amber-600">This unit is locked and can only be modified by system administrators.</p>
                  </div>
                )}
              </ERPFieldGrid>
            </ERPDrawerSection>

            {unit && (
              <ERPDrawerSection id="audit" activeId={activeSection} title="Audit Information" lazyMount>
                <ERPFieldGrid>
                  <div className="space-y-2 col-span-6">
                    <Label className="text-muted-foreground text-xs">Created At</Label>
                    <Input value={new Date(unit.created_at).toLocaleString()} disabled />
                  </div>
                  <div className="space-y-2 col-span-6">
                    <Label className="text-muted-foreground text-xs">Updated At</Label>
                    <Input value={new Date(unit.updated_at).toLocaleString()} disabled />
                  </div>
                  {unit.deactivated_at && (
                    <>
                      <div className="space-y-2 col-span-6">
                        <Label className="text-muted-foreground text-xs">Deactivated At</Label>
                        <Input value={new Date(unit.deactivated_at).toLocaleString()} disabled />
                      </div>
                      <div className="space-y-2 col-span-12">
                        <Label className="text-muted-foreground text-xs">Deactivation Reason</Label>
                        <Textarea value={unit.deactivation_reason ?? ""} disabled rows={2} />
                      </div>
                    </>
                  )}
                </ERPFieldGrid>
              </ERPDrawerSection>
            )}
          </ERPDrawerBody>

          <ERPFormFooter
            mode={mode}
            onSave={handleSave}
            onSaveAndClose={handleSaveAndClose}
            onCancel={() => onOpenChange(false)}
            isSubmitting={isSubmitting}
            hasUnsavedChanges={isDirty}
          />
        </div>
      </form>
    </ERPDrawerForm>
  );
}

export function UnitFormDialog(props: UnitFormDialogProps) {
  return <UnitFormDialogInner key={`${props.mode}-${props.unit?.id ?? 'new'}`} {...props} />;
}
