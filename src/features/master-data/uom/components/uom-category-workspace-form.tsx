"use client";

import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import type { UomCategory } from "@/features/master-data/uom/types";
import { createUomCategory, updateUomCategory } from "@/features/master-data/uom/actions";
import { RequiredLabel } from "@/components/erp/required-label";
import { useQueryClient } from "@tanstack/react-query";
import { useFormDirty } from "@/hooks/use-form-dirty";
import { Ruler, Shield, Info } from "lucide-react";
import type { AuthContext } from "@/lib/rbac/check";
import { useWorkspace } from "@/hooks/use-workspace";
import { ERPRecordWorkspaceForm, ERPRecordSectionPanel } from "@/components/workspace/erp-record-workspace-form";
import { useWorkspaceFormDraft } from "@/hooks/use-workspace-form-draft";

type UomCategoryWorkspaceFormProps = {
  category?: UomCategory | null;
  mode: "add" | "edit" | "view";
  authContext: AuthContext;
  onSuccess?: () => void;
};

const FORM_ID = "uom-category-workspace-form";

export function UomCategoryWorkspaceForm({ category, mode, onSuccess }: UomCategoryWorkspaceFormProps) {
  const { closeTab, activeTab, markDirty, forceCloseActiveTab } = useWorkspace();
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
    { id: "basic", label: "Basic Info", icon: Ruler },
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
        category_name_en: formData.get("category_name_en") as string,
        category_name_ar: (formData.get("category_name_ar") as string) || null,
        description_en: (formData.get("description_en") as string) || null,
        description_ar: (formData.get("description_ar") as string) || null,
        notes: (formData.get("notes") as string) || null,
        sort_order: parseInt(formData.get("sort_order") as string) || 0,
      };
      let result;
      if (isEditing && category) {
        result = await updateUomCategory({ id: category.id, ...shared, is_active: formData.get("is_active") === "on" });
      } else {
        result = await createUomCategory({ category_code: (formData.get("category_code") as string).toUpperCase(), ...shared });
      }
      if (result.success) {
        toast.success(`UOM category ${isEditing ? "updated" : "created"} successfully`);
        clearDraft();
        resetDirty();
        onSuccess?.();
        return true;
      } else {
        toast.error(result.error ?? "Failed to save UOM category");
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
      title={isViewing ? "View UOM Category" : isEditing ? "Edit UOM Category" : "New UOM Category"}
      subtitle={category ? `${category.category_name_en} (${category.category_code})` : "Create a new unit of measure category"}
      recordCode={category?.category_code}
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
              <RequiredLabel htmlFor="category_code">Category Code</RequiredLabel>
              <Input id="category_code" name="category_code" required defaultValue={getDraftDefault("category_code", category?.category_code ?? "")} disabled={isViewing || isEditing} className="uppercase" placeholder="WEIGHT" />
            </div>
            <div className="space-y-2 col-span-6">
              <Label htmlFor="sort_order" className="text-muted-foreground text-xs">Sort Order</Label>
              <Input id="sort_order" name="sort_order" type="number" min={0} defaultValue={getDraftDefault("sort_order", category?.sort_order ?? 0)} disabled={isViewing} />
            </div>
            <div className="space-y-2 col-span-6">
              <RequiredLabel htmlFor="category_name_en">English Name</RequiredLabel>
              <Input id="category_name_en" name="category_name_en" required defaultValue={getDraftDefault("category_name_en", category?.category_name_en ?? "")} disabled={isViewing} />
            </div>
            <div className="space-y-2 col-span-6">
              <Label htmlFor="category_name_ar" className="text-muted-foreground text-xs">Arabic Name</Label>
              <Input id="category_name_ar" name="category_name_ar" defaultValue={getDraftDefault("category_name_ar", category?.category_name_ar ?? "")} disabled={isViewing} dir="rtl" />
            </div>
            <div className="space-y-2 col-span-6">
              <Label htmlFor="description_en" className="text-muted-foreground text-xs">Description (EN)</Label>
              <Textarea id="description_en" name="description_en" defaultValue={getDraftDefault("description_en", category?.description_en ?? "")} disabled={isViewing} rows={2} />
            </div>
            <div className="space-y-2 col-span-6">
              <Label htmlFor="description_ar" className="text-muted-foreground text-xs">Description (AR)</Label>
              <Textarea id="description_ar" name="description_ar" defaultValue={getDraftDefault("description_ar", category?.description_ar ?? "")} disabled={isViewing} dir="rtl" rows={2} />
            </div>
            <div className="space-y-2 col-span-12">
              <Label htmlFor="notes" className="text-muted-foreground text-xs">Notes</Label>
              <Textarea id="notes" name="notes" defaultValue={getDraftDefault("notes", category?.notes ?? "")} disabled={isViewing} rows={2} />
            </div>
          </div>
        </ERPRecordSectionPanel>

        <ERPRecordSectionPanel id="status" activeId={activeSection} title="Status">
          <div className="grid grid-cols-12 gap-4">
            {(isEditing || isViewing) && (
              <div className="space-y-2 col-span-6">
                <div className="flex items-center space-x-2">
                  <Checkbox id="is_active" name="is_active" defaultChecked={getDraftBoolean("is_active", category?.is_active ?? true)} disabled={isViewing} />
                  <Label htmlFor="is_active" className="text-sm font-normal cursor-pointer">Active</Label>
                </div>
              </div>
            )}
          </div>
        </ERPRecordSectionPanel>

        <ERPRecordSectionPanel id="audit" activeId={activeSection} title="Audit Information" lazyMount>
          {category ? (
            <div className="grid grid-cols-12 gap-4">
              <div className="space-y-2 col-span-6">
                <Label className="text-muted-foreground text-xs">Created At</Label>
                <Input value={new Date(category.created_at).toLocaleString()} disabled className="text-xs" />
              </div>
              <div className="space-y-2 col-span-6">
                <Label className="text-muted-foreground text-xs">Updated At</Label>
                <Input value={new Date(category.updated_at).toLocaleString()} disabled className="text-xs" />
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
