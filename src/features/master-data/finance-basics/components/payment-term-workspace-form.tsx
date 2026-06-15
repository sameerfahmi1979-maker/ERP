"use client";

import { useState, useEffect } from "react";
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
import { CalendarClock, Tag, Shield, Info } from "lucide-react";
import type { AuthContext } from "@/lib/rbac/check";
import { useWorkspace } from "@/hooks/use-workspace";
import { ERPRecordWorkspaceForm, ERPRecordSectionPanel } from "@/components/workspace/erp-record-workspace-form";
import { useWorkspaceFormDraft } from "@/hooks/use-workspace-form-draft";

type PaymentTermWorkspaceFormProps = {
  paymentTerm?: PaymentTerm | null;
  mode: "add" | "edit" | "view";
  authContext: AuthContext;
};

const FORM_ID = "payment-term-workspace-form";

export function PaymentTermWorkspaceForm({ paymentTerm, mode }: PaymentTermWorkspaceFormProps) {
  const { closeTab, activeTab, markDirty } = useWorkspace();
  const queryClient = useQueryClient();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeSection, setActiveSection] = useState("basic");
  const isEditing = mode === "edit";
  const isViewing = mode === "view";
  const { isDirty, resetDirty } = useFormDirty({ formId: FORM_ID, enabled: !isViewing });
  const { getDraftDefault, getDraftBoolean, syncDraft, clearDraft } = useWorkspaceFormDraft({ formId: FORM_ID, enabled: !isViewing });

  useEffect(() => {
    if (activeTab?.id) markDirty(activeTab.id, isDirty);
  }, [isDirty, activeTab?.id, markDirty]);

  const sections = [
    { id: "basic", label: "Basic Info", icon: CalendarClock },
    { id: "terms", label: "Terms", icon: Tag },
    { id: "status", label: "Status", icon: Shield },
    { id: "audit", label: "Audit Info", icon: Info },
  ];

  const handleRequestClose = () => closeTab(activeTab?.id ?? "");

  const handleSave = async (): Promise<boolean> => {
    if (isViewing) return false;
    const form = document.getElementById(FORM_ID) as HTMLFormElement;
    const formData = new FormData(form);
    setIsSubmitting(true);
    try {
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
      let result;
      if (isEditing && paymentTerm) {
        result = await updatePaymentTerm({ id: paymentTerm.id, ...shared, is_active: formData.get("is_active") === "on" });
      } else {
        result = await createPaymentTerm({ term_code: (formData.get("term_code") as string).toUpperCase(), ...shared });
      }
      if (result.success) {
        toast.success(`Payment term ${isEditing ? "updated" : "created"} successfully`);
        clearDraft();
        resetDirty();
        invalidatePaymentTerms(queryClient);
        return true;
      } else {
        toast.error(result.error ?? "Failed to save payment term");
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
      title={isViewing ? "View Payment Term" : isEditing ? "Edit Payment Term" : "New Payment Term"}
      subtitle={paymentTerm ? `${paymentTerm.term_name_en} (${paymentTerm.term_code})` : "Create a new payment term"}
      recordCode={paymentTerm?.term_code}
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
              <RequiredLabel htmlFor="term_code">Term Code</RequiredLabel>
              <Input id="term_code" name="term_code" required defaultValue={getDraftDefault("term_code", paymentTerm?.term_code ?? "")} disabled={isViewing || isEditing} className="uppercase" placeholder="NET30" />
            </div>
            <div className="space-y-2 col-span-6">
              <RequiredLabel htmlFor="term_name_en">English Name</RequiredLabel>
              <Input id="term_name_en" name="term_name_en" required defaultValue={getDraftDefault("term_name_en", paymentTerm?.term_name_en ?? "")} disabled={isViewing} />
            </div>
            <div className="space-y-2 col-span-6">
              <Label htmlFor="term_name_ar" className="text-muted-foreground text-xs">Arabic Name</Label>
              <Input id="term_name_ar" name="term_name_ar" defaultValue={getDraftDefault("term_name_ar", paymentTerm?.term_name_ar ?? "")} disabled={isViewing} dir="rtl" />
            </div>
          </div>
        </ERPRecordSectionPanel>

        <ERPRecordSectionPanel id="terms" activeId={activeSection} title="Payment Terms">
          <div className="grid grid-cols-12 gap-4">
            <div className="space-y-2 col-span-4">
              <Label htmlFor="due_days" className="text-muted-foreground text-xs">Due Days *</Label>
              <Input id="due_days" name="due_days" type="number" min={0} required defaultValue={getDraftDefault("due_days", paymentTerm?.due_days ?? 0)} disabled={isViewing} />
            </div>
            <div className="space-y-2 col-span-4">
              <Label htmlFor="advance_percentage" className="text-muted-foreground text-xs">Advance %</Label>
              <Input id="advance_percentage" name="advance_percentage" type="number" min={0} max={100} step="0.01" defaultValue={getDraftDefault("advance_percentage", paymentTerm?.advance_percentage ?? 0)} disabled={isViewing} />
            </div>
            <div className="space-y-2 col-span-4">
              <Label htmlFor="retention_percentage" className="text-muted-foreground text-xs">Retention %</Label>
              <Input id="retention_percentage" name="retention_percentage" type="number" min={0} max={100} step="0.01" defaultValue={getDraftDefault("retention_percentage", paymentTerm?.retention_percentage ?? 0)} disabled={isViewing} />
            </div>
            <div className="space-y-2 col-span-12">
              <Label htmlFor="calculation_notes" className="text-muted-foreground text-xs">Calculation Notes</Label>
              <Textarea id="calculation_notes" name="calculation_notes" defaultValue={getDraftDefault("calculation_notes", paymentTerm?.calculation_notes ?? "")} disabled={isViewing} rows={3} />
            </div>
            <div className="space-y-2 col-span-6">
              <Label htmlFor="description_en" className="text-muted-foreground text-xs">Description (EN)</Label>
              <Textarea id="description_en" name="description_en" defaultValue={getDraftDefault("description_en", paymentTerm?.description_en ?? "")} disabled={isViewing} rows={2} />
            </div>
            <div className="space-y-2 col-span-6">
              <Label htmlFor="description_ar" className="text-muted-foreground text-xs">Description (AR)</Label>
              <Textarea id="description_ar" name="description_ar" defaultValue={getDraftDefault("description_ar", paymentTerm?.description_ar ?? "")} disabled={isViewing} dir="rtl" rows={2} />
            </div>
            <div className="space-y-2 col-span-6">
              <Label htmlFor="sort_order" className="text-muted-foreground text-xs">Sort Order</Label>
              <Input id="sort_order" name="sort_order" type="number" min={0} defaultValue={getDraftDefault("sort_order", paymentTerm?.sort_order ?? 0)} disabled={isViewing} />
            </div>
          </div>
        </ERPRecordSectionPanel>

        <ERPRecordSectionPanel id="status" activeId={activeSection} title="Status">
          <div className="grid grid-cols-12 gap-4">
            {(isEditing || isViewing) && (
              <div className="space-y-2 col-span-6">
                <div className="flex items-center space-x-2">
                  <Checkbox id="is_active" name="is_active" defaultChecked={getDraftBoolean("is_active", paymentTerm?.is_active ?? true)} disabled={isViewing} />
                  <Label htmlFor="is_active" className="text-sm font-normal cursor-pointer">Active</Label>
                </div>
              </div>
            )}
          </div>
        </ERPRecordSectionPanel>

        <ERPRecordSectionPanel id="audit" activeId={activeSection} title="Audit Information" lazyMount>
          {paymentTerm ? (
            <div className="grid grid-cols-12 gap-4">
              <div className="space-y-2 col-span-6">
                <Label className="text-muted-foreground text-xs">Created At</Label>
                <Input value={new Date(paymentTerm.created_at).toLocaleString()} disabled className="text-xs" />
              </div>
              <div className="space-y-2 col-span-6">
                <Label className="text-muted-foreground text-xs">Updated At</Label>
                <Input value={new Date(paymentTerm.updated_at).toLocaleString()} disabled className="text-xs" />
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
