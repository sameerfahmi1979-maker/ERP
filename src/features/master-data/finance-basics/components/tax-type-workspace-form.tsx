"use client";

import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import type { TaxType } from "@/features/master-data/finance-basics/types";
import { createTaxType, updateTaxType } from "@/features/master-data/finance-basics/actions";
import { LookupSelect } from "@/components/erp/lookup-select";
import { RequiredLabel } from "@/components/erp/required-label";
import { useQueryClient } from "@tanstack/react-query";
import { useFormDirty } from "@/hooks/use-form-dirty";
import { invalidateTaxTypes } from "@/lib/query/invalidation";
import { Percent, Tag, Shield, Info } from "lucide-react";
import type { AuthContext } from "@/lib/rbac/check";
import { useWorkspace } from "@/hooks/use-workspace";
import { useWorkspaceFormDraft } from "@/hooks/use-workspace-form-draft";
import { ERPRecordWorkspaceForm, ERPRecordSectionPanel } from "@/components/workspace/erp-record-workspace-form";

type TaxTypeWorkspaceFormProps = {
  taxType?: TaxType | null;
  mode: "add" | "edit" | "view";
  authContext: AuthContext;
};

const FORM_ID = "tax-type-workspace-form";

export function TaxTypeWorkspaceForm({ taxType, mode }: TaxTypeWorkspaceFormProps) {
  const { closeTab, activeTab, markDirty, forceCloseActiveTab } = useWorkspace();
  const queryClient = useQueryClient();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeSection, setActiveSection] = useState("basic");
  const isEditing = mode === "edit";
  const isViewing = mode === "view";
  const { isDirty, resetDirty } = useFormDirty({ formId: FORM_ID, enabled: !isViewing });

  // ── Draft preservation (UI.4E.2) ──────────────────────────────────────────
  const { getDraftDefault, getDraftBoolean, syncDraft, writeDraftField, clearDraft } = useWorkspaceFormDraft({
    formId: FORM_ID,
    enabled: !isViewing,
  });

  const [taxTreatmentCode, setTaxTreatmentCode] = useState<string | null>(() =>
    getDraftDefault("tax_treatment_code", taxType?.tax_treatment_code ?? "") || null
  );

  useEffect(() => {
    if (activeTab?.id) markDirty(activeTab.id, isDirty);
  }, [isDirty, activeTab?.id, markDirty]);

  const sections = [
    { id: "basic", label: "Basic Info", icon: Percent },
    { id: "vat", label: "VAT & Applicability", icon: Tag },
    { id: "status", label: "Status", icon: Shield },
    { id: "audit", label: "Audit Info", icon: Info },
  ];

  const handleRequestClose = () => closeTab(activeTab?.id ?? "");

  const handleSave = async (): Promise<boolean> => {
    if (isViewing) return false;
    if (!taxTreatmentCode) { toast.error("Please select a tax treatment type"); return false; }
    const form = document.getElementById(FORM_ID) as HTMLFormElement;
    const formData = new FormData(form);
    setIsSubmitting(true);
    try {
      const shared = {
        tax_name_en: formData.get("tax_name_en") as string,
        tax_name_ar: (formData.get("tax_name_ar") as string) || null,
        tax_rate: parseFloat(formData.get("tax_rate") as string) || 0,
        tax_treatment_code: taxTreatmentCode,
        is_vat: formData.get("is_vat") === "on",
        is_reverse_charge: formData.get("is_reverse_charge") === "on",
        applies_to_sales: formData.get("applies_to_sales") === "on",
        applies_to_purchases: formData.get("applies_to_purchases") === "on",
        applies_to_scrap: formData.get("applies_to_scrap") === "on",
        effective_from: formData.get("effective_from") as string,
        effective_to: (formData.get("effective_to") as string) || null,
        description_en: (formData.get("description_en") as string) || null,
        description_ar: (formData.get("description_ar") as string) || null,
        notes: (formData.get("notes") as string) || null,
        sort_order: parseInt(formData.get("sort_order") as string) || 0,
      };
      let result;
      if (isEditing && taxType) {
        result = await updateTaxType({ id: taxType.id, ...shared, is_active: formData.get("is_active") === "on" });
      } else {
        result = await createTaxType({ tax_code: (formData.get("tax_code") as string).toUpperCase(), ...shared });
      }
      if (result.success) {
        toast.success(`Tax type ${isEditing ? "updated" : "created"} successfully`);
        clearDraft(); resetDirty(); if (activeTab?.id) markDirty(activeTab.id, false);
        invalidateTaxTypes(queryClient);
        return true;
      } else {
        toast.error(result.error ?? "Failed to save tax type");
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
      title={isViewing ? "View Tax Type" : isEditing ? "Edit Tax Type" : "New Tax Type"}
      subtitle={taxType ? `${taxType.tax_name_en} (${taxType.tax_code})` : "Create a new tax type"}
      recordCode={taxType?.tax_code}
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
              <RequiredLabel htmlFor="tax_code">Tax Code</RequiredLabel>
              <Input id="tax_code" name="tax_code" required defaultValue={getDraftDefault("tax_code", taxType?.tax_code ?? "")} disabled={isViewing || isEditing} className="uppercase" placeholder="VAT5" />
            </div>
            <div className="space-y-2 col-span-6">
              <RequiredLabel htmlFor="tax_rate">Tax Rate (%)</RequiredLabel>
              <Input id="tax_rate" name="tax_rate" type="number" min={0} max={100} step="0.0001" required defaultValue={getDraftDefault("tax_rate", taxType?.tax_rate ?? 0)} disabled={isViewing} />
            </div>
            <div className="space-y-2 col-span-6">
              <RequiredLabel htmlFor="tax_name_en">English Name</RequiredLabel>
              <Input id="tax_name_en" name="tax_name_en" required defaultValue={getDraftDefault("tax_name_en", taxType?.tax_name_en ?? "")} disabled={isViewing} />
            </div>
            <div className="space-y-2 col-span-6">
              <Label htmlFor="tax_name_ar" className="text-muted-foreground text-xs">Arabic Name</Label>
              <Input id="tax_name_ar" name="tax_name_ar" defaultValue={getDraftDefault("tax_name_ar", taxType?.tax_name_ar ?? "")} disabled={isViewing} dir="rtl" />
            </div>
            <div className="space-y-2 col-span-6">
              <RequiredLabel>Tax Treatment</RequiredLabel>
              <LookupSelect categoryCode="TAX_TREATMENT_TYPES" value={taxTreatmentCode} onValueChange={(v) => { const s = v ? String(v) : null; setTaxTreatmentCode(s); writeDraftField("tax_treatment_code", s ?? ""); }} valueField="code" showCode disabled={isViewing} required />
            </div>
            <div className="space-y-2 col-span-3">
              <RequiredLabel htmlFor="effective_from">Effective From</RequiredLabel>
              <Input id="effective_from" name="effective_from" type="date" required defaultValue={getDraftDefault("effective_from", taxType?.effective_from ?? "2018-01-01")} disabled={isViewing} />
            </div>
            <div className="space-y-2 col-span-3">
              <Label htmlFor="effective_to" className="text-muted-foreground text-xs">Effective To</Label>
              <Input id="effective_to" name="effective_to" type="date" defaultValue={getDraftDefault("effective_to", taxType?.effective_to ?? "")} disabled={isViewing} />
            </div>
          </div>
        </ERPRecordSectionPanel>

        <ERPRecordSectionPanel id="vat" activeId={activeSection} title="VAT Flags & Applicability">
          <div className="grid grid-cols-12 gap-4">
            <div className="space-y-3 col-span-12">
              <div className="flex items-center space-x-2">
                <Checkbox id="is_vat" name="is_vat" defaultChecked={getDraftBoolean("is_vat", taxType?.is_vat ?? false)} disabled={isViewing} />
                <Label htmlFor="is_vat" className="text-sm font-normal cursor-pointer">VAT Tax</Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox id="is_reverse_charge" name="is_reverse_charge" defaultChecked={getDraftBoolean("is_reverse_charge", taxType?.is_reverse_charge ?? false)} disabled={isViewing} />
                <Label htmlFor="is_reverse_charge" className="text-sm font-normal cursor-pointer">Reverse Charge</Label>
              </div>
              <Label className="text-muted-foreground text-xs pt-2 block">Applies To</Label>
              <div className="flex items-center space-x-2">
                <Checkbox id="applies_to_sales" name="applies_to_sales" defaultChecked={getDraftBoolean("applies_to_sales", taxType?.applies_to_sales ?? true)} disabled={isViewing} />
                <Label htmlFor="applies_to_sales" className="text-sm font-normal cursor-pointer">Sales</Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox id="applies_to_purchases" name="applies_to_purchases" defaultChecked={getDraftBoolean("applies_to_purchases", taxType?.applies_to_purchases ?? true)} disabled={isViewing} />
                <Label htmlFor="applies_to_purchases" className="text-sm font-normal cursor-pointer">Purchases</Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox id="applies_to_scrap" name="applies_to_scrap" defaultChecked={getDraftBoolean("applies_to_scrap", taxType?.applies_to_scrap ?? false)} disabled={isViewing} />
                <Label htmlFor="applies_to_scrap" className="text-sm font-normal cursor-pointer">Scrap / Waste</Label>
              </div>
            </div>
            <div className="space-y-2 col-span-6">
              <Label htmlFor="description_en" className="text-muted-foreground text-xs">Description (EN)</Label>
              <Textarea id="description_en" name="description_en" defaultValue={getDraftDefault("description_en", taxType?.description_en ?? "")} disabled={isViewing} rows={2} />
            </div>
            <div className="space-y-2 col-span-6">
              <Label htmlFor="sort_order" className="text-muted-foreground text-xs">Sort Order</Label>
              <Input id="sort_order" name="sort_order" type="number" min={0} defaultValue={getDraftDefault("sort_order", taxType?.sort_order ?? 0)} disabled={isViewing} />
            </div>
          </div>
        </ERPRecordSectionPanel>

        <ERPRecordSectionPanel id="status" activeId={activeSection} title="Status">
          <div className="grid grid-cols-12 gap-4">
            {(isEditing || isViewing) && (
              <div className="space-y-2 col-span-6">
                <div className="flex items-center space-x-2">
                  <Checkbox id="is_active" name="is_active" defaultChecked={getDraftBoolean("is_active", taxType?.is_active ?? true)} disabled={isViewing} />
                  <Label htmlFor="is_active" className="text-sm font-normal cursor-pointer">Active</Label>
                </div>
              </div>
            )}
          </div>
        </ERPRecordSectionPanel>

        <ERPRecordSectionPanel id="audit" activeId={activeSection} title="Audit Information" lazyMount>
          {taxType ? (
            <div className="grid grid-cols-12 gap-4">
              <div className="space-y-2 col-span-6">
                <Label className="text-muted-foreground text-xs">Created At</Label>
                <Input value={new Date(taxType.created_at).toLocaleString()} disabled className="text-xs" />
              </div>
              <div className="space-y-2 col-span-6">
                <Label className="text-muted-foreground text-xs">Updated At</Label>
                <Input value={new Date(taxType.updated_at).toLocaleString()} disabled className="text-xs" />
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
