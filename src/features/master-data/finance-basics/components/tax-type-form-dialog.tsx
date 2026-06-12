"use client";

import { useState } from "react";
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
import { ERPFormFooter } from "@/components/erp/erp-form-footer";
import {
  ERPDrawerForm,
  ERPDrawerSectionNav,
  ERPDrawerBody,
  ERPDrawerSection,
  ERPFieldGrid,
} from "@/components/erp/erp-drawer-form";
import { Percent, Tag, Shield, Info } from "lucide-react";

type TaxTypeFormDialogProps = {
  taxType?: TaxType | null;
  mode: "add" | "edit" | "view";
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function TaxTypeFormDialog(props: TaxTypeFormDialogProps) {
  if (!props.open) return null;
  return (
    <TaxTypeFormDialogInner
      key={`${props.mode}-${props.taxType?.id ?? "new"}`}
      {...props}
    />
  );
}

function TaxTypeFormDialogInner({ taxType, mode, open, onOpenChange }: TaxTypeFormDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeSection, setActiveSection] = useState("basic");
  const [taxTreatmentCode, setTaxTreatmentCode] = useState<string | null>(taxType?.tax_treatment_code ?? null);
  const isEditing = mode === "edit";
  const isViewing = mode === "view";

  const queryClient = useQueryClient();
  // Dirty state tracking for Safe Close
  const { isDirty, resetDirty } = useFormDirty({
    formId: "drawer-form",
    enabled: !isViewing,
  });

  const sections = [
    { id: "basic", label: "Basic Info", icon: Percent },
    { id: "vat", label: "VAT & Applicability", icon: Tag },
    { id: "status", label: "Status", icon: Shield },
    { id: "audit", label: "Audit Info", icon: Info },
  ];

  const handleSave = async (e?: React.FormEvent<HTMLFormElement>) => {
    if (e) e.preventDefault();
    
    if (isViewing) return;

    if (!taxTreatmentCode) {
      toast.error("Please select a tax treatment type");
      return false;
    }

    const form = document.getElementById("drawer-form") as HTMLFormElement;
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
        resetDirty();
        invalidateTaxTypes(queryClient);
        return true;
      } else {
        toast.error(result.error ?? "Failed to save tax type");
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
      title={isViewing ? "View Tax Type" : isEditing ? "Edit Tax Type" : "Add Tax Type"}
      subtitle={taxType ? `Tax: ${taxType.tax_name_en} (${taxType.tax_code})` : "Create a new tax type"}
      recordNumber={taxType?.tax_code}
      mode={isViewing ? "view" : isEditing ? "edit" : "add"}
      isDirty={isDirty}
    >
      <form id="drawer-form" onSubmit={handleSubmit} className="flex flex-1 overflow-hidden h-full">
        <ERPDrawerSectionNav sections={sections} activeSection={activeSection} setActiveSection={setActiveSection} />
        <div className="flex-grow flex flex-col justify-between overflow-hidden">
          <ERPDrawerBody>
            <ERPDrawerSection id="basic" activeId={activeSection} title="Basic Information">
              <ERPFieldGrid>
                <div className="space-y-2 col-span-6">
                  <RequiredLabel htmlFor="tax_code">Tax Code</RequiredLabel>
                  <Input id="tax_code" name="tax_code" required defaultValue={taxType?.tax_code} disabled={isViewing || isEditing} className="uppercase" placeholder="VAT5" />
                </div>
                <div className="space-y-2 col-span-6">
                  <RequiredLabel htmlFor="tax_rate">Tax Rate (%)</RequiredLabel>
                  <Input id="tax_rate" name="tax_rate" type="number" min={0} max={100} step="0.0001" required defaultValue={taxType?.tax_rate ?? 0} disabled={isViewing} />
                </div>
                <div className="space-y-2 col-span-6">
                  <RequiredLabel htmlFor="tax_name_en">English Name</RequiredLabel>
                  <Input id="tax_name_en" name="tax_name_en" required defaultValue={taxType?.tax_name_en} disabled={isViewing} />
                </div>
                <div className="space-y-2 col-span-6">
                  <Label htmlFor="tax_name_ar" className="text-muted-foreground text-xs">Arabic Name</Label>
                  <Input id="tax_name_ar" name="tax_name_ar" defaultValue={taxType?.tax_name_ar ?? ""} disabled={isViewing} dir="rtl" />
                </div>
                <div className="space-y-2 col-span-6">
                  <RequiredLabel>Tax Treatment</RequiredLabel>
                  <LookupSelect
                    categoryCode="TAX_TREATMENT_TYPES"
                    value={taxTreatmentCode}
                    onValueChange={(v) => setTaxTreatmentCode(v ? String(v) : null)}
                    valueField="code"
                    showCode
                    disabled={isViewing}
                    required
                  />
                </div>
                <div className="space-y-2 col-span-3">
                  <RequiredLabel htmlFor="effective_from">Effective From</RequiredLabel>
                  <Input id="effective_from" name="effective_from" type="date" required defaultValue={taxType?.effective_from ?? "2018-01-01"} disabled={isViewing} />
                </div>
                <div className="space-y-2 col-span-3">
                  <Label htmlFor="effective_to" className="text-muted-foreground text-xs">Effective To</Label>
                  <Input id="effective_to" name="effective_to" type="date" defaultValue={taxType?.effective_to ?? ""} disabled={isViewing} />
                </div>
              </ERPFieldGrid>
            </ERPDrawerSection>

            <ERPDrawerSection id="vat" activeId={activeSection} title="VAT Flags & Applicability">
              <ERPFieldGrid>
                <div className="space-y-3 col-span-12">
                  <div className="flex items-center space-x-2">
                    <Checkbox id="is_vat" name="is_vat" defaultChecked={taxType?.is_vat ?? false} disabled={isViewing} />
                    <Label htmlFor="is_vat" className="text-sm font-normal cursor-pointer">VAT Tax</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox id="is_reverse_charge" name="is_reverse_charge" defaultChecked={taxType?.is_reverse_charge ?? false} disabled={isViewing} />
                    <Label htmlFor="is_reverse_charge" className="text-sm font-normal cursor-pointer">Reverse Charge</Label>
                  </div>
                  <Label className="text-muted-foreground text-xs pt-2">Applies To</Label>
                  <div className="flex items-center space-x-2">
                    <Checkbox id="applies_to_sales" name="applies_to_sales" defaultChecked={taxType?.applies_to_sales ?? true} disabled={isViewing} />
                    <Label htmlFor="applies_to_sales" className="text-sm font-normal cursor-pointer">Sales</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox id="applies_to_purchases" name="applies_to_purchases" defaultChecked={taxType?.applies_to_purchases ?? true} disabled={isViewing} />
                    <Label htmlFor="applies_to_purchases" className="text-sm font-normal cursor-pointer">Purchases</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox id="applies_to_scrap" name="applies_to_scrap" defaultChecked={taxType?.applies_to_scrap ?? false} disabled={isViewing} />
                    <Label htmlFor="applies_to_scrap" className="text-sm font-normal cursor-pointer">Scrap / Waste</Label>
                  </div>
                </div>
                <div className="space-y-2 col-span-6">
                  <Label htmlFor="description_en" className="text-muted-foreground text-xs">Description (EN)</Label>
                  <Textarea id="description_en" name="description_en" defaultValue={taxType?.description_en ?? ""} disabled={isViewing} rows={2} />
                </div>
                <div className="space-y-2 col-span-6">
                  <Label htmlFor="sort_order" className="text-muted-foreground text-xs">Sort Order</Label>
                  <Input id="sort_order" name="sort_order" type="number" min={0} defaultValue={taxType?.sort_order ?? 0} disabled={isViewing} />
                </div>
              </ERPFieldGrid>
            </ERPDrawerSection>

            <ERPDrawerSection id="status" activeId={activeSection} title="Status">
              <ERPFieldGrid>
                {(isEditing || isViewing) && (
                  <div className="space-y-2 col-span-6">
                    <div className="flex items-center space-x-2">
                      <Checkbox id="is_active" name="is_active" defaultChecked={taxType?.is_active ?? true} disabled={isViewing} />
                      <Label htmlFor="is_active" className="text-sm font-normal cursor-pointer">Active</Label>
                    </div>
                  </div>
                )}
              </ERPFieldGrid>
            </ERPDrawerSection>

            <ERPDrawerSection id="audit" activeId={activeSection} title="Audit Information" lazyMount>
              {taxType ? (
                <ERPFieldGrid>
                  <div className="space-y-2 col-span-6">
                    <Label className="text-muted-foreground text-xs">Created At</Label>
                    <Input value={new Date(taxType.created_at).toLocaleString()} disabled className="text-xs" />
                  </div>
                  <div className="space-y-2 col-span-6">
                    <Label className="text-muted-foreground text-xs">Updated At</Label>
                    <Input value={new Date(taxType.updated_at).toLocaleString()} disabled className="text-xs" />
                  </div>
                </ERPFieldGrid>
              ) : (
                <div className="text-sm text-muted-foreground">Audit information will be available after saving</div>
              )}
            </ERPDrawerSection>
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
