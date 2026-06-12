"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import type { PaymentTerm } from "@/features/master-data/finance-basics/types";
import { createPaymentTerm, updatePaymentTerm } from "@/features/master-data/finance-basics/actions";
import { RequiredLabel } from "@/components/erp/required-label";
import { useQueryClient } from "@tanstack/react-query";
import { useFormDirty } from "@/hooks/use-form-dirty";
import { invalidatePaymentTerms } from "@/lib/query/invalidation";
import { ERPFormFooter } from "@/components/erp/erp-form-footer";
import {
  ERPDrawerForm,
  ERPDrawerSectionNav,
  ERPDrawerBody,
  ERPDrawerSection,
  ERPFieldGrid,
} from "@/components/erp/erp-drawer-form";
import { CalendarClock, Tag, Shield, Info } from "lucide-react";

type PaymentTermFormDialogProps = {
  paymentTerm?: PaymentTerm | null;
  mode: "add" | "edit" | "view";
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function PaymentTermFormDialog({
  paymentTerm,
  mode,
  open,
  onOpenChange,
}: PaymentTermFormDialogProps) {
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
    { id: "basic", label: "Basic Info", icon: CalendarClock },
    { id: "terms", label: "Terms", icon: Tag },
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
      const shared = {
        term_name_en: formData.get("term_name_en") as string,
        term_name_ar: (formData.get("term_name_ar") as string) || null,
        due_days: parseInt(formData.get("due_days") as string) || 0,
        advance_percentage: parseFloat(formData.get("advance_percentage") as string) || 0,
        retention_percentage: parseFloat(formData.get("retention_percentage") as string) || 0,
        calculation_notes: (formData.get("calculation_notes") as string) || null,
        description_en: (formData.get("description_en") as string) || null,
        description_ar: (formData.get("description_ar") as string) || null,
        notes: (formData.get("notes") as string) || null,
        sort_order: parseInt(formData.get("sort_order") as string) || 0,
      };

      if (isEditing && paymentTerm) {
        result = await updatePaymentTerm({
          id: paymentTerm.id,
          ...shared,
          is_active: formData.get("is_active") === "on",
        });
      } else {
        result = await createPaymentTerm({
          term_code: (formData.get("term_code") as string).toUpperCase(),
          ...shared,
        });
      }

      if (result.success) {
        toast.success(`Payment term ${isEditing ? "updated" : "created"} successfully`);
        resetDirty();
        invalidatePaymentTerms(queryClient);
        return true;
      } else {
        toast.error(result.error ?? "Failed to save payment term");
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
      title={isViewing ? "View Payment Term" : isEditing ? "Edit Payment Term" : "Add Payment Term"}
      subtitle={paymentTerm ? `Term: ${paymentTerm.term_name_en} (${paymentTerm.term_code})` : "Create a new payment term"}
      recordNumber={paymentTerm?.term_code}
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
                  <RequiredLabel htmlFor="term_code">Term Code</RequiredLabel>
                  <Input id="term_code" name="term_code" required defaultValue={paymentTerm?.term_code} disabled={isViewing || isEditing} className="uppercase" placeholder="NET30" />
                </div>
                <div className="space-y-2 col-span-6">
                  <RequiredLabel htmlFor="term_name_en">English Name</RequiredLabel>
                  <Input id="term_name_en" name="term_name_en" required defaultValue={paymentTerm?.term_name_en} disabled={isViewing} />
                </div>
                <div className="space-y-2 col-span-6">
                  <Label htmlFor="term_name_ar" className="text-muted-foreground text-xs">Arabic Name</Label>
                  <Input id="term_name_ar" name="term_name_ar" defaultValue={paymentTerm?.term_name_ar ?? ""} disabled={isViewing} dir="rtl" />
                </div>
              </ERPFieldGrid>
            </ERPDrawerSection>

            <ERPDrawerSection id="terms" activeId={activeSection} title="Payment Terms">
              <ERPFieldGrid>
                <div className="space-y-2 col-span-4">
                  <Label htmlFor="due_days" className="text-muted-foreground text-xs">Due Days *</Label>
                  <Input id="due_days" name="due_days" type="number" min={0} required defaultValue={paymentTerm?.due_days ?? 0} disabled={isViewing} />
                </div>
                <div className="space-y-2 col-span-4">
                  <Label htmlFor="advance_percentage" className="text-muted-foreground text-xs">Advance %</Label>
                  <Input id="advance_percentage" name="advance_percentage" type="number" min={0} max={100} step="0.01" defaultValue={paymentTerm?.advance_percentage ?? 0} disabled={isViewing} />
                </div>
                <div className="space-y-2 col-span-4">
                  <Label htmlFor="retention_percentage" className="text-muted-foreground text-xs">Retention %</Label>
                  <Input id="retention_percentage" name="retention_percentage" type="number" min={0} max={100} step="0.01" defaultValue={paymentTerm?.retention_percentage ?? 0} disabled={isViewing} />
                </div>
                <div className="space-y-2 col-span-12">
                  <Label htmlFor="calculation_notes" className="text-muted-foreground text-xs">Calculation Notes</Label>
                  <Textarea id="calculation_notes" name="calculation_notes" defaultValue={paymentTerm?.calculation_notes ?? ""} disabled={isViewing} rows={3} />
                </div>
                <div className="space-y-2 col-span-6">
                  <Label htmlFor="description_en" className="text-muted-foreground text-xs">Description (EN)</Label>
                  <Textarea id="description_en" name="description_en" defaultValue={paymentTerm?.description_en ?? ""} disabled={isViewing} rows={2} />
                </div>
                <div className="space-y-2 col-span-6">
                  <Label htmlFor="description_ar" className="text-muted-foreground text-xs">Description (AR)</Label>
                  <Textarea id="description_ar" name="description_ar" defaultValue={paymentTerm?.description_ar ?? ""} disabled={isViewing} dir="rtl" rows={2} />
                </div>
                <div className="space-y-2 col-span-6">
                  <Label htmlFor="sort_order" className="text-muted-foreground text-xs">Sort Order</Label>
                  <Input id="sort_order" name="sort_order" type="number" min={0} defaultValue={paymentTerm?.sort_order ?? 0} disabled={isViewing} />
                </div>
              </ERPFieldGrid>
            </ERPDrawerSection>

            <ERPDrawerSection id="status" activeId={activeSection} title="Status">
              <ERPFieldGrid>
                {(isEditing || isViewing) && (
                  <div className="space-y-2 col-span-6">
                    <div className="flex items-center space-x-2">
                      <Checkbox id="is_active" name="is_active" defaultChecked={paymentTerm?.is_active ?? true} disabled={isViewing} />
                      <Label htmlFor="is_active" className="text-sm font-normal cursor-pointer">Active</Label>
                    </div>
                  </div>
                )}
              </ERPFieldGrid>
            </ERPDrawerSection>

            <ERPDrawerSection id="audit" activeId={activeSection} title="Audit Information" lazyMount>
              {paymentTerm ? (
                <ERPFieldGrid>
                  <div className="space-y-2 col-span-6">
                    <Label className="text-muted-foreground text-xs">Created At</Label>
                    <Input value={new Date(paymentTerm.created_at).toLocaleString()} disabled className="text-xs" />
                  </div>
                  <div className="space-y-2 col-span-6">
                    <Label className="text-muted-foreground text-xs">Updated At</Label>
                    <Input value={new Date(paymentTerm.updated_at).toLocaleString()} disabled className="text-xs" />
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
