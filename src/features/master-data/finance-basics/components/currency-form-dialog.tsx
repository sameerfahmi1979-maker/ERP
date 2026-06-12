"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import type { Currency } from "@/features/master-data/finance-basics/types";
import { createCurrency, updateCurrency } from "@/features/master-data/finance-basics/actions";
import { RequiredLabel } from "@/components/erp/required-label";
import { useQueryClient } from "@tanstack/react-query";
import { useFormDirty } from "@/hooks/use-form-dirty";
import { invalidateCurrencies } from "@/lib/query/invalidation";
import { ERPFormFooter } from "@/components/erp/erp-form-footer";
import {
  ERPDrawerForm,
  ERPDrawerSectionNav,
  ERPDrawerBody,
  ERPDrawerSection,
  ERPFieldGrid,
} from "@/components/erp/erp-drawer-form";
import { Coins, Tag, Shield, Info } from "lucide-react";

type CurrencyFormDialogProps = {
  currency?: Currency | null;
  mode: "add" | "edit" | "view";
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function CurrencyFormDialog({
  currency,
  mode,
  open,
  onOpenChange,
}: CurrencyFormDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeSection, setActiveSection] = useState("basic");
  const isEditing = mode === "edit";
  const isViewing = mode === "view";

  const queryClient = useQueryClient();
  // Dirty state tracking for Safe Close
  const { isDirty, resetDirty } = useFormDirty({
    formId: "drawer-form",
    enabled: !isViewing,
  });

  const sections = [
    { id: "basic", label: "Basic Info", icon: Coins },
    { id: "details", label: "Details", icon: Tag },
    { id: "status", label: "Status", icon: Shield },
    { id: "audit", label: "Audit Info", icon: Info },
  ];

  const handleSave = async (e?: React.FormEvent<HTMLFormElement>) => {
    if (e) e.preventDefault();
    
    if (isViewing) return;

    const form = document.getElementById("drawer-form") as HTMLFormElement;
    const formData = new FormData(form);

    setIsSubmitting(true);
    try {
      let result;
      if (isEditing && currency) {
        result = await updateCurrency({
          id: currency.id,
          currency_name_en: formData.get("currency_name_en") as string,
          currency_name_ar: (formData.get("currency_name_ar") as string) || null,
          symbol: (formData.get("symbol") as string) || null,
          decimal_places: parseInt(formData.get("decimal_places") as string) || 2,
          is_base_currency: formData.get("is_base_currency") === "on",
          description_en: (formData.get("description_en") as string) || null,
          description_ar: (formData.get("description_ar") as string) || null,
          notes: (formData.get("notes") as string) || null,
          sort_order: parseInt(formData.get("sort_order") as string) || 0,
          is_active: formData.get("is_active") === "on",
        });
      } else {
        result = await createCurrency({
          currency_code: (formData.get("currency_code") as string).toUpperCase(),
          currency_name_en: formData.get("currency_name_en") as string,
          currency_name_ar: (formData.get("currency_name_ar") as string) || null,
          symbol: (formData.get("symbol") as string) || null,
          decimal_places: parseInt(formData.get("decimal_places") as string) || 2,
          is_base_currency: formData.get("is_base_currency") === "on",
          description_en: (formData.get("description_en") as string) || null,
          description_ar: (formData.get("description_ar") as string) || null,
          notes: (formData.get("notes") as string) || null,
          sort_order: parseInt(formData.get("sort_order") as string) || 0,
        });
      }

      if (result.success) {
        toast.success(`Currency ${isEditing ? "updated" : "created"} successfully`);
        resetDirty();
        invalidateCurrencies(queryClient);
        return true;
      } else {
        toast.error(result.error ?? "Failed to save currency");
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
      title={isViewing ? "View Currency" : isEditing ? "Edit Currency" : "Add Currency"}
      subtitle={currency ? `Currency: ${currency.currency_name_en} (${currency.currency_code})` : "Create a new currency record"}
      recordNumber={currency?.currency_code}
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
                  <RequiredLabel htmlFor="currency_code">Currency Code (ISO 4217)</RequiredLabel>
                  <Input
                    id="currency_code"
                    name="currency_code"
                    required
                    defaultValue={currency?.currency_code}
                    disabled={isViewing || isEditing}
                    placeholder="AED"
                    className="uppercase"
                    maxLength={3}
                  />
                </div>
                <div className="space-y-2 col-span-6">
                  <Label htmlFor="symbol" className="text-muted-foreground text-xs">Symbol</Label>
                  <Input id="symbol" name="symbol" defaultValue={currency?.symbol ?? ""} disabled={isViewing} placeholder="د.إ" maxLength={10} />
                </div>
                <div className="space-y-2 col-span-6">
                  <RequiredLabel htmlFor="currency_name_en">English Name</RequiredLabel>
                  <Input id="currency_name_en" name="currency_name_en" required defaultValue={currency?.currency_name_en} disabled={isViewing} placeholder="UAE Dirham" />
                </div>
                <div className="space-y-2 col-span-6">
                  <Label htmlFor="currency_name_ar" className="text-muted-foreground text-xs">Arabic Name</Label>
                  <Input id="currency_name_ar" name="currency_name_ar" defaultValue={currency?.currency_name_ar ?? ""} disabled={isViewing} dir="rtl" />
                </div>
                <div className="space-y-2 col-span-6">
                  <Label htmlFor="decimal_places" className="text-muted-foreground text-xs">Decimal Places *</Label>
                  <Input id="decimal_places" name="decimal_places" type="number" min={0} max={4} required defaultValue={currency?.decimal_places ?? 2} disabled={isViewing} />
                </div>
                <div className="space-y-3 col-span-6">
                  <div className="flex items-center space-x-2">
                    <Checkbox id="is_base_currency" name="is_base_currency" defaultChecked={currency?.is_base_currency ?? false} disabled={isViewing} />
                    <Label htmlFor="is_base_currency" className="text-sm font-normal cursor-pointer">Base Currency</Label>
                  </div>
                </div>
              </ERPFieldGrid>
            </ERPDrawerSection>

            <ERPDrawerSection id="details" activeId={activeSection} title="Descriptions & Notes">
              <ERPFieldGrid>
                <div className="space-y-2 col-span-6">
                  <Label htmlFor="description_en" className="text-muted-foreground text-xs">Description (EN)</Label>
                  <Textarea id="description_en" name="description_en" defaultValue={currency?.description_en ?? ""} disabled={isViewing} rows={3} />
                </div>
                <div className="space-y-2 col-span-6">
                  <Label htmlFor="description_ar" className="text-muted-foreground text-xs">Description (AR)</Label>
                  <Textarea id="description_ar" name="description_ar" defaultValue={currency?.description_ar ?? ""} disabled={isViewing} dir="rtl" rows={3} />
                </div>
                <div className="space-y-2 col-span-12">
                  <Label htmlFor="notes" className="text-muted-foreground text-xs">Notes</Label>
                  <Textarea id="notes" name="notes" defaultValue={currency?.notes ?? ""} disabled={isViewing} rows={2} />
                </div>
                <div className="space-y-2 col-span-6">
                  <Label htmlFor="sort_order" className="text-muted-foreground text-xs">Sort Order</Label>
                  <Input id="sort_order" name="sort_order" type="number" min={0} defaultValue={currency?.sort_order ?? 0} disabled={isViewing} />
                </div>
              </ERPFieldGrid>
            </ERPDrawerSection>

            <ERPDrawerSection id="status" activeId={activeSection} title="Status">
              <ERPFieldGrid>
                {(isEditing || isViewing) && (
                  <div className="space-y-2 col-span-6">
                    <div className="flex items-center space-x-2">
                      <Checkbox id="is_active" name="is_active" defaultChecked={currency?.is_active ?? true} disabled={isViewing} />
                      <Label htmlFor="is_active" className="text-sm font-normal cursor-pointer">Active</Label>
                    </div>
                  </div>
                )}
              </ERPFieldGrid>
            </ERPDrawerSection>

            <ERPDrawerSection id="audit" activeId={activeSection} title="Audit Information" lazyMount>
              {currency ? (
                <ERPFieldGrid>
                  <div className="space-y-2 col-span-6">
                    <Label className="text-muted-foreground text-xs">Created At</Label>
                    <Input value={new Date(currency.created_at).toLocaleString()} disabled className="text-xs" />
                  </div>
                  <div className="space-y-2 col-span-6">
                    <Label className="text-muted-foreground text-xs">Updated At</Label>
                    <Input value={new Date(currency.updated_at).toLocaleString()} disabled className="text-xs" />
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
