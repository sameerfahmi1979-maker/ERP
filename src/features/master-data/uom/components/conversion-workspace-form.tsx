"use client";

import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import type { UomConversionWithUnits } from "@/features/master-data/uom/types";
import { createUomConversion, updateUomConversion } from "@/features/master-data/uom/actions";
import { UnitOfMeasureSelect } from "@/components/erp/uom/unit-of-measure-select";
import { RequiredLabel } from "@/components/erp/required-label";
import { useFormDirty } from "@/hooks/use-form-dirty";
import { ArrowRight, Shield, Info } from "lucide-react";
import type { AuthContext } from "@/lib/rbac/check";
import { useWorkspace } from "@/hooks/use-workspace";
import { ERPRecordWorkspaceForm, ERPRecordSectionPanel } from "@/components/workspace/erp-record-workspace-form";
import { useWorkspaceFormDraft } from "@/hooks/use-workspace-form-draft";

type ConversionWorkspaceFormProps = {
  conversion?: UomConversionWithUnits | null;
  mode: "add" | "edit" | "view";
  authContext: AuthContext;
};

const FORM_ID = "conversion-workspace-form";

export function ConversionWorkspaceForm({ conversion, mode }: ConversionWorkspaceFormProps) {
  const { closeTab, activeTab, markDirty, forceCloseActiveTab } = useWorkspace();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeSection, setActiveSection] = useState("basic");

  const isEditing = mode === "edit";
  const isViewing = mode === "view";

  const { isDirty, resetDirty } = useFormDirty({ formId: FORM_ID, enabled: !isViewing });
  const { getDraftDefault, getDraftBoolean, syncDraft, writeDraftField, clearDraft } = useWorkspaceFormDraft({ formId: FORM_ID, enabled: !isViewing });

  const [fromUomId, setFromUomId] = useState<number | null>(() => {
    const d = getDraftDefault("from_uom_id", "");
    return d ? Number(d) : conversion?.from_uom_id ?? null;
  });
  const [toUomId, setToUomId] = useState<number | null>(() => {
    const d = getDraftDefault("to_uom_id", "");
    return d ? Number(d) : conversion?.to_uom_id ?? null;
  });

  useEffect(() => {
    if (activeTab?.id) markDirty(activeTab.id, isDirty);
  }, [isDirty, activeTab?.id, markDirty]);

  const sections = [
    { id: "basic", label: "Conversion", icon: ArrowRight },
    { id: "status", label: "Status", icon: Shield },
    { id: "audit", label: "Audit Info", icon: Info },
  ];

  const handleRequestClose = () => closeTab(activeTab?.id ?? "");

  const handleSave = async (): Promise<boolean> => {
    if (isViewing) return false;
    const form = document.getElementById(FORM_ID) as HTMLFormElement;
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
        clearDraft();
        resetDirty();
        return true;
      } else {
        toast.error(result.error ?? "Failed to save conversion");
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

  const conversionTitle = conversion
    ? `${conversion.from_unit?.unit_name_en ?? "?"} → ${conversion.to_unit?.unit_name_en ?? "?"}`
    : undefined;

  return (
    <ERPRecordWorkspaceForm
      mode={mode}
      title={isViewing ? "View UOM Conversion" : isEditing ? "Edit UOM Conversion" : "New UOM Conversion"}
      subtitle={conversionTitle ?? "Create a new conversion rule"}
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
        <ERPRecordSectionPanel id="basic" activeId={activeSection} title="Conversion Settings">
          <div className="grid grid-cols-12 gap-4">
            <div className="space-y-2 col-span-12">
              <RequiredLabel htmlFor="from_uom">From Unit</RequiredLabel>
              {isEditing || isViewing ? (
                <Input value={conversion?.from_unit?.unit_name_en ?? ""} disabled />
              ) : (
                <UnitOfMeasureSelect value={fromUomId} onValueChange={(v) => { setFromUomId(v); writeDraftField("from_uom_id", v ?? ""); }} required />
              )}
            </div>
            <div className="space-y-2 col-span-12">
              <RequiredLabel htmlFor="to_uom">To Unit</RequiredLabel>
              {isEditing || isViewing ? (
                <Input value={conversion?.to_unit?.unit_name_en ?? ""} disabled />
              ) : (
                <UnitOfMeasureSelect value={toUomId} onValueChange={(v) => { setToUomId(v); writeDraftField("to_uom_id", v ?? ""); }} required />
              )}
            </div>
            <div className="space-y-2 col-span-6">
              <RequiredLabel htmlFor="conversion_factor">Conversion Factor</RequiredLabel>
              <Input id="conversion_factor" name="conversion_factor" type="number" step="any" min={0.0000000001} required defaultValue={getDraftDefault("conversion_factor", conversion?.conversion_factor ?? 1)} disabled={isViewing} />
            </div>
            <div className="space-y-2 col-span-6">
              <Label htmlFor="conversion_formula_code" className="text-muted-foreground text-xs">Formula Code</Label>
              <Input id="conversion_formula_code" name="conversion_formula_code" defaultValue={getDraftDefault("conversion_formula_code", conversion?.conversion_formula_code ?? "")} disabled={isViewing} placeholder="Optional" />
            </div>
            <div className="space-y-3 col-span-6">
              <div className="flex items-center space-x-2">
                <Checkbox id="is_bidirectional" name="is_bidirectional" defaultChecked={getDraftBoolean("is_bidirectional", conversion?.is_bidirectional ?? false)} disabled={isViewing} />
                <Label htmlFor="is_bidirectional" className="text-sm font-normal cursor-pointer">Bidirectional</Label>
              </div>
            </div>
            <div className="space-y-2 col-span-6">
              <Label htmlFor="sort_order" className="text-muted-foreground text-xs">Sort Order</Label>
              <Input id="sort_order" name="sort_order" type="number" min={0} defaultValue={getDraftDefault("sort_order", conversion?.sort_order ?? 0)} disabled={isViewing} />
            </div>
            <div className="space-y-2 col-span-12">
              <Label htmlFor="notes" className="text-muted-foreground text-xs">Notes</Label>
              <Textarea id="notes" name="notes" defaultValue={getDraftDefault("notes", conversion?.notes ?? "")} disabled={isViewing} rows={3} />
            </div>
          </div>
        </ERPRecordSectionPanel>

        <ERPRecordSectionPanel id="status" activeId={activeSection} title="Status">
          <div className="grid grid-cols-12 gap-4">
            <div className="space-y-3 col-span-6">
              <div className="flex items-center space-x-2">
                <Checkbox id="is_active" name="is_active" defaultChecked={getDraftBoolean("is_active", conversion?.is_active ?? true)} disabled={isViewing} />
                <Label htmlFor="is_active" className="text-sm font-normal cursor-pointer">Active</Label>
              </div>
            </div>
            {conversion?.is_system && (
              <div className="col-span-12">
                <p className="text-sm text-muted-foreground">This is a system conversion and cannot be deleted.</p>
              </div>
            )}
            {conversion?.is_locked && (
              <div className="col-span-12">
                <p className="text-sm text-amber-600">This conversion is locked and can only be modified by system administrators.</p>
              </div>
            )}
          </div>
        </ERPRecordSectionPanel>

        <ERPRecordSectionPanel id="audit" activeId={activeSection} title="Audit Information" lazyMount>
          {conversion ? (
            <div className="grid grid-cols-12 gap-4">
              <div className="space-y-2 col-span-6">
                <Label className="text-muted-foreground text-xs">Created At</Label>
                <Input value={new Date(conversion.created_at).toLocaleString()} disabled className="text-xs" />
              </div>
              <div className="space-y-2 col-span-6">
                <Label className="text-muted-foreground text-xs">Updated At</Label>
                <Input value={new Date(conversion.updated_at).toLocaleString()} disabled className="text-xs" />
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
