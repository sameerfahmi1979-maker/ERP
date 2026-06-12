"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import type { UomConversionWithUnits } from "../types";
import { createUomConversion, updateUomConversion } from "../actions";
import { UnitOfMeasureSelect } from "@/components/erp/uom/unit-of-measure-select";
import { RequiredLabel } from "@/components/erp/required-label";
import { ERPFormFooter } from "@/components/erp/erp-form-footer";
import {
  ERPDrawerForm,
  ERPDrawerSectionNav,
  ERPDrawerBody,
  ERPDrawerSection,
  ERPFieldGrid,
} from "@/components/erp/erp-drawer-form";
import { ArrowRight, Shield, Info } from "lucide-react";
import { useFormDirty } from "@/hooks/use-form-dirty";

type ConversionFormDialogProps = {
  conversion?: UomConversionWithUnits | null;
  mode: "add" | "edit" | "view";
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
};

function ConversionFormDialogInner({
  conversion,
  mode,
  open,
  onOpenChange,
  onSuccess,
}: ConversionFormDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeSection, setActiveSection] = useState("basic");
  const [fromUomId, setFromUomId] = useState<number | null>(conversion?.from_uom_id ?? null);
  const [toUomId, setToUomId] = useState<number | null>(conversion?.to_uom_id ?? null);
  const isEditing = mode === "edit";
  const isViewing = mode === "view";
  const { isDirty, resetDirty } = useFormDirty({
    formId: "drawer-form",
    enabled: !isViewing,
  });

  const sections = [
    { id: "basic", label: "Conversion", icon: ArrowRight },
    { id: "status", label: "Status", icon: Shield },
    { id: "audit", label: "Audit Info", icon: Info },
  ];

  const handleSave = async (e?: React.FormEvent<HTMLFormElement>) => {
    if (e) e.preventDefault();
    
    if (isViewing) return;

    const form = document.getElementById("drawer-form") as HTMLFormElement;
    const formData = new FormData(form);

    if (!isEditing && (!fromUomId || !toUomId)) {
      toast.error("Please select both from and to units");
      return false;
    }

    setIsSubmitting(true);
    try {
      let result;
      if (isEditing && conversion) {
        result = await updateUomConversion({
          id: conversion.id,
          conversion_factor: parseFloat(formData.get("conversion_factor") as string),
          conversion_formula_code: (formData.get("conversion_formula_code") as string) || null,
          is_bidirectional: formData.get("is_bidirectional") === "on",
          notes: (formData.get("notes") as string) || null,
          sort_order: parseInt(formData.get("sort_order") as string) || 0,
          is_active: formData.get("is_active") === "on",
        });
      } else {
        result = await createUomConversion({
          from_uom_id: fromUomId!,
          to_uom_id: toUomId!,
          conversion_factor: parseFloat(formData.get("conversion_factor") as string),
          conversion_formula_code: (formData.get("conversion_formula_code") as string) || null,
          is_bidirectional: formData.get("is_bidirectional") === "on",
          notes: (formData.get("notes") as string) || null,
          sort_order: parseInt(formData.get("sort_order") as string) || 0,
        });
      }

      if (result.success) {
        toast.success(`Conversion ${isEditing ? "updated" : "created"} successfully`);
        resetDirty();
        if (onSuccess) onSuccess();
        return true;
      } else {
        toast.error(result.error ?? "Failed to save conversion");
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
      title={isViewing ? "View UOM Conversion" : isEditing ? "Edit UOM Conversion" : "Add UOM Conversion"}
      subtitle={conversion ? "Conversion rule" : "Create a new conversion rule"}
      mode={mode}
      isDirty={isDirty}
    >
      <form id="drawer-form" onSubmit={handleSubmit} className="flex flex-1 overflow-hidden h-full">
        <ERPDrawerSectionNav sections={sections} activeSection={activeSection} setActiveSection={setActiveSection} />
        <div className="flex-grow flex flex-col justify-between overflow-hidden">
          <ERPDrawerBody>
            <ERPDrawerSection id="basic" activeId={activeSection} title="Conversion Settings">
              <ERPFieldGrid>
                <div className="space-y-2 col-span-12">
                  <RequiredLabel htmlFor="from_uom">From Unit</RequiredLabel>
                  {isEditing || isViewing ? (
                    <Input value={conversion?.from_unit?.unit_name_en ?? ""} disabled />
                  ) : (
                    <UnitOfMeasureSelect
                      value={fromUomId}
                      onValueChange={setFromUomId}
                      required
                    />
                  )}
                </div>
                <div className="space-y-2 col-span-12">
                  <RequiredLabel htmlFor="to_uom">To Unit</RequiredLabel>
                  {isEditing || isViewing ? (
                    <Input value={conversion?.to_unit?.unit_name_en ?? ""} disabled />
                  ) : (
                    <UnitOfMeasureSelect
                      value={toUomId}
                      onValueChange={setToUomId}
                      required
                    />
                  )}
                </div>
                <div className="space-y-2 col-span-6">
                  <RequiredLabel htmlFor="conversion_factor">Conversion Factor</RequiredLabel>
                  <Input
                    id="conversion_factor"
                    name="conversion_factor"
                    type="number"
                    step="any"
                    min={0.0000000001}
                    required
                    defaultValue={conversion?.conversion_factor ?? 1}
                    disabled={isViewing}
                  />
                </div>
                <div className="space-y-2 col-span-6">
                  <Label htmlFor="conversion_formula_code" className="text-muted-foreground text-xs">Formula Code</Label>
                  <Input
                    id="conversion_formula_code"
                    name="conversion_formula_code"
                    defaultValue={conversion?.conversion_formula_code ?? ""}
                    disabled={isViewing}
                    placeholder="Optional"
                  />
                </div>
                <div className="space-y-3 col-span-6">
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="is_bidirectional"
                      name="is_bidirectional"
                      defaultChecked={conversion?.is_bidirectional ?? false}
                      disabled={isViewing}
                    />
                    <Label htmlFor="is_bidirectional" className="text-sm font-normal cursor-pointer">Bidirectional</Label>
                  </div>
                </div>
                <div className="space-y-2 col-span-6">
                  <Label htmlFor="sort_order" className="text-muted-foreground text-xs">Sort Order</Label>
                  <Input
                    id="sort_order"
                    name="sort_order"
                    type="number"
                    min={0}
                    defaultValue={conversion?.sort_order ?? 0}
                    disabled={isViewing}
                  />
                </div>
                <div className="space-y-2 col-span-12">
                  <Label htmlFor="notes" className="text-muted-foreground text-xs">Notes</Label>
                  <Textarea
                    id="notes"
                    name="notes"
                    defaultValue={conversion?.notes ?? ""}
                    disabled={isViewing}
                    rows={4}
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
                      defaultChecked={conversion?.is_active ?? true}
                      disabled={isViewing}
                    />
                    <Label htmlFor="is_active" className="text-sm font-normal cursor-pointer">Active</Label>
                  </div>
                </div>
                {conversion?.is_system && (
                  <div className="space-y-2 col-span-12">
                    <p className="text-sm text-muted-foreground">This is a system conversion and cannot be deleted.</p>
                  </div>
                )}
                {conversion?.is_locked && (
                  <div className="space-y-2 col-span-12">
                    <p className="text-sm text-amber-600">This conversion is locked and can only be modified by system administrators.</p>
                  </div>
                )}
              </ERPFieldGrid>
            </ERPDrawerSection>

            {conversion && (
              <ERPDrawerSection id="audit" activeId={activeSection} title="Audit Information" lazyMount>
                <ERPFieldGrid>
                  <div className="space-y-2 col-span-6">
                    <Label className="text-muted-foreground text-xs">Created At</Label>
                    <Input value={new Date(conversion.created_at).toLocaleString()} disabled />
                  </div>
                  <div className="space-y-2 col-span-6">
                    <Label className="text-muted-foreground text-xs">Updated At</Label>
                    <Input value={new Date(conversion.updated_at).toLocaleString()} disabled />
                  </div>
                  {conversion.deactivated_at && (
                    <>
                      <div className="space-y-2 col-span-6">
                        <Label className="text-muted-foreground text-xs">Deactivated At</Label>
                        <Input value={new Date(conversion.deactivated_at).toLocaleString()} disabled />
                      </div>
                      <div className="space-y-2 col-span-12">
                        <Label className="text-muted-foreground text-xs">Deactivation Reason</Label>
                        <Textarea value={conversion.deactivation_reason ?? ""} disabled rows={2} />
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

export function ConversionFormDialog(props: ConversionFormDialogProps) {
  return <ConversionFormDialogInner key={`${props.mode}-${props.conversion?.id ?? 'new'}`} {...props} />;
}
