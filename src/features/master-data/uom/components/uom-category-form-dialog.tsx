"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import type { UomCategory } from "../types";
import { createUomCategory, updateUomCategory } from "../actions";
import { RequiredLabel } from "@/components/erp/required-label";
import { ERPFormFooter } from "@/components/erp/erp-form-footer";
import {
  ERPDrawerForm,
  ERPDrawerSectionNav,
  ERPDrawerBody,
  ERPDrawerSection,
  ERPFieldGrid,
} from "@/components/erp/erp-drawer-form";
import { Tag, Shield, Info } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useFormDirty } from "@/hooks/use-form-dirty";
import { invalidateUom } from "@/lib/query/invalidation";

type UomCategoryFormDialogProps = {
  category?: UomCategory | null;
  mode: "add" | "edit" | "view";
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
};

export function UomCategoryFormDialog({
  category,
  mode,
  open,
  onOpenChange,
  onSuccess,
}: UomCategoryFormDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeSection, setActiveSection] = useState("basic");
  const isEditing = mode === "edit";
  const isViewing = mode === "view";
  const queryClient = useQueryClient();
  const { isDirty, resetDirty } = useFormDirty({
    formId: "drawer-form",
    enabled: !isViewing,
  });

  const sections = [
    { id: "basic", label: "Basic Info", icon: Tag },
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
      if (isEditing && category) {
        result = await updateUomCategory({
          id: category.id,
          category_name_en: formData.get("category_name_en") as string,
          category_name_ar: (formData.get("category_name_ar") as string) || null,
          description_en: (formData.get("description_en") as string) || null,
          description_ar: (formData.get("description_ar") as string) || null,
          notes: (formData.get("notes") as string) || null,
          sort_order: parseInt(formData.get("sort_order") as string) || 0,
          is_active: formData.get("is_active") === "on",
        });
      } else {
        result = await createUomCategory({
          category_code: (formData.get("category_code") as string).toUpperCase(),
          category_name_en: formData.get("category_name_en") as string,
          category_name_ar: (formData.get("category_name_ar") as string) || null,
          description_en: (formData.get("description_en") as string) || null,
          description_ar: (formData.get("description_ar") as string) || null,
          notes: (formData.get("notes") as string) || null,
          sort_order: parseInt(formData.get("sort_order") as string) || 0,
        });
      }

      if (result.success) {
        toast.success(`Category ${isEditing ? "updated" : "created"} successfully`);
        resetDirty();
        invalidateUom(queryClient);
        if (onSuccess) onSuccess();
        return true;
      } else {
        toast.error(result.error ?? "Failed to save category");
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
      title={isViewing ? "View UOM Category" : isEditing ? "Edit UOM Category" : "Add UOM Category"}
      subtitle={category ? `Category: ${category.category_name_en}` : "Create a new UOM category"}
      recordNumber={category?.category_code}
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
                  <RequiredLabel htmlFor="category_code">Category Code</RequiredLabel>
                  <Input
                    id="category_code"
                    name="category_code"
                    required
                    defaultValue={category?.category_code}
                    disabled={isViewing || isEditing}
                    placeholder="WEIGHT"
                    className="uppercase"
                  />
                </div>
                <div className="space-y-2 col-span-6">
                  <Label htmlFor="sort_order" className="text-muted-foreground text-xs">Sort Order</Label>
                  <Input
                    id="sort_order"
                    name="sort_order"
                    type="number"
                    min={0}
                    defaultValue={category?.sort_order ?? 0}
                    disabled={isViewing}
                  />
                </div>
                <div className="space-y-2 col-span-6">
                  <RequiredLabel htmlFor="category_name_en">English Name</RequiredLabel>
                  <Input
                    id="category_name_en"
                    name="category_name_en"
                    required
                    defaultValue={category?.category_name_en}
                    disabled={isViewing}
                    placeholder="Weight"
                  />
                </div>
                <div className="space-y-2 col-span-6">
                  <Label htmlFor="category_name_ar" className="text-muted-foreground text-xs">Arabic Name</Label>
                  <Input
                    id="category_name_ar"
                    name="category_name_ar"
                    defaultValue={category?.category_name_ar ?? ""}
                    disabled={isViewing}
                    dir="rtl"
                  />
                </div>
                <div className="space-y-2 col-span-12">
                  <Label htmlFor="description_en" className="text-muted-foreground text-xs">English Description</Label>
                  <Textarea
                    id="description_en"
                    name="description_en"
                    defaultValue={category?.description_en ?? ""}
                    disabled={isViewing}
                    rows={2}
                  />
                </div>
                <div className="space-y-2 col-span-12">
                  <Label htmlFor="description_ar" className="text-muted-foreground text-xs">Arabic Description</Label>
                  <Textarea
                    id="description_ar"
                    name="description_ar"
                    defaultValue={category?.description_ar ?? ""}
                    disabled={isViewing}
                    dir="rtl"
                    rows={2}
                  />
                </div>
                <div className="space-y-2 col-span-12">
                  <Label htmlFor="notes" className="text-muted-foreground text-xs">Notes</Label>
                  <Textarea
                    id="notes"
                    name="notes"
                    defaultValue={category?.notes ?? ""}
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
                      defaultChecked={category?.is_active ?? true}
                      disabled={isViewing}
                    />
                    <Label htmlFor="is_active" className="text-sm font-normal cursor-pointer">Active</Label>
                  </div>
                </div>
                {category?.is_system && (
                  <div className="space-y-2 col-span-12">
                    <p className="text-sm text-muted-foreground">This is a system category and cannot be deleted.</p>
                  </div>
                )}
                {category?.is_locked && (
                  <div className="space-y-2 col-span-12">
                    <p className="text-sm text-amber-600">This category is locked and can only be modified by system administrators.</p>
                  </div>
                )}
              </ERPFieldGrid>
            </ERPDrawerSection>

            {category && (
              <ERPDrawerSection id="audit" activeId={activeSection} title="Audit Information" lazyMount>
                <ERPFieldGrid>
                  <div className="space-y-2 col-span-6">
                    <Label className="text-muted-foreground text-xs">Created At</Label>
                    <Input value={new Date(category.created_at).toLocaleString()} disabled />
                  </div>
                  <div className="space-y-2 col-span-6">
                    <Label className="text-muted-foreground text-xs">Updated At</Label>
                    <Input value={new Date(category.updated_at).toLocaleString()} disabled />
                  </div>
                  {category.deactivated_at && (
                    <>
                      <div className="space-y-2 col-span-6">
                        <Label className="text-muted-foreground text-xs">Deactivated At</Label>
                        <Input value={new Date(category.deactivated_at).toLocaleString()} disabled />
                      </div>
                      <div className="space-y-2 col-span-12">
                        <Label className="text-muted-foreground text-xs">Deactivation Reason</Label>
                        <Textarea value={category.deactivation_reason ?? ""} disabled rows={2} />
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
